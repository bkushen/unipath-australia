import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const args = new Map();
for (const raw of process.argv.slice(2)) {
  const [key, ...rest] = raw.replace(/^--/, "").split("=");
  args.set(key, rest.length ? rest.join("=") : true);
}

const writeMode = args.get("write") === true;
const delayMs = Number(args.get("delay") ?? 120);
const auditPath = String(args.get("audit") ?? "data/course-link-audits/rmit-catalogue-match.json");
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const outputJson = `${outputDir}/rmit-verified-links.json`;
const outputCsv = `${outputDir}/rmit-verified-links.csv`;

if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5000) throw new Error("--delay must be between 0 and 5000 milliseconds.");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const USER_AGENT = "UniPathAustralia/0.9 (+https://github.com/bkushen/unipath-australia; strict RMIT course-link verification)";

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

const supabase = createClient(supabaseUrl, serviceRoleKey || publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function normaliseText(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function compact(value) { return normaliseText(value).replace(/ /g, ""); }
function stripHtml(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<noscript\b[\s\S]*?<\/noscript>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g," ").trim();
}
function extractTag(html, tag) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}
function uniqueMatches(text, regex) {
  const values = new Set();
  for (const match of text.matchAll(regex)) values.add(String(match[1] ?? match[0]).toUpperCase().replace(/\s+/g, ""));
  return [...values];
}
function extractLabelledCricos(text) {
  return uniqueMatches(text, /\bCRICOS(?:\s+(?:code|course code))?\s*[:#-]?\s*([0-9]{6}[A-Z]|[0-9]{7})\b/gi);
}
function extractLabelledVet(text) {
  return uniqueMatches(text, /\b(?:national(?:\s+course)?\s+code|training\s+package\s+code|national\s+qualification\s+code)\s*[:#-]?\s*([A-Z]{3}\d{5}|\d{5}[A-Z]{3})\b/gi);
}
function canonicalRootUrl(value) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  const segments = url.pathname.split("/").filter(Boolean);
  const codeIndex = segments.findIndex((segment) => /(?:^|-)(?:ad|bp|c)\d{3,4}$/i.test(segment));
  if (codeIndex >= 0) url.pathname = `/${segments.slice(0, codeIndex + 1).join("/")}`;
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}
function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function fetchPage(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,*/*" },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const html = await response.text();
  return { html, finalUrl: canonicalRootUrl(response.url || url) };
}

const audit = JSON.parse(await readFile(auditPath, "utf8"));
if (!Array.isArray(audit?.rows)) throw new Error(`Audit file does not contain rows: ${auditPath}`);
const acceptedRows = audit.rows.filter((row) => row.accepted === true && row.candidate_url);
console.log(`Accepted catalogue matches to re-verify: ${acceptedRows.length}`);

const pageCache = new Map();
const results = [];
let verified = 0;
let written = 0;

for (let index = 0; index < acceptedRows.length; index += 1) {
  const row = acceptedRows[index];
  const requestedUrl = canonicalRootUrl(row.candidate_url);
  let page = pageCache.get(requestedUrl);
  if (!page) {
    try {
      const fetched = await fetchPage(requestedUrl);
      const pageText = stripHtml(fetched.html).slice(0, 220000);
      page = {
        url: fetched.finalUrl,
        title: extractTag(fetched.html, "title"),
        h1: extractTag(fetched.html, "h1"),
        cricosCodes: extractLabelledCricos(pageText),
        vetCodes: extractLabelledVet(pageText),
      };
      pageCache.set(requestedUrl, page);
    } catch (error) {
      page = { url: requestedUrl, title: "", h1: "", cricosCodes: [], vetCodes: [], fetchError: error.message };
      pageCache.set(requestedUrl, page);
    }
    if (delayMs) await sleep(delayMs);
  }

  const courseName = normaliseText(row.course_name);
  const headline = normaliseText(`${page.h1} ${page.title}`);
  const exactName = Boolean(courseName && headline.includes(courseName));
  const cricos = compact(row.cricos_code);
  const vet = compact(row.vet_national_code);
  const cricosMatch = Boolean(cricos && page.cricosCodes.some((value) => compact(value) === cricos));
  const vetMatch = Boolean(vet && page.vetCodes.some((value) => compact(value) === vet));
  const hasCricos = Boolean(cricos);
  const hasVet = Boolean(vet);

  let accepted = false;
  let reason = null;
  if (page.fetchError) reason = `fetch_error:${page.fetchError}`;
  else if (!exactName) reason = "official_page_title_mismatch";
  else if (hasCricos && !cricosMatch) reason = "cricos_not_confirmed_on_official_page";
  else if (hasVet && page.vetCodes.length > 0 && !vetMatch) reason = "vet_code_not_confirmed_on_official_page";
  else {
    accepted = true;
    verified += 1;
  }

  let writeStatus = "dry_run";
  if (accepted && writeMode) {
    const { error } = await supabase
      .from("courses")
      .update({ official_course_url: page.url, official_course_url_verified_at: new Date().toISOString() })
      .eq("id", row.course_id);
    if (error) writeStatus = `write_error:${error.message}`;
    else { writeStatus = "written"; written += 1; }
  } else if (!accepted) {
    writeStatus = reason;
  }

  results.push({
    course_id: row.course_id,
    course_name: row.course_name,
    cricos_code: row.cricos_code,
    vet_national_code: row.vet_national_code,
    official_url: page.url,
    official_h1: page.h1,
    official_title: page.title,
    official_cricos_codes: page.cricosCodes.join("|"),
    official_vet_codes: page.vetCodes.join("|"),
    exact_name: exactName,
    cricos_match: cricosMatch,
    vet_match: vetMatch,
    accepted,
    rejection_reason: reason,
    write_status: writeStatus,
  });

  console.log(`[${index + 1}/${acceptedRows.length}] ${row.course_name} -> ${accepted ? "VERIFIED" : "review"}${reason ? ` [${reason}]` : ""} ${page.url}`);
}

await mkdir(outputDir, { recursive: true });
await writeFile(outputJson, `${JSON.stringify({ generatedAt: new Date().toISOString(), sourceAudit: auditPath, writeMode, rows: results }, null, 2)}\n`, "utf8");
const headers = ["course_id","course_name","cricos_code","vet_national_code","official_url","official_h1","official_title","official_cricos_codes","official_vet_codes","exact_name","cricos_match","vet_match","accepted","rejection_reason","write_status"];
const csv = [headers.join(","), ...results.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
await writeFile(outputCsv, `${csv}\n`, "utf8");

console.log("\n=== RMIT strict verification summary ===");
console.log(JSON.stringify({ catalogueAccepted: acceptedRows.length, verified, written, reviewed: acceptedRows.length - verified, outputJson, outputCsv }, null, 2));
if (!writeMode) console.log("Dry run only. Only rows whose exact course title and specific CRICOS evidence are confirmed are eligible for --write.");
