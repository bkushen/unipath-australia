import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const FIELD_HINTS: Array<[RegExp, string]> = [
  [/\b(it|information technology|software|cyber|computer|data science|artificial intelligence|ai)\b/i, "02 - Information Technology"],
  [/\b(engineer|engineering)\b/i, "03 - Engineering and Related Technologies"],
  [/\b(health|nursing|medicine|medical|public health|pharmacy)\b/i, "06 - Health"],
  [/\b(business|commerce|accounting|finance|management|marketing)\b/i, "08 - Management and Commerce"],
  [/\b(education|teaching|teacher)\b/i, "07 - Education"],
  [/\b(law|psychology|social|society|culture)\b/i, "09 - Society and Culture"],
  [/\b(architecture|building|construction)\b/i, "04 - Architecture and Building"],
  [/\b(science|biology|chemistry|physics|mathematics)\b/i, "01 - Natural and Physical Sciences"],
  [/\b(creative|design|arts|music|film)\b/i, "10 - Creative Arts"],
];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 1200) : "";
  if (!question) return NextResponse.json({ error: "Please enter a question." }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "The AI adviser is not configured on this deployment yet.", needsConfiguration: true }, { status: 503 });

  const supabase = await createClient();
  const field = FIELD_HINTS.find(([pattern]) => pattern.test(question))?.[1] ?? null;

  let courseQuery = supabase.from("courses").select(`
    id,name,qualification_level,cricos_code,cricos_field_1_broad,duration_months,cricos_duration_weeks,annual_fee,cricos_tuition_fee_total,source_url,cricos_fee_source_url,
    universities(name),
    course_campuses(campuses(name,city,state,regional,regional_verified,regional_classification,regional_source_url,living_costs(category,monthly_estimate,weekly_low,weekly_high,verification_status,source_url)))
  `).eq("verification_status", "VERIFIED").not("cricos_code", "is", null).limit(12);
  if (field) courseQuery = courseQuery.eq("cricos_field_1_broad", field);

  const [{ data: courses }, { data: skilled }] = await Promise.all([
    courseQuery.order("cricos_tuition_fee_total", { ascending: true, nullsFirst: false }),
    supabase.from("skilled_occupations").select(`
      name,assessing_authority,source_url,verified_at,
      skilled_occupation_codes(anzsco_code,anzsco_version),
      skilled_occupation_programs(migration_programs(subclass,name,stream,pathway_type))
    `).limit(20)
  ]);

  const evidence = {
    detected_study_field: field,
    courses: courses ?? [],
    skilled_occupations: skilled ?? [],
    evidence_rules: {
      tuition: "cricos_tuition_fee_total is whole-course CRICOS tuition; annual_fee is only a university annual fee where separately verified",
      regional: "CATEGORY_2 and CATEGORY_3 are designated-regional location classifications; CATEGORY_1 is not designated regional",
      migration: "occupation/program evidence is not a PR probability and must not be inferred from a similar course title",
      missing_values: "null/missing means UniPath has not verified that value yet",
    }
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.6",
      store: false,
      instructions: [
        "You are the UniPath Australia study adviser for international students.",
        "Answer only from the supplied UniPath evidence. Never invent a fee, scholarship, entry requirement, living cost, accreditation, occupation link, visa rule or migration outcome.",
        "When evidence is missing, say it is not yet verified in UniPath.",
        "Never say a course guarantees PR, a visa, employment or skills assessment. Do not produce a PR probability.",
        "Distinguish whole-course CRICOS tuition from university annual fees and from user living-cost estimates.",
        "Treat Home Affairs Category 2/3 as location classification only, not migration eligibility.",
        "Keep the answer concise and practical. When recommending courses, explain the evidence and limitations.",
      ].join("\n"),
      input: `Student question:\n${question}\n\nVerified UniPath evidence:\n${JSON.stringify(evidence)}`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("OpenAI Responses API error", response.status, detail.slice(0, 500));
    return NextResponse.json({ error: "The adviser could not generate an answer right now." }, { status: 502 });
  }

  const result = await response.json();
  const answer = extractText(result);
  if (!answer) return NextResponse.json({ error: "The adviser returned no answer." }, { status: 502 });
  return NextResponse.json({ answer, evidenceCount: (courses ?? []).length, detectedField: field });
}

function extractText(result: any) {
  if (typeof result?.output_text === "string") return result.output_text;
  const parts: string[] = [];
  for (const item of result?.output ?? []) {
    for (const content of item?.content ?? []) {
      if ((content?.type === "output_text" || content?.type === "text") && typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}
