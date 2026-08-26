import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const args = new Map(process.argv.slice(2).map((raw) => {
  const [key, ...rest] = raw.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : true];
}));
const year = Number(args.get("year") ?? 2026);
const limit = Number(args.get("limit") ?? 0);
const start = Number(args.get("start") ?? 0);
const debugPort = Number(args.get("debug-port") ?? 9224);
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const cataloguePath = `${outputDir}/unsw-handbook-catalogue-${year}.json`;
const profileDir = join(tmpdir(), "unipath-unsw-chrome-profile");
const root = "https://handbook.unsw.edu.au";

if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a non-negative integer.");
if (!Number.isInteger(start) || start < 0) throw new Error("--start must be a non-negative integer.");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function normalise(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
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
  console.log(`Opening ${chromePath.includes("Edge") ? "Edge" : "Chrome"} for UNSW Handbook rendering...`);
  const child = spawn(chromePath, [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check", "--new-window", root], { stdio: "ignore" });
  let target = null;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const tabs = await response.json();
      target = tabs.find((tab) => String(tab.url).startsWith(root)) ?? tabs.find((tab) => tab.type === "page");
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
function extractProgrammeNameFromRenderedText(text, renderedTitle) {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => normalise(line)).filter(Boolean);
  const homeIndex = lines.findIndex((line) => /^Home$/i.test(line));
  if (homeIndex >= 0) {
    for (let i = homeIndex + 1; i < Math.min(lines.length, homeIndex + 8); i += 1) {
      const line = lines[i];
      if (/^\/$/.test(line) || /^(chevron_|expand_|open |search\b)/i.test(line)) continue;
      if (!/^Handbook$/i.test(line) && line.length >= 3 && line.length <= 220) return line;
    }
  }
  const titleName = normalise(String(renderedTitle ?? "").replace(/^Handbook\s*[-|:]\s*/i, ""));
  return /^Handbook(?:\s*[-|:].*)?$/i.test(titleName) ? "" : titleName;
}
async function renderEntry(cdp, url) {
  await cdp.send("Page.navigate", { url });
  for (let attempt = 0; attempt < 35; attempt += 1) {
    await sleep(450);
    const state = await cdp.eval(`(() => ({href: location.href, title: document.title || "", text: document.body?.innerText || ""}))()`);
    if (state?.href?.includes("handbook.unsw.edu.au") && state.text && state.text.length > 800) {
      const text = state.text;
      const programmeName = extractProgrammeNameFromRenderedText(text, state.title);
      if (!programmeName) continue;
      const cricosCodes = [...new Set([...text.matchAll(/CRICOS\s+Code\s*(?:\r?\n|\s|:|-)*([0-9]{6}[A-Z]|[0-9]{7})/gi)].map((m) => m[1].toUpperCase()))];
      const awards = [];
      const awardSection = text.match(/Award\(s\)[\s\S]{0,1600}?(?=\r?\n(?:UAC Code|CRICOS Code|Learning Outcomes|Program Structure|Overview|Minimum Units of Credit)\b)/i)?.[0] ?? "";
      for (const match of awardSection.matchAll(/\b((?:Bachelor|Master|Doctor|Graduate Certificate|Graduate Diploma|Diploma|Associate Degree|Juris Doctor)[^\r\n]{2,220}?)(?=\s+-\s+[A-Z]|\r?\n|$)/g)) {
        const award = normalise(match[1]);
        if (award && !/^Bachelor$|^Master$|^Doctor$/i.test(award)) awards.push(award);
      }
      return { programmeName, awards: [...new Set(awards)], cricosCodes, renderedTitle: state.title, browserRendered: true };
    }
  }
  return { programmeName: "", awards: [], cricosCodes: [], browserRendered: false, renderError: "render_timeout_or_shell_only" };
}

const saved = JSON.parse(await readFile(cataloguePath, "utf8"));
if (!Array.isArray(saved?.entries) || !saved.entries.length) throw new Error(`Missing or invalid catalogue: ${cataloguePath}. Run course-links:unsw once first.`);
const entries = saved.entries;
const end = limit > 0 ? Math.min(entries.length, start + limit) : entries.length;
const browser = await connectBrowser();
try {
  for (let index = start; index < end; index += 1) {
    const entry = entries[index];
    try {
      const rendered = await renderEntry(browser.cdp, entry.url);
      entries[index] = { ...entry, ...rendered, pageVerified: Boolean(rendered.browserRendered && rendered.programmeName) };
      console.log(`[${index + 1}/${entries.length}] ${entry.providerCode} -> ${rendered.programmeName || "render failed"} | CRICOS ${rendered.cricosCodes.join("|") || "none"}`);
    } catch (error) {
      entries[index] = { ...entry, browserRendered: false, renderError: error.message };
      console.log(`[${index + 1}/${entries.length}] ${entry.providerCode} -> render error: ${error.message}`);
    }
    if ((index + 1) % 25 === 0) await writeFile(cataloguePath, `${JSON.stringify({ ...saved, generatedAt: new Date().toISOString(), browserEnriched: true, entries }, null, 2)}\n`, "utf8");
  }
  await writeFile(cataloguePath, `${JSON.stringify({ ...saved, generatedAt: new Date().toISOString(), browserEnriched: true, entries }, null, 2)}\n`, "utf8");
  const enriched = entries.filter((entry) => entry.browserRendered && entry.programmeName).length;
  const withCricos = entries.filter((entry) => Array.isArray(entry.cricosCodes) && entry.cricosCodes.length).length;
  console.log("\n=== UNSW browser enrichment summary ===");
  console.log(JSON.stringify({ catalogueEntries: entries.length, processedStart: start, processed: end - start, browserEnrichedEntries: enriched, entriesWithCricos: withCricos, cataloguePath }, null, 2));
} finally {
  try { browser.ws.close(); } catch {}
  try { browser.child.kill(); } catch {}
}
