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
const delayMs = Number(args.get("delay") ?? 180);
const minimumConfidence = Number(args.get("threshold") ?? 0.92);
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const cataloguePath = `${outputDir}/rmit-official-catalogue.json`;
const auditJsonPath = `${outputDir}/rmit-catalogue-match.json`;
const auditCsvPath = `${outputDir}/rmit-catalogue-match.csv`;

if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a non-negative integer.");
if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5000) throw new Error("--delay must be between 0 and 5000 milliseconds.");
if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0.75 || minimumConfidence > 1) throw new Error("--threshold must be between 0.75 and 1.");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const USER_AGENT = "UniPathAustralia/0.7 (+https://github.com/bkushen/unipath-australia; RMIT official catalogue verification)";
const RMIT_ROOT = "https://www.rmit.edu.au/";
const STOP_WORDS = new Set(["a","an","and","at","for","in","of","on","or","the","to","with","by","from","into","study","course","courses","program","programs","degree","degrees","honours","honor","international"]);
const EXCLUDED_PATH_HINTS = ["/news","/events","/staff","/people","/profiles","/alumni","/library","/contact","/about","/media","/blog","/article","/articles","/entry-requirements","/inherent-requirements"];

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
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  return normaliseText(value).replace(/ /g, "");
}

function tokens(value) {
  return [...new Set(normaliseText(value).split(" ").filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))];
}

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
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(html, tag) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}

function decodeXml(value) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function xmlLocations(xml) {
  return [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXml(match[1].trim())).filter(Boolean);
}

function rmitCourseCodeFromUrl(value) {
  try {
    const path = new URL(value).pathname.toLowerCase();
    const match = path.match(/(?:^|[-/])((?:ad|bp|c)\d{3,4})(?:$|[-/])/i);
    return match ? match[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

function canonicalUrl(value) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

function looksLikeRmitCoursePage(value) {
  try {
    const url = new URL(value);
    if (url.hostname.replace(/^www\./, "") !== "rmit.edu.au") return false;
    const path = url.pathname.toLowerCase();
    if (EXCLUDED_PATH_HINTS.some((hint) => path.includes(hint))) return false;
    if (!rmitCourseCodeFromUrl(value)) return false;
    return path.includes("/study-with-us/") && (
      path.includes("/bachelor-degrees/") ||
      path.includes("/associate-degrees/") ||
      path.includes("/advanced-diplomas/") ||
      path.includes("/diplomas/") ||
      path.includes("/certificates/") ||
      path.includes("/masters-degrees/") ||
      path.includes("/graduate-certificates/") ||
      path.includes("/graduate-diplomas/") ||
      path.includes("/doctorates/") ||
      path.includes("/phd/") ||
      path.includes("/research-programs/")
    );
  } catch {
    return false;
  }
}

async function fetchText(url, accept = "text/html,application/xhtml+xml,application/xml,text/xml,text/plain") {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": USER_AGENT, accept },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return {
    text: await response.text(),
    finalUrl: response.url,
    contentType: response.headers.get("content-type") ?? "",
  };
}

async function discoverRmitSitemapPages() {
  const seeds = new Set([
    new URL("/sitemap.xml", RMIT_ROOT).toString(),
    new URL("/sitemap_index.xml", RMIT_ROOT).toString(),
    new URL("/sitemap-index.xml", RMIT_ROOT).toString(),
  ]);

  try {
    const robots = await fetchText(new URL("/robots.txt", RMIT_ROOT).toString(), "text/plain,*/*");
    for (const match of robots.text.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)) seeds.add(match[1]);
  } catch (error) {
    console.warn(`robots.txt skipped: ${error.message}`);
  }

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
    } catch (error) {
      console.warn(`  sitemap skipped: ${sitemapUrl} (${error.message})`);
    }
  }
  return { sitemapCount: seen.size, pages: [...pages] };
}

function extractCodesFromPageText(text, regex) {
  const values = new Set();
  for (const match of text.matchAll(regex)) values.add(String(match[1] ?? match[0]).toUpperCase().replace(/\s+/g, ""));
  return [...values];
}

