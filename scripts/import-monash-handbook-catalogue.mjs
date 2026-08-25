import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const args = new Map(process.argv.slice(2).map((raw) => {
  const [key, ...rest] = raw.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : true];
}));

const writeMode = args.get("write") === true;
const refreshCatalogue = args.get("refresh-catalogue") === true;
const limit = Number(args.get("limit") ?? 0);
const delayMs = Number(args.get("delay") ?? 80);
const minimumConfidence = Number(args.get("threshold") ?? 0.94);
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const cataloguePath = `${outputDir}/monash-handbook-catalogue.json`;
const auditJsonPath = `${outputDir}/monash-handbook-match.json`;
const auditCsvPath = `${outputDir}/monash-handbook-match.csv`;
const HANDBOOK_API = "https://handbook.monash.edu/api/es/search";
const HANDBOOK_ROOT = "https://handbook.monash.edu";
const SCHEMA_VERSION = 1;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36 UniPathAustralia/1.3";

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
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, " ").trim();
}
function extractTag(html, tag) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}
function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function currentCourseUrl(code) {
  return `${HANDBOOK_ROOT}/current/courses/${encodeURIComponent(code)}`;
}
function courseCode(value) {
  const text = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]\d{4,5}$/.test(text) ? text : null;
}

function recursivelyFindCourseObjects(value, found = []) {
  if (!value || typeof value !== "object") return found;
  if (!Array.isArray(value)) {
    const code = courseCode(value.code);
    const name = typeof value.name === "string" ? value.name.trim() : "";
    if (code && name) found.push({ code, name });
    for (const child of Object.values(value)) recursivelyFindCourseObjects(child, found);
  } else {
    for (const child of value) recursivelyFindCourseObjects(child, found);
  }
  return found;
}

