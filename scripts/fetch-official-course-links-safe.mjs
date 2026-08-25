import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const args = new Map();
for (const raw of process.argv.slice(2)) {
  const [key, ...rest] = raw.replace(/^--/, "").split("=");
  args.set(key, rest.length ? rest.join("=") : true);
}

const selectedUniversity = typeof args.get("university") === "string" ? String(args.get("university")) : null;
const runAll = args.get("all") === true;
const writeMode = args.get("write") === true;
const refresh = args.get("refresh") === true;
const perUniversityLimit = Number(args.get("limit") ?? 0);
const delayMs = Number(args.get("delay") ?? 250);
const minimumConfidence = Number(args.get("threshold") ?? 0.88);
const maxSitemapFiles = Number(args.get("max-sitemaps") ?? 100);
const maxCandidatePages = Number(args.get("max-candidates") ?? 8);
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");

if (!selectedUniversity && !runAll) throw new Error('Choose one university with --university="RMIT University" or use --all.');
if (!Number.isInteger(perUniversityLimit) || perUniversityLimit < 0) throw new Error("--limit must be a non-negative integer.");
if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 10000) throw new Error("--delay must be between 0 and 10000 milliseconds.");
if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0.5 || minimumConfidence > 1) throw new Error("--threshold must be between 0.5 and 1.");
if (!Number.isInteger(maxSitemapFiles) || maxSitemapFiles < 1 || maxSitemapFiles > 500) throw new Error("--max-sitemaps must be an integer between 1 and 500.");
if (!Number.isInteger(maxCandidatePages) || maxCandidatePages < 2 || maxCandidatePages > 15) throw new Error("--max-candidates must be an integer between 2 and 15.");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const USER_AGENT = "UniPathAustralia/0.5 (+https://github.com/bkushen/unipath-australia; official university course-link verification)";
const STOP_WORDS = new Set(["a","an","and","at","for","in","of","on","or","the","to","with","by","from","into","study","course","courses","program","programs","degree","degrees","honours","honor","international"]);
const COURSE_PATH_HINTS = ["/course","/courses","/study","/degrees","/degree","/program","/programs","/undergraduate","/postgraduate","/bachelor","/master","/masters","/diploma","/certificate"];
const EXCLUDED_PATH_HINTS = ["/news","/events","/research/news","/staff","/people","/profiles","/alumni","/library","/contact","/about","/media","/blog","/article","/articles","/entry-requirements","/inherent-requirements"];
const SPECIALISATION_TERMS = new Set([
  "aeronautical","aerospace","architectural","architecture","civil","electrical","electronic","electronics","mechanical","mechatronics","manufacturing","automotive","chemical","biomedical","environmental","telecommunications","communication","communications","software","computer","computing","cyber","security","network","networks","data","analytics","fashion","textile","merchandising","furniture","aviation","pilot","pilots","screen","media","visual","accounting","finance","marketing","business","content","creation","design"
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
if (writeMode && !serviceRoleKey) throw new Error("--write requires SUPABASE_SERVICE_ROLE_KEY in your local .env.local. Do not paste that secret into source control or chat.");

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
  return value.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");
}
function xmlLocations(xml) {
  return [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXml(match[1].trim())).filter(Boolean);
}
function normaliseWebsite(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.hash = "";
    return url.toString();
  } catch { return null; }
}
function sameUniversityHost(url, allowedHosts) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return [...allowedHosts].some((allowed) => {
    const cleaned = allowed.toLowerCase().replace(/^www\./, "");
    return host === cleaned || host.endsWith(`.${cleaned}`) || cleaned.endsWith(`.${host}`);
  });
}
function pathLooksCourseLike(url) {
  const path = `${url.pathname}${url.search}`.toLowerCase();
  if (EXCLUDED_PATH_HINTS.some((hint) => path.includes(hint))) return false;
  return COURSE_PATH_HINTS.some((hint) => path.includes(hint));
}
function urlText(url) { return decodeURIComponent(`${url.pathname} ${url.search}`).replace(/[-_+/=?&]/g, " "); }
function canonicalPageUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch { return value; }
}
function specialisationExtras(courseName, headline) {
  const courseTokens = new Set(tokens(courseName));
  return [...new Set(tokens(headline).filter((token) => SPECIALISATION_TERMS.has(token) && !courseTokens.has(token)))];
}

