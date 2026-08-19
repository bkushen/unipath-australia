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

type EligibilityStatus = "likely_meets" | "needs_review" | "requirements_not_verified";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const tokens = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function qualificationRank(value?: string | null) {
  const q = (value ?? "").toLowerCase();
  if (q.includes("doctor") || q.includes("phd")) return 8;
  if (q.includes("master")) return 7;
  if (q.includes("graduate diploma")) return 6;
  if (q.includes("graduate certificate")) return 5;
  if (q.includes("honour")) return 5;
  if (q.includes("bachelor")) return 4;
  if (q.includes("associate")) return 3;
  if (q.includes("advanced diploma")) return 3;
  if (q.includes("diploma")) return 2;
  if (q.includes("certificate iv")) return 1;
  return 0;
}

function qualificationReadiness(profile: Profile, candidate: Candidate) {
  const current = qualificationRank(profile.highestQualification);
  const target = qualificationRank(candidate.course.qualificationLevel);
  if (!current || !target) return { score: 65, reason: null, caution: "Qualification-level readiness could not be fully checked from the entered labels." };

  if (target >= 7) {
    if (current >= 4) return { score: 90, reason: "Your entered qualification level is broadly consistent with postgraduate-course entry pathways.", caution: null };
    return { score: 48, reason: null, caution: "This is a postgraduate course and your entered qualification level may require a pathway or additional evidence." };
  }

  if (target === 4 || target === 5) {
    if (current >= 2) return { score: 82, reason: "Your prior qualification level is broadly compatible with progressing to undergraduate study.", caution: null };
    return { score: 60, reason: null, caution: "Undergraduate entry still needs checking against the university's country-specific academic requirements." };
  }

  return { score: 75, reason: null, caution: null };
}

