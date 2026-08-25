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
const limit = Number(args.get("limit") ?? 0);
const minimumConfidence = Number(args.get("threshold") ?? 0.94);
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const cataloguePath = `${outputDir}/monash-handbook-browser-catalogue.json`;
const auditJsonPath = `${outputDir}/monash-handbook-browser-match.json`;
const auditCsvPath = `${outputDir}/monash-handbook-browser-match.csv`;
const HANDBOOK_ROOT = "https://handbook.monash.edu";
const HANDBOOK_API = `${HANDBOOK_ROOT}/api/es/search`;
const DEBUG_PORT = Number(args.get("debug-port") ?? 9223);
const PROFILE_DIR = join(tmpdir(), "unipath-monash-chrome-profile");

if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a non-negative integer.");
if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0.8 || minimumConfidence > 1) throw new Error("--threshold must be between 0.8 and 1.");

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

const STOP_WORDS = new Set(["a","an","and","at","for","in","of","on","or","the","to","with","by","from","into","study","course","courses","program","programs","degree","degrees","honours","honor","international"]);
function normaliseText(value) { return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function compact(value) { return normaliseText(value).replace(/ /g, ""); }
function tokens(value) { return [...new Set(normaliseText(value).split(" ").filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))]; }
function tokenCoverage(source, target) { const src = tokens(source); if (!src.length) return 0; const trg = new Set(tokens(target)); return src.filter((t) => trg.has(t)).length / src.length; }
function tokenJaccard(a, b) { const left = new Set(tokens(a)); const right = new Set(tokens(b)); if (!left.size || !right.size) return 0; let n = 0; for (const token of left) if (right.has(token)) n += 1; return n / (left.size + right.size - n); }
function csvEscape(value) { const text = String(value ?? ""); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function courseCode(value) { const text = String(value ?? "").trim().toUpperCase(); return /^[A-Z]\d{4,5}$/.test(text) ? text : null; }
function currentCourseUrl(code) { return `${HANDBOOK_ROOT}/current/courses/${encodeURIComponent(code)}`; }

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
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const task = this.pending.get(message.id);
      if (!task) return;
      this.pending.delete(message.id);
      if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
    };
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
    return result.result?.value;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function connectBrowser() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("Chrome or Edge was not found. Install Google Chrome or Microsoft Edge and run again.");
  await mkdir(PROFILE_DIR, { recursive: true });
  console.log(`Opening ${chromePath.includes("Edge") ? "Edge" : "Chrome"} for Monash verification...`);
  console.log("If Monash shows a browser verification screen, complete it in the opened window. The script will wait up to 90 seconds.");
  const child = spawn(chromePath, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    HANDBOOK_ROOT,
  ], { stdio: "ignore" });

  let target = null;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const tabs = await response.json();
      target = tabs.find((tab) => String(tab.url).startsWith(HANDBOOK_ROOT)) ?? tabs.find((tab) => tab.type === "page");
      if (target?.webSocketDebuggerUrl) break;
    } catch {}
    await sleep(1000);
  }
  if (!target?.webSocketDebuggerUrl) {
    child.kill();
    throw new Error("Could not connect to the temporary Chrome debugging session.");
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("Could not connect to Chrome DevTools.")); });
  const cdp = new CdpClient(ws);
  await cdp.send("Runtime.enable");
  return { child, ws, cdp };
}

function recursivelyFindCourseObjects(value, found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) { for (const child of value) recursivelyFindCourseObjects(child, found); return found; }
  const code = courseCode(value.code);
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (code && name) found.push({ code, name });
  for (const child of Object.values(value)) recursivelyFindCourseObjects(child, found);
  return found;
}

