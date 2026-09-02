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
const delayMs = Number(args.get("delay") ?? 150);
const minimumConfidence = Number(args.get("threshold") ?? 0.90);
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const cataloguePath = `${outputDir}/rmit-official-catalogue.json`;
const auditJsonPath = `${outputDir}/rmit-catalogue-match.json`;
const auditCsvPath = `${outputDir}/rmit-catalogue-match.csv`;
const CATALOGUE_SCHEMA_VERSION = 2;

if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a non-negative integer.");
if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5000) throw new Error("--delay must be between 0 and 5000 milliseconds.");
if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0.75 || minimumConfidence > 1) throw new Error("--threshold must be between 0.75 and 1.");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const USER_AGENT = "UniPathAustralia/0.8 (+https://github.com/bkushen/unipath-australia; RMIT official catalogue verification)";
const RMIT_ROOT = "https://www.rmit.edu.au/";
const STOP_WORDS = new Set(["a","an","and","at","for","in","of","on","or","the","to","with","by","from","into","study","course","courses","program","programs","degree","degrees","honours","honor","international"]);
const SPECIALISATION_TERMS = new Set([
  "aeronautical","aerospace","architectural","architecture","civil","electrical","electronic","electronics","mechanical","mechatronics","manufacturing","automotive","chemical","biomedical","environmental","telecommunications","communication","communications","software","computer","computing","cyber","security","network","networks","data","analytics","fashion","textile","merchandising","furniture","aviation","pilot","pilots","screen","media","visual","accounting","finance","marketing","business","content","creation","design","professional","practice","production"
]);

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
if (writeMode && !serviceRoleKey) throw new Error("--write requires SUPABASE_SERVICE_ROLE_KEY in your local .env.local. Keep that secret local and do not paste it into chat or source control.");

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
function decodeXml(value) { return value.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'"); }
function xmlLocations(xml) { return [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map((m) => decodeXml(m[1].trim())).filter(Boolean); }
function rmitCourseCodeFromUrl(value) {
  try {
    const match = new URL(value).pathname.match(/(?:^|[-/])((?:ad|bp|c)\d{3,4})(?:$|[-/])/i);
    return match ? match[1].toUpperCase() : null;
  } catch { return null; }
}
function canonicalRootCourseUrl(value) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  const segments = url.pathname.split("/").filter(Boolean);
  const codeIndex = segments.findIndex((segment) => /(?:^|-)(?:ad|bp|c)\d{3,4}$/i.test(segment));
  if (codeIndex >= 0) url.pathname = `/${segments.slice(0, codeIndex + 1).join("/")}`;
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}
function looksLikeRmitCourseUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname.replace(/^www\./, "") !== "rmit.edu.au") return false;
    const path = url.pathname.toLowerCase();
    return Boolean(rmitCourseCodeFromUrl(value)) && path.includes("/study-with-us/") && (
      path.includes("/bachelor-degrees/") || path.includes("/associate-degrees/") || path.includes("/advanced-diplomas/") ||
      path.includes("/diplomas/") || path.includes("/certificates/") || path.includes("/masters-degrees/") ||
      path.includes("/graduate-certificates/") || path.includes("/graduate-diplomas/") || path.includes("/doctorates/") ||
      path.includes("/phd/") || path.includes("/research-programs/")
    );
  } catch { return false; }
}
function specialisationExtras(courseName, catalogueName) {
  const courseTokens = new Set(tokens(courseName));
  return [...new Set(tokens(catalogueName).filter((token) => SPECIALISATION_TERMS.has(token) && !courseTokens.has(token)))];
}
function extractCodes(text, regex) {
  const values = new Set();
  for (const match of text.matchAll(regex)) values.add(String(match[1] ?? match[0]).toUpperCase().replace(/\s+/g, ""));
  return [...values];
}
function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function fetchText(url, accept = "text/html,application/xhtml+xml,application/xml,text/xml,text/plain") {
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": USER_AGENT, accept }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { text: await response.text(), finalUrl: response.url, contentType: response.headers.get("content-type") ?? "" };
}

