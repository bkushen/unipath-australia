import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const args = new Map(process.argv.slice(2).map((raw) => {
  const [key, ...rest] = raw.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : true];
}));
const writeMode = args.get("write") === true;
const outputDir = String(args.get("output-dir") ?? "data/course-link-audits");
const auditPath = `${outputDir}/sydney-course-match.json`;
const outputJson = `${outputDir}/sydney-verified-links.json`;
const outputCsv = `${outputDir}/sydney-verified-links.csv`;

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
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/\bhonors\b/gi, "honours").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function compact(value) { return normalise(value).replace(/ /g, ""); }
function decodeHtml(value) { return String(value ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function stripTags(value) { return decodeHtml(String(value ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }
function csvEscape(value) { const text = String(value ?? ""); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

async function fetchText(url, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "UniPathAustralia/0.2 (+course-link-verification)", accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" }, redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { html: await response.text(), finalUrl: response.url };
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

function extractPage(html) {
  const h1 = stripTags(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const ogTitle = decodeHtml(html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? "").replace(/\s*-\s*The University of Sydney\s*$/i, "").trim();
  const title = stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s*-\s*The University of Sydney\s*$/i, "").trim();
  const pageName = h1 || ogTitle || title;
  const text = stripTags(html);
  const cricosCodes = [...new Set([...text.matchAll(/\b(?:CRICOS(?:\s+course)?\s+(?:code|Code)|CRICOS)\s*[:#-]?\s*([0-9]{6}[A-Z]|[0-9]{7})\b/gi)].map((m) => m[1].toUpperCase()))];
  return { pageName, cricosCodes };
}

await loadEnvFile();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !(serviceRoleKey || publishableKey)) throw new Error("Supabase environment variables are missing. Use the existing .env.local configuration.");
if (writeMode && !serviceRoleKey) throw new Error("--write requires SUPABASE_SERVICE_ROLE_KEY in your local .env.local. Keep that secret local.");
const supabase = createClient(supabaseUrl, serviceRoleKey || publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

await mkdir(outputDir, { recursive: true });
const audit = JSON.parse(await readFile(auditPath, "utf8"));
const accepted = (audit?.rows ?? []).filter((row) => row.accepted && row.candidate_url);
if (!accepted.length) throw new Error(`No accepted Sydney candidates found in ${auditPath}. Run the Sydney dry-run matcher first.`);

const urlCounts = new Map();
for (const row of accepted) urlCounts.set(row.candidate_url, (urlCounts.get(row.candidate_url) ?? 0) + 1);

const results = [];
let verified = 0;
let written = 0;
console.log(`University of Sydney strict verification candidates: ${accepted.length}`);

for (let index = 0; index < accepted.length; index += 1) {
  const row = accepted[index];
  let ok = false;
  let reason = null;
  let liveName = "";
  let liveCricos = [];
  let finalUrl = "";
  try {
    if ((urlCounts.get(row.candidate_url) ?? 0) > 1) throw new Error("candidate_url_collision");
    if (!/^https:\/\/www\.sydney\.edu\.au\/courses\/courses\/(?:uc|pc)\/[^?#]+\.html(?:[?#].*)?$/i.test(row.candidate_url)) throw new Error("invalid_official_course_url");
    if (row.match_method !== "unique_exact_title") throw new Error("unexpected_importer_match_method");

    const page = await fetchText(row.candidate_url);
    finalUrl = page.finalUrl;
    if (!/^https:\/\/www\.sydney\.edu\.au\/(?:content\/)?courses\/courses\/(?:uc|pc)\/[^?#]+\.html(?:[?#].*)?$/i.test(finalUrl)) throw new Error("redirected_outside_official_course_page");

    const metadata = extractPage(page.html);
    liveName = metadata.pageName;
    liveCricos = metadata.cricosCodes;
    if (!liveName || normalise(liveName) !== normalise(row.course_name)) throw new Error("exact_live_title_mismatch");

    const dbCricos = compact(row.cricos_code);
    if (dbCricos && liveCricos.length && !liveCricos.some((value) => compact(value) === dbCricos)) throw new Error("live_cricos_conflict");

    ok = true;
    verified += 1;
    if (writeMode) {
      const { error } = await supabase.from("courses").update({ official_course_url: row.candidate_url, official_course_url_verified_at: new Date().toISOString() }).eq("id", row.course_id);
      if (error) throw new Error(`write_error:${error.message}`);
      written += 1;
    }
  } catch (error) {
    reason = error.message;
    ok = false;
  }

  results.push({ course_id: row.course_id, course_name: row.course_name, cricos_code: row.cricos_code, candidate_url: row.candidate_url, importer_match_method: row.match_method, live_name: liveName, live_cricos_codes: liveCricos.join("|"), final_url: finalUrl, verified: ok, rejection_reason: reason, write_status: ok ? (writeMode ? "written" : "dry_run") : "review" });
  console.log(`[${index + 1}/${accepted.length}] ${row.course_name} -> ${ok ? "VERIFIED" : `review [${reason}]`}`);
}

await writeFile(outputJson, `${JSON.stringify({ generatedAt: new Date().toISOString(), writeMode, rows: results }, null, 2)}\n`, "utf8");
const headers = ["course_id","course_name","cricos_code","candidate_url","importer_match_method","live_name","live_cricos_codes","final_url","verified","rejection_reason","write_status"];
const csv = [headers.join(","), ...results.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
await writeFile(outputCsv, `${csv}\n`, "utf8");

console.log("\n=== University of Sydney strict verification summary ===");
console.log(JSON.stringify({ importerAccepted: accepted.length, verified, reviewed: accepted.length - verified, written, outputJson, outputCsv }, null, 2));
