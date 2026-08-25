export type ScholarshipPreference = "high" | "prefer" | "none" | string;

export type ScholarshipRecord = {
  id?: string;
  name?: string | null;
  percentage?: number | null;
  amount?: number | null;
} | null;

export type ScholarshipAssessment = {
  adjustment: number;
  label: string;
  note: string;
  linked: boolean;
};

export function assessScholarshipPreference(
  preference: ScholarshipPreference,
  scholarship: ScholarshipRecord,
): ScholarshipAssessment {
  if (preference === "none") {
    return {
      adjustment: 0,
      label: scholarship ? "Linked scholarship record" : "No scholarship preference",
      linked: Boolean(scholarship),
      note: scholarship
        ? "A scholarship record is linked to this course in UniPath, but you did not ask scholarships to affect ranking. Course linkage does not establish your eligibility, award value or availability."
        : "Scholarships do not affect this ranking because no scholarship preference was selected.",
    };
  }

  if (!scholarship) {
    return {
      adjustment: 0,
      label: "No linked scholarship record",
      linked: false,
      note: "UniPath does not penalise this course because scholarship coverage is incomplete. No linked record does not mean the university has no scholarships.",
    };
  }

  const adjustment = preference === "high" ? 3 : 1;
  return {
    adjustment,
    label: "Potential scholarship to review",
    linked: true,
    note: `A scholarship record is linked to this course, so UniPath adds only a small ${adjustment}-point preference adjustment. This does not mean you are eligible, that the scholarship is open, or that the displayed amount will apply to you.`,
  };
}

export function previousServerScholarshipAdjustment(
  preference: ScholarshipPreference,
  hasLinkedScholarship: boolean,
) {
  if (preference === "high") return hasLinkedScholarship ? 8 : -10;
  if (preference === "prefer") return hasLinkedScholarship ? 5 : 0;
  return 0;
}
