import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const args = new Map();
for (const raw of process.argv.slice(2)) {
  const [key, ...rest] = raw.replace(/^--/, "").split("=");
  args.set(key, rest.length ? rest.join("=") : true);
}

const writeMode = args.get("write") === true;
const refreshCatalogue = args.get("refresh-catalogue") === true;
const limit = Number(args.get("limit") ?? 0);
const delayMs = Number(args.get("delay") ?? 120);
const minimumConfidence = Number(args.get("threshold") ?? 0.92);
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const cataloguePath = `${outputDir}/monash-official-catalogue.json`;
const auditJsonPath = `${outputDir}/monash-catalogue-match.json`;
const auditCsvPath = `${outputDir}/monash-catalogue-match.csv`;
const CATALOGUE_SCHEMA_VERSION = 1;
const MONASH_ROOT = "https://www.monash.edu";
const MONASH_INDEX = "https://www.monash.edu/study/courses/find-a-course";
const USER_AGENT = "UniPathAustralia/1.0 (+https://github.com/bkushen/unipath-australia; Monash official course catalogue verification)";

if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a non-negative integer.");
if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5000) throw new Error("--delay must be between 0 and 5000 milliseconds.");
if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0.75 || minimumConfidence > 1) throw new Error("--threshold must be between 0.75 and 1.");