function extractPercentageRequirement(text: string | null) {
  if (!text) return null;
  const matches = [...text.matchAll(/(?:minimum\s*)?(\d{2}(?:\.\d+)?)\s*%/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 40 && value <= 95);
  return matches.length ? Math.max(...matches) : null;
}

function fieldRelated(previousField: string | undefined, candidate: Candidate, requirement: EntryRequirement) {
  if (!requirement.relevant_field_required) return null;
  const previous = tokens(previousField ?? "");
  const target = `${candidate.course.studyField ?? ""} ${candidate.course.name}`.toLowerCase();
  if (!previous.length) return false;
  return previous.some((word) => word.length >= 4 && target.includes(word));
}

function fallbackScore(candidate: Candidate, requirement: EntryRequirement | undefined, profile: Profile) {
  const reasons: string[] = [];
  const cautions: string[] = [];
  let eligibilityStatus: EligibilityStatus = requirement ? "needs_review" : "requirements_not_verified";
  let verifiedChecks = 0;
  let failedChecks = 0;
  let unresolvedChecks = 0;

  const readiness = qualificationReadiness(profile, candidate);
  if (readiness.reason) reasons.push(readiness.reason);
  if (readiness.caution) cautions.push(readiness.caution);

  let academicEvidenceScore = 65;
  let englishEvidenceScore = 65;
  let fieldEvidenceScore = 70;

  if (requirement) {
    const percentageRequirement = extractPercentageRequirement(requirement.academic_text);
    if (profile.academicScorePercent != null && percentageRequirement != null) {
      verifiedChecks += 1;
      if (profile.academicScorePercent >= percentageRequirement) {
        academicEvidenceScore = clamp(88 + Math.min(10, profile.academicScorePercent - percentageRequirement));
        reasons.push(`Your academic average of ${profile.academicScorePercent}% meets the loaded ${percentageRequirement}% course threshold.`);
      } else {
        academicEvidenceScore = clamp(55 - (percentageRequirement - profile.academicScorePercent) * 2);
        failedChecks += 1;
        cautions.push(`Your academic average of ${profile.academicScorePercent}% is below the loaded ${percentageRequirement}% threshold.`);
      }
    } else if (requirement.minimum_gpa != null) {
      unresolvedChecks += 1;
      academicEvidenceScore = 62;
      cautions.push(`A minimum GPA of ${Number(requirement.minimum_gpa)} is loaded, but UniPath does not convert your percentage to that GPA scale automatically.`);
    } else if (requirement.academic_text) {
      unresolvedChecks += 1;
      academicEvidenceScore = 68;
      cautions.push("Course-specific academic entry conditions are loaded and still require a manual equivalency check.");
    }

    const related = fieldRelated(profile.qualificationField, candidate, requirement);
    if (related === true) {
      verifiedChecks += 1;
      fieldEvidenceScore = 90;
      reasons.push("Your previous study field appears related to the course area where a relevant field is required.");
    } else if (related === false) {
      failedChecks += 1;
      fieldEvidenceScore = 45;
      cautions.push("A relevant prior field is required and your entered study field does not clearly match it.");
    }

    const test = profile.englishTestType ?? "none";
    if (test === "ielts" && profile.englishScore != null) {
      if (requirement.ielts_overall != null) {
        verifiedChecks += 1;
        const required = Number(requirement.ielts_overall);
        if (profile.englishScore >= required) {
          englishEvidenceScore = clamp(90 + Math.min(8, (profile.englishScore - required) * 4));
          reasons.push(`IELTS ${profile.englishScore} meets the loaded overall requirement of ${required}.`);
        } else {
          englishEvidenceScore = clamp(50 - (required - profile.englishScore) * 20);
          failedChecks += 1;
          cautions.push(`IELTS ${profile.englishScore} is below the loaded overall requirement of ${required}.`);
        }
      } else {
        unresolvedChecks += 1;
        cautions.push("You entered IELTS, but a course-specific IELTS threshold is not yet loaded for this course.");
      }
    } else if (test === "pte" && profile.englishScore != null) {
      if (requirement.pte_overall != null) {
        verifiedChecks += 1;
        const required = Number(requirement.pte_overall);
        if (profile.englishScore >= required) {
          englishEvidenceScore = clamp(90 + Math.min(8, (profile.englishScore - required) / 2));
          reasons.push(`PTE ${profile.englishScore} meets the loaded overall requirement of ${required}.`);
        } else {
          englishEvidenceScore = clamp(50 - (required - profile.englishScore) * 2);
          failedChecks += 1;
          cautions.push(`PTE ${profile.englishScore} is below the loaded overall requirement of ${required}.`);
        }
      } else {
        unresolvedChecks += 1;
        cautions.push("You entered PTE, but a course-specific PTE threshold is not yet loaded for this course.");
      }
    } else if (requirement.ielts_overall != null || requirement.pte_overall != null) {
      unresolvedChecks += 1;
      englishEvidenceScore = 58;
      cautions.push("An English requirement is loaded, but no English test score was entered.");
    }

    if (failedChecks > 0) eligibilityStatus = "needs_review";
    else if (verifiedChecks > 0 && unresolvedChecks === 0) eligibilityStatus = "likely_meets";
    else eligibilityStatus = "needs_review";
  } else {
    cautions.push("Course-specific academic and English entry requirements are not yet verified in UniPath.");
  }

  const baseFit = clamp(
    candidate.scores.overall * 0.45 +
    candidate.scores.career * 0.18 +
    candidate.scores.academic * 0.12 +
    candidate.scores.affordability * 0.10 +
    candidate.scores.location * 0.10 +
    candidate.scores.migration * 0.05
  );

  const eligibilityEvidence = requirement
    ? clamp(readiness.score * 0.25 + academicEvidenceScore * 0.30 + englishEvidenceScore * 0.30 + fieldEvidenceScore * 0.15)
    : clamp(readiness.score * 0.45 + 55 * 0.55);

  let preferenceAdjustment = 0;
  if (profile.scholarshipImportance === "high") preferenceAdjustment += candidate.scholarship ? 4 : -3;
  else if (profile.scholarshipImportance === "prefer" && candidate.scholarship) preferenceAdjustment += 2;
  if (profile.regionalAccepted === false && candidate.campus.regional) preferenceAdjustment -= 5;
  if (profile.migrationImportance === "high" && candidate.scores.migration >= 75) preferenceAdjustment += 3;

  const evidenceWeight = requirement ? 0.35 : 0.20;
  const finalScore = clamp(baseFit * (1 - evidenceWeight) + eligibilityEvidence * evidenceWeight + preferenceAdjustment);
  const confidence = requirement ? (verifiedChecks >= 2 && unresolvedChecks === 0 ? "high" : "medium") : "low";

  if (candidate.scores.career >= 80) reasons.push("Strong career-direction alignment in the live recommendation engine.");
  if (candidate.scores.affordability >= 80) reasons.push("Available tuition evidence fits or is close to your stated budget.");
  if (candidate.scores.location >= 85) reasons.push("The selected campus aligns well with your location preferences.");
  if (candidate.scholarship && profile.scholarshipImportance !== "none") reasons.push("A linked scholarship is available in UniPath for this course.");

  return {
    courseId: candidate.course.id,
    aiScore: finalScore,
    eligibilityStatus,
    confidence,
    scoreBreakdown: {
      baseCourseFit: baseFit,
      qualificationReadiness: readiness.score,
      academicEvidence: academicEvidenceScore,
      englishEvidence: englishEvidenceScore,
      fieldEvidence: fieldEvidenceScore,
      eligibilityEvidence,
    },
    reasons: reasons.slice(0, 6),
    cautions: cautions.slice(0, 6),
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
        message: "UniPath used its free transparent scoring engine: live course fit plus source-backed eligibility evidence where available.",
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
      return NextResponse.json({ results: fallback, mode: "explainable_fallback", model: null, message: "AI service was unavailable, so UniPath used the free transparent scoring engine." });
    }

    const payload = await aiResponse.json();
    const outputText = extractOutputText(payload);
    if (!outputText) return NextResponse.json({ results: fallback, mode: "explainable_fallback", model: null, message: "AI output could not be parsed, so UniPath used the free transparent scoring engine." });

    const parsed = JSON.parse(outputText) as { results?: Array<{ courseId: string; aiScore: number; eligibilityStatus: EligibilityStatus; reasons: string[]; cautions: string[] }> };
    const aiMap = new Map((parsed.results ?? []).map((item) => [item.courseId, item]));
    const results = fallback.map((fallbackItem) => {
      const ai = aiMap.get(fallbackItem.courseId);
      return ai ? { ...fallbackItem, ...ai, entryRequirement: fallbackItem.entryRequirement } : fallbackItem;
    });

    return NextResponse.json({ results, mode: "openai", model, message: "AI score combines the live UniPath ranking with the evidence supplied to the model." });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("AI scoring failed", detail);
    return NextResponse.json({ error: "Unable to calculate course-fit scores.", detail }, { status: 500 });
  }
}
