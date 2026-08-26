import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const args = new Map(process.argv.slice(2).map((raw) => {
  const [key, ...rest] = raw.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : true];
}));

const writeMode = args.get("write") === true;
const refreshCatalogue = args.get("refresh-catalogue") === true;
const limit = Number(args.get("limit") ?? 0);
const delayMs = Number(args.get("delay") ?? 75);
const year = Number(args.get("year") ?? 2026);
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const cataloguePath = `${outputDir}/unsw-handbook-catalogue-${year}.json`;
const auditJsonPath = `${outputDir}/unsw-handbook-match.json`;
const auditCsvPath = `${outputDir}/unsw-handbook-match.csv`;
const HANDBOOK_ROOT = "https://www.handbook.unsw.edu.au";
const SITEMAP_CANDIDATES = [
  `${HANDBOOK_ROOT}/sitemap.xml`,
  "https://handbook.unsw.edu.au/sitemap.xml",
];
const SCHEMA_VERSION = 1;
const USER_AGENT = "UniPathAustralia/1.0 (+https://github.com/bkushen/unipath-australia; UNSW official handbook verification)";

if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a non-negative integer.");
if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error("--year must be a valid handbook year.");
if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5000) throw new Error("--delay must be between 0 and 5000 milliseconds.");

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
const supabase = createClient(supabaseUrl, serviceRoleKey || publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

function normaliseText(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/\bhonors\b/g, "honours").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function compact(value) { return normaliseText(value).replace(/ /g, ""); }
function stripHtml(html) {
  return String(html ?? "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&ndash;|&#8211;/gi, "-").replace(/&mdash;|&#8212;/gi, "-").replace(/\s+/g, " ").trim();
}
function decodeXml(value) { return String(value ?? "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"); }
function extractTag(html, tag) {
  const match = String(html ?? "").match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}
function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function labelledCricos(pageText) {
  const values = new Set();
  for (const match of String(pageText ?? "").matchAll(/\bCRICOS\s+Code\s*[:#-]?\s*([0-9]{6}[A-Z]|[0-9]{7})\b/gi)) values.add(match[1].toUpperCase());
  return [...values];
}
function programmeCodeFromUrl(url) {
  const match = String(url ?? "").match(/\/programs\/\d{4}\/(\d{4,5})(?:[/?#]|$)/i);
  return match ? match[1] : null;
}
function studyLevelFromUrl(url) {
  if (/\/undergraduate\/programs\//i.test(url)) return "undergraduate";
  if (/\/postgraduate\/programs\//i.test(url)) return "postgraduate";
  return null;
}
function extractAwards(pageText) {
  const text = String(pageText ?? "");
  const section = text.match(/\bAward\(s\)\s+(?:info\s+)?(?:Award\(s\):[^.]*\.\s*)?([\s\S]{1,650}?)(?=\s+(?:UAC Code|CRICOS Code|Learning Outcomes|Stand Alone Programs|Program Structure|Overview)\b)/i)?.[1] ?? "";
  if (!section) return [];
  const cleaned = section.replace(/\s+-\s+[A-Z][A-Za-z0-9(). /&-]{0,25}(?=\s+(?:Bachelor|Master|Doctor|Graduate|Diploma|Associate|Juris|$))/g, " ").trim();
  const awards = [...cleaned.matchAll(/\b((?:Bachelor|Master|Doctor|Graduate Certificate|Graduate Diploma|Diploma|Associate Degree|Juris Doctor)[A-Za-z0-9()&,' /.-]{2,180}?)(?=\s+-\s+[A-Z]|\s+(?:Bachelor|Master|Doctor|Graduate Certificate|Graduate Diploma|Diploma|Associate Degree|Juris Doctor)\b|$)/g)]
    .map((match) => match[1].replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return [...new Set(awards)];
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml,text/xml,*/*", "accept-language": "en-AU,en;q=0.9" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { text: await response.text(), finalUrl: response.url, contentType: response.headers.get("content-type") ?? "" };
}

function parseLocs(xml) {
  return [...String(xml ?? "").matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => decodeXml(match[1].trim()));
}

async function discoverProgramUrls() {
  const queue = [...SITEMAP_CANDIDATES];
  const seen = new Set();
  const programs = new Set();
  let sitemapFiles = 0;
  while (queue.length) {
    const url = queue.shift();
    if (!url || seen.has(url) || seen.size > 100) continue;
    seen.add(url);
    try {
      const { text } = await fetchText(url);
      sitemapFiles += 1;
      for (const loc of parseLocs(text)) {
        if (/\.xml(?:[?#]|$)/i.test(loc) || /sitemap/i.test(loc)) {
          if (!seen.has(loc)) queue.push(loc);
          continue;
        }
        const pattern = new RegExp(`/(?:undergraduate|postgraduate)/programs/${year}/\\d{4,5}(?:[/?#]|$)`, "i");
        if (pattern.test(loc)) programs.add(loc.replace(/[?#].*$/, ""));
      }
    } catch (error) {
      console.warn(`  sitemap skipped: ${url} (${error.message})`);
    }
  }
  console.log(`UNSW sitemap files checked: ${sitemapFiles}; ${year} program URLs found: ${programs.size}`);
  if (!programs.size) throw new Error("No UNSW Handbook program URLs were discovered from the official sitemap. No URLs will be fabricated.");
  return [...programs].sort();
}

async function buildCatalogue() {
  console.log(`Building UNSW official ${year} programme catalogue from the UNSW Handbook sitemap...`);
  const urls = await discoverProgramUrls();
  const entries = [];
  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    try {
      const page = await fetchText(url);
      const pageText = stripHtml(page.text).slice(0, 350000);
      const h1 = extractTag(page.text, "h1");
      const title = extractTag(page.text, "title");
      const providerCode = programmeCodeFromUrl(page.finalUrl || url);
      const cricosCodes = labelledCricos(pageText);
      const awards = extractAwards(pageText);
      entries.push({
        url: page.finalUrl || url,
        providerCode,
        studyLevel: studyLevelFromUrl(page.finalUrl || url),
        programmeName: h1.replace(/^Handbook\s*-\s*/i, "").trim() || title.replace(/^Handbook\s*-\s*/i, "").trim(),
        awards,
        cricosCodes,
        pageVerified: Boolean(providerCode && (h1 || title)),
      });
    } catch (error) {
      entries.push({ url, providerCode: programmeCodeFromUrl(url), studyLevel: studyLevelFromUrl(url), programmeName: "", awards: [], cricosCodes: [], pageVerified: false, fetchError: error.message });
    }
    if ((index + 1) % 50 === 0 || index + 1 === urls.length) console.log(`  catalogue ${index + 1}/${urls.length}`);
    if (delayMs) await sleep(delayMs);
  }
  const catalogue = entries.filter((entry) => entry.providerCode);
  await mkdir(outputDir, { recursive: true });
  await writeFile(cataloguePath, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), year, entries: catalogue }, null, 2)}\n`, "utf8");
  console.log(`UNSW Handbook programme entries: ${catalogue.length}; verified pages: ${catalogue.filter((entry) => entry.pageVerified).length}`);
  console.log(`Catalogue saved: ${cataloguePath}`);
  return catalogue;
}

async function loadOrBuildCatalogue() {
  if (!refreshCatalogue) {
    try {
      const saved = JSON.parse(await readFile(cataloguePath, "utf8"));
      if (saved?.schemaVersion === SCHEMA_VERSION && saved?.year === year && Array.isArray(saved.entries) && saved.entries.length) {
        console.log(`Using cached UNSW Handbook catalogue: ${saved.entries.length} entries`);
        return saved.entries;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") console.warn(`Cached UNSW catalogue ignored: ${error.message}`);
    }
  }
  return buildCatalogue();
}

async function fetchUniversity() {
  const { data, error } = await supabase.from("universities").select("id,name").eq("name", "University of New South Wales").limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("University of New South Wales was not found in the universities table.");
  return data;
}
async function fetchCourses(universityId) {
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

function nameCompatibility(courseName, entry) {
  const db = normaliseText(courseName);
  const candidates = [entry.programmeName, ...(entry.awards ?? []), (entry.awards ?? []).join(" / ")].map(normaliseText).filter(Boolean);
  if (candidates.includes(db)) return { exact: true, compatible: true };
  const dbTokens = new Set(db.split(" ").filter((x) => x.length > 2));
  let bestCoverage = 0;
  for (const candidate of candidates) {
    const candidateTokens = new Set(candidate.split(" ").filter((x) => x.length > 2));
    if (!dbTokens.size || !candidateTokens.size) continue;
    let overlap = 0;
    for (const token of dbTokens) if (candidateTokens.has(token)) overlap += 1;
    bestCoverage = Math.max(bestCoverage, overlap / dbTokens.size);
  }
  return { exact: false, compatible: bestCoverage >= 0.5, coverage: bestCoverage };
}

function matchCourse(course, catalogue, duplicateNameCount) {
  const cricos = compact(course.cricos_code);
  const providerCode = compact(course.university_course_code);
  const cricosCandidates = cricos ? catalogue.filter((entry) => entry.cricosCodes.some((value) => compact(value) === cricos)) : [];
  const providerCandidates = providerCode ? catalogue.filter((entry) => compact(entry.providerCode) === providerCode) : [];
  const pool = cricosCandidates.length ? cricosCandidates : providerCandidates;
  if (!pool.length) return { accepted: false, reason: "no_current_handbook_identifier_match", entry: null, exactName: false, nameCompatible: false };
  if (pool.length > 1) {
    const exactNameEntries = pool.filter((entry) => nameCompatibility(course.name, entry).exact);
    if (exactNameEntries.length === 1) return { accepted: true, reason: null, entry: exactNameEntries[0], exactName: true, nameCompatible: true };
    return { accepted: false, reason: "multiple_handbook_pages_match_identifier", entry: pool[0], exactName: false, nameCompatible: false };
  }
  const entry = pool[0];
  if (!entry.pageVerified) return { accepted: false, reason: "official_handbook_page_not_verified", entry, exactName: false, nameCompatible: false };
  const names = nameCompatibility(course.name, entry);
  if (!names.compatible) return { accepted: false, reason: "handbook_name_not_compatible", entry, exactName: names.exact, nameCompatible: false };
  if (duplicateNameCount > 1 && !cricos && !providerCode) return { accepted: false, reason: "duplicate_database_name_needs_identifier", entry, exactName: names.exact, nameCompatible: names.compatible };
  return { accepted: true, reason: null, entry, exactName: names.exact, nameCompatible: names.compatible };
}

await mkdir(outputDir, { recursive: true });
const catalogue = await loadOrBuildCatalogue();
const university = await fetchUniversity();
const courses = await fetchCourses(university.id);
const duplicateNameCounts = new Map();
for (const course of courses) {
  const key = normaliseText(course.name);
  duplicateNameCounts.set(key, (duplicateNameCounts.get(key) ?? 0) + 1);
}
const pending = courses.filter((course) => !course.official_course_url);
const selected = limit > 0 ? pending.slice(0, limit) : pending;
console.log("\n=== UNSW Handbook matching ===");
console.log(`Database courses: ${courses.length}; pending exact links: ${pending.length}; processing: ${selected.length}`);
console.log(`Official ${year} Handbook catalogue entries: ${catalogue.length}`);

const rows = [];
let matched = 0;
let written = 0;
for (let index = 0; index < selected.length; index += 1) {
  const course = selected[index];
  const result = matchCourse(course, catalogue, duplicateNameCounts.get(normaliseText(course.name)) ?? 1);
  const entry = result.entry;
  let writeStatus = result.accepted ? "dry_run" : result.reason;
  if (result.accepted) {
    matched += 1;
    if (writeMode) {
      const { error } = await supabase.from("courses").update({ official_course_url: entry.url, official_course_url_verified_at: new Date().toISOString() }).eq("id", course.id);
      if (error) writeStatus = `write_error:${error.message}`;
      else { written += 1; writeStatus = "written"; }
    }
  }
  rows.push({
    course_id: course.id,
    course_name: course.name,
    cricos_code: course.cricos_code,
    university_course_code: course.university_course_code,
    candidate_url: entry?.url ?? null,
    candidate_program_code: entry?.providerCode ?? null,
    candidate_programme_name: entry?.programmeName ?? null,
    candidate_awards: entry?.awards?.join(" | ") ?? "",
    candidate_cricos_codes: entry?.cricosCodes?.join("|") ?? "",
    exact_name: result.exactName,
    name_compatible: result.nameCompatible,
    accepted: result.accepted,
    rejection_reason: result.reason,
    write_status: writeStatus,
  });
  console.log(`[${index + 1}/${selected.length}] ${course.name} -> ${result.accepted ? "MATCH" : "review"}${result.reason ? ` [${result.reason}]` : ""}${entry?.url ? ` ${entry.url}` : ""}`);
}

await writeFile(auditJsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION, year, writeMode, rows }, null, 2)}\n`, "utf8");
const headers = ["course_id","course_name","cricos_code","university_course_code","candidate_url","candidate_program_code","candidate_programme_name","candidate_awards","candidate_cricos_codes","exact_name","name_compatible","accepted","rejection_reason","write_status"];
const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
await writeFile(auditCsvPath, `${csv}\n`, "utf8");
console.log("\n=== UNSW Handbook run summary ===");
console.log(JSON.stringify({ databaseCourses: courses.length, pending: pending.length, processed: selected.length, catalogueEntries: catalogue.length, matched, written, auditJson: auditJsonPath, auditCsv: auditCsvPath, catalogueCache: cataloguePath }, null, 2));
if (!writeMode) console.log("Dry run only. Only current UNSW Handbook pages with matching official CRICOS/program identifiers are eligible for --write.");