async function buildOfficialCatalogue() {
  console.log("Building RMIT official course catalogue from RMIT sitemaps...");
  const sitemap = await discoverRmitSitemapPages();
  const candidateUrls = [...new Set(sitemap.pages.filter(looksLikeRmitCoursePage).map(canonicalUrl))];
  console.log(`Sitemaps read: ${sitemap.sitemapCount}; sitemap URLs: ${sitemap.pages.length}; RMIT coded course URLs: ${candidateUrls.length}`);

  const entries = [];
  for (let index = 0; index < candidateUrls.length; index += 1) {
    const url = candidateUrls[index];
    try {
      const { text, finalUrl, contentType } = await fetchText(url, "text/html,application/xhtml+xml,*/*");
      if (!contentType.toLowerCase().includes("html") && !/<html\b/i.test(text)) continue;
      const canonical = canonicalUrl(finalUrl || url);
      if (!looksLikeRmitCoursePage(canonical)) continue;
      const pageText = stripHtml(text).slice(0, 220000);
      const title = extractTag(text, "title");
      const h1 = extractTag(text, "h1");
      const providerCode = rmitCourseCodeFromUrl(canonical);
      const cricosCodes = extractCodesFromPageText(pageText, /\b(?:CRICOS(?:\s+(?:code|course code))?\s*[:#-]?\s*)?([0-9]{6}[A-Z])\b/gi);
      const vetCodes = extractCodesFromPageText(pageText, /\b((?:[A-Z]{3})\d{5})\b/g);
      entries.push({
        url: canonical,
        providerCode,
        title,
        h1,
        displayName: h1 || title.replace(/\s*[-|]\s*RMIT University.*$/i, "").trim(),
        cricosCodes,
        vetCodes,
      });
      if ((index + 1) % 50 === 0 || index + 1 === candidateUrls.length) console.log(`  catalogue ${index + 1}/${candidateUrls.length}`);
    } catch (error) {
      console.warn(`  catalogue page skipped: ${url} (${error.message})`);
    }
    if (delayMs) await sleep(delayMs);
  }

  const dedupedByCode = new Map();
  for (const entry of entries) {
    const key = entry.providerCode ?? entry.url;
    const current = dedupedByCode.get(key);
    if (!current) {
      dedupedByCode.set(key, entry);
      continue;
    }
    const currentScore = tokens(current.displayName).length + current.cricosCodes.length * 3 + current.vetCodes.length * 3;
    const newScore = tokens(entry.displayName).length + entry.cricosCodes.length * 3 + entry.vetCodes.length * 3;
    if (newScore > currentScore) dedupedByCode.set(key, entry);
  }

  const catalogue = [...dedupedByCode.values()].sort((a, b) => String(a.providerCode).localeCompare(String(b.providerCode)));
  await mkdir(outputDir, { recursive: true });
  await writeFile(cataloguePath, `${JSON.stringify({ generatedAt: new Date().toISOString(), source: RMIT_ROOT, entries: catalogue }, null, 2)}\n`, "utf8");
  console.log(`Catalogue saved: ${catalogue.length} unique RMIT course identities -> ${cataloguePath}`);
  return catalogue;
}

async function loadOrBuildCatalogue() {
  if (!refreshCatalogue) {
    try {
      const saved = JSON.parse(await readFile(cataloguePath, "utf8"));
      if (Array.isArray(saved?.entries) && saved.entries.length) {
        console.log(`Using cached RMIT catalogue: ${saved.entries.length} entries from ${cataloguePath}`);
        return saved.entries;
      }
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

function identifierMatch(course, entry) {
  const cricos = compact(course.cricos_code);
  const vet = compact(course.vet_national_code);
  const universityCode = compact(course.university_course_code);
  const entryCricos = new Set((entry.cricosCodes ?? []).map(compact));
  const entryVet = new Set((entry.vetCodes ?? []).map(compact));
  const entryProvider = compact(entry.providerCode);
  return {
    cricos: Boolean(cricos && entryCricos.has(cricos)),
    vet: Boolean(vet && entryVet.has(vet)),
    provider: Boolean(universityCode && entryProvider && universityCode === entryProvider),
  };
}

function scoreCourseAgainstEntry(course, entry) {
  const name = entry.displayName || `${entry.h1 ?? ""} ${entry.title ?? ""}`;
  const coverage = tokenCoverage(course.name, name);
  const reverseCoverage = tokenCoverage(name, course.name);
  const jaccard = tokenJaccard(course.name, name);
  const exactName = normaliseText(course.name) === normaliseText(name);
  const ids = identifierMatch(course, entry);
  const identifierCount = Number(ids.cricos) + Number(ids.vet) + Number(ids.provider);
  let confidence = coverage * 0.34 + reverseCoverage * 0.18 + jaccard * 0.18 + (exactName ? 0.20 : 0);
  if (ids.cricos) confidence += 0.30;
  if (ids.vet) confidence += 0.28;
  if (ids.provider) confidence += 0.35;
  return { confidence: Math.min(1, confidence), exactName, coverage, reverseCoverage, jaccard, ids, identifierCount };
}

function chooseCatalogueMatch(course, catalogue) {
  const ranked = catalogue
    .map((entry) => ({ entry, ...scoreCourseAgainstEntry(course, entry) }))
    .filter((candidate) => candidate.coverage >= 0.45 || candidate.identifierCount > 0)
    .sort((a, b) => b.confidence - a.confidence);

  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  if (!best) return { accepted: false, reason: "no_catalogue_candidate", best: null, second: null };

  const bestHasId = best.identifierCount > 0;
  const strongName = best.exactName || (best.coverage >= 0.95 && best.reverseCoverage >= 0.82);
  const margin = second ? best.confidence - second.confidence : 1;
  const sameBestUrl = second ? canonicalUrl(best.entry.url) === canonicalUrl(second.entry.url) : false;

  // Identifier evidence can disambiguate duplicate database names. Without identifier evidence,
  // require an exceptionally strong name match and a healthy lead over the next catalogue page.
  if (best.confidence < minimumConfidence) return { accepted: false, reason: "below_threshold", best, second };
  if (!bestHasId && !strongName) return { accepted: false, reason: "weak_name_without_identifier", best, second };
  if (!bestHasId && second && !sameBestUrl && margin < 0.08) return { accepted: false, reason: "ambiguous_catalogue_match", best, second };

  // If a DB identifier exists, an official page must agree with at least one loaded identifier.
  const courseHasIdentifier = Boolean(course.cricos_code || course.vet_national_code || course.university_course_code);
  if (courseHasIdentifier && !bestHasId) return { accepted: false, reason: "database_identifier_not_confirmed", best, second };

  return { accepted: true, reason: null, best, second };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

await mkdir(outputDir, { recursive: true });
const university = await fetchRmitUniversity();
const allCourses = await fetchRmitCourses(university.id);
const pending = allCourses.filter((course) => !course.official_course_url);
const selected = limit > 0 ? pending.slice(0, limit) : pending;
const catalogue = await loadOrBuildCatalogue();

console.log("\n=== RMIT catalogue-first matching ===");
console.log(`Database courses: ${allCourses.length}; pending exact links: ${pending.length}; processing: ${selected.length}`);
console.log(`Official catalogue identities: ${catalogue.length}`);

const rows = [];
let matched = 0;
let written = 0;
for (let index = 0; index < selected.length; index += 1) {
  const course = selected[index];
  const choice = chooseCatalogueMatch(course, catalogue);
  const best = choice.best;
  let writeStatus = "dry_run";

  if (choice.accepted && writeMode) {
    const { error } = await supabase
      .from("courses")
      .update({ official_course_url: best.entry.url, official_course_url_verified_at: new Date().toISOString() })
      .eq("id", course.id);
    if (error) writeStatus = `write_error:${error.message}`;
    else {
      written += 1;
      writeStatus = "written";
    }
  } else if (!choice.accepted) {
    writeStatus = choice.reason;
  }

  if (choice.accepted) matched += 1;
  rows.push({
    course_id: course.id,
    course_name: course.name,
    cricos_code: course.cricos_code,
    vet_national_code: course.vet_national_code,
    university_course_code: course.university_course_code,
    accepted: choice.accepted,
    rejection_reason: choice.reason,
    confidence: best ? Number(best.confidence.toFixed(4)) : null,
    exact_name: best?.exactName ?? false,
    cricos_confirmed: best?.ids?.cricos ?? false,
    vet_confirmed: best?.ids?.vet ?? false,
    provider_code_confirmed: best?.ids?.provider ?? false,
    rmit_provider_code: best?.entry?.providerCode ?? null,
    candidate_url: best?.entry?.url ?? null,
    candidate_name: best?.entry?.displayName ?? null,
    second_candidate_url: choice.second?.entry?.url ?? null,
    second_confidence: choice.second ? Number(choice.second.confidence.toFixed(4)) : null,
    write_status: writeStatus,
  });

  const confidenceText = best ? best.confidence.toFixed(3) : "none";
  const reasonText = choice.accepted ? "" : ` [${choice.reason}]`;
  console.log(`[${index + 1}/${selected.length}] ${course.name} -> ${choice.accepted ? "MATCH" : "review"} (${confidenceText})${reasonText}${best?.entry?.url ? ` ${best.entry.url}` : ""}`);
}

await writeFile(auditJsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), university: university.name, threshold: minimumConfidence, writeMode, catalogueEntries: catalogue.length, rows }, null, 2)}\n`, "utf8");
const headers = ["course_id","course_name","cricos_code","vet_national_code","university_course_code","accepted","rejection_reason","confidence","exact_name","cricos_confirmed","vet_confirmed","provider_code_confirmed","rmit_provider_code","candidate_url","candidate_name","second_candidate_url","second_confidence","write_status"];
const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
await writeFile(auditCsvPath, `${csv}\n`, "utf8");

console.log("\n=== RMIT catalogue run summary ===");
console.log(JSON.stringify({
  databaseCourses: allCourses.length,
  pending: pending.length,
  processed: selected.length,
  catalogueEntries: catalogue.length,
  matched,
  written,
  auditJson: auditJsonPath,
  auditCsv: auditCsvPath,
  catalogueCache: cataloguePath,
}, null, 2));

if (!writeMode) console.log("Dry run only. Review the audit before adding --write.");