async function handbookApiRequest() {
  const payload = {
    query: { bool: { must: [{ term: { live: true } }] } },
    from: 0,
    size: 10000,
    track_scores: false,
    _source: {
      includes: ["*.code", "*.name", "*.award_titles", "*.keywords", "urlmap", "contenttype", "versionNumber", "availableInYears", "implementationYear"],
    },
  };
  const response = await fetch(HANDBOOK_API, {
    method: "POST",
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json,text/plain,*/*",
      "content-type": "application/json",
      "accept-language": "en-AU,en;q=0.9",
      origin: HANDBOOK_ROOT,
      referer: `${HANDBOOK_ROOT}/search?ct=course`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${HANDBOOK_API}`);
  const data = await response.json();
  const hits = Array.isArray(data?.hits?.hits) ? data.hits.hits : [];
  return { data, hits };
}

async function buildCatalogue() {
  console.log("Building Monash course catalogue from the official Monash Handbook API...");
  const { data, hits } = await handbookApiRequest();
  const total = typeof data?.hits?.total === "number" ? data.hits.total : data?.hits?.total?.value;
  console.log(`Handbook API hits returned: ${hits.length}${Number.isFinite(total) ? `; total: ${total}` : ""}`);

  const entriesByCode = new Map();
  for (const hit of hits) {
    const candidates = recursivelyFindCourseObjects(hit?._source ?? hit);
    for (const candidate of candidates) {
      if (!entriesByCode.has(candidate.code)) {
        entriesByCode.set(candidate.code, {
          providerCode: candidate.code,
          displayName: candidate.name,
          url: currentCourseUrl(candidate.code),
          source: "Monash Handbook API",
        });
      }
    }
  }

  const catalogue = [...entriesByCode.values()].sort((a, b) => a.providerCode.localeCompare(b.providerCode));
  if (!catalogue.length) throw new Error("The Monash Handbook API responded, but no course-code records were found. No URLs will be fabricated.");
  await mkdir(outputDir, { recursive: true });
  await writeFile(cataloguePath, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), source: HANDBOOK_API, entries: catalogue }, null, 2)}\n`, "utf8");
  console.log(`Official Monash Handbook course identities: ${catalogue.length}`);
  console.log(`Catalogue saved: ${cataloguePath}`);
  return catalogue;
}

async function loadOrBuildCatalogue() {
  if (!refreshCatalogue) {
    try {
      const saved = JSON.parse(await readFile(cataloguePath, "utf8"));
      if (saved?.schemaVersion === SCHEMA_VERSION && Array.isArray(saved.entries) && saved.entries.length) {
        console.log(`Using cached Monash Handbook catalogue: ${saved.entries.length} entries`);
        return saved.entries;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") console.warn(`Cached Monash catalogue ignored: ${error.message}`);
    }
  }
  return buildCatalogue();
}

async function verifyHandbookPage(entry) {
  try {
    const response = await fetch(entry.url, {
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,*/*", "accept-language": "en-AU,en;q=0.9" },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return { verified: false, reason: `handbook_page_http_${response.status}`, h1: "", title: "" };
    const html = await response.text();
    const h1 = extractTag(html, "h1");
    const title = extractTag(html, "title");
    const headline = normaliseText(`${h1} ${title}`);
    const nameConfirmed = headline.includes(normaliseText(entry.displayName));
    const codeConfirmed = compact(`${html.slice(0, 250000)} ${response.url}`).includes(compact(entry.providerCode));
    return {
      verified: nameConfirmed && codeConfirmed,
      reason: nameConfirmed ? (codeConfirmed ? null : "course_code_not_confirmed_on_handbook_page") : "course_title_not_confirmed_on_handbook_page",
      h1,
      title,
    };
  } catch (error) {
    return { verified: false, reason: `handbook_page_fetch_error:${error.message}`, h1: "", title: "" };
  }
}

async function fetchMonashUniversity() {
  const { data, error } = await supabase.from("universities").select("id,name").eq("name", "Monash University").limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Monash University was not found in the universities table.");
  return data;
}

async function fetchMonashCourses(universityId) {
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
  const providerMatch = Boolean(course.university_course_code && compact(course.university_course_code) === compact(entry.providerCode));
  let score = coverage * 0.48 + jaccard * 0.30 + (exactName ? 0.22 : 0) + (providerMatch ? 0.34 : 0);
  score = Math.min(1, score);
  if (exactName) score = Math.max(score, 0.98);
  if (exactName && providerMatch) score = 1;
  return { entry, score, exactName, coverage, jaccard, providerMatch };
}

function matchCourse(course, catalogue, duplicateNameCount) {
  const ranked = catalogue.map((entry) => rankCandidate(course, entry)).sort((a, b) => b.score - a.score);
  const best = ranked[0] ?? null;
  if (!best) return { best: null, accepted: false, reason: "no_handbook_candidate" };
  if (duplicateNameCount > 1 && !best.providerMatch) return { best, accepted: false, reason: "duplicate_database_name_needs_course_identifier" };
  if (best.score < minimumConfidence) return { best, accepted: false, reason: "below_threshold" };
  if (!best.exactName && !best.providerMatch) return { best, accepted: false, reason: "handbook_title_not_exact" };
  const second = ranked[1];
  if (second && second.score >= minimumConfidence && second.entry.url !== best.entry.url && Math.abs(best.score - second.score) < 0.04) {
    return { best, accepted: false, reason: "near_tie_multiple_handbook_courses" };
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
const selected = limit > 0 ? pending.slice(0, limit) : pending;

console.log("\n=== Monash Handbook matching ===");
console.log(`Database courses: ${courses.length}; pending exact links: ${pending.length}; processing: ${selected.length}`);
console.log(`Official Handbook course identities: ${catalogue.length}`);

const auditRows = [];
let matched = 0;
let writable = 0;
let written = 0;
for (let index = 0; index < selected.length; index += 1) {
  const course = selected[index];
  const duplicateNameCount = duplicateNameCounts.get(normaliseText(course.name)) ?? 1;
  const result = matchCourse(course, catalogue, duplicateNameCount);
  const best = result.best;
  let pageVerification = { verified: false, reason: result.reason, h1: "", title: "" };

  if (result.accepted && best) {
    matched += 1;
    pageVerification = await verifyHandbookPage(best.entry);
    if (delayMs) await sleep(delayMs);
  }

  const acceptedForWrite = Boolean(result.accepted && pageVerification.verified);
  if (acceptedForWrite) writable += 1;
  let writeStatus = acceptedForWrite ? "dry_run" : (result.reason ?? pageVerification.reason ?? "review");

  if (acceptedForWrite && writeMode) {
    const { error } = await supabase.from("courses").update({ official_course_url: best.entry.url, official_course_url_verified_at: new Date().toISOString() }).eq("id", course.id);
    if (error) writeStatus = `write_error:${error.message}`;
    else { written += 1; writeStatus = "written"; }
  }

  auditRows.push({
    course_id: course.id,
    course_name: course.name,
    cricos_code: course.cricos_code,
    university_course_code: course.university_course_code,
    duplicate_name_count: duplicateNameCount,
    candidate_url: best?.entry.url ?? null,
    candidate_course_code: best?.entry.providerCode ?? null,
    candidate_name: best?.entry.displayName ?? null,
    confidence: best ? Number(best.score.toFixed(4)) : null,
    exact_name: best?.exactName ?? false,
    provider_code_match: best?.providerMatch ?? false,
    catalogue_match: result.accepted,
    page_verified: pageVerification.verified,
    rejection_reason: result.reason ?? pageVerification.reason,
    write_status: writeStatus,
  });

  const state = acceptedForWrite ? "VERIFIED" : result.accepted ? "review" : "review";
  const reason = acceptedForWrite ? "" : ` [${result.reason ?? pageVerification.reason ?? "review"}]`;
  console.log(`[${index + 1}/${selected.length}] ${course.name} -> ${state} (${best ? best.score.toFixed(3) : "none"})${reason}${best?.entry.url ? ` ${best.entry.url}` : ""}`);
}

await writeFile(auditJsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION, threshold: minimumConfidence, writeMode, rows: auditRows }, null, 2)}\n`, "utf8");
const headers = ["course_id","course_name","cricos_code","university_course_code","duplicate_name_count","candidate_url","candidate_course_code","candidate_name","confidence","exact_name","provider_code_match","catalogue_match","page_verified","rejection_reason","write_status"];
const csv = [headers.join(","), ...auditRows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
await writeFile(auditCsvPath, `${csv}\n`, "utf8");

console.log("\n=== Monash Handbook run summary ===");
console.log(JSON.stringify({ databaseCourses: courses.length, pending: pending.length, processed: selected.length, catalogueEntries: catalogue.length, catalogueMatched: matched, verified: writable, written, auditJson: auditJsonPath, auditCsv: auditCsvPath, catalogueCache: cataloguePath }, null, 2));
if (!writeMode) console.log("Dry run only. Duplicate database names are not written unless a Monash course code resolves them, and every writable link must pass a live official Handbook page check.");
