import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const args = new Map(process.argv.slice(2).map((raw) => {
  const [key, ...rest] = raw.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : true];
}));

const writeMode = args.get("write") === true;
const refreshCatalogue = args.get("refresh-catalogue") === true;
const limit = Number(args.get("limit") ?? 0);
const delayMs = Number(args.get("delay") ?? 100);
const minimumConfidence = Number(args.get("threshold") ?? 0.94);
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const cataloguePath = `${outputDir}/deakin-handbook-catalogue.json`;
const auditJsonPath = `${outputDir}/deakin-handbook-match.json`;
const auditCsvPath = `${outputDir}/deakin-handbook-match.csv`;
const ALL_COURSES_URL = "https://handbook.deakin.edu.au/courses-search/allcourses.php";
const HANDBOOK_ROOT = "https://handbook.deakin.edu.au";
const SCHEMA_VERSION = 1;
const USER_AGENT = "UniPathAustralia/1.0 (+https://github.com/bkushen/unipath-australia; Deakin official handbook verification)";

if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a non-negative integer.");
if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5000) throw new Error("--delay must be between 0 and 5000 milliseconds.");
if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0.8 || minimumConfidence > 1) throw new Error("--threshold must be between 0.8 and 1.");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const STOP_WORDS = new Set(["a","an","and","at","for","in","of","on","or","the","to","with","by","from","into","study","course","courses","program","programs","degree","degrees","honours","honor","international"]);