async function discoverRmitSitemapPages() {
  const seeds = new Set([new URL("/sitemap.xml", RMIT_ROOT).toString(), new URL("/sitemap_index.xml", RMIT_ROOT).toString(), new URL("/sitemap-index.xml", RMIT_ROOT).toString()]);
  try {
    const robots = await fetchText(new URL("/robots.txt", RMIT_ROOT).toString(), "text/plain,*/*");
    for (const match of robots.text.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)) seeds.add(match[1]);
  } catch (error) { console.warn(`robots.txt skipped: ${error.message}`); }

  const queue = [...seeds];
  const seen = new Set();
  const pages = new Set();
  while (queue.length && seen.size < 100) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seen.has(sitemapUrl)) continue;
    seen.add(sitemapUrl);
    try {
      const { text } = await fetchText(sitemapUrl, "application/xml,text/xml,text/plain,*/*");
      const locations = xmlLocations(text);
      const isIndex = /<sitemapindex\b/i.test(text) || locations.some((loc) => /\.xml(?:\?|$)/i.test(loc));
      for (const location of locations) {
        let parsed;
        try { parsed = new URL(location); } catch { continue; }
        if (parsed.hostname.replace(/^www\./, "") !== "rmit.edu.au") continue;
        if (isIndex && (/\.xml(?:\?|$)/i.test(parsed.pathname + parsed.search) || /sitemap/i.test(parsed.pathname))) {
          if (!seen.has(parsed.toString())) queue.push(parsed.toString());
        } else if (!/\.xml(?:\?|$)/i.test(parsed.pathname + parsed.search)) {
          pages.add(parsed.toString());
        }
      }
    } catch (error) { console.warn(`  sitemap skipped: ${sitemapUrl} (${error.message})`); }
  }
  return { sitemapCount: seen.size, pages: [...pages] };
}

