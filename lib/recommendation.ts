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
  regionalVerified?: boolean;
  annualFee: number | null;
  durationMonths: number;
  estimatedMonthlyLiving: number | null;
  careerTags: string[];
  backgroundTags: string[];
  migrationAlignment: "Strong" | "Moderate" | "Limited" | "Unknown";
  migrationEvidenceCount?: number;
  migrationEvidenceLabels?: string[];
  scholarshipNote?: string;
  verificationStatus: "DEMO" | "VERIFIED" | "ESTIMATED";
  courseCode?: string | null;
  cricosCode?: string | null;
  feeYear?: number | null;
  sourceUrl?: string | null;
  accreditation?: string | null;
  campusName?: string | null;
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
  estimatedTuition: number | null;
  estimatedLiving: number | null;
  estimatedTotalCost: number | null;
  reasons: string[];
  cautions: string[];
};

const normalise = (value: string) => value.trim().toLowerCase();
const containsAny = (value: string, terms: string[]) => {
  const text = normalise(value);
  if (!text) return false;
  return terms.some((term) => {
    const candidate = normalise(term);
    return candidate.length > 1 && (text.includes(candidate) || candidate.includes(text));
  });
};

export function scoreCourse(profile: StudentAssessment, course: CourseCandidate): RecommendationResult {
  const reasons: string[] = [];
  const cautions: string[] = [];

  let academic = 60;
  if (profile.field && containsAny(profile.field, course.backgroundTags)) {
    academic = 95;
    reasons.push("Strong match with your previous study field");
  } else if (profile.field) {
    academic = 66;
    cautions.push("Check the university's detailed academic entry requirements for your previous field");
  }

  let career = course.careerTags.length ? 68 : 58;
  if (profile.desiredOccupation && containsAny(profile.desiredOccupation, course.careerTags)) {
    career = 96;
    reasons.push("The university lists career outcomes closely aligned with your stated goal");
  } else if (profile.desiredOccupation && course.careerTags.length) {
    cautions.push("The listed career outcomes do not exactly match your stated profession");
  } else if (!course.careerTags.length) {
    cautions.push("Verified career-outcome data is not available yet for this course");
  }

  const annualBudget = Number(profile.annualBudget || 0);
  const totalBudget = Number(profile.totalBudget || 0);
  const livingBudget = Number(profile.livingBudget || 0);
  const years = Math.max(course.durationMonths, 0) / 12;
  const estimatedTuition = course.annualFee !== null ? Math.round(course.annualFee * years) : null;
  const estimatedLiving = course.estimatedMonthlyLiving !== null
    ? Math.round(course.estimatedMonthlyLiving * course.durationMonths)
    : null;
  const estimatedTotalCost = estimatedTuition !== null && estimatedLiving !== null
    ? estimatedTuition + estimatedLiving
    : null;

  let affordability = 60;
  if (course.annualFee === null) {
    cautions.push("International tuition has not yet been verified for this course");
  } else {
    affordability = 75;
    if (annualBudget > 0) {
      const feeRatio = course.annualFee / annualBudget;
      if (feeRatio <= 0.85) affordability = 100;
      else if (feeRatio <= 1) affordability = 90;
      else if (feeRatio <= 1.15) affordability = 65;
      else affordability = 35;
    }
  }

  if (estimatedTotalCost !== null && totalBudget > 0) {
    if (estimatedTotalCost > totalBudget) {
      affordability = Math.min(affordability, estimatedTotalCost <= totalBudget * 1.1 ? 60 : 35);
      cautions.push("Estimated tuition and living costs exceed your stated total budget");
    } else {
      reasons.push("Estimated tuition and living costs fit within your stated total budget");
    }
  } else if (totalBudget > 0 && course.estimatedMonthlyLiving === null) {
    cautions.push("A total-cost comparison is pending verified local living-cost data");
  }

  if (course.estimatedMonthlyLiving !== null && livingBudget > 0 && course.estimatedMonthlyLiving > livingBudget) {
    affordability = Math.max(25, affordability - 12);
    cautions.push("Estimated monthly living cost is above your preferred living budget");
  }

  let location = 70;
  if (!course.state && !course.city) {
    location = 60;
    cautions.push("Course campus location has not yet been verified");
  } else {
    if (profile.state) {
      location = profile.state === course.state ? 100 : 45;
      if (profile.state === course.state) reasons.push(`Matches your preferred state (${course.state})`);
      else cautions.push(`Located in ${course.state}, outside your preferred state`);
    }
    if (profile.city && normalise(profile.city) === normalise(course.city)) {
      location = 100;
      reasons.push(`Located in your preferred city (${course.city})`);
    }
    if (course.regionalVerified) {
      if (profile.regional === "yes" && course.regional) {
        location = Math.min(100, location + 8);
        reasons.push("Verified regional location matches your preference");
      }
      if (profile.regional === "no" && course.regional) {
        location = Math.max(35, location - 20);
        cautions.push("This course is at a verified regional campus but you selected a metropolitan preference");
      }
    } else if (profile.regional !== "maybe") {
      cautions.push("Migration-regional classification has not yet been verified for this campus");
    }
  }

  const migrationMap = { Strong: 92, Moderate: 72, Limited: 45, Unknown: 55 } as const;
  let migration: number = migrationMap[course.migrationAlignment];
  const migrationImportant = ["explore", "regional", "employer"].includes(profile.migrationGoal);

  if (["return", "temporary", "unsure"].includes(profile.migrationGoal)) {
    migration = 70;
  } else if (migrationImportant && (course.migrationEvidenceCount ?? 0) > 0) {
    migration = Math.max(migration, 68);
    reasons.push(`Verified skilled-occupation evidence is available for ${course.migrationEvidenceCount} conservative course link${course.migrationEvidenceCount === 1 ? "" : "s"}`);
    cautions.push("Migration evidence availability is not a visa, nomination, invitation or skills-assessment probability");
  } else if (migrationImportant && course.migrationAlignment === "Unknown") {
    cautions.push("Verified occupation-to-visa pathway analysis is still pending for this course");
  } else if (migrationImportant) {
    reasons.push(`${course.migrationAlignment} current migration-pathway alignment based on verified pathway records`);
  }

  if (course.migrationAlignment === "Limited" && migrationImportant) {
    cautions.push("Current verified skilled-migration alignment is limited");
  }

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
    cautions: cautions.slice(0, 4),
  };
}

export function rankCourses(profile: StudentAssessment, courses: CourseCandidate[]) {
  return courses.map((course) => scoreCourse(profile, course)).sort((a, b) => b.totalScore - a.totalScore);
}