async function browserHandbookApi(cdp) {
  const payload = {
    query: { bool: { must: [{ term: { live: true } }] } },
    from: 0,
    size: 10000,
    track_scores: false,
    _source: { includes: ["*.code", "*.name", "*.award_titles", "*.keywords", "urlmap", "contenttype", "versionNumber", "availableInYears", "implementationYear"] },
  };
  const expression = `(async () => {
    const response = await fetch(${JSON.stringify(HANDBOOK_API)}, {
      method: "POST", credentials: "include",
      headers: { "content-type": "application/json", "accept": "application/json,text/plain,*/*" },
      body: ${JSON.stringify(JSON.stringify(payload))}
    });
    return { status: response.status, text: await response.text() };
  })()`;

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const result = await cdp.evaluate(expression);
    if (result?.status === 200) return JSON.parse(result.text);
    console.log(`  Monash browser API status ${result?.status ?? "unknown"}; waiting for browser access...`);
    await sleep(5000);
  }
  throw new Error("The real browser could not access the Monash Handbook API after 90 seconds.");
}

async function verifyPageInBrowser(cdp, entry) {
  const expression = `(async () => {
    const response = await fetch(${JSON.stringify(entry.url)}, { credentials: "include" });
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    return { status: response.status, finalUrl: response.url, title: doc.title || "", h1: doc.querySelector("h1")?.textContent?.trim() || "", text: doc.body?.innerText?.slice(0, 180000) || "" };
  })()`;
  const page = await cdp.evaluate(expression);
  if (!page || page.status !== 200) return { verified: false, reason: `handbook_page_http_${page?.status ?? "unknown"}`, page };
  const headline = normaliseText(`${page.h1} ${page.title}`);
  const nameConfirmed = headline.includes(normaliseText(entry.displayName));
  const codeConfirmed = compact(`${page.text} ${page.finalUrl}`).includes(compact(entry.providerCode));
  return { verified: nameConfirmed && codeConfirmed, reason: nameConfirmed ? (codeConfirmed ? null : "course_code_not_confirmed") : "course_title_not_confirmed", page };
}