async function buildOfficialCatalogue() {
  console.log("Building RMIT official root-course catalogue from RMIT sitemaps...");
  const sitemap = await discoverRmitSitemapPages();
  const rootUrls = [...new Set(sitemap.pages.filter(looksLikeRmitCourseUrl).map(canonicalRootCourseUrl))];
  console.log(`Sitemaps read: ${sitemap.sitemapCount}; sitemap URLs: ${sitemap.pages.length}; unique root course URLs: ${rootUrls.length}`);

  const entries = [];
  for (let index = 0; index < rootUrls.length; index += 1) {
    const requestedUrl = rootUrls[index];
    try {
      const { text, finalUrl, contentType } = await fetchText(requestedUrl, "text/html,application/xhtml+xml,*/*");
      if (!contentType.toLowerCase().includes("html") && !/<html\b/i.test(text)) continue;
      const url = canonicalRootCourseUrl(finalUrl || requestedUrl);
      if (!looksLikeRmitCourseUrl(url)) continue;
      const title = extractTag(text, "title");
      const h1 = extractTag(text, "h1");
      const displayName = (h1 || title.replace(/\s*[-|]\s*RMIT University.*$/i, "").trim()).trim();
      const pageText = stripHtml(text).slice(0, 220000);
      entries.push({
        url,
        providerCode: rmitCourseCodeFromUrl(url),
        title,
        h1,
        displayName,
        cricosCodes: extractCodes(pageText, /\b(?:CRICOS(?:\s+(?:code|course code))?\s*[:#-]?\s*)?([0-9]{6}[A-Z])\b/gi),
        vetCodes: extractCodes(pageText, /\b((?:[A-Z]{3})\d{5})\b/g),
      });
    } catch (error) {
      console.warn(`  catalogue page skipped: ${requestedUrl} (${error.message})`);
    }
    if ((index + 1) % 50 === 0 || index + 1 === rootUrls.length) console.log(`  catalogue ${index + 1}/${rootUrls.length}`);
    if (delayMs) await sleep(delayMs);
  }

  const byIdentity = new Map();
  for (const entry of entries) {
    const key = `${entry.providerCode}|${normaliseText(entry.displayName)}`;
    if (!byIdentity.has(key)) byIdentity.set(key, entry);
  }
  const catalogue = [...byIdentity.values()].sort((a, b) => `${a.providerCode}:${a.displayName}`.localeCompare(`${b.providerCode}:${b.displayName}`));
  await mkdir(outputDir, { recursive: true });
  await writeFile(cataloguePath, `${JSON.stringify({ schemaVersion: CATALOGUE_SCHEMA_VERSION, generatedAt: new Date().toISOString(), source: RMIT_ROOT, entries: catalogue }, null, 2)}\n`, "utf8");
  console.log(`Catalogue saved: ${catalogue.length} official RMIT root course pages -> ${cataloguePath}`);
  return catalogue;
}

async function loadOrBuildCatalogue() {
  if (!refreshCatalogue) {
    try {
      const saved = JSON.parse(await readFile(cataloguePath, "utf8"));
      if (saved?.schemaVersion === CATALOGUE_SCHEMA_VERSION && Array.isArray(saved.entries) && saved.entries.length) {
        console.log(`Using cached RMIT root catalogue: ${saved.entries.length} entries from ${cataloguePath}`);
        return saved.entries;
      }
      if (saved?.entries?.length) console.log("Cached RMIT catalogue is from an older schema; rebuilding it once.");
    } catch (error) {
      if (error?.code !== "ENOENT") console.warn(`Cached catalogue ignored: ${error.message}`);
    }
  }
  return buildOfficialCatalogue();
}

async function fetchRmitUniversity() {
  const { data, error } = await supabase.from("universities").select("id,name,website").ilike("name", "RMIT University").limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("RMIT University was not found in the universities table.");
  return data;
}

async function fetchRmitCourses(universityId) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("courses")
      .select("id,name,cricos_code,university_course_code,vet_national_code,official_course_url,official_course_url_verified_at")
      .eq("university_id", universityId)
      .order("name")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

function identifierMatches(course, entry) {
  const cricos = compact(course.cricos_code);
  const vet = compact(course.vet_national_code);
  const provider = compact(course.university_course_code);
  return {
    cricos: Boolean(cricos && entry.cricosCodes.some((value) => compact(value) === cricos)),
    vet: Boolean(vet && entry.vetCodes.some((value) => compact(value) === vet)),
    provider: Boolean(provider && compact(entry.providerCode) === provider),
  };
}

function rankCatalogueCandidate(course, entry) {
  const courseName = normaliseText(course.name);
  const entryName = normaliseText(entry.displayName);
  const exactName = courseName === entryName;
  const coverage = tokenCoverage(course.name, entry.displayName);
  const jaccard = tokenJaccard(course.name, entry.displayName);
  const identifiers = identifierMatches(course, entry);
  const identifierCount = Number(identifiers.cricos) + Number(identifiers.vet) + Number(identifiers.provider);
  const extras = specialisationExtras(course.name, entry.displayName);

  let score = coverage * 0.44 + jaccard * 0.28 + (exactName ? 0.20 : 0) + Math.min(0.30, identifierCount * 0.16);
  if (extras.length) score -= Math.min(0.30, extras.length * 0.14);
  score = Math.max(0, Math.min(1, score));

  if (exactName && identifierCount >= 1) score = Math.max(score, 0.99);
  else if (exactName) score = Math.max(score, 0.94);
  else if (identifierCount >= 1 && coverage >= 0.90 && !extras.length) score = Math.max(score, 0.96);

  return { entry, score, exactName, coverage, jaccard, identifierCount, identifiers, extras };
}

function matchCourse(course, catalogue) {
  const ranked = catalogue.map((entry) => rankCatalogueCandidate(course, entry)).sort((a, b) => b.score - a.score);
  const best = ranked[0] ?? null;
  if (!best) return { best: null, accepted: false, reason: "no_catalogue_candidate", ambiguous: [] };

  const courseHasIdentifier = Boolean(compact(course.cricos_code) || compact(course.vet_national_code) || compact(course.university_course_code));
  const identifierCandidates = ranked.filter((item) => item.identifierCount > 0 && item.score >= 0.80);
  const distinctIdentifierPages = [...new Map(identifierCandidates.map((item) => [item.entry.url, item])).values()];

  if (courseHasIdentifier && distinctIdentifierPages.length > 1) {
    const materiallyDifferent = distinctIdentifierPages.filter((item) => {
      const sameName = normaliseText(item.entry.displayName) === normaliseText(best.entry.displayName);
      const sameProvider = item.entry.providerCode === best.entry.providerCode;
      return !sameName || !sameProvider;
    });
    if (materiallyDifferent.length) {
      return {
        best,
        accepted: false,
        reason: "identifier_maps_to_multiple_course_pages",
        ambiguous: distinctIdentifierPages.map((item) => ({ url: item.entry.url, providerCode: item.entry.providerCode, displayName: item.entry.displayName })),
      };
    }
  }

  if (best.extras.length && !best.exactName) {
    return { best, accepted: false, reason: `specialisation_conflict:${best.extras.join("|")}`, ambiguous: [] };
  }
  if (best.score < minimumConfidence) {
    return { best, accepted: false, reason: "below_threshold", ambiguous: [] };
  }

  const second = ranked[1];
  if (second && second.score >= minimumConfidence && Math.abs(best.score - second.score) < 0.035 && second.entry.url !== best.entry.url) {
    return {
      best,
      accepted: false,
      reason: "near_tie_multiple_course_pages",
      ambiguous: [best, second].map((item) => ({ url: item.entry.url, providerCode: item.entry.providerCode, displayName: item.entry.displayName, score: Number(item.score.toFixed(4)) })),
    };
  }

  return { best, accepted: true, reason: null, ambiguous: [] };
}

await mkdir(outputDir, { recursive: true });
const catalogue = await loadOrBuildCatalogue();
const university = await fetchRmitUniversity();
const courses = await fetchRmitCourses(university.id);
const pending = courses.filter((course) => !course.official_course_url);
const selectedCourses = limit > 0 ? pending.slice(0, limit) : pending;

console.log("\n=== RMIT catalogue-first matching ===");
console.log(`Database courses: ${courses.length}; pending exact links: ${pending.length}; processing: ${selectedCourses.length}`);
console.log(`Official root catalogue pages: ${catalogue.length}`);

const auditRows = [];
let matched = 0;
let written = 0;
for (let index = 0; index < selectedCourses.length; index += 1) {
  const course = selectedCourses[index];
  const result = matchCourse(course, catalogue);
  const best = result.best;
  let writeStatus = "dry_run";

  if (result.accepted) {
    matched += 1;
    if (writeMode) {
      const { error } = await supabase
        .from("courses")
        .update({ official_course_url: best.entry.url, official_course_url_verified_at: new Date().toISOString() })
        .eq("id", course.id);
      if (error) writeStatus = `write_error:${error.message}`;
      else { written += 1; writeStatus = "written"; }
    }
  } else {
    writeStatus = result.reason ?? "review";
  }

  auditRows.push({
    course_id: course.id,
    course_name: course.name,
    cricos_code: course.cricos_code,
    university_course_code: course.university_course_code,
    vet_national_code: course.vet_national_code,
    candidate_url: best?.entry.url ?? null,
    candidate_provider_code: best?.entry.providerCode ?? null,
    candidate_name: best?.entry.displayName ?? null,
    confidence: best ? Number(best.score.toFixed(4)) : null,
    exact_name: best?.exactName ?? false,
    cricos_match: best?.identifiers.cricos ?? false,
    vet_match: best?.identifiers.vet ?? false,
    provider_code_match: best?.identifiers.provider ?? false,
    specialisation_extras: best?.extras.join("|") ?? "",
    accepted: result.accepted,
    rejection_reason: result.reason,
    ambiguous_candidates: JSON.stringify(result.ambiguous),
    write_status: writeStatus,
  });

  const confidenceText = best ? best.score.toFixed(3) : "none";
  const reasonText = result.accepted ? "" : ` [${result.reason}]`;
  console.log(`[${index + 1}/${selectedCourses.length}] ${course.name} -> ${result.accepted ? "MATCH" : "review"} (${confidenceText})${reasonText}${best?.entry.url ? ` ${best.entry.url}` : ""}`);
}

await writeFile(auditJsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), schemaVersion: CATALOGUE_SCHEMA_VERSION, threshold: minimumConfidence, writeMode, rows: auditRows }, null, 2)}\n`, "utf8");
const headers = ["course_id","course_name","cricos_code","university_course_code","vet_national_code","candidate_url","candidate_provider_code","candidate_name","confidence","exact_name","cricos_match","vet_match","provider_code_match","specialisation_extras","accepted","rejection_reason","ambiguous_candidates","write_status"];
const csv = [headers.join(","), ...auditRows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
await writeFile(auditCsvPath, `${csv}\n`, "utf8");

console.log("\n=== RMIT catalogue run summary ===");
console.log(JSON.stringify({ databaseCourses: courses.length, pending: pending.length, processed: selectedCourses.length, catalogueEntries: catalogue.length, matched, written, auditJson: auditJsonPath, auditCsv: auditCsvPath, catalogueCache: cataloguePath }, null, 2));
if (!writeMode) console.log("Dry run only. Only exact official root course pages that pass ambiguity checks are eligible for --write.");
