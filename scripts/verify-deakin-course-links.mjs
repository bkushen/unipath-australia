import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const args = new Map(process.argv.slice(2).map((raw) => {
  const [key, ...rest] = raw.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : true];
}));

const writeMode = args.get("write") === true;
const inputPath = String(args.get("input") ?? "data/course-link-audits/deakin-handbook-match.json");
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const outputJsonPath = `${outputDir}/deakin-verified-links.json`;
const outputCsvPath = `${outputDir}/deakin-verified-links.csv`;
const USER_AGENT = "UniPathAustralia/1.1 (+https://github.com/bkushen/unipath-australia; strict Deakin course-link verification)";

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

function normaliseText(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function compact(value) { return normaliseText(value).replace(/ /g, ""); }
function stripHtml(html) {
  return String(html ?? "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&ndash;|&#8211;/gi, "-").replace(/&mdash;|&#8212;/gi, "-").replace(/\s+/g, " ").trim();
}
function extractTag(html, tag) {
  const match = String(html ?? "").match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}
function labelledCricos(pageText) {
  const values = new Set();
  for (const match of String(pageText ?? "").matchAll(/\bCRICOS(?:\s+code)?\s*[:#-]?\s*([0-9]{6}[A-Z]|[0-9]{7})\b/gi)) values.add(match[1].toUpperCase());
  return [...values];
}
function labelledDeakinCode(pageText) {
  const match = String(pageText ?? "").match(/\bDeakin(?:\s+course)?\s+code\s*[:#-]?\s*([A-Z]\d{3,4}[A-Z]?)\b/i);
  return match ? match[1].toUpperCase() : null;
}
function extractAwardName(pageText, html) {
  const awardMatch = String(pageText ?? "").match(/\bAward granted\s+(.{3,180}?)(?=\s+(?:Campus|Online|Length|Fee paying annual fee|CRICOS|Level|VTAC|Deakin course code|Australian Qualifications Framework)\b)/i);
  return (awardMatch?.[1] || extractTag(html, "h1") || "").trim();
}
function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function fetchPage(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,*/*", "accept-language": "en-AU,en;q=0.9" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const pageText = stripHtml(html).slice(0, 300000);
  return {
    finalUrl: response.url,
    html,
    pageText,
    awardName: extractAwardName(pageText, html),
    deakinCode: labelledDeakinCode(pageText),
    cricosCodes: labelledCricos(pageText),
  };
}

const audit = JSON.parse(await readFile(inputPath, "utf8"));
if (!Array.isArray(audit?.rows)) throw new Error(`Invalid Deakin audit file: ${inputPath}`);
const accepted = audit.rows.filter((row) => row.accepted === true && row.candidate_url);
const urlCounts = new Map();
for (const row of accepted) urlCounts.set(row.candidate_url, (urlCounts.get(row.candidate_url) ?? 0) + 1);

const pageCache = new Map();
const results = [];
let verified = 0;
let written = 0;

for (let index = 0; index < accepted.length; index += 1) {
  const row = accepted[index];
  let page = pageCache.get(row.candidate_url);
  let fetchError = null;
  if (!page) {
    try {
      page = await fetchPage(row.candidate_url);
      pageCache.set(row.candidate_url, page);
    } catch (error) {
      fetchError = error.message;
    }
  }

  const databaseName = normaliseText(row.course_name);
  const awardName = normaliseText(page?.awardName);
  const exactAwardMatch = Boolean(databaseName && awardName && databaseName === awardName);
  const cricos = compact(row.cricos_code);
  const cricosMatch = Boolean(cricos && page?.cricosCodes?.some((value) => compact(value) === cricos));
  const expectedCode = compact(row.candidate_deakin_code || row.candidate_course_code);
  const codeMatch = Boolean(expectedCode && page?.deakinCode && compact(page.deakinCode) === expectedCode);
  const collisionCount = urlCounts.get(row.candidate_url) ?? 1;

  let rejectionReason = null;
  if (!page) rejectionReason = `official_page_fetch_error:${fetchError || "unknown"}`;
  else if (!codeMatch) rejectionReason = "deakin_course_code_not_confirmed_on_official_page";
  else if (!exactAwardMatch) rejectionReason = "official_award_title_mismatch";
  else if (row.cricos_code && !cricosMatch) rejectionReason = "cricos_not_confirmed_on_official_page";
  else if (collisionCount > 1) {
    const exactPeers = accepted.filter((peer) => peer.candidate_url === row.candidate_url && normaliseText(peer.course_name) === awardName && (!peer.cricos_code || page.cricosCodes.some((value) => compact(value) === compact(peer.cricos_code))));
    if (exactPeers.length !== 1 || exactPeers[0].course_id !== row.course_id) rejectionReason = "shared_url_collision_not_uniquely_resolved";
  }

  const isVerified = !rejectionReason;
  let writeStatus = isVerified ? "dry_run" : rejectionReason;
  if (isVerified) {
    verified += 1;
    if (writeMode) {
      const { error } = await supabase.from("courses").update({ official_course_url: row.candidate_url, official_course_url_verified_at: new Date().toISOString() }).eq("id", row.course_id);
      if (error) writeStatus = `write_error:${error.message}`;
      else { written += 1; writeStatus = "written"; }
    }
  }

  results.push({
    course_id: row.course_id,
    course_name: row.course_name,
    cricos_code: row.cricos_code,
    candidate_url: row.candidate_url,
    candidate_deakin_code: row.candidate_deakin_code || row.candidate_course_code || null,
    official_award_name: page?.awardName ?? null,
    official_cricos_codes: page?.cricosCodes?.join("|") ?? "",
    official_deakin_code: page?.deakinCode ?? null,
    shared_url_count: collisionCount,
    exact_award_match: exactAwardMatch,
    cricos_match: cricosMatch,
    code_match: codeMatch,
    verified: isVerified,
    rejection_reason: rejectionReason,
    write_status: writeStatus,
  });
  console.log(`[${index + 1}/${accepted.length}] ${row.course_name} -> ${isVerified ? "VERIFIED" : "review"}${rejectionReason ? ` [${rejectionReason}]` : ""}`);
}

await mkdir(outputDir, { recursive: true });
await writeFile(outputJsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), inputPath, writeMode, acceptedFromImporter: accepted.length, rows: results }, null, 2)}\n`, "utf8");
const headers = ["course_id","course_name","cricos_code","candidate_url","candidate_deakin_code","official_award_name","official_cricos_codes","official_deakin_code","shared_url_count","exact_award_match","cricos_match","code_match","verified","rejection_reason","write_status"];
const csv = [headers.join(","), ...results.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
await writeFile(outputCsvPath, `${csv}\n`, "utf8");

console.log("\n=== Deakin strict verification summary ===");
console.log(JSON.stringify({ importerAccepted: accepted.length, verified, reviewed: accepted.length - verified, written, outputJson: outputJsonPath, outputCsv: outputCsvPath }, null, 2));
if (!writeMode) console.log("Dry run only. --write is permitted only after this strict verification pass is reviewed.");
