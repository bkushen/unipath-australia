import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";

const args = new Map(process.argv.slice(2).map((raw) => {
  const [key, ...rest] = raw.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : true];
}));
const writeMode = args.get("write") === true;
const debugPort = Number(args.get("debug-port") ?? 9225);
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const auditPath = `${outputDir}/unsw-handbook-match.json`;
const outputJson = `${outputDir}/unsw-verified-links.json`;
const outputCsv = `${outputDir}/unsw-verified-links.csv`;
const profileDir = join(tmpdir(), "unipath-unsw-verify-chrome-profile-v2");
const ROOT = "https://handbook.unsw.edu.au";

async function loadEnvFile(path = ".env.local") {
  try {
    const text = await readFile(path, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
await loadEnvFile();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !(serviceRoleKey || publishableKey)) throw new Error("Supabase environment variables are missing. Use the existing .env.local configuration.");
if (writeMode && !serviceRoleKey) throw new Error("--write requires SUPABASE_SERVICE_ROLE_KEY in your local .env.local. Keep that secret local.");
const supabase = createClient(supabaseUrl, serviceRoleKey || publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function normaliseDisplay(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function normaliseText(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/\bhonors\b/g, "honours").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function compact(value) { return normaliseText(value).replace(/ /g, ""); }
function csvEscape(value) { const text = String(value ?? ""); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function programmeCodeFromUrl(url) { return String(url ?? "").match(/\/programs\/\d{4}\/(\d{4,5})(?:[/?#]|$)/i)?.[1] ?? null; }
function extractCricos(text) {
  return [...new Set([...String(text ?? "").matchAll(/CRICOS\s+Code\s*(?:\r?\n|\s|:|-)*([0-9]{6}[A-Z]|[0-9]{7})/gi)].map((m) => m[1].toUpperCase()))];
}
function extractProgrammeName(text, renderedTitle = "") {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => normaliseDisplay(line)).filter(Boolean);
  const homeIndex = lines.findIndex((line) => /^Home$/i.test(line));
  if (homeIndex >= 0) {
    for (let i = homeIndex + 1; i < Math.min(lines.length, homeIndex + 8); i += 1) {
      const line = lines[i];
      if (/^\/$/.test(line) || /^(chevron_|expand_|open |search\b)/i.test(line)) continue;
      if (!/^Handbook$/i.test(line) && line.length >= 3 && line.length <= 220) return line;
    }
  }
  const titleName = normaliseDisplay(String(renderedTitle ?? "").replace(/^Handbook\s*[-|:]\s*/i, ""));
  return /^Handbook(?:\s*[-|:].*)?$/i.test(titleName) ? "" : titleName;
}
function extractAwards(text) {
  const section = String(text ?? "").match(/Award\(s\)[\s\S]{0,1600}?(?=\r?\n(?:UAC Code|CRICOS Code|Learning Outcomes|Program Structure|Overview|Minimum Units of Credit)\b)/i)?.[0] ?? "";
  const awards = [];
  for (const match of section.matchAll(/\b((?:Bachelor|Master|Doctor|Graduate Certificate|Graduate Diploma|Diploma|Associate Degree|Juris Doctor)[^\r\n]{2,220}?)(?=\s+-\s+[A-Z]|\r?\n|$)/g)) {
    const award = normaliseDisplay(match[1]);
    if (award && !/^Bachelor$|^Master$|^Doctor$/i.test(award)) awards.push(award);
  }
  return [...new Set(awards)];
}
function nameCompatibility(courseName, programmeName, awards) {
  const db = normaliseText(courseName);
  const candidates = [programmeName, ...awards, awards.join(" / ")].map(normaliseText).filter(Boolean);
  if (candidates.includes(db)) return { exact: true, compatible: true, coverage: 1 };
  const dbTokens = new Set(db.split(" ").filter((x) => x.length > 2));
  let best = 0;
  for (const candidate of candidates) {
    const tokens = new Set(candidate.split(" ").filter((x) => x.length > 2));
    if (!dbTokens.size || !tokens.size) continue;
    let overlap = 0;
    for (const token of dbTokens) if (tokens.has(token)) overlap += 1;
    best = Math.max(best, overlap / dbTokens.size);
  }
  return { exact: false, compatible: best >= 0.5, coverage: best };
}
function findChrome() {
  const candidates = process.platform === "win32" ? [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ] : process.platform === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"] : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((path) => path && existsSync(path)) ?? null;
}
class CdpClient {
  constructor(ws) {
    this.ws = ws; this.nextId = 1; this.pending = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data));
      if (!msg.id) return;
      const task = this.pending.get(msg.id); if (!task) return;
      this.pending.delete(msg.id);
      msg.error ? task.reject(new Error(msg.error.message)) : task.resolve(msg.result);
    };
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
    return result.result?.value;
  }
}
async function connectBrowser() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("Chrome or Edge was not found.");
  await mkdir(profileDir, { recursive: true });
  const child = spawn(chromePath, [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check", "--new-window", ROOT], { stdio: "ignore" });
  let target = null;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const tabs = await response.json();
      target = tabs.find((tab) => String(tab.url).includes("handbook.unsw.edu.au")) ?? tabs.find((tab) => tab.type === "page");
      if (target?.webSocketDebuggerUrl) break;
    } catch {}
    await sleep(1000);
  }
  if (!target?.webSocketDebuggerUrl) { child.kill(); throw new Error("Could not connect to the temporary browser session."); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("Could not connect to Chrome DevTools.")); });
  const cdp = new CdpClient(ws);
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
  return { child, ws, cdp };
}
async function renderPage(cdp, url, expectedCricos) {
  await cdp.send("Page.navigate", { url });
  let last = null;
  for (let attempt = 0; attempt < 35; attempt += 1) {
    await sleep(450);
    const state = await cdp.eval(`(() => ({href: location.href, title: document.title || "", text: document.body?.innerText || ""}))()`);
    if (!state?.href?.includes("handbook.unsw.edu.au") || !state.text || state.text.length <= 800) continue;
    const programmeName = extractProgrammeName(state.text, state.title);
    const awards = extractAwards(state.text);
    const cricosCodes = extractCricos(state.text);
    last = { ...state, programmeName, awards, cricosCodes };
    if (!programmeName) continue;
    if (!expectedCricos || cricosCodes.some((value) => compact(value) === compact(expectedCricos))) return last;
  }
  if (last) return last;
  throw new Error("render_timeout_or_shell_only");
}

await mkdir(outputDir, { recursive: true });
const audit = JSON.parse(await readFile(auditPath, "utf8"));
const accepted = (audit?.rows ?? []).filter((row) => row.accepted && row.candidate_url);
if (!accepted.length) throw new Error(`No accepted UNSW candidates found in ${auditPath}. Run the UNSW dry-run matcher first.`);
const urlCounts = new Map();
for (const row of accepted) urlCounts.set(row.candidate_url, (urlCounts.get(row.candidate_url) ?? 0) + 1);

console.log(`UNSW strict browser verification candidates: ${accepted.length}`);
const browser = await connectBrowser();
const results = [];
let verified = 0;
let written = 0;
try {
  for (let index = 0; index < accepted.length; index += 1) {
    const row = accepted[index];
    let acceptedStrict = false;
    let reason = null;
    let pageProgrammeName = "";
    let pageAwards = [];
    let pageCricos = [];
    try {
      if ((urlCounts.get(row.candidate_url) ?? 0) > 1) throw new Error("candidate_url_collision");
      if (!/^https:\/\/(?:www\.)?handbook\.unsw\.edu\.au\/(?:undergraduate|postgraduate)\/programs\/2026\/\d{4,5}(?:[/?#]|$)/i.test(row.candidate_url)) throw new Error("invalid_current_handbook_url");
      const expectedCode = String(row.candidate_program_code ?? "").trim();
      if (!expectedCode || programmeCodeFromUrl(row.candidate_url) !== expectedCode) throw new Error("program_code_url_mismatch");
      const page = await renderPage(browser.cdp, row.candidate_url, row.cricos_code);
      if (programmeCodeFromUrl(page.href) !== expectedCode) throw new Error("rendered_program_code_mismatch");
      pageProgrammeName = page.programmeName;
      pageAwards = page.awards;
      pageCricos = page.cricosCodes;
      const dbCricos = compact(row.cricos_code);
      const cricosConfirmed = Boolean(dbCricos && pageCricos.some((value) => compact(value) === dbCricos));
      const names = nameCompatibility(row.course_name, pageProgrammeName, pageAwards);
      if (dbCricos) {
        if (!cricosConfirmed) throw new Error("cricos_not_confirmed_on_live_page");
        if (!names.compatible) throw new Error("course_name_not_compatible_with_live_page");
      } else if (!names.exact) {
        throw new Error("exact_title_required_without_cricos");
      }
      acceptedStrict = true;
      verified += 1;
      if (writeMode) {
        const { error } = await supabase.from("courses").update({ official_course_url: row.candidate_url, official_course_url_verified_at: new Date().toISOString() }).eq("id", row.course_id);
        if (error) throw new Error(`write_error:${error.message}`);
        written += 1;
      }
    } catch (error) {
      reason = error.message;
      acceptedStrict = false;
    }
    results.push({
      course_id: row.course_id,
      course_name: row.course_name,
      cricos_code: row.cricos_code,
      candidate_url: row.candidate_url,
      candidate_program_code: row.candidate_program_code,
      importer_match_method: row.match_method ?? "",
      live_programme_name: pageProgrammeName,
      live_awards: pageAwards.join(" | "),
      live_cricos_codes: pageCricos.join("|"),
      verified: acceptedStrict,
      rejection_reason: reason,
      write_status: acceptedStrict ? (writeMode ? "written" : "dry_run") : "review",
    });
    console.log(`[${index + 1}/${accepted.length}] ${row.course_name} -> ${acceptedStrict ? "VERIFIED" : `review [${reason}]`}`);
  }
} finally {
  try { browser.ws.close(); } catch {}
  try { browser.child.kill(); } catch {}
}
await writeFile(outputJson, `${JSON.stringify({ generatedAt: new Date().toISOString(), writeMode, rows: results }, null, 2)}\n`, "utf8");
const headers = ["course_id","course_name","cricos_code","candidate_url","candidate_program_code","importer_match_method","live_programme_name","live_awards","live_cricos_codes","verified","rejection_reason","write_status"];
const csv = [headers.join(","), ...results.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
await writeFile(outputCsv, `${csv}\n`, "utf8");
console.log("\n=== UNSW strict verification summary ===");
console.log(JSON.stringify({ importerAccepted: accepted.length, verified, reviewed: accepted.length - verified, written, outputJson, outputCsv }, null, 2));
