import { readFile, writeFile } from "node:fs/promises";

const sourceFile = process.env.SOURCE_FILE ?? "data/cricos/chunks/courses-02-information-technology-001.json";
const outputFile = process.env.OUTPUT_FILE ?? "/tmp/cricos-fees.json";
const limit = Number(process.env.LIMIT ?? 20);
const offset = Number(process.env.OFFSET ?? 0);
const delayMs = Number(process.env.DELAY_MS ?? 500);
const verifiedAt = new Date().toISOString();

if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("LIMIT must be an integer between 1 and 200");
if (!Number.isInteger(offset) || offset < 0) throw new Error("OFFSET must be a non-negative integer");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function textFromHtml(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#36;|&dollar;/gi, "$")
    .replace(/\s+/g, " ")
    .trim();
}

function amountAfterLabel(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}\\s*:?\\s*(?:\\$?\\s*AU\\s*)?\\$?\\s*([0-9][0-9,.]*)`, "i"));
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

async function fetchPage(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "UniPathAustralia/0.1 (+https://github.com/bkushen/unipath-australia; CRICOS fee verification)",
          accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(800 * attempt);
    }
  }
  throw lastError;
}

const courses = JSON.parse(await readFile(sourceFile, "utf8"));
const selected = courses.slice(offset, offset + limit);
const results = [];
const failures = [];

for (let index = 0; index < selected.length; index += 1) {
  const course = selected[index];
  const code = String(course.cricos_code ?? "").trim().toUpperCase();
  if (!code) continue;

  const sourceUrl = `https://cricos.education.gov.au/course/coursedetails.aspx?coursecode=${encodeURIComponent(code.toLowerCase())}`;
  let captured = false;
  try {
    const html = await fetchPage(sourceUrl);
    const text = textFromHtml(html);
    const tuition = amountAfterLabel(text, "Tuition Fee");
    const nonTuition = amountAfterLabel(text, "Non Tuition Fee");
    const total = amountAfterLabel(text, "Estimated Total Course Cost");

    if (tuition === null) {
      failures.push({ cricos_code: code, reason: "Tuition Fee label/value not found", source_url: sourceUrl });
    } else if (tuition <= 0) {
      failures.push({ cricos_code: code, reason: "CRICOS tuition value is zero or negative", source_url: sourceUrl });
    } else {
      results.push({
        cricos_code: code,
        tuition_fee_total: tuition,
        non_tuition_fee_total: nonTuition,
        estimated_total_cost: total,
        source_url: sourceUrl,
        verified_at: verifiedAt,
      });
      captured = true;
    }
  } catch (error) {
    failures.push({ cricos_code: code, reason: String(error), source_url: sourceUrl });
  }

  console.log(`[${index + 1}/${selected.length}] ${code}: ${captured ? "fee captured" : "not captured"}`);
  if (index < selected.length - 1) await sleep(delayMs);
}

await writeFile(outputFile, `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ sourceFile, offset, requested: selected.length, captured: results.length, failed: failures.length, outputFile }, null, 2));
if (failures.length) console.error(JSON.stringify({ failures }, null, 2));

if (results.length === 0) process.exitCode = 1;