const STOP_WORDS = new Set(["a","an","and","at","for","in","of","on","or","the","to","with","by","from","into","study","course","courses","program","programs","degree","degrees","honours","honor","international"]);
const SPECIALISATION_TERMS = new Set([
  "accounting","actuarial","aerospace","architectural","architecture","artificial","intelligence","biomedical","biotechnology","business","civil","commerce","communication","computer","computing","criminology","cyber","data","design","digital","economics","education","electrical","engineering","environmental","fashion","finance","fine","global","health","information","journalism","law","laws","marketing","media","medicine","nursing","pharmacy","professional","psychology","science","software","teaching","technology"
]);

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
  return html.replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<noscript\b[\s\S]*?<\/noscript>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g," ").trim();
}
function extractTag(html, tag) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}
function decodeHtml(value) {
  return String(value ?? "").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function canonicalCourseUrl(value) {
  const url = new URL(value, MONASH_ROOT);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}
function monashCourseCode(value) {
  try {
    const path = new URL(value, MONASH_ROOT).pathname;
    const match = path.match(/-([A-Za-z]\d{4,5})(?:$|\/)/);
    return match ? match[1].toUpperCase() : null;
  } catch { return null; }
}
function isMonashCourseUrl(value) {
  try {
    const url = new URL(value, MONASH_ROOT);
    return url.hostname === "www.monash.edu" && url.pathname.startsWith("/study/courses/find-a-course/") && Boolean(monashCourseCode(url.toString()));
  } catch { return false; }
}
function extractCourseUrlsFromHtml(html) {
  const urls = new Set();
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const href = decodeHtml(match[1]);
    try {
      const url = canonicalCourseUrl(href);
      if (isMonashCourseUrl(url)) urls.add(url);
    } catch {}
  }
  return [...urls];
}
function extractQualification(pageText) {
  const match = pageText.match(/\bQualification\s+(.{3,240}?)(?=\s+(?:Fees|Course Handbook|Overview|Entry Requirements|Applications|How to apply|Show more)\b)/i);
  return match ? match[1].trim() : "";
}
function cleanTitle(title) {
  return String(title ?? "")
    .replace(/\s*[-|]\s*Study at Monash University.*$/i, "")
    .replace(/\s*[-|]\s*Study at Monash.*$/i, "")
    .replace(/\s*\|\s*Monash University.*$/i, "")
    .trim();
}
function specialisationExtras(courseName, target) {
  const courseTokens = new Set(tokens(courseName));
  return [...new Set(tokens(target).filter((token) => SPECIALISATION_TERMS.has(token) && !courseTokens.has(token)))];
}
function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text;
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,*/*" },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { text: await response.text(), finalUrl: response.url };
}

async function discoverCourseUrls() {
  const pages = [MONASH_INDEX, `${MONASH_INDEX}?f.Tabs%7Cmonash~ds-monash-courses=Courses`];
  const urls = new Set();
  for (const page of pages) {
    try {
      const { text } = await fetchText(page);
      for (const url of extractCourseUrlsFromHtml(text)) urls.add(url);
    } catch (error) {
      console.warn(`  course index skipped: ${page} (${error.message})`);
    }
  }
  return [...urls];
}

async function buildOfficialCatalogue() {
  console.log("Building Monash official course catalogue from the Monash Find a Course index...");
  const courseUrls = await discoverCourseUrls();
  console.log(`Monash coded course URLs discovered: ${courseUrls.length}`);
  const entries = [];
  for (let index = 0; index < courseUrls.length; index += 1) {
    const requestedUrl = courseUrls[index];
    try {
      const { text, finalUrl } = await fetchText(requestedUrl);
      const url = canonicalCourseUrl(finalUrl || requestedUrl);
      if (!isMonashCourseUrl(url)) continue;
      const title = extractTag(text, "title");
      const h1 = extractTag(text, "h1");
      const pageText = stripHtml(text).slice(0, 220000);
      const qualification = extractQualification(pageText);
      const clean = cleanTitle(title);
      const searchText = [clean, h1, qualification, decodeURIComponent(new URL(url).pathname.replace(/[-/]/g, " "))].filter(Boolean).join(" | ");
      entries.push({ url, providerCode: monashCourseCode(url), title, h1, qualification, searchText });
    } catch (error) {
      console.warn(`  catalogue page skipped: ${requestedUrl} (${error.message})`);
    }
    if ((index + 1) % 50 === 0 || index + 1 === courseUrls.length) console.log(`  catalogue ${index + 1}/${courseUrls.length}`);
    if (delayMs) await sleep(delayMs);
  }
  const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
  const catalogue = [...byUrl.values()].sort((a, b) => String(a.providerCode).localeCompare(String(b.providerCode)));
  await mkdir(outputDir, { recursive: true });
  await writeFile(cataloguePath, `${JSON.stringify({ schemaVersion: CATALOGUE_SCHEMA_VERSION, generatedAt: new Date().toISOString(), source: MONASH_INDEX, entries: catalogue }, null, 2)}\n`, "utf8");
  console.log(`Catalogue saved: ${catalogue.length} official Monash course pages -> ${cataloguePath}`);
  return catalogue;
}

async function loadOrBuildCatalogue() {
  if (!refreshCatalogue) {
    try {
      const saved = JSON.parse(await readFile(cataloguePath, "utf8"));
      if (saved?.schemaVersion === CATALOGUE_SCHEMA_VERSION && Array.isArray(saved.entries) && saved.entries.length) {
        console.log(`Using cached Monash catalogue: ${saved.entries.length} entries from ${cataloguePath}`);
        return saved.entries;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") console.warn(`Cached Monash catalogue ignored: ${error.message}`);
    }
  }
  return buildOfficialCatalogue();
}

async function fetchMonashUniversity() {
  const { data, error } = await supabase.from("universities").select("id,name,website").eq("name", "Monash University").limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Monash University was not found in the universities table.");
  return data;
}

async function fetchMonashCourses(universityId) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("courses").select("id,name,cricos_code,university_course_code,vet_national_code,official_course_url,official_course_url_verified_at").eq("university_id", universityId).order("name").range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

function rankCandidate(course, entry) {
  const target = entry.searchText;
  const normalizedCourse = normaliseText(course.name);
  const normalizedTarget = normaliseText(target);
  const phraseMatch = Boolean(normalizedCourse && normalizedTarget.includes(normalizedCourse));
  const coverage = tokenCoverage(course.name, target);
  const jaccard = tokenJaccard(course.name, target);
  const providerMatch = Boolean(course.university_course_code && compact(course.university_course_code) === compact(entry.providerCode));
  const extras = specialisationExtras(course.name, `${entry.h1} ${cleanTitle(entry.title)} ${entry.qualification}`);
  let score = coverage * 0.52 + jaccard * 0.28 + (phraseMatch ? 0.22 : 0) + (providerMatch ? 0.30 : 0);
  if (extras.length && !phraseMatch) score -= Math.min(0.28, extras.length * 0.10);
  score = Math.max(0, Math.min(1, score));
  if (phraseMatch && coverage >= 0.95) score = Math.max(score, 0.98);
  return { entry, score, phraseMatch, coverage, jaccard, providerMatch, extras };
}

function matchCourse(course, catalogue, duplicateNameCount) {
  const ranked = catalogue.map((entry) => rankCandidate(course, entry)).sort((a, b) => b.score - a.score);
  const best = ranked[0] ?? null;
  if (!best) return { best: null, accepted: false, reason: "no_catalogue_candidate" };
  if (duplicateNameCount > 1 && !best.providerMatch) return { best, accepted: false, reason: "duplicate_database_name_needs_course_identifier" };
  if (best.extras.length && !best.phraseMatch) return { best, accepted: false, reason: `specialisation_conflict:${best.extras.join("|")}` };
  if (best.score < minimumConfidence) return { best, accepted: false, reason: "below_threshold" };
  const second = ranked[1];
  if (second && second.score >= minimumConfidence && second.entry.url !== best.entry.url && Math.abs(best.score - second.score) < 0.04) {
    return { best, accepted: false, reason: "near_tie_multiple_course_pages" };
  }
  return { best, accepted: true, reason: null };
}

await mkdir(outputDir, { recursive: true });
const catalogue = await loadOrBuildCatalogue();
const university = await fetchMonashUniversity();
const courses = await fetchMonashCourses(university.id);
const duplicateNameCounts = new Map();
for (const course of courses) {
  const key = normaliseText(course.name);
  duplicateNameCounts.set(key, (duplicateNameCounts.get(key) ?? 0) + 1);
}
const pending = courses.filter((course) => !course.official_course_url);
const selectedCourses = limit > 0 ? pending.slice(0, limit) : pending;

console.log("\n=== Monash catalogue-first matching ===");
console.log(`Database courses: ${courses.length}; pending exact links: ${pending.length}; processing: ${selectedCourses.length}`);
console.log(`Official catalogue pages: ${catalogue.length}`);

const auditRows = [];
let matched = 0;
let written = 0;
for (let index = 0; index < selectedCourses.length; index += 1) {
  const course = selectedCourses[index];
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
    candidate_course_code: best?.entry.providerCode ?? null,
    candidate_title: best?.entry.title ?? null,
    candidate_h1: best?.entry.h1 ?? null,
    candidate_qualification: best?.entry.qualification ?? null,
    confidence: best ? Number(best.score.toFixed(4)) : null,
    phrase_match: best?.phraseMatch ?? false,
    provider_code_match: best?.providerMatch ?? false,
    specialisation_extras: best?.extras.join("|") ?? "",
    accepted: result.accepted,
    rejection_reason: result.reason,
    write_status: writeStatus,
  });
  const confidenceText = best ? best.score.toFixed(3) : "none";
  console.log(`[${index + 1}/${selectedCourses.length}] ${course.name} -> ${result.accepted ? "MATCH" : "review"} (${confidenceText})${result.reason ? ` [${result.reason}]` : ""}${best?.entry.url ? ` ${best.entry.url}` : ""}`);
}

await writeFile(auditJsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), schemaVersion: CATALOGUE_SCHEMA_VERSION, threshold: minimumConfidence, writeMode, rows: auditRows }, null, 2)}\n`, "utf8");
const headers = ["course_id","course_name","cricos_code","university_course_code","duplicate_name_count","candidate_url","candidate_course_code","candidate_title","candidate_h1","candidate_qualification","confidence","phrase_match","provider_code_match","specialisation_extras","accepted","rejection_reason","write_status"];
const csv = [headers.join(","), ...auditRows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
await writeFile(auditCsvPath, `${csv}\n`, "utf8");

console.log("\n=== Monash catalogue run summary ===");
console.log(JSON.stringify({ databaseCourses: courses.length, pending: pending.length, processed: selectedCourses.length, catalogueEntries: catalogue.length, matched, written, auditJson: auditJsonPath, auditCsv: auditCsvPath, catalogueCache: cataloguePath }, null, 2));
if (!writeMode) console.log("Dry run only. Duplicate course names stay in review unless a Monash course identifier resolves them.");
