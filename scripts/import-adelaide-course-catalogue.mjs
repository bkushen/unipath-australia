import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const args = new Map(process.argv.slice(2).map((raw) => {
  const [key, ...rest] = raw.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : true];
}));
const limit = Number(args.get("limit") ?? 0);
const writeMode = args.get("write") === true;
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const cataloguePath = `${outputDir}/adelaide-course-catalogue.json`;
const auditJson = `${outputDir}/adelaide-course-match.json`;
const auditCsv = `${outputDir}/adelaide-course-match.csv`;
const UNIVERSITY_NAME = "Adelaide University";
const ROOT = "https://adelaideuni.edu.au";
const SITEMAP = `${ROOT}/sitemap.xml`;

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

function normalise(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\bhonors\b/gi, "honours")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function compact(value) { return normalise(value).replace(/ /g, ""); }
function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function stripTags(value) { return decodeHtml(String(value ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }
function csvEscape(value) { const text = String(value ?? ""); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

async function fetchText(url, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "UniPathAustralia/0.2 (+course-link-verification)",
          accept: "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { text: await response.text(), finalUrl: response.url };
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

function sitemapLocs(xml) {
  return [...String(xml ?? "").matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => decodeHtml(m[1].trim()));
}
function canonicalDegreeUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/^(?:www\.)?adelaideuni\.edu\.au$/i.test(parsed.hostname)) return null;
    const match = parsed.pathname.match(/^\/study\/degrees\/([a-z0-9][a-z0-9-]*)(?:\/(int|dom))?\/?$/i);
    if (!match) return null;
    const slug = match[1].toLowerCase();
    const audience = match[2]?.toLowerCase();
    if (audience === "dom") return null;
    return `${ROOT}/study/degrees/${slug}/${audience === "int" ? "int/" : ""}`;
  } catch {
    return null;
  }
}
async function discoverDegreeUrls() {
  const queue = [SITEMAP];
  const seen = new Set();
  const bySlug = new Map();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    let xml;
    try {
      xml = (await fetchText(current)).text;
    } catch (error) {
      console.warn(`Could not read sitemap ${current}: ${error.message}`);
      continue;
    }
    for (const loc of sitemapLocs(xml)) {
      if (/\.xml(?:\?|$)/i.test(loc) && /^https:\/\/(?:www\.)?adelaideuni\.edu\.au\//i.test(loc) && !seen.has(loc)) {
        queue.push(loc);
        continue;
      }
      const degreeUrl = canonicalDegreeUrl(loc);
      if (!degreeUrl) continue;
      const slug = degreeUrl.match(/\/degrees\/([^/]+)/i)?.[1];
      if (!slug) continue;
      const currentChoice = bySlug.get(slug);
      if (!currentChoice || /\/int\/$/i.test(degreeUrl)) bySlug.set(slug, degreeUrl);
    }
    if (seen.size > 300) break;
  }
  return [...bySlug.values()].sort();
}

