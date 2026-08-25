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
const minimumConfidence = Number(args.get("threshold") ?? 0.92);
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const cataloguePath = `${outputDir}/monash-official-catalogue-v3.json`;
const auditJsonPath = `${outputDir}/monash-catalogue-match-v3.json`;
const auditCsvPath = `${outputDir}/monash-catalogue-match-v3.csv`;
const SCHEMA_VERSION = 3;
const MONASH_ROOT = "https://www.monash.edu";
const MONASH_INDEX = `${MONASH_ROOT}/study/courses/find-a-course`;
const MONASH_SITEMAPS = ["http://www.monash.edu/sitemap.xml", "https://www.monash.edu/sitemap.xml"];
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36 UniPathAustralia/1.2";

if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a non-negative integer.");
if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5000) throw new Error("--delay must be between 0 and 5000 milliseconds.");
if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0.75 || minimumConfidence > 1) throw new Error("--threshold must be between 0.75 and 1.");

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

const STOP_WORDS = new Set(["a","an","and","at","for","in","of","on","or","the","to","with","by","from","into","study","course","courses","program","programs","degree","degrees","honours","honor","international"]);
function normaliseText(value) { return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function compact(value) { return normaliseText(value).replace(/ /g, ""); }
function tokens(value) { return [...new Set(normaliseText(value).split(" ").filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))]; }
function tokenCoverage(source, target) { const src = tokens(source); if (!src.length) return 0; const trg = new Set(tokens(target)); return src.filter((t) => trg.has(t)).length / src.length; }
function tokenJaccard(a, b) { const left = new Set(tokens(a)); const right = new Set(tokens(b)); if (!left.size || !right.size) return 0; let n = 0; for (const token of left) if (right.has(token)) n += 1; return n / (left.size + right.size - n); }
function stripHtml(html) { return html.replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<noscript\b[\s\S]*?<\/noscript>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g," ").trim(); }
function extractTag(html, tag) { const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")); return match ? stripHtml(match[1]) : ""; }
function decodeHtml(value) { return String(value ?? "").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">"); }
function decodeXml(value) { return decodeHtml(value); }
function xmlLocations(xml) { return [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXml(match[1].trim())).filter(Boolean); }
function canonicalCourseUrl(value) { const url = new URL(value, MONASH_ROOT); url.hash = ""; url.search = ""; url.pathname = url.pathname.replace(/\/+$/, ""); return url.toString(); }
function monashCourseCode(value) { try { const match = new URL(value, MONASH_ROOT).pathname.match(/-([A-Za-z]\d{4,5})(?:$|\/)/); return match ? match[1].toUpperCase() : null; } catch { return null; } }
function isMonashCourseUrl(value) { try { const url = new URL(value, MONASH_ROOT); return url.hostname === "www.monash.edu" && url.pathname.startsWith("/study/courses/find-a-course/") && Boolean(monashCourseCode(url.toString())); } catch { return false; } }
function cleanTitle(title) { return String(title ?? "").replace(/\s*[-|]\s*Study at Monash University.*$/i, "").replace(/\s*[-|]\s*Study at Monash.*$/i, "").replace(/\s*\|\s*Monash University.*$/i, "").trim(); }
function csvEscape(value) { const text = String(value ?? ""); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text; }
function labelledCricos(pageText) { const values = new Set(); for (const match of pageText.matchAll(/\bCRICOS(?:\s+(?:code|course code))?\s*[:#-]?\s*([0-9]{6}[A-Z]|[0-9]{7})\b/gi)) values.add(match[1].toUpperCase()); return [...values]; }
function slugDisplayName(value) {
  const url = new URL(value);
  const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
  return last.replace(/-[A-Za-z]\d{4,5}$/i, "").replace(/-/g, " ").trim();
}
function courseCoreName(value) {
  return normaliseText(value)
    .replace(/^(bachelor|master|doctor|diploma|certificate|graduate certificate|graduate diploma|associate degree)\s+(of|in)\s+/, "")
    .replace(/\s+\(honours\)$/i, "")
    .trim();
}

function resolveCourseHref(rawHref) {
  const href = decodeHtml(rawHref);
  try {
    const parsed = new URL(href, MONASH_ROOT);
    if (parsed.hostname === "mon-search.funnelback.squiz.cloud") {
      const target = parsed.searchParams.get("url") || parsed.searchParams.get("index_url");
      if (!target) return null;
      const canonical = canonicalCourseUrl(decodeURIComponent(target));
      return isMonashCourseUrl(canonical) ? canonical : null;
    }
    const canonical = canonicalCourseUrl(parsed.toString());
    return isMonashCourseUrl(canonical) ? canonical : null;
  } catch { return null; }
}

function extractCourseUrlsFromHtml(html) {
  const urls = new Set();
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const url = resolveCourseHref(match[1]);
    if (url) urls.add(url);
  }
  return [...urls];
}

async function fetchText(url, accept = "text/html,application/xhtml+xml,application/xml,text/xml,*/*") {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
      accept,
      "accept-language": "en-AU,en;q=0.9",
      "cache-control": "no-cache",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { text: await response.text(), finalUrl: response.url, contentType: response.headers.get("content-type") ?? "" };
}

async function discoverFromSitemaps() {
  const queue = [...MONASH_SITEMAPS];
  const seen = new Set();
  const urls = new Set();
  while (queue.length && seen.size < 80) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seen.has(sitemapUrl)) continue;
    seen.add(sitemapUrl);
    try {
      const { text } = await fetchText(sitemapUrl, "application/xml,text/xml,text/plain,*/*");
      const locations = xmlLocations(text);
      const isIndex = /<sitemapindex\b/i.test(text) || locations.some((loc) => /\.xml(?:\?|$)/i.test(loc));
      for (const location of locations) {
        let parsed;
        try { parsed = new URL(location, MONASH_ROOT); } catch { continue; }
        if (!parsed.hostname.endsWith("monash.edu")) continue;
        if (isIndex && (/\.xml(?:\?|$)/i.test(parsed.pathname + parsed.search) || /sitemap/i.test(parsed.pathname))) {
          if (!seen.has(parsed.toString())) queue.push(parsed.toString());
          continue;
        }
        const canonical = canonicalCourseUrl(parsed.toString());
        if (isMonashCourseUrl(canonical)) urls.add(canonical);
      }
    } catch (error) {
      console.warn(`  sitemap skipped: ${sitemapUrl} (${error.message})`);
    }
  }
  console.log(`Monash sitemap files checked: ${seen.size}; coded course URLs found: ${urls.size}`);
  return [...urls];
}

async function discoverFromIndex() {
  const urls = new Set();
  for (const page of [MONASH_INDEX, `${MONASH_INDEX}?international=true`]) {
    try {
      const { text } = await fetchText(page);
      for (const url of extractCourseUrlsFromHtml(text)) urls.add(url);
    } catch (error) {
      console.warn(`  Monash Find a Course index unavailable: ${page} (${error.message})`);
    }
  }
  return [...urls];
}

async function discoverCourseUrls() {
  const sitemapUrls = await discoverFromSitemaps();
  if (sitemapUrls.length) return sitemapUrls;
  return discoverFromIndex();
}

async function buildOfficialCatalogue() {
  console.log("Building Monash official catalogue from Monash sitemap/course pages...");
  const courseUrls = await discoverCourseUrls();
  if (!courseUrls.length) throw new Error("No Monash course URLs were discovered. Monash may be blocking both its sitemap and Find a Course index; no URLs will be fabricated.");
  console.log(`Monash official course URLs discovered: ${courseUrls.length}`);
  const entries = [];
  for (let index = 0; index < courseUrls.length; index += 1) {
    const rootUrl = courseUrls[index];
    let entry = {
      url: rootUrl,
      providerCode: monashCourseCode(rootUrl),
      title: "",
      h1: "",
      displayName: slugDisplayName(rootUrl),
      cricosCodes: [],
      pageVerified: false,
    };
    try {
      const { text } = await fetchText(`${rootUrl}?international=true`);
      const title = extractTag(text, "title");
      const h1 = extractTag(text, "h1");
      const pageText = stripHtml(text).slice(0, 240000);
      entry = {
        ...entry,
        title,
        h1,
        displayName: h1 || cleanTitle(title) || entry.displayName,
        cricosCodes: labelledCricos(pageText),
        pageVerified: true,
      };
    } catch (error) {
      // The sitemap URL itself is still official evidence. Keep it for dry-run
      // matching, but never write an unverified page to Supabase.
      entry.fetchError = error.message;
    }
    entries.push(entry);
    if ((index + 1) % 50 === 0 || index + 1 === courseUrls.length) console.log(`  catalogue ${index + 1}/${courseUrls.length}`);
    if (delayMs) await sleep(delayMs);
  }
  const catalogue = [...new Map(entries.map((entry) => [entry.url, entry])).values()];
  await mkdir(outputDir, { recursive: true });
  await writeFile(cataloguePath, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), source: "Monash official sitemap", entries: catalogue }, null, 2)}\n`, "utf8");
  console.log(`Catalogue saved: ${catalogue.length} official Monash course URLs -> ${cataloguePath}`);
  return catalogue;
}

async function loadOrBuildCatalogue() {
  if (!refreshCatalogue) {
    try {
      const saved = JSON.parse(await readFile(cataloguePath, "utf8"));
      if (saved?.schemaVersion === SCHEMA_VERSION && Array.isArray(saved.entries) && saved.entries.length) {
        console.log(`Using cached Monash catalogue: ${saved.entries.length} entries from ${cataloguePath}`);
        return saved.entries;
      }
    } catch (error) { if (error?.code !== "ENOENT") console.warn(`Cached catalogue ignored: ${error.message}`); }
  }
  return buildOfficialCatalogue();
}

const { data: university, error: universityError } = await supabase.from("universities").select("id,name").eq("name", "Monash University").limit(1).maybeSingle();
if (universityError) throw universityError;
if (!university) throw new Error("Monash University was not found in the universities table.");

const courses = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from("courses").select("id,name,cricos_code,university_course_code,official_course_url").eq("university_id", university.id).order("name").range(from, from + 999);
  if (error) throw error;
  if (!data?.length) break;
  courses.push(...data);
  if (data.length < 1000) break;
}

const catalogue = await loadOrBuildCatalogue();
const duplicateNameCounts = new Map();
for (const course of courses) { const key = normaliseText(course.name); duplicateNameCounts.set(key, (duplicateNameCounts.get(key) ?? 0) + 1); }
const pending = courses.filter((course) => !course.official_course_url);
const selected = limit > 0 ? pending.slice(0, limit) : pending;

function rankCandidate(course, entry) {
  const courseName = normaliseText(course.name);
  const coreName = courseCoreName(course.name);
  const entryName = normaliseText(entry.displayName);
  const exactName = courseName === entryName || entryName.includes(courseName) || (coreName && entryName === coreName);
  const coverage = Math.max(tokenCoverage(course.name, entry.displayName), coreName ? tokenCoverage(coreName, entry.displayName) : 0);
  const jaccard = Math.max(tokenJaccard(course.name, entry.displayName), coreName ? tokenJaccard(coreName, entry.displayName) : 0);
  const cricos = compact(course.cricos_code);
  const cricosMatch = Boolean(cricos && entry.cricosCodes.some((value) => compact(value) === cricos));
  const providerMatch = Boolean(course.university_course_code && compact(course.university_course_code) === compact(entry.providerCode));
  let score = coverage * 0.48 + jaccard * 0.28 + (exactName ? 0.22 : 0) + (cricosMatch ? 0.36 : 0) + (providerMatch ? 0.34 : 0);
  score = Math.min(1, score);
  if (exactName && cricosMatch) score = 1;
  else if (exactName && providerMatch) score = 1;
  else if (exactName && coverage >= 0.95) score = Math.max(score, 0.96);
  return { entry, score, exactName, coverage, jaccard, cricosMatch, providerMatch };
}

function matchCourse(course) {
  const ranked = catalogue.map((entry) => rankCandidate(course, entry)).sort((a, b) => b.score - a.score);
  const best = ranked[0] ?? null;
  if (!best) return { best: null, accepted: false, reason: "no_catalogue_candidate" };
  const duplicateCount = duplicateNameCounts.get(normaliseText(course.name)) ?? 1;
  if (duplicateCount > 1 && !best.cricosMatch && !best.providerMatch) return { best, accepted: false, reason: "duplicate_database_name_needs_identifier" };
  if (best.score < minimumConfidence) return { best, accepted: false, reason: "below_threshold" };
  const second = ranked[1];
  if (second && second.score >= minimumConfidence && second.entry.url !== best.entry.url && Math.abs(best.score - second.score) < 0.04) return { best, accepted: false, reason: "near_tie_multiple_course_pages" };
  if (!best.entry.pageVerified) return { best, accepted: false, reason: "official_url_discovered_but_page_fetch_blocked" };
  return { best, accepted: true, reason: null };
}

console.log("\n=== Monash catalogue-first matching v3 ===");
console.log(`Database courses: ${courses.length}; pending exact links: ${pending.length}; processing: ${selected.length}`);
console.log(`Official catalogue pages: ${catalogue.length}`);

const auditRows = [];
let matched = 0;
let written = 0;
for (let index = 0; index < selected.length; index += 1) {
  const course = selected[index];
  const result = matchCourse(course);
  const best = result.best;
  let writeStatus = result.accepted ? "dry_run" : result.reason;
  if (result.accepted) {
    matched += 1;
    if (writeMode) {
      const { error } = await supabase.from("courses").update({ official_course_url: best.entry.url, official_course_url_verified_at: new Date().toISOString() }).eq("id", course.id);
      if (error) writeStatus = `write_error:${error.message}`;
      else { written += 1; writeStatus = "written"; }
    }
  }
  auditRows.push({ course_id: course.id, course_name: course.name, cricos_code: course.cricos_code, duplicate_name_count: duplicateNameCounts.get(normaliseText(course.name)) ?? 1, candidate_url: best?.entry.url ?? null, candidate_course_code: best?.entry.providerCode ?? null, candidate_name: best?.entry.displayName ?? null, candidate_cricos_codes: best?.entry.cricosCodes?.join("|") ?? "", page_verified: best?.entry.pageVerified ?? false, confidence: best ? Number(best.score.toFixed(4)) : null, exact_name: best?.exactName ?? false, cricos_match: best?.cricosMatch ?? false, provider_code_match: best?.providerMatch ?? false, accepted: result.accepted, rejection_reason: result.reason, write_status: writeStatus });
  console.log(`[${index + 1}/${selected.length}] ${course.name} -> ${result.accepted ? "MATCH" : "review"} (${best ? best.score.toFixed(3) : "none"})${result.reason ? ` [${result.reason}]` : ""}${best?.entry.url ? ` ${best.entry.url}` : ""}`);
}

await mkdir(outputDir, { recursive: true });
await writeFile(auditJsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION, threshold: minimumConfidence, writeMode, rows: auditRows }, null, 2)}\n`, "utf8");
const headers = ["course_id","course_name","cricos_code","duplicate_name_count","candidate_url","candidate_course_code","candidate_name","candidate_cricos_codes","page_verified","confidence","exact_name","cricos_match","provider_code_match","accepted","rejection_reason","write_status"];
const csv = [headers.join(","), ...auditRows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
await writeFile(auditCsvPath, `${csv}\n`, "utf8");

console.log("\n=== Monash catalogue run summary ===");
console.log(JSON.stringify({ databaseCourses: courses.length, pending: pending.length, processed: selected.length, catalogueEntries: catalogue.length, matched, written, auditJson: auditJsonPath, auditCsv: auditCsvPath, catalogueCache: cataloguePath }, null, 2));
if (!writeMode) console.log("Dry run only. Monash sitemap URLs may be used for discovery, but an exact link is not writable unless the official course page itself was successfully fetched and verified.");
