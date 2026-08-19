import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

type Candidate = {
  course: { id: string; name: string; qualificationLevel?: string | null; studyField?: string | null; annualFee?: number | null; totalFee?: number | null };
  university: { name: string };
  campus: { city?: string | null; state?: string | null; regional?: boolean | null };
  scholarship?: { name: string; percentage?: number | null; amount?: number | null } | null;
  scores: { academic: number; career: number; affordability: number; location: number; migration: number; overall: number };
};

type Profile = {
  highestQualification?: string;
  qualificationField?: string;
  academicScorePercent?: number | null;
  englishTestType?: "none" | "ielts" | "pte";
  englishScore?: number | null;
  desiredOccupation?: string;
  preferredStudy?: string;
  preferredLocation?: string;
  preferredStates?: string[];
  regionalAccepted?: boolean;
  semesterBudget?: number;
  fullBudget?: number;
  scholarshipImportance?: string;
  migrationImportance?: string;
};

type EntryRequirement = {
  course_id: string;
  academic_text: string | null;
  minimum_gpa: number | string | null;
  relevant_field_required: boolean | null;
  ielts_overall: number | string | null;
  pte_overall: number | string | null;
  source_url: string | null;
  verified_at: string | null;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function fallbackScore(candidate: Candidate, requirement: EntryRequirement | undefined, profile: Profile) {
  let eligibilityStatus: "likely_meets" | "needs_review" | "requirements_not_verified" = requirement ? "needs_review" : "requirements_not_verified";
  const reasons: string[] = [];
  const cautions: string[] = [];
  let eligibilityAdjustment = 0;

  if (requirement) {
    if (profile.englishTestType === "ielts" && profile.englishScore != null && requirement.ielts_overall != null) {
      const required = Number(requirement.ielts_overall);
      if (profile.englishScore >= required) {
        eligibilityAdjustment += 5;
        reasons.push(`IELTS ${profile.englishScore} meets the loaded overall requirement of ${required}.`);
        eligibilityStatus = "likely_meets";
      } else {
        eligibilityAdjustment -= 18;
        cautions.push(`IELTS ${profile.englishScore} is below the loaded overall requirement of ${required}.`);
      }
    }
    if (profile.englishTestType === "pte" && profile.englishScore != null && requirement.pte_overall != null) {
      const required = Number(requirement.pte_overall);
      if (profile.englishScore >= required) {
        eligibilityAdjustment += 5;
        reasons.push(`PTE ${profile.englishScore} meets the loaded overall requirement of ${required}.`);
        eligibilityStatus = "likely_meets";
      } else {
        eligibilityAdjustment -= 18;
        cautions.push(`PTE ${profile.englishScore} is below the loaded overall requirement of ${required}.`);
      }
    }
    if (requirement.relevant_field_required) {
      const previous = (profile.qualificationField ?? "").toLowerCase();
      const study = (candidate.course.studyField ?? candidate.course.name).toLowerCase();
      const overlap = previous.split(/[^a-z0-9]+/).filter(Boolean).some((word) => word.length > 3 && study.includes(word));
      if (!overlap) {
        eligibilityAdjustment -= 8;
        cautions.push("A relevant prior field is required and your entered study field needs manual review.");
      } else {
        reasons.push("Your previous study field appears related to the course area.");
      }
    }
    if (!profile.englishScore && (requirement.ielts_overall != null || requirement.pte_overall != null)) {
      cautions.push("An English requirement is loaded, but no English test score was entered.");
    }
  } else {
    cautions.push("Course-specific academic and English entry requirements are not yet verified in UniPath.");
  }

  const transparentBase = candidate.scores.overall * 0.55 + candidate.scores.career * 0.15 + candidate.scores.academic * 0.10 + candidate.scores.affordability * 0.10 + candidate.scores.location * 0.10;
  return {
    courseId: candidate.course.id,
    aiScore: clamp(transparentBase + eligibilityAdjustment),
    eligibilityStatus,
    reasons,
    cautions,
    entryRequirement: requirement ?? null,
  };
}

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const output = (payload as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: string }).type === "output_text") {
        const text = (part as { text?: string }).text;
        if (text) return text;
      }
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { profile?: Profile; candidates?: Candidate[] };
    const profile = body.profile ?? {};
    const candidates = (body.candidates ?? []).slice(0, 12);
    if (!candidates.length) return NextResponse.json({ results: [], mode: "no_candidates" });

    const courseIds = candidates.map((item) => item.course.id);
    const supabase = getSupabase();
    const { data: entryRows, error: entryError } = await supabase
      .from("entry_requirements")
      .select("course_id,academic_text,minimum_gpa,relevant_field_required,ielts_overall,pte_overall,source_url,verified_at")
      .in("course_id", courseIds);
    if (entryError) throw entryError;

    const requirementMap = new Map((entryRows ?? []).map((row) => [row.course_id, row as EntryRequirement]));
    const fallback = candidates.map((candidate) => fallbackScore(candidate, requirementMap.get(candidate.course.id), profile));

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        results: fallback,
        mode: "explainable_fallback",
        model: null,
        message: "OPENAI_API_KEY is not configured, so UniPath used the transparent scoring fallback.",
      });
    }

    const compactCandidates = candidates.map((candidate) => ({
      courseId: candidate.course.id,
      course: candidate.course.name,
      qualification: candidate.course.qualificationLevel,
      studyField: candidate.course.studyField,
      university: candidate.university.name,
      location: `${candidate.campus.city ?? ""} ${candidate.campus.state ?? ""}`.trim(),
      regional: candidate.campus.regional,
      annualFee: candidate.course.annualFee,
      totalFee: candidate.course.totalFee,
      scholarship: candidate.scholarship ?? null,
      baseScores: candidate.scores,
      entryRequirement: requirementMap.get(candidate.course.id) ?? null,
    }));

    const model = process.env.OPENAI_MODEL || "gpt-5-mini";
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        instructions: "You are UniPath Australia's course-fit scoring assistant. Score only from the supplied student profile, live course data, and source-backed entry requirements. Never invent missing requirements, fees, scholarships, migration eligibility, PR outcomes, visa outcomes, or skills-assessment outcomes. Missing evidence must lower confidence rather than be treated as a failure. Return conservative, explainable scores.",
        input: JSON.stringify({ profile, candidates: compactCandidates }),
        text: {
          format: {
            type: "json_schema",
            name: "unipath_ai_scores",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      courseId: { type: "string" },
                      aiScore: { type: "integer", minimum: 0, maximum: 100 },
                      eligibilityStatus: { type: "string", enum: ["likely_meets", "needs_review", "requirements_not_verified"] },
                      reasons: { type: "array", items: { type: "string" }, maxItems: 4 },
                      cautions: { type: "array", items: { type: "string" }, maxItems: 4 }
                    },
                    required: ["courseId", "aiScore", "eligibilityStatus", "reasons", "cautions"]
                  }
                }
              },
              required: ["results"]
            }
          }
        }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("OpenAI AI score request failed", aiResponse.status, errorText.slice(0, 500));
      return NextResponse.json({ results: fallback, mode: "explainable_fallback", model: null, message: "AI service was unavailable, so UniPath used the transparent scoring fallback." });
    }

    const payload = await aiResponse.json();
    const outputText = extractOutputText(payload);
    if (!outputText) return NextResponse.json({ results: fallback, mode: "explainable_fallback", model: null, message: "AI output could not be parsed, so UniPath used the transparent scoring fallback." });

    const parsed = JSON.parse(outputText) as { results?: Array<{ courseId: string; aiScore: number; eligibilityStatus: string; reasons: string[]; cautions: string[] }> };
    const aiMap = new Map((parsed.results ?? []).map((item) => [item.courseId, item]));
    const results = fallback.map((fallbackItem) => {
      const ai = aiMap.get(fallbackItem.courseId);
      return ai ? { ...fallbackItem, ...ai, entryRequirement: fallbackItem.entryRequirement } : fallbackItem;
    });

    return NextResponse.json({ results, mode: "openai", model, message: "AI score combines the live UniPath ranking with the evidence supplied to the model." });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("AI scoring failed", detail);
    return NextResponse.json({ error: "Unable to calculate AI scores.", detail }, { status: 500 });
  }
}
