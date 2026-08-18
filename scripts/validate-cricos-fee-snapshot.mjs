import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const feeFile = process.env.FEE_FILE ?? process.argv[2];
const cricosDir = process.env.CRICOS_DIR ?? "data/cricos";

if (!feeFile) throw new Error("Provide FEE_FILE or pass the fee snapshot path as the first argument");

const activeCodes = new Set();
const courseFiles = (await readdir(cricosDir))
  .filter((name) => /^courses-.*\.json$/i.test(name))
  .sort();

for (const file of courseFiles) {
  const rows = JSON.parse(await readFile(join(cricosDir, file), "utf8"));
  for (const row of rows) {
    const code = String(row.cricos_code ?? "").trim().toUpperCase();
    if (code) activeCodes.add(code);
  }
}

const fees = JSON.parse(await readFile(feeFile, "utf8"));
if (!Array.isArray(fees)) throw new Error("Fee snapshot must be a JSON array");
if (!fees.length) throw new Error("Fee snapshot is empty");

const seen = new Set();
const errors = [];
let withNonTuition = 0;
let withEstimatedTotal = 0;

for (const [index, row] of fees.entries()) {
  const code = String(row.cricos_code ?? "").trim().toUpperCase();
  const tuition = Number(row.tuition_fee_total);
  const nonTuition = row.non_tuition_fee_total == null ? null : Number(row.non_tuition_fee_total);
  const estimatedTotal = row.estimated_total_cost == null ? null : Number(row.estimated_total_cost);
  const verifiedAt = Date.parse(String(row.verified_at ?? ""));

  if (!code) errors.push(`row ${index + 1}: missing CRICOS code`);
  if (code && seen.has(code)) errors.push(`row ${index + 1}: duplicate CRICOS code ${code}`);
  if (code) seen.add(code);
  if (code && !activeCodes.has(code)) errors.push(`row ${index + 1}: ${code} is not in the active normalized university catalogue`);

  if (!Number.isFinite(tuition) || tuition <= 0) errors.push(`row ${index + 1} (${code || "unknown"}): tuition must be a positive number`);
  if (nonTuition !== null && (!Number.isFinite(nonTuition) || nonTuition < 0)) errors.push(`row ${index + 1} (${code || "unknown"}): non-tuition fee must be zero or positive`);
  if (estimatedTotal !== null && (!Number.isFinite(estimatedTotal) || estimatedTotal < tuition)) errors.push(`row ${index + 1} (${code || "unknown"}): estimated total cannot be lower than tuition`);
  if (nonTuition !== null) withNonTuition += 1;
  if (estimatedTotal !== null) withEstimatedTotal += 1;

  if (!Number.isFinite(verifiedAt)) errors.push(`row ${index + 1} (${code || "unknown"}): invalid verified_at timestamp`);

  try {
    const source = new URL(String(row.source_url ?? ""));
    if (source.protocol !== "https:" || source.hostname !== "cricos.education.gov.au") {
      errors.push(`row ${index + 1} (${code || "unknown"}): source must be HTTPS on cricos.education.gov.au`);
    }
    const sourceCode = String(source.searchParams.get("coursecode") ?? "").toUpperCase();
    if (code && sourceCode !== code) errors.push(`row ${index + 1} (${code}): source URL coursecode does not match`);
  } catch {
    errors.push(`row ${index + 1} (${code || "unknown"}): invalid source URL`);
  }
}

const summary = {
  file: basename(feeFile),
  records: fees.length,
  unique_cricos_codes: seen.size,
  with_non_tuition_fee: withNonTuition,
  with_estimated_total_cost: withEstimatedTotal,
  active_catalogue_codes_checked: activeCodes.size,
  errors: errors.length,
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
}