function normaliseText(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function compact(value) { return normaliseText(value).replace(/ /g, ""); }
function tokens(value) { return [...new Set(normaliseText(value).split(" ").filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))]; }
function tokenCoverage(source, target) {
  const sourceTokens = tokens(source);
  if (!sourceTokens.length) return 0;
  const targetTokens = new Set(tokens(target));
  return sourceTokens.filter((token) => targetTokens.has(token)).length / sourceTokens.length;
}
function tokenJaccard(a, b) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}
function stripHtml(html) {
  return String(html ?? "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&ndash;|&#8211;/gi, "-").replace(/&mdash;|&#8212;/gi, "-").replace(/\s+/g, " ").trim();
}
function decodeHtml(value) {
  return String(value ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function extractTag(html, tag) {
  const match = String(html ?? "").match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}
function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function courseUrl(code) {
  return `${HANDBOOK_ROOT}/courses-search/course.php?course=${encodeURIComponent(code)}&stutype=international`;
}
function validCourseCode(value) {
  const text = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]\d{3,4}[A-Z]?$/.test(text) ? text : null;
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

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,*/*", "accept-language": "en-AU,en;q=0.9" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { text: await response.text(), finalUrl: response.url, contentType: response.headers.get("content-type") ?? "" };
}

function parseAllCourses(html) {
  const candidates = new Map();
  for (const match of String(html ?? "").matchAll(/<a\b[^>]*href=["']([^"']*course\.php\?[^"']*course=([A-Za-z]\d{3,4}[A-Za-z]?)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeHtml(match[1]);
    const code = validCourseCode(match[2]);
    const anchorText = stripHtml(match[3]);
    if (!code || !anchorText) continue;
    const name = anchorText.replace(/\s*\([A-Z]\d{3,4}[A-Z]?\s+v\d+\)\s*$/i, "").trim();
    if (!name) continue;
    if (!candidates.has(code)) candidates.set(code, { providerCode: code, displayName: name, sourceHref: href });
  }

  if (!candidates.size) {
    const plainText = stripHtml(html);
    for (const match of plainText.matchAll(/([^|]{3,180}?)\s*\(([A-Z]\d{3,4}[A-Z]?)\s+v\d+\)/g)) {
      const code = validCourseCode(match[2]);
      const name = String(match[1]).trim().replace(/^.*?(?=(?:Diploma|Associate Degree|Bachelor|Graduate Certificate|Graduate Diploma|Master|Doctor|English|Deakin Uni Ready))/i, "").trim();
      if (code && name && !candidates.has(code)) candidates.set(code, { providerCode: code, displayName: name, sourceHref: null });
    }
  }
  return [...candidates.values()];
}

async function buildCatalogue() {
  console.log("Building Deakin official course catalogue from the Deakin University Handbook...");
  const { text } = await fetchText(ALL_COURSES_URL);
  const discovered = parseAllCourses(text);
  if (!discovered.length) throw new Error("No Deakin course identities were discovered from the official Handbook all-courses page. No URLs will be fabricated.");
  console.log(`Deakin Handbook course identities discovered: ${discovered.length}`);

  const entries = [];
  for (let index = 0; index < discovered.length; index += 1) {
    const item = discovered[index];
    const url = courseUrl(item.providerCode);
    try {
      const page = await fetchText(url);
      const pageText = stripHtml(page.text).slice(0, 260000);
      const title = extractTag(page.text, "title");
      const h1 = extractTag(page.text, "h1");
      const awardMatch = pageText.match(/\bAward granted\s+(.{3,180}?)(?=\s+(?:Campus|Online|Length|Fee paying annual fee|CRICOS|Level|VTAC|Deakin course code|Australian Qualifications Framework)\b)/i);
      const displayName = (awardMatch?.[1] || h1 || item.displayName).trim();
      const deakinCode = labelledDeakinCode(pageText);
      const pageCodeConfirmed = deakinCode ? compact(deakinCode) === compact(item.providerCode) : compact(pageText).includes(compact(item.providerCode));
      entries.push({
        url: page.finalUrl || url,
        providerCode: item.providerCode,
        displayName,
        discoveredName: item.displayName,
        title,
        h1,
        cricosCodes: labelledCricos(pageText),
        pageCodeConfirmed,
        pageVerified: true,
      });
    } catch (error) {
      entries.push({
        url,
        providerCode: item.providerCode,
        displayName: item.displayName,
        discoveredName: item.displayName,
        title: "",
        h1: "",
        cricosCodes: [],
        pageCodeConfirmed: false,
        pageVerified: false,
        fetchError: error.message,
      });
    }
    if ((index + 1) % 50 === 0 || index + 1 === discovered.length) console.log(`  catalogue ${index + 1}/${discovered.length}`);
    if (delayMs) await sleep(delayMs);
  }

  const catalogue = [...new Map(entries.map((entry) => [entry.providerCode, entry])).values()];
  await mkdir(outputDir, { recursive: true });
  await writeFile(cataloguePath, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), source: ALL_COURSES_URL, entries: catalogue }, null, 2)}\n`, "utf8");
  console.log(`Verified Deakin Handbook catalogue entries: ${catalogue.filter((entry) => entry.pageVerified && entry.pageCodeConfirmed).length}/${catalogue.length}`);
  console.log(`Catalogue saved: ${cataloguePath}`);
  return catalogue;
}

async function loadOrBuildCatalogue() {
  if (!refreshCatalogue) {
    try {
      const saved = JSON.parse(await readFile(cataloguePath, "utf8"));
      if (saved?.schemaVersion === SCHEMA_VERSION && Array.isArray(saved.entries) && saved.entries.length) {
        console.log(`Using cached Deakin Handbook catalogue: ${saved.entries.length} entries`);
        return saved.entries;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") console.warn(`Cached Deakin catalogue ignored: ${error.message}`);
    }
  }
  return buildCatalogue();
}

async function fetchDeakinUniversity() {
  const { data, error } = await supabase.from("universities").select("id,name").eq("name", "Deakin University").limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Deakin University was not found in the universities table.");
  return data;
}

async function fetchDeakinCourses(universityId) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("courses").select("id,name,cricos_code,university_course_code,official_course_url").eq("university_id", universityId).order("name").range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

function rankCandidate(course, entry) {
  const courseName = normaliseText(course.name);
  const entryName = normaliseText(entry.displayName);
  const exactName = courseName === entryName;
  const coverage = tokenCoverage(course.name, entry.displayName);
  const jaccard = tokenJaccard(course.name, entry.displayName);
  const cricos = compact(course.cricos_code);
  const cricosMatch = Boolean(cricos && entry.cricosCodes.some((value) => compact(value) === cricos));
  const providerMatch = Boolean(course.university_course_code && compact(course.university_course_code) === compact(entry.providerCode));

  let score = coverage * 0.42 + jaccard * 0.24 + (exactName ? 0.20 : 0) + (cricosMatch ? 0.42 : 0) + (providerMatch ? 0.38 : 0);
  score = Math.min(1, score);
  if (exactName && cricosMatch) score = 1;
  else if (exactName && providerMatch) score = 1;
  else if (exactName && entry.pageCodeConfirmed) score = Math.max(score, 0.96);
  return { entry, score, exactName, coverage, jaccard, cricosMatch, providerMatch };
}

function matchCourse(course, catalogue, duplicateNameCount) {
  const ranked = catalogue.map((entry) => rankCandidate(course, entry)).sort((a, b) => b.score - a.score);
  const best = ranked[0] ?? null;
  if (!best) return { best: null, accepted: false, reason: "no_handbook_candidate" };
  if (!best.entry.pageVerified) return { best, accepted: false, reason: "official_handbook_page_not_verified" };
  if (!best.entry.pageCodeConfirmed) return { best, accepted: false, reason: "deakin_course_code_not_confirmed" };
  if (duplicateNameCount > 1 && !best.cricosMatch && !best.providerMatch) return { best, accepted: false, reason: "duplicate_database_name_needs_identifier" };
  if (course.cricos_code && !best.cricosMatch) return { best, accepted: false, reason: "cricos_not_confirmed_on_official_page" };
  if (best.score < minimumConfidence) return { best, accepted: false, reason: "below_threshold" };
  if (!best.exactName && !best.cricosMatch && !best.providerMatch) return { best, accepted: false, reason: "handbook_title_not_exact" };
  const second = ranked[1];
  if (second && second.score >= minimumConfidence && second.entry.url !== best.entry.url && Math.abs(best.score - second.score) < 0.035) {
    return { best, accepted: false, reason: "near_tie_multiple_handbook_courses" };
  }
  return { best, accepted: true, reason: null };
}

await mkdir(outputDir, { recursive: true });
const catalogue = await loadOrBuildCatalogue();
const university = await fetchDeakinUniversity();
const courses = await fetchDeakinCourses(university.id);
const duplicateNameCounts = new Map();
for (const course of courses) {
  const key = normaliseText(course.name);
  duplicateNameCounts.set(key, (duplicateNameCounts.get(key) ?? 0) + 1);
}
const pending = courses.filter((course) => !course.official_course_url);
const selected = limit > 0 ? pending.slice(0, limit) : pending;

console.log("\n=== Deakin Handbook matching ===");
console.log(`Database courses: ${courses.length}; pending exact links: ${pending.length}; processing: ${selected.length}`);
console.log(`Official Handbook catalogue entries: ${catalogue.length}`);

const auditRows = [];
let matched = 0;
let written = 0;
for (let index = 0; index < selected.length; index += 1) {
  const course = selected[index];
  const duplicateNameCount = duplicateNameCounts.get(normaliseText(course.name)) ?? 1;
  const result = matchCourse(course, catalogue, duplicateNameCount);
  const best = result.best;
  let writeStatus = result.accepted ? "dry_run" : result.reason;

  if (result.accepted) {
    matched += 1;
    if (writeMode) {
      const { error } = await supabase.from("courses").update({ official_course_url: best.entry.url, official_course_url_verified_at: new Date().toISOString() }).eq("id", course.id);
      if (error) writeStatus = `write_error:${error.message}`;
      else { writeStatus = "written"; written += 1; }
    }
  }

  auditRows.push({
    course_id: course.id,
    course_name: course.name,
    cricos_code: course.cricos_code,
    university_course_code: course.university_course_code,
    duplicate_name_count: duplicateNameCount,
    candidate_url: best?.entry.url ?? null,
    candidate_deakin_code: best?.entry.providerCode ?? null,
    candidate_name: best?.entry.displayName ?? null,
    candidate_cricos_codes: best?.entry.cricosCodes?.join("|") ?? "",
    confidence: best ? Number(best.score.toFixed(4)) : null,
    exact_name: best?.exactName ?? false,
    cricos_match: best?.cricosMatch ?? false,
    provider_code_match: best?.providerMatch ?? false,
    page_verified: best?.entry.pageVerified ?? false,
    page_code_confirmed: best?.entry.pageCodeConfirmed ?? false,
    accepted: result.accepted,
    rejection_reason: result.reason,
    write_status: writeStatus,
  });

  console.log(`[${index + 1}/${selected.length}] ${course.name} -> ${result.accepted ? "MATCH" : "review"} (${best ? best.score.toFixed(3) : "none"})${result.reason ? ` [${result.reason}]` : ""}${best?.entry.url ? ` ${best.entry.url}` : ""}`);
}

await writeFile(auditJsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION, threshold: minimumConfidence, writeMode, rows: auditRows }, null, 2)}\n`, "utf8");
const headers = ["course_id","course_name","cricos_code","university_course_code","duplicate_name_count","candidate_url","candidate_deakin_code","candidate_name","candidate_cricos_codes","confidence","exact_name","cricos_match","provider_code_match","page_verified","page_code_confirmed","accepted","rejection_reason","write_status"];
const csv = [headers.join(","), ...auditRows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
await writeFile(auditCsvPath, `${csv}\n`, "utf8");

console.log("\n=== Deakin Handbook run summary ===");
console.log(JSON.stringify({ databaseCourses: courses.length, pending: pending.length, processed: selected.length, catalogueEntries: catalogue.length, matched, written, auditJson: auditJsonPath, auditCsv: auditCsvPath, catalogueCache: cataloguePath }, null, 2));
if (!writeMode) console.log("Dry run only. Only exact Deakin Handbook pages with matching CRICOS evidence are eligible for --write.");
