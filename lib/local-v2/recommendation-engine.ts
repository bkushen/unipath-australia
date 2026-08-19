import { demoCampuses, demoCourses, demoUniversities } from "./fixtures";
import type {
  DemoCampus,
  DemoCourse,
  DemoUniversity,
  RankedCourseRecommendation,
  StudentDecisionProfile,
} from "./types";

const clamp = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

function textMatchScore(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (!left || !right) return 50;
  if (left === right) return 100;
  if (left.includes(right) || right.includes(left)) return 90;

  const leftTerms = new Set(left.split(/[^a-z0-9]+/).filter(Boolean));
  const rightTerms = right.split(/[^a-z0-9]+/).filter(Boolean);
  const overlap = rightTerms.filter((term) => leftTerms.has(term)).length;
  return clamp(45 + overlap * 15);
}

function getUniversity(course: DemoCourse): DemoUniversity {
  const university = demoUniversities.find((item) => item.id === course.universityId);
  if (!university) throw new Error(`Missing university fixture for ${course.id}`);
  return university;
}

function getCampus(course: DemoCourse): DemoCampus {
  const campus = demoCampuses.find((item) => item.id === course.campusId);
  if (!campus) throw new Error(`Missing campus fixture for ${course.id}`);
  return campus;
}

function affordabilityScore(profile: StudentDecisionProfile, course: DemoCourse): number {
  if (profile.annualTuitionBudgetCents <= 0) return 50;
  const ratio = course.annualTuitionCents / profile.annualTuitionBudgetCents;
  if (ratio <= 0.8) return 100;
  if (ratio <= 1) return clamp(100 - (ratio - 0.8) * 100);
  return clamp(80 - (ratio - 1) * 120);
}

function locationScore(profile: StudentDecisionProfile, campus: DemoCampus): number {
  const stateMatch = profile.preferredStates.length === 0 || profile.preferredStates.includes(campus.state);
  if (!stateMatch) return 45;
  if (campus.regional && profile.regionalAccepted) return 100;
  return 90;
}

function academicScore(profile: StudentDecisionProfile, course: DemoCourse): number {
  const levelScore = textMatchScore(profile.highestQualification, course.qualificationLevel) >= 90 ? 85 : 75;
  const fieldScore = textMatchScore(profile.qualificationField, course.field);
  return clamp(levelScore * 0.35 + fieldScore * 0.65);
}

function careerScore(profile: StudentDecisionProfile, course: DemoCourse): number {
  const direct = Math.max(...course.occupations.map((occupation) => textMatchScore(profile.desiredOccupation, occupation)));
  const skills = profile.skills ?? [];
  if (skills.length === 0) return direct;
  const matchingSkills = course.skillTags.filter((tag) =>
    skills.some((skill) => textMatchScore(skill, tag) >= 85),
  ).length;
  const skillScore = clamp(55 + matchingSkills * 12);
  return clamp(direct * 0.75 + skillScore * 0.25);
}

function overallScore(
  profile: StudentDecisionProfile,
  scores: Omit<RankedCourseRecommendation["scores"], "overall">,
): number {
  const migrationWeight = profile.migrationImportance === "high" ? 0.22 : profile.migrationImportance === "consider" ? 0.12 : 0.03;
  const remaining = 1 - migrationWeight;

  const base =
    scores.academic * 0.22 +
    scores.career * 0.28 +
    scores.affordability * 0.2 +
    scores.location * 0.12 +
    scores.labourMarket * 0.18;

  return clamp(base * remaining + scores.migration * migrationWeight);
}

export function rankCourses(profile: StudentDecisionProfile): RankedCourseRecommendation[] {
  return demoCourses
    .map((course) => {
      const university = getUniversity(course);
      const campus = getCampus(course);
      const scoresWithoutOverall = {
        academic: academicScore(profile, course),
        career: careerScore(profile, course),
        affordability: affordabilityScore(profile, course),
        location: locationScore(profile, campus),
        labourMarket: course.labourMarketScore,
        migration: course.migrationAlignmentScore,
      };
      const overall = overallScore(profile, scoresWithoutOverall);
      const reasons: string[] = [];
      const cautions: string[] = [];

      if (scoresWithoutOverall.career >= 85) reasons.push("Strong match to the selected career goal.");
      if (scoresWithoutOverall.affordability >= 80) reasons.push("Annual tuition is within or close to the stated budget.");
      if (profile.preferredStates.includes(campus.state)) reasons.push(`Campus is in preferred state ${campus.state}.`);
      if (campus.regional && profile.regionalAccepted) reasons.push("Regional campus preference is supported.");
      if (scoresWithoutOverall.labourMarket >= 85) reasons.push("Demo labour-market indicator is strong.");
      if (profile.migrationImportance !== "none" && scoresWithoutOverall.migration >= 80) {
        reasons.push("Demo migration-pathway alignment is comparatively strong.");
      }

      if (course.annualTuitionCents > profile.annualTuitionBudgetCents) cautions.push("Annual tuition exceeds the stated tuition budget.");
      if (profile.preferredStates.length > 0 && !profile.preferredStates.includes(campus.state)) cautions.push("Campus is outside the preferred state list.");
      cautions.push("All migration and labour-market values in this local build are DEMO data, not migration advice.");

      return {
        course,
        university,
        campus,
        scores: { ...scoresWithoutOverall, overall },
        reasons,
        cautions,
      };
    })
    .sort((a, b) => b.scores.overall - a.scores.overall);
}
