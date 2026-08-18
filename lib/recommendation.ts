export type StudentAssessment = {
  qualification: string;
  field: string;
  country: string;
  currentOccupation: string;
  desiredOccupation: string;
  annualBudget: string;
  totalBudget: string;
  livingBudget: string;
  state: string;
  city: string;
  regional: string;
  migrationGoal: string;
};

export type CourseCandidate = {
  id: string;
  university: string;
  course: string;
  qualificationLevel: string;
  field: string;
  state: string;
  city: string;
  regional: boolean;
  annualFee: number;
  durationMonths: number;
  estimatedMonthlyLiving: number;
  careerTags: string[];
  backgroundTags: string[];
  migrationAlignment: "Strong" | "Moderate" | "Limited" | "Unknown";
  scholarshipNote?: string;
  verificationStatus: "DEMO" | "VERIFIED" | "ESTIMATED";
};

export type RecommendationResult = CourseCandidate & {
  totalScore: number;
  scores: {
    academic: number;
    career: number;
    affordability: number;
    location: number;
    migration: number;
  };
  estimatedTuition: number;
  estimatedLiving: number;
  estimatedTotalCost: number;
  reasons: string[];
  cautions: string[];
};

const normalise = (value: string) => value.trim().toLowerCase();
const containsAny = (value: string, terms: string[]) => {
  const text = normalise(value);
  if (!text) return false;
  return terms.some((term) => text.includes(normalise(term)) || normalise(term).includes(text));
};

export function scoreCourse(profile: StudentAssessment, course: CourseCandidate): RecommendationResult {
  const reasons: string[] = [];
  const cautions: string[] = [];

  let academic = 55;
  if (profile.field && containsAny(profile.field, course.backgroundTags)) {
    academic = 95;
    reasons.push("Strong match with your previous study field");
  } else if (profile.field) {
    academic = 65;
    cautions.push("Previous study field may require closer entry-requirement review");
  }

  let career = 55;
  if (profile.desiredOccupation && containsAny(profile.desiredOccupation, course.careerTags)) {
    career = 96;
    reasons.push("Course is closely aligned with your stated career goal");
  } else if (profile.desiredOccupation) {
    career = 68;
    cautions.push("Career alignment is indirect rather than exact");
  }

  const annualBudget = Number(profile.annualBudget || 0);
  const totalBudget = Number(profile.totalBudget || 0);
  const livingBudget = Number(profile.livingBudget || 0);
  const years = course.durationMonths / 12;
  const estimatedTuition = Math.round(course.annualFee * years);
  const estimatedLiving = Math.round(course.estimatedMonthlyLiving * course.durationMonths);
  const estimatedTotalCost = estimatedTuition + estimatedLiving;

  let affordability = 70;
  if (annualBudget > 0) {
    const feeRatio = course.annualFee / annualBudget;
    if (feeRatio <= 0.85) affordability = 100;
    else if (feeRatio <= 1) affordability = 90;
    else if (feeRatio <= 1.15) affordability = 65;
    else affordability = 35;
  }
  if (totalBudget > 0 && estimatedTotalCost > totalBudget) {
    affordability = Math.min(affordability, estimatedTotalCost <= totalBudget * 1.1 ? 60 : 35);
    cautions.push("Estimated total study and living cost exceeds your stated budget");
  } else if (totalBudget > 0) {
    reasons.push("Estimated total cost fits within your stated overall budget");
  }
  if (livingBudget > 0 && course.estimatedMonthlyLiving > livingBudget) {
    affordability = Math.max(25, affordability - 12);
    cautions.push("Estimated monthly living cost is above your preferred living budget");
  }

  let location = 75;
  if (profile.state) {
    location = profile.state === course.state ? 100 : 45;
    if (profile.state === course.state) reasons.push(`Matches your preferred state (${course.state})`);
    else cautions.push(`Located in ${course.state}, outside your preferred state`);
  }
  if (profile.city && normalise(profile.city) === normalise(course.city)) {
    location = 100;
    reasons.push(`Located in your preferred city (${course.city})`);
  }
  if (profile.regional === "yes" && course.regional) {
    location = Math.min(100, location + 8);
    reasons.push("Regional location matches your preference");
  }
  if (profile.regional === "no" && course.regional) {
    location = Math.max(35, location - 20);
    cautions.push("This is a regional campus but you selected metro preference");
  }

  const migrationMap = { Strong: 92, Moderate: 72, Limited: 45, Unknown: 55 } as const;
  let migration = migrationMap[course.migrationAlignment];
  if (["return", "temporary", "unsure"].includes(profile.migrationGoal)) migration = 70;
  if (["explore", "regional", "employer"].includes(profile.migrationGoal)) {
    reasons.push(`${course.migrationAlignment} current migration-pathway alignment in this demo record`);
  }
  if (course.migrationAlignment === "Limited") cautions.push("Limited skilled-migration alignment identified in this demo record");

  const totalScore = Math.round(
    academic * 0.22 +
    career * 0.24 +
    affordability * 0.24 +
    location * 0.14 +
    migration * 0.16
  );

  return {
    ...course,
    totalScore,
    scores: { academic, career, affordability, location, migration },
    estimatedTuition,
    estimatedLiving,
    estimatedTotalCost,
    reasons: reasons.slice(0, 4),
    cautions: cautions.slice(0, 3),
  };
}

export function rankCourses(profile: StudentAssessment, courses: CourseCandidate[]) {
  return courses.map((course) => scoreCourse(profile, course)).sort((a, b) => b.totalScore - a.totalScore);
}