async function fetchText(url, accept = "text/html,application/xhtml+xml,application/xml,text/xml,text/plain") {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": USER_AGENT, accept },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { text: await response.text(), finalUrl: response.url, contentType: response.headers.get("content-type") ?? "" };
}

async function discoverAllowedHosts(website) {
  const hosts = new Set([new URL(website).hostname.replace(/^www\./, "")]);
  try {
    const response = await fetch(website, { redirect: "follow", headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(15000) });
    if (response.url) hosts.add(new URL(response.url).hostname.replace(/^www\./, ""));
  } catch {}
  return hosts;
}

async function discoverSitemapUrls(website, allowedHosts) {
  const root = new URL(website);
  root.pathname = "/";
  root.search = "";
  root.hash = "";
  const seeds = new Set([
    new URL("/sitemap.xml", root).toString(),
    new URL("/sitemap_index.xml", root).toString(),
    new URL("/sitemap-index.xml", root).toString(),
  ]);
  try {
    const robots = await fetchText(new URL("/robots.txt", root).toString(), "text/plain,*/*");
    for (const match of robots.text.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)) seeds.add(match[1]);
  } catch {}

  const queue = [...seeds];
  const seen = new Set();
  const pages = new Set();
  while (queue.length && seen.size < maxSitemapFiles) {
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
        if (!sameUniversityHost(parsed, allowedHosts)) continue;
        if (isIndex && (/\.xml(?:\?|$)/i.test(parsed.pathname + parsed.search) || /sitemap/i.test(parsed.pathname))) {
          if (!seen.has(parsed.toString())) queue.push(parsed.toString());
        } else if (/^https?:$/i.test(parsed.protocol) && !/\.xml(?:\?|$)/i.test(parsed.pathname + parsed.search)) {
          pages.add(parsed.toString());
        }
      }
    } catch (error) {
      console.warn(`  sitemap skipped: ${sitemapUrl} (${error.message})`);
    }
    if (delayMs) await sleep(Math.min(delayMs, 400));
  }
  return { sitemapCount: seen.size, pages: [...pages] };
}