function extractPageMetadata(html, url) {
  const h1 = stripTags(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const ogTitle = decodeHtml(html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? "");
  const title = stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const rawName = h1 || ogTitle || title;
  const name = rawName
    .replace(/^Study\s+/i, "")
    .replace(/\s+at Adelaide University(?:\s*-.*)?$/i, "")
    .replace(/\s*[|–-]\s*Adelaide University\s*$/i, "")
    .trim();
  const text = stripTags(html);
  const cricosCodes = [...new Set([...text.matchAll(/\bCRICOS\s+(?:code\s*)?[:#-]?\s*([0-9]{6}[A-Z]|[0-9]{7})\b/gi)].map((m) => m[1].toUpperCase()))];
  const programCodes = [...new Set([...text.matchAll(/\bProgram\s+code\s*[:#-]?\s*([A-Z][A-Z0-9]{2,12})\b/gi)].map((m) => m[1].toUpperCase()))];
  return { url, name, normalisedName: normalise(name), cricosCodes, programCodes, pageVerified: Boolean(name && name.length > 3) };
}

await loadEnvFile();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !(serviceRoleKey || publishableKey)) throw new Error("Supabase environment variables are missing. Use the existing .env.local configuration.");
if (writeMode && !serviceRoleKey) throw new Error("--write requires SUPABASE_SERVICE_ROLE_KEY in your local .env.local. Keep that secret local.");
const supabase = createClient(supabaseUrl, serviceRoleKey || publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

const { data: universities, error: universityError } = await supabase.from("universities").select("id,name").eq("name", UNIVERSITY_NAME).limit(1);
if (universityError) throw universityError;
const university = universities?.[0];
if (!university) throw new Error(`${UNIVERSITY_NAME} was not found in the database.`);
const { data: courses, error: courseError } = await supabase
  .from("courses")
  .select("id,name,cricos_code,university_course_code,official_course_url")
  .eq("university_id", university.id)
  .order("name");
if (courseError) throw courseError;
const pending = (courses ?? []).filter((course) => !course.official_course_url);
const work = limit > 0 ? pending.slice(0, limit) : pending;

await mkdir(outputDir, { recursive: true });
console.log("Discovering official Adelaide University degree pages...");
const urls = await discoverDegreeUrls();
if (!urls.length) throw new Error("No Adelaide University degree URLs were discovered from the official sitemap.");
console.log(`Discovered ${urls.length} candidate degree URLs.`);

const catalogue = [];
for (let index = 0; index < urls.length; index += 1) {
  const requestedUrl = urls[index];
  try {
    const page = await fetchText(requestedUrl);
    const finalDegreeUrl = canonicalDegreeUrl(page.finalUrl);
    if (!finalDegreeUrl) continue;
    const metadata = extractPageMetadata(page.text, finalDegreeUrl);
    if (metadata.pageVerified) catalogue.push(metadata);
  } catch (error) {
    console.warn(`[${index + 1}/${urls.length}] ${requestedUrl} -> ${error.message}`);
  }
  if ((index + 1) % 50 === 0) console.log(`Fetched ${index + 1}/${urls.length} pages...`);
}
await writeFile(cataloguePath, `${JSON.stringify({ generatedAt: new Date().toISOString(), source: SITEMAP, entries: catalogue }, null, 2)}\n`, "utf8");

const byCricos = new Map();
const byCode = new Map();
const byTitle = new Map();
for (const entry of catalogue) {
  for (const cricos of entry.cricosCodes) {
    const key = compact(cricos);
    if (!byCricos.has(key)) byCricos.set(key, []);
    byCricos.get(key).push(entry);
  }
  for (const code of entry.programCodes) {
    const key = compact(code);
    if (!byCode.has(key)) byCode.set(key, []);
    byCode.get(key).push(entry);
  }
  const titleKey = normalise(entry.name);
  if (!byTitle.has(titleKey)) byTitle.set(titleKey, []);
  byTitle.get(titleKey).push(entry);
}
const dbNameCounts = new Map();
for (const course of courses ?? []) {
  const key = normalise(course.name);
  dbNameCounts.set(key, (dbNameCounts.get(key) ?? 0) + 1);
}

const rows = [];
let matched = 0;
let written = 0;
for (const course of work) {
  const dbCricos = compact(course.cricos_code);
  const dbCode = compact(course.university_course_code);
  const dbTitle = normalise(course.name);
  let candidates = [];
  let matchMethod = null;
  let rejectionReason = null;

  if (dbCricos && (byCricos.get(dbCricos)?.length ?? 0) === 1) {
    candidates = byCricos.get(dbCricos);
    matchMethod = "cricos_identifier";
  } else if (dbCode && (byCode.get(dbCode)?.length ?? 0) === 1) {
    candidates = byCode.get(dbCode);
    matchMethod = "provider_course_code";
  } else if ((dbNameCounts.get(dbTitle) ?? 0) === 1 && (byTitle.get(dbTitle)?.length ?? 0) === 1) {
    candidates = byTitle.get(dbTitle);
    matchMethod = "unique_exact_title";
  } else if ((dbNameCounts.get(dbTitle) ?? 0) > 1 && (byTitle.get(dbTitle)?.length ?? 0) >= 1) {
    rejectionReason = "duplicate_database_name_needs_identifier";
  } else if ((byTitle.get(dbTitle)?.length ?? 0) > 1) {
    rejectionReason = "multiple_current_pages_same_exact_title";
  } else {
    rejectionReason = "no_exact_current_degree_match";
  }

  const candidate = candidates?.[0] ?? null;
  let accepted = Boolean(candidate);
  if (candidate && dbCricos && candidate.cricosCodes.length && !candidate.cricosCodes.some((value) => compact(value) === dbCricos)) {
    accepted = false;
    rejectionReason = "current_page_cricos_conflict";
  }

  if (accepted) {
    matched += 1;
    if (writeMode) {
      const { error } = await supabase.from("courses").update({ official_course_url: candidate.url, official_course_url_verified_at: new Date().toISOString() }).eq("id", course.id);
      if (error) throw new Error(`Write failed for ${course.name}: ${error.message}`);
      written += 1;
    }
  }

  rows.push({
    course_id: course.id,
    course_name: course.name,
    cricos_code: course.cricos_code,
    university_course_code: course.university_course_code,
    accepted,
    match_method: matchMethod,
    rejection_reason: accepted ? null : rejectionReason,
    candidate_url: candidate?.url ?? null,
    candidate_name: candidate?.name ?? null,
    candidate_cricos_codes: candidate?.cricosCodes ?? [],
    candidate_program_codes: candidate?.programCodes ?? [],
  });
}
await writeFile(auditJson, `${JSON.stringify({ generatedAt: new Date().toISOString(), writeMode, rows }, null, 2)}\n`, "utf8");
const headers = ["course_id","course_name","cricos_code","university_course_code","accepted","match_method","rejection_reason","candidate_url","candidate_name","candidate_cricos_codes","candidate_program_codes"];
const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => csvEscape(Array.isArray(row[key]) ? row[key].join("|") : row[key])).join(","))].join("\n");
await writeFile(auditCsv, `${csv}\n`, "utf8");

console.log("\n=== Adelaide University course-link run summary ===");
console.log(JSON.stringify({ databaseCourses: courses?.length ?? 0, pending: pending.length, processed: work.length, discoveredUrls: urls.length, catalogueEntries: catalogue.length, matched, written, cataloguePath, auditJson, auditCsv }, null, 2));
