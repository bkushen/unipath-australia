import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

type Candidate = {
  course: { id: string; name: string; qualificationLevel?: string | null; studyField?: string | null; annualFee?: number | null; totalFee?: number | null };
  university: { name: string };
  campus: { city?: string | null; state?: string | null; regional?: boolean | null };
  scholarship?: { name: string; percentage?: number | null; amount?: number | null } | null;
  feeEvidence?: {
    source?: "verified_course_fee" | "estimated_course_fee" | "course_record" | "cricos_tuition_total" | "unavailable" | string;
    feeYear?: number | null;
    derivedAnnual?: boolean | null;
    sourceUrl?: string | null;
    verifiedAt?: string | null;
    verificationStatus?: string | null;
    note?: string | null;
  } | null;
  careerMatch?: {
    source?: "explicit_mapping" | "osca_metadata_inference" | "inferred_text" | string;
    linkedOccupations?: string[];
    oscaOccupation?: { code: string; name: string; sourceRelease?: string | null } | null;
  };
  scores: { academic: number; career: number; affordability: number; location: number; migration: number; overall: number };
};

type Profile = {
  age?: number | null;
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

type PriorQualificationMetadata = {
  label: string;
  scoring_kind: string | null;
  progression_rank: number | null;
  progression_note: string | null;
};

type EligibilityStatus = "likely_meets" | "needs_review" | "requirements_not_verified";
type QualificationKind =
  | "secondary_below_year12"
  | "secondary_year12"
  | "foundation"
  | "non_aqf"
  | "certificate_iii"
  | "certificate_iv"
  | "diploma"
  | "advanced_diploma"
  | "associate_degree"
  | "bachelor"
  | "bachelor_honours"
  | "graduate_certificate"
  | "graduate_diploma"
  | "masters"
  | "doctoral"
  | "unknown";

const qualificationKinds = new Set<QualificationKind>([
  "secondary_below_year12", "secondary_year12", "foundation", "non_aqf", "certificate_iii", "certificate_iv", "diploma", "advanced_diploma", "associate_degree", "bachelor", "bachelor_honours", "graduate_certificate", "graduate_diploma", "masters", "doctoral", "unknown",
]);

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const tokens = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function qualificationKind(value?: string | null, metadata?: PriorQualificationMetadata | null): QualificationKind {
  const metadataKind = metadata?.scoring_kind as QualificationKind | null | undefined;
  if (metadataKind && qualificationKinds.has(metadataKind)) return metadataKind;

  const q = (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!q) return "unknown";
  if (q.includes("below year 12")) return "secondary_below_year12";
  if (q.includes("year 12") || q.includes("senior secondary")) return "secondary_year12";
  if (q.includes("foundation")) return "foundation";
  if (q.includes("doctoral") || q.includes("doctorate") || q.includes("phd")) return "doctoral";
  if (q.includes("master")) return "masters";
  if (q.includes("graduate diploma")) return "graduate_diploma";
  if (q.includes("graduate certificate")) return "graduate_certificate";
  if (q.includes("bachelor honours") || q.includes("bachelor honor") || q.includes("honours degree")) return "bachelor_honours";
  if (q.includes("bachelor")) return "bachelor";
  if (q.includes("associate degree")) return "associate_degree";
  if (q.includes("advanced diploma")) return "advanced_diploma";
  if (q.includes("diploma")) return "diploma";
  if (q.includes("certificate iv") || q.includes("certificate 4")) return "certificate_iv";
  if (q.includes("certificate iii") || q.includes("certificate 3")) return "certificate_iii";
  if (q.includes("non aqf") || q.includes("non-aqf")) return "non_aqf";
  return "unknown";
}

function qualificationRank(kind: QualificationKind) {
  switch (kind) {
    case "secondary_below_year12": return 0;
    case "secondary_year12": return 1;
    case "foundation": return 2;
    case "certificate_iii": return 2;
    case "certificate_iv": return 3;
    case "diploma": return 4;
    case "advanced_diploma": return 5;
    case "associate_degree": return 5;
    case "bachelor": return 6;
    case "bachelor_honours": return 7;
    case "graduate_certificate": return 8;
    case "graduate_diploma": return 9;
    case "masters": return 10;
    case "doctoral": return 11;
    default: return 0;
  }
}

function qualificationReadiness(profile: Profile, candidate: Candidate, metadata?: PriorQualificationMetadata | null) {
  const currentKind = qualificationKind(profile.highestQualification, metadata);
  const targetKind = qualificationKind(candidate.course.qualificationLevel);
  const current = metadata?.progression_rank != null ? metadata.progression_rank : qualificationRank(currentKind);
  const target = qualificationRank(targetKind);
  const databaseNote = metadata?.progression_note ? ` ${metadata.progression_note}` : "";

  if (targetKind === "unknown" || targetKind === "non_aqf") {
    return { score: 65, reason: null, caution: "The destination qualification level could not be assessed reliably from the course label. Check the university's actual entry requirements." };
  }

  if (currentKind === "unknown" || currentKind === "non_aqf") {
    return { score: 60, reason: null, caution: `Your prior qualification needs a manual equivalency check before progression can be assessed confidently.${databaseNote}` };
  }

  if (targetKind === "doctoral") {
    if (currentKind === "masters") return { score: 82, reason: "Your entered qualification is at a common prior level for doctoral study consideration.", caution: "Doctoral admission normally depends on research preparation and course-specific criteria, which still require verification." };
    if (currentKind === "bachelor_honours" || currentKind === "graduate_diploma") return { score: 70, reason: null, caution: "Doctoral entry may be possible through some pathways, but research preparation and course-specific requirements must be checked." };
    if (current >= target) return { score: 76, reason: "Your entered qualification is already at doctoral level.", caution: "This does not establish suitability or admission to another doctoral course." };
    return { score: 48, reason: null, caution: "The selected course is doctoral level and your entered qualification does not by itself establish a typical direct-entry pathway." };
  }

  if (targetKind === "masters") {
    if (["bachelor", "bachelor_honours", "graduate_certificate", "graduate_diploma", "masters", "doctoral"].includes(currentKind)) {
      return { score: 86, reason: "Your entered qualification level is broadly consistent with common master's-level study pathways.", caution: "Actual admission still depends on the university's course-specific academic, field and equivalency requirements." };
    }
    return { score: 50, reason: null, caution: "This is a master's-level course. A pathway, additional qualification or other evidence may be required; UniPath does not assume direct eligibility." };
  }

  if (targetKind === "graduate_certificate" || targetKind === "graduate_diploma") {
    if (qualificationRank(currentKind) >= qualificationRank("bachelor")) return { score: 84, reason: "Your entered qualification level is broadly consistent with common graduate certificate/diploma study pathways.", caution: "Course-specific admission requirements still need verification." };
    return { score: 52, reason: null, caution: "Graduate certificate/diploma entry often requires prior higher education or another approved pathway; direct eligibility is not assumed." };
  }

  if (targetKind === "bachelor_honours") {
    if (currentKind === "bachelor") return { score: 84, reason: "Your entered bachelor's level is a plausible progression toward honours study.", caution: "Honours entry often depends on discipline relevance and academic performance, which must be checked." };
    if (qualificationRank(currentKind) >= qualificationRank("bachelor_honours")) return { score: 76, reason: "Your entered qualification is at or above honours level.", caution: "A higher qualification does not automatically establish admission or that this course is the best progression choice." };
    return { score: 50, reason: null, caution: "Honours study usually requires an appropriate bachelor's-level pathway; course-specific requirements must be checked." };
  }

  if (targetKind === "bachelor") {
    if (currentKind === "secondary_year12") return { score: 78, reason: "Year 12-equivalent study is a common starting level for bachelor's applications.", caution: `Country-specific equivalency, subject prerequisites and course entry standards still need verification.${databaseNote}` };
    if (currentKind === "foundation") return { score: 80, reason: "Foundation Studies is a plausible pathway toward bachelor's-level study.", caution: `Foundation recognition and progression conditions vary by provider and course.${databaseNote}` };
    if (["diploma", "advanced_diploma", "associate_degree"].includes(currentKind)) return { score: 80, reason: "Your entered qualification represents a plausible progression toward bachelor's study.", caution: "Any credit, advanced standing or direct entry depends on the university and is not assumed." };
    if (currentKind === "certificate_iii" || currentKind === "certificate_iv") return { score: 66, reason: null, caution: "A bachelor's pathway may be available, but country-specific entry or pathway requirements still need checking." };
    if (currentKind === "secondary_below_year12") return { score: 50, reason: null, caution: `Further senior-secondary study or a recognised pathway may be needed before bachelor's entry can be considered.${databaseNote}` };
    if (qualificationRank(currentKind) >= qualificationRank("bachelor")) return { score: 76, reason: "Your entered qualification is at or above bachelor's level.", caution: "Studying another bachelor's degree may be suitable for a field change, but progression and admission should be assessed separately." };
  }

  if (targetKind === "associate_degree" || targetKind === "advanced_diploma" || targetKind === "diploma") {
    if (currentKind === "secondary_year12" || currentKind === "foundation") return { score: 80, reason: "Your entered qualification is a plausible starting level for diploma or associate-degree study.", caution: `Provider-specific entry requirements and international equivalency still need verification.${databaseNote}` };
    if (currentKind === "secondary_below_year12") return { score: 62, reason: null, caution: `A preparatory or senior-secondary pathway may be required before entry to this level.${databaseNote}` };
    if (qualificationRank(currentKind) > target) return { score: 72, reason: "Your entered qualification is above the selected course level.", caution: "This may still suit a career change or skills goal, but it is not treated as automatic academic progression." };
    if (qualificationRank(currentKind) >= qualificationRank("certificate_iii")) return { score: 78, reason: "The selected course level is a plausible next or adjacent study level from your entered qualification.", caution: "Admission and credit depend on provider-specific requirements." };
  }

  if (targetKind === "certificate_iii" || targetKind === "certificate_iv") {
    if (["secondary_below_year12", "secondary_year12", "foundation"].includes(currentKind)) return { score: 76, reason: "The selected certificate level is a plausible vocational progression from your entered education level.", caution: `Provider-specific age, language, prerequisite and equivalency rules still apply.${databaseNote}` };
    if (qualificationRank(currentKind) > target) return { score: 70, reason: "Your entered qualification is above the selected certificate level.", caution: "This course may still be useful for vocational skills, but it is not treated as academic progression." };
    return { score: 74, reason: null, caution: "Certificate entry requirements vary by provider and course and still need checking." };
  }

  return { score: qualificationRank(currentKind) === target ? 74 : 68, reason: null, caution: `Qualification-level fit is only a progression signal, not an admission decision.${databaseNote}` };
}

function extractPercentageRequirement(text: string | null) {
  if (!text) return null;
  const matches = [...text.matchAll(/(?:minimum\s*)?(\d{2}(?:\.\d+)?)\s*%/gi)].map((match) => Number(match[1])).filter((value) => value >= 40 && value <= 95);
  return matches.length ? Math.max(...matches) : null;
}

function fieldRelated(previousField: string | undefined, candidate: Candidate, requirement: EntryRequirement) {
  if (!requirement.relevant_field_required) return null;
  const previous = tokens(previousField ?? "");
  const target = `${candidate.course.studyField ?? ""} ${candidate.course.name}`.toLowerCase();
  if (!previous.length) return false;
  return previous.some((word) => word.length >= 4 && target.includes(word));
}

function applyCareerGate(score: number, careerScore: number) {
  if (careerScore <= 35) return Math.min(score, 60);
  if (careerScore < 50) return Math.min(score, 68);
  return score;
}

function fallbackScore(candidate: Candidate, requirement: EntryRequirement | undefined, profile: Profile, priorQualification?: PriorQualificationMetadata | null) {
  const reasons: string[] = [];
  const cautions: string[] = [];
  let eligibilityStatus: EligibilityStatus = requirement ? "needs_review" : "requirements_not_verified";
  let verifiedChecks = 0;
  let failedChecks = 0;
  let unresolvedChecks = 0;

  const readiness = qualificationReadiness(profile, candidate, priorQualification);
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

  const baseFit = clamp(candidate.scores.overall * 0.42 + candidate.scores.career * 0.23 + candidate.scores.academic * 0.11 + candidate.scores.affordability * 0.09 + candidate.scores.location * 0.10 + candidate.scores.migration * 0.05);
  const eligibilityEvidence = requirement ? clamp(readiness.score * 0.25 + academicEvidenceScore * 0.30 + englishEvidenceScore * 0.30 + fieldEvidenceScore * 0.15) : clamp(readiness.score * 0.45 + 55 * 0.55);

  let preferenceAdjustment = 0;
  if (profile.scholarshipImportance === "high") preferenceAdjustment += candidate.scholarship ? 4 : -3;
  else if (profile.scholarshipImportance === "prefer" && candidate.scholarship) preferenceAdjustment += 2;
  if (profile.regionalAccepted === false && candidate.campus.regional) preferenceAdjustment -= 5;
  if (profile.migrationImportance === "high" && candidate.scores.migration >= 75) preferenceAdjustment += 3;

  let careerAdjustment = 0;
  if (candidate.scores.career >= 85) careerAdjustment += 2;
  else if (candidate.scores.career < 50) careerAdjustment -= 8;
  if (candidate.scores.career <= 35) careerAdjustment -= 8;

  const evidenceWeight = requirement ? 0.35 : 0.20;
  const rawFinalScore = clamp(baseFit * (1 - evidenceWeight) + eligibilityEvidence * evidenceWeight + preferenceAdjustment + careerAdjustment);
  const finalScore = applyCareerGate(rawFinalScore, candidate.scores.career);
  const confidence = requirement ? (verifiedChecks >= 2 && unresolvedChecks === 0 ? "high" : "medium") : "low";

  if (candidate.scores.career <= 35) {
    cautions.push("Career relevance is too weak for this career goal, so UniPath capped the final match score even if budget or location fit is strong.");
  } else if (candidate.scores.career < 50) {
    cautions.push("Career relevance is weak, so this course is deliberately prevented from outranking substantially more career-relevant options on budget or location alone.");
  }

  const feeEvidence = candidate.feeEvidence;
  if (feeEvidence?.source === "verified_course_fee") reasons.push(`Tuition evidence: verified${feeEvidence.feeYear ? ` ${feeEvidence.feeYear}` : ""} course-fee evidence is loaded${feeEvidence.derivedAnnual ? "; the annual amount is derived from the loaded total and duration" : ""}.`);
  else if (feeEvidence?.source === "estimated_course_fee") cautions.push(`Tuition evidence: the loaded fee is an estimate${feeEvidence.feeYear ? ` for ${feeEvidence.feeYear}` : ""}; confirm the current international fee with the university before applying.`);
  else if (feeEvidence?.source === "cricos_tuition_total") cautions.push("Tuition evidence: the annual amount is derived from a CRICOS total tuition amount and course duration, not a verified direct annual fee.");
  else if (feeEvidence?.source === "course_record") cautions.push("Tuition evidence: a fee is present in the course record, but it is not labelled as a verified course-fee override; confirm the current international fee with the university.");
  else if (feeEvidence?.source === "unavailable") cautions.push("Tuition evidence: no tuition amount is currently loaded, so budget fit has reduced influence on this recommendation.");

  const osca = candidate.careerMatch?.oscaOccupation;
  if (osca) {
    reasons.push(`Career goal: ${osca.name} · OSCA ${osca.code} (${osca.sourceRelease ?? "OSCA 2024 Version 1.0"}).`);
    if (candidate.careerMatch?.source === "osca_metadata_inference") reasons.push("Course-career relevance was inferred by UniPath using the official OSCA occupation metadata; this is not an ABS course recommendation.");
    else if (candidate.careerMatch?.source === "explicit_mapping") reasons.push("This course also has an explicit course-to-career mapping loaded in UniPath.");
  }
  if (candidate.scores.career >= 80 && !osca) reasons.push("Strong career-direction alignment in the live recommendation engine.");
  if (candidate.scores.affordability >= 80) reasons.push("Available tuition evidence fits or is close to your stated budget.");
  if (candidate.scores.location >= 85) reasons.push("The selected campus aligns well with your location preferences.");
  if (candidate.scholarship && profile.scholarshipImportance !== "none") reasons.push("A linked scholarship is available in UniPath for this course.");

  return {
    courseId: candidate.course.id,
    aiScore: finalScore,
    eligibilityStatus,
    confidence,
    scoreBreakdown: { baseCourseFit: baseFit, qualificationReadiness: readiness.score, academicEvidence: academicEvidenceScore, englishEvidence: englishEvidenceScore, fieldEvidence: fieldEvidenceScore, eligibilityEvidence },
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
    const entryQuery = supabase.from("entry_requirements").select("course_id,academic_text,minimum_gpa,relevant_field_required,ielts_overall,pte_overall,source_url,verified_at").in("course_id", courseIds);
    const priorQuery = profile.highestQualification?.trim()
      ? supabase.from("prior_qualification_levels").select("label,scoring_kind,progression_rank,progression_note").eq("active", true).ilike("label", profile.highestQualification.trim()).limit(1)
      : Promise.resolve({ data: [], error: null });

    const [{ data: entryRows, error: entryError }, { data: priorRows, error: priorError }] = await Promise.all([entryQuery, priorQuery]);
    if (entryError) throw entryError;
    if (priorError) throw priorError;

    const priorQualification = ((priorRows ?? [])[0] as PriorQualificationMetadata | undefined) ?? null;
    const requirementMap = new Map((entryRows ?? []).map((row) => [row.course_id, row as EntryRequirement]));
    const candidateMap = new Map(candidates.map((candidate) => [candidate.course.id, candidate]));
    const fallback = candidates.map((candidate) => fallbackScore(candidate, requirementMap.get(candidate.course.id), profile, priorQualification));

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ results: fallback, mode: "explainable_fallback", model: null, message: "UniPath used its free transparent scoring engine: career-first live course fit plus source-backed eligibility evidence where available." });
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
      feeEvidence: candidate.feeEvidence ?? null,
      scholarship: candidate.scholarship ?? null,
      careerMatch: candidate.careerMatch ?? null,
      baseScores: candidate.scores,
      entryRequirement: requirementMap.get(candidate.course.id) ?? null,
    }));

    const model = process.env.OPENAI_MODEL || "gpt-5-mini";
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        instructions: "You are UniPath Australia's course-fit scoring assistant. Score only from the supplied student profile, database-backed prior-qualification metadata, live course data, fee evidence, OSCA career evidence, and source-backed entry requirements. Career relevance is a gating factor: a weak career score must not be rescued by cheap tuition, scholarship, location or generic academic relevance. Respect fee-evidence quality: verified direct/source-supported fees are stronger than estimates or derived CRICOS annualisations, and unavailable fees must not be treated as evidence that a course is affordable. Qualification-level progression is only a fit signal and must never be treated as proof of admission eligibility. OSCA identifies occupations but does not recommend courses. Never invent missing requirements, fees, scholarships, migration eligibility, PR outcomes, visa outcomes, skills-assessment outcomes, or official occupation-to-course mappings. Missing evidence must lower confidence rather than be treated as a failure. Return conservative, explainable scores.",
        input: JSON.stringify({ profile, priorQualificationMetadata: priorQualification, candidates: compactCandidates }),
        text: { format: { type: "json_schema", name: "unipath_ai_scores", strict: true, schema: { type: "object", additionalProperties: false, properties: { results: { type: "array", items: { type: "object", additionalProperties: false, properties: { courseId: { type: "string" }, aiScore: { type: "integer", minimum: 0, maximum: 100 }, eligibilityStatus: { type: "string", enum: ["likely_meets", "needs_review", "requirements_not_verified"] }, reasons: { type: "array", items: { type: "string" }, maxItems: 4 }, cautions: { type: "array", items: { type: "string" }, maxItems: 4 } }, required: ["courseId", "aiScore", "eligibilityStatus", "reasons", "cautions"] } } }, required: ["results"] } } }
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
      const candidate = candidateMap.get(fallbackItem.courseId);
      return ai && candidate
        ? { ...fallbackItem, ...ai, aiScore: applyCareerGate(ai.aiScore, candidate.scores.career), entryRequirement: fallbackItem.entryRequirement }
        : fallbackItem;
    });

    return NextResponse.json({ results, mode: "openai", model, message: "AI score combines the live UniPath ranking with the evidence supplied to the model, with career relevance kept as a hard ranking guardrail." });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("AI scoring failed", detail);
    return NextResponse.json({ error: "Unable to calculate course-fit scores.", detail }, { status: 500 });
  }
}