async function fetchCoursesForUniversity(universityId) {
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

function preliminaryScore(course, url) {
  const path = urlText(url);
  const compactUrl = compact(url.href);
  const courseCode = compact(course.university_course_code);
  const cricos = compact(course.cricos_code);
  const vet = compact(course.vet_national_code);
  const identifierBonus =
    (courseCode && compactUrl.includes(courseCode) ? 0.32 : 0) +
    (cricos && compactUrl.includes(cricos) ? 0.30 : 0) +
    (vet && compactUrl.includes(vet) ? 0.30 : 0);
  const conflictPenalty = specialisationExtras(course.name, path).length ? 0.16 : 0;
  return Math.max(0, Math.min(1,
    tokenCoverage(course.name, path) * 0.54 +
    tokenJaccard(course.name, path) * 0.28 +
    identifierBonus +
    (pathLooksCourseLike(url) ? 0.08 : 0) -
    conflictPenalty
  ));
}

function verifyPage(course, url, html) {
  const title = extractTag(html, "title");
  const h1 = extractTag(html, "h1");
  const pageText = stripHtml(html).slice(0, 180000);
  const headline = `${title} ${h1} ${urlText(url)}`;
  const compactPage = compact(pageText);
  const compactHeadline = compact(headline);
  const compactUrl = compact(url.href);
  const courseCode = compact(course.university_course_code);
  const cricos = compact(course.cricos_code);
  const vet = compact(course.vet_national_code);
  const courseCodeFound = Boolean(courseCode && (compactPage.includes(courseCode) || compactUrl.includes(courseCode)));
  const cricosFound = Boolean(cricos && (compactPage.includes(cricos) || compactUrl.includes(cricos)));
  const vetCodeFound = Boolean(vet && (compactPage.includes(vet) || compactUrl.includes(vet)));
  const courseCodeHeadlineFound = Boolean(courseCode && compactHeadline.includes(courseCode));
  const cricosHeadlineFound = Boolean(cricos && compactHeadline.includes(cricos));
  const vetCodeHeadlineFound = Boolean(vet && compactHeadline.includes(vet));
  const headlineCoverage = tokenCoverage(course.name, headline);
  const headlineJaccard = tokenJaccard(course.name, headline);
  const exactHeadline = normaliseText(title).includes(normaliseText(course.name)) || normaliseText(h1).includes(normaliseText(course.name));
  const conflicts = specialisationExtras(course.name, headline);
  const identifierBonus = (courseCodeFound ? 0.24 : 0) + (cricosFound ? 0.28 : 0) + (vetCodeFound ? 0.26 : 0);
  const score = Math.max(0, Math.min(1,
    headlineCoverage * 0.42 +
    headlineJaccard * 0.20 +
    tokenCoverage(course.name, pageText) * 0.14 +
    identifierBonus +
    (exactHeadline ? 0.08 : 0) -
    (conflicts.length ? 0.20 : 0)
  ));
  return {
    title,
    h1,
    score,
    exactHeadline,
    headlineCoverage,
    headlineJaccard,
    courseCodeFound,
    cricosFound,
    vetCodeFound,
    courseCodeHeadlineFound,
    cricosHeadlineFound,
    vetCodeHeadlineFound,
    conflicts,
  };
}

function qualifiesAsIndependentCollisionPage(item) {
  if (item.conflicts.length) return false;
  if (item.confidence < Math.max(0.72, minimumConfidence - 0.16)) return false;
  return item.exactHeadline || item.headlineCoverage >= 0.90 || item.headlineJaccard >= 0.82;
}

async function verifyCourse(course, candidateUrls, allowedHosts) {
  const ranked = candidateUrls
    .map((href) => {
      try {
        const url = new URL(href);
        if (!sameUniversityHost(url, allowedHosts)) return null;
        return { url, preliminary: preliminaryScore(course, url) };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.preliminary - a.preliminary)
    .slice(0, Math.max(maxCandidatePages * 4, 24));

  const shortlist = ranked.filter((item) => item.preliminary >= 0.22).slice(0, maxCandidatePages);
  const evaluated = [];
  for (const candidate of shortlist) {
    try {
      const { text, finalUrl, contentType } = await fetchText(candidate.url.toString(), "text/html,application/xhtml+xml,*/*");
      if (!contentType.toLowerCase().includes("html") && !/<html\b/i.test(text)) continue;
      const finalParsed = new URL(finalUrl || candidate.url.toString());
      if (!sameUniversityHost(finalParsed, allowedHosts) || !pathLooksCourseLike(finalParsed)) continue;
      const verified = verifyPage(course, finalParsed, text);
      const confidence = Math.min(1, verified.score * 0.86 + candidate.preliminary * 0.14);
      evaluated.push({ url: finalParsed.toString(), confidence, preliminary: candidate.preliminary, ...verified });
    } catch (error) {
      console.warn(`    candidate skipped: ${candidate.url} (${error.message})`);
    }
    if (delayMs) await sleep(delayMs);
  }

  evaluated.sort((a, b) => b.confidence - a.confidence);
  const best = evaluated[0] ?? null;
  if (!best) return { best: null, collisionKinds: [], collisionUrls: [] };

  const collisionKinds = [];
  const collisionUrls = new Set();
  const identifierChecks = [
    ["CRICOS", "cricosFound", "cricosHeadlineFound"],
    ["VET", "vetCodeFound", "vetCodeHeadlineFound"],
    ["UNIVERSITY_COURSE_CODE", "courseCodeFound", "courseCodeHeadlineFound"],
  ];

  for (const [kind, bodyKey, headlineKey] of identifierChecks) {
    const pages = evaluated.filter((item) => {
      if (!item[bodyKey]) return false;
      if (!qualifiesAsIndependentCollisionPage(item)) return false;
      // A second page is collision evidence only when it independently looks like
      // this exact course. A code mentioned in related-course/navigation text is not enough.
      return item[headlineKey] || item.exactHeadline || item.headlineCoverage >= 0.95;
    });
    const distinct = [...new Set(pages.map((item) => canonicalPageUrl(item.url)))];
    if (distinct.length > 1) {
      collisionKinds.push(kind);
      distinct.forEach((url) => collisionUrls.add(url));
    }
  }

  return { best, collisionKinds, collisionUrls: [...collisionUrls] };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const { data: universityRows, error: universityError } = await supabase
  .from("universities")
  .select("id,name,website")
  .order("name");
if (universityError) throw universityError;

const universities = (universityRows ?? []).filter((university) =>
  selectedUniversity ? normaliseText(university.name) === normaliseText(selectedUniversity) : runAll
);
if (!universities.length) throw new Error(`No matching university found for ${selectedUniversity ?? "--all"}.`);

await mkdir(outputDir, { recursive: true });
const summary = [];

for (const university of universities) {
  const website = normaliseWebsite(university.website);
  if (!website) {
    console.warn(`Skipping ${university.name}: no valid website.`);
    summary.push({ university: university.name, courses: 0, matched: 0, written: 0, reason: "missing_website" });
    continue;
  }

  console.log(`\n=== ${university.name} ===`);
  console.log(`Website: ${website}`);
  const courses = await fetchCoursesForUniversity(university.id);
  const duplicateNameCounts = new Map();
  for (const course of courses) {
    const key = normaliseText(course.name);
    duplicateNameCounts.set(key, (duplicateNameCounts.get(key) ?? 0) + 1);
  }
  const pending = courses.filter((course) => refresh || !course.official_course_url);
  const selectedCourses = perUniversityLimit > 0 ? pending.slice(0, perUniversityLimit) : pending;
  console.log(`Courses: ${courses.length}; pending exact links: ${pending.length}; processing: ${selectedCourses.length}`);

  const allowedHosts = await discoverAllowedHosts(website);
  console.log(`Allowed university hosts: ${[...allowedHosts].join(", ")}`);
  const sitemap = await discoverSitemapUrls(website, allowedHosts);
  const courseLikePages = sitemap.pages.filter((href) => {
    try { return pathLooksCourseLike(new URL(href)); } catch { return false; }
  });
  const candidatePages = courseLikePages.length >= Math.min(30, Math.max(1, selectedCourses.length)) ? courseLikePages : sitemap.pages;
  console.log(`Sitemaps read: ${sitemap.sitemapCount}; URLs discovered: ${sitemap.pages.length}; course-like URLs: ${courseLikePages.length}`);

  const auditRows = [];
  let matched = 0;
  let written = 0;

  for (let index = 0; index < selectedCourses.length; index += 1) {
    const course = selectedCourses[index];
    const duplicateNameCount = duplicateNameCounts.get(normaliseText(course.name)) ?? 1;
    const { best: result, collisionKinds, collisionUrls } = await verifyCourse(course, candidatePages, allowedHosts);
    const identifierEvidence = Boolean(result && (result.cricosFound || result.courseCodeFound || result.vetCodeFound));
    const duplicateSafe = duplicateNameCount === 1 || identifierEvidence;
    const specialisationSafe = !result?.conflicts?.length;
    const titleSafe = Boolean(result && (result.exactHeadline || identifierEvidence));
    const collisionSafe = collisionKinds.length === 0;
    const accepted = Boolean(
      result &&
      result.confidence >= minimumConfidence &&
      duplicateSafe &&
      specialisationSafe &&
      titleSafe &&
      collisionSafe
    );

    let rejectionReason = null;
    if (!result) rejectionReason = "no_candidate";
    else if (collisionKinds.length) rejectionReason = `identifier_collision:${collisionKinds.join("|")}`;
    else if (result.confidence < minimumConfidence) rejectionReason = "below_threshold";
    else if (!duplicateSafe) rejectionReason = "duplicate_name_needs_identifier";
    else if (!specialisationSafe) rejectionReason = `specialisation_conflict:${result.conflicts.join("|")}`;
    else if (!titleSafe) rejectionReason = "title_not_exact_and_no_identifier";

    let writeStatus = "dry_run";
    if (accepted && writeMode) {
      const { error } = await supabase
        .from("courses")
        .update({ official_course_url: result.url, official_course_url_verified_at: new Date().toISOString() })
        .eq("id", course.id);
      if (error) writeStatus = `write_error:${error.message}`;
      else {
        written += 1;
        writeStatus = "written";
      }
    } else if (!accepted) {
      writeStatus = rejectionReason ?? "review";
    }

    if (accepted) matched += 1;
    auditRows.push({
      university: university.name,
      course_id: course.id,
      course_name: course.name,
      cricos_code: course.cricos_code,
      university_course_code: course.university_course_code,
      vet_national_code: course.vet_national_code,
      duplicate_name_count: duplicateNameCount,
      previous_url: course.official_course_url,
      candidate_url: result?.url ?? null,
      confidence: result ? Number(result.confidence.toFixed(4)) : null,
      title: result?.title ?? null,
      h1: result?.h1 ?? null,
      headline_coverage: result ? Number(result.headlineCoverage.toFixed(4)) : null,
      cricos_found: result?.cricosFound ?? false,
      course_code_found: result?.courseCodeFound ?? false,
      vet_code_found: result?.vetCodeFound ?? false,
      exact_headline: result?.exactHeadline ?? false,
      specialisation_conflicts: result?.conflicts?.join("|") ?? "",
      identifier_collision_kinds: collisionKinds.join("|"),
      identifier_collision_urls: collisionUrls.join("|"),
      accepted,
      rejection_reason: accepted ? null : rejectionReason,
      write_status: writeStatus,
    });

    const confidenceText = result ? result.confidence.toFixed(3) : "none";
    const reasonText = accepted ? "" : rejectionReason ? ` [${rejectionReason}]` : "";
    console.log(`[${index + 1}/${selectedCourses.length}] ${course.name} -> ${accepted ? "MATCH" : "review"} (${confidenceText})${reasonText}${result?.url ? ` ${result.url}` : ""}`);
  }

  const slug = normaliseText(university.name).replace(/ /g, "-");
  const jsonPath = `${outputDir}/${slug}-safe.json`;
  const csvPath = `${outputDir}/${slug}-safe.csv`;
  await writeFile(jsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), university: university.name, website, threshold: minimumConfidence, writeMode, rows: auditRows }, null, 2)}\n`, "utf8");
  const headers = [
    "university","course_id","course_name","cricos_code","university_course_code","vet_national_code","duplicate_name_count","previous_url","candidate_url","confidence","title","h1","headline_coverage","cricos_found","course_code_found","vet_code_found","exact_headline","specialisation_conflicts","identifier_collision_kinds","identifier_collision_urls","accepted","rejection_reason","write_status"
  ];
  const csv = [headers.join(","), ...auditRows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
  await writeFile(csvPath, `${csv}\n`, "utf8");

  summary.push({
    university: university.name,
    website,
    courses: courses.length,
    pending: pending.length,
    processed: selectedCourses.length,
    sitemapPages: sitemap.pages.length,
    courseLikePages: courseLikePages.length,
    matched,
    written,
    auditJson: jsonPath,
    auditCsv: csvPath,
  });
  console.log(`Completed ${university.name}: ${matched}/${selectedCourses.length} strong matches${writeMode ? `; ${written} written` : "; dry run only"}.`);
}

console.log("\n=== Course link run summary ===");
console.log(JSON.stringify(summary, null, 2));
if (!writeMode) console.log("Dry run only. Collision and specialisation safeguards must pass before --write is used.");