async function fetchMonashCourses() {
  const { data: university, error: universityError } = await supabase.from("universities").select("id,name").eq("name", "Monash University").limit(1).maybeSingle();
  if (universityError) throw universityError;
  if (!university) throw new Error("Monash University was not found in the universities table.");
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("courses").select("id,name,cricos_code,university_course_code,official_course_url").eq("university_id", university.id).order("name").range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

function rankCandidate(course, entry) {
  const exactName = normaliseText(course.name) === normaliseText(entry.displayName);
  const coverage = tokenCoverage(course.name, entry.displayName);
  const jaccard = tokenJaccard(course.name, entry.displayName);
  const providerMatch = Boolean(course.university_course_code && compact(course.university_course_code) === compact(entry.providerCode));
  let score = coverage * 0.48 + jaccard * 0.30 + (exactName ? 0.22 : 0) + (providerMatch ? 0.34 : 0);
  score = Math.min(1, score);
  if (exactName) score = Math.max(score, 0.98);
  if (exactName && providerMatch) score = 1;
  return { entry, score, exactName, providerMatch };
}

await mkdir(outputDir, { recursive: true });
const browser = await connectBrowser();
try {
  const apiData = await browserHandbookApi(browser.cdp);
  const hits = Array.isArray(apiData?.hits?.hits) ? apiData.hits.hits : [];
  const entriesByCode = new Map();
  for (const hit of hits) {
    for (const candidate of recursivelyFindCourseObjects(hit?._source ?? hit)) {
      if (!entriesByCode.has(candidate.code)) entriesByCode.set(candidate.code, { providerCode: candidate.code, displayName: candidate.name, url: currentCourseUrl(candidate.code) });
    }
  }
  const catalogue = [...entriesByCode.values()].sort((a, b) => a.providerCode.localeCompare(b.providerCode));
  if (!catalogue.length) throw new Error("Browser access succeeded, but no Monash course identities were found in the Handbook response.");
  await writeFile(cataloguePath, `${JSON.stringify({ generatedAt: new Date().toISOString(), source: HANDBOOK_API, entries: catalogue }, null, 2)}\n`, "utf8");
  console.log(`Official Monash Handbook course identities: ${catalogue.length}`);

  const courses = await fetchMonashCourses();
  const duplicateNameCounts = new Map();
  for (const course of courses) { const key = normaliseText(course.name); duplicateNameCounts.set(key, (duplicateNameCounts.get(key) ?? 0) + 1); }
  const pending = courses.filter((course) => !course.official_course_url);
  const selected = limit > 0 ? pending.slice(0, limit) : pending;
  console.log("\n=== Monash browser-assisted matching ===");
  console.log(`Database courses: ${courses.length}; pending exact links: ${pending.length}; processing: ${selected.length}`);

  const auditRows = [];
  let matched = 0;
  let verified = 0;
  let written = 0;
  for (let index = 0; index < selected.length; index += 1) {
    const course = selected[index];
    const ranked = catalogue.map((entry) => rankCandidate(course, entry)).sort((a, b) => b.score - a.score);
    const best = ranked[0] ?? null;
    const duplicateCount = duplicateNameCounts.get(normaliseText(course.name)) ?? 1;
    let accepted = Boolean(best && best.score >= minimumConfidence && (best.exactName || best.providerMatch));
    let reason = accepted ? null : best ? "handbook_title_not_exact_or_below_threshold" : "no_handbook_candidate";
    if (accepted && duplicateCount > 1 && !best.providerMatch) { accepted = false; reason = "duplicate_database_name_needs_course_identifier"; }
    const second = ranked[1];
    if (accepted && second && second.score >= minimumConfidence && second.entry.url !== best.entry.url && Math.abs(best.score - second.score) < 0.04) { accepted = false; reason = "near_tie_multiple_handbook_courses"; }

    let pageCheck = { verified: false, reason };
    if (accepted) pageCheck = await verifyPageInBrowser(browser.cdp, best.entry);
    const writable = accepted && pageCheck.verified;
    if (accepted) matched += 1;
    if (writable) verified += 1;
    let writeStatus = writable ? "dry_run" : pageCheck.reason ?? reason;
    if (writable && writeMode) {
      const { error } = await supabase.from("courses").update({ official_course_url: best.entry.url, official_course_url_verified_at: new Date().toISOString() }).eq("id", course.id);
      if (error) writeStatus = `write_error:${error.message}`; else { writeStatus = "written"; written += 1; }
    }
    auditRows.push({ course_id: course.id, course_name: course.name, cricos_code: course.cricos_code, university_course_code: course.university_course_code, duplicate_name_count: duplicateCount, candidate_url: best?.entry.url ?? null, candidate_course_code: best?.entry.providerCode ?? null, candidate_name: best?.entry.displayName ?? null, confidence: best ? Number(best.score.toFixed(4)) : null, exact_name: best?.exactName ?? false, provider_code_match: best?.providerMatch ?? false, matched: accepted, browser_verified: pageCheck.verified, rejection_reason: writable ? null : pageCheck.reason ?? reason, write_status: writeStatus });
    console.log(`[${index + 1}/${selected.length}] ${course.name} -> ${writable ? "VERIFIED" : "review"}${writable ? "" : ` [${pageCheck.reason ?? reason}]`}${best?.entry.url ? ` ${best.entry.url}` : ""}`);
  }

  await writeFile(auditJsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), writeMode, rows: auditRows }, null, 2)}\n`, "utf8");
  const headers = ["course_id","course_name","cricos_code","university_course_code","duplicate_name_count","candidate_url","candidate_course_code","candidate_name","confidence","exact_name","provider_code_match","matched","browser_verified","rejection_reason","write_status"];
  const csv = [headers.join(","), ...auditRows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
  await writeFile(auditCsvPath, `${csv}\n`, "utf8");
  console.log("\n=== Monash browser-assisted summary ===");
  console.log(JSON.stringify({ databaseCourses: courses.length, pending: pending.length, processed: selected.length, catalogueEntries: catalogue.length, matched, verified, written, auditJson: auditJsonPath, auditCsv: auditCsvPath }, null, 2));
  if (!writeMode) console.log("Dry run only. The Monash Handbook API and candidate pages were accessed through a real local browser session; duplicate names remain protected.");
} finally {
  try { browser.ws.close(); } catch {}
  try { browser.child.kill(); } catch {}
}
