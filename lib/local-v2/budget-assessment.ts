export type BudgetFeeSource =
  | "verified_course_fee"
  | "estimated_course_fee"
  | "course_record"
  | "cricos_tuition_total"
  | "unavailable"
  | string;

export type BudgetAssessmentInput = {
  semesterBudget: number;
  fullCourseBudget: number;
  annualFee: number | null | undefined;
  totalFee: number | null | undefined;
  durationMonths: number | null | undefined;
  currency?: string | null;
  feeSource?: BudgetFeeSource | null;
  derivedAnnual?: boolean | null;
};

export type BudgetComparison = {
  budget: number;
  tuition: number | null;
  difference: number | null;
  status: "within_budget" | "over_budget" | "not_assessed";
  label: string;
  basis: string;
};

export type BudgetAssessment = {
  semester: BudgetComparison;
  fullCourse: BudgetComparison;
  confidence: "higher" | "planning_estimate" | "limited";
  note: string;
};

const rounded = (value: number) => Math.round(value * 100) / 100;

function feeConfidence(source?: BudgetFeeSource | null, derivedAnnual?: boolean | null): BudgetAssessment["confidence"] {
  if (source === "verified_course_fee" && !derivedAnnual) return "higher";
  if (source === "unavailable" || !source) return "limited";
  return "planning_estimate";
}

function compareBudget(budget: number, tuition: number | null, basis: string): BudgetComparison {
  if (!(budget > 0) || tuition == null || !Number.isFinite(tuition) || tuition <= 0) {
    return {
      budget,
      tuition: tuition != null && Number.isFinite(tuition) && tuition > 0 ? rounded(tuition) : null,
      difference: null,
      status: "not_assessed",
      label: "Budget comparison unavailable",
      basis,
    };
  }

  const difference = rounded(budget - tuition);
  return {
    budget: rounded(budget),
    tuition: rounded(tuition),
    difference,
    status: difference >= 0 ? "within_budget" : "over_budget",
    label: difference >= 0 ? `${Math.abs(difference).toLocaleString("en-AU")} under budget` : `${Math.abs(difference).toLocaleString("en-AU")} over budget`,
    basis,
  };
}

function semesterTuitionEstimate(input: BudgetAssessmentInput) {
  if (input.totalFee != null && input.totalFee > 0 && input.durationMonths != null && input.durationMonths > 0) {
    return {
      value: input.totalFee * (6 / input.durationMonths),
      basis: "Approximate six-month tuition derived from the loaded total tuition and course duration.",
    };
  }

  if (input.annualFee != null && input.annualFee > 0) {
    return {
      value: input.annualFee / 2,
      basis: "Approximate semester tuition calculated as half of the loaded annual tuition.",
    };
  }

  return {
    value: null,
    basis: "No suitable tuition amount is loaded for a semester comparison.",
  };
}

function fullCourseTuitionEstimate(input: BudgetAssessmentInput) {
  if (input.totalFee != null && input.totalFee > 0) {
    return {
      value: input.totalFee,
      basis: "Loaded total-course tuition.",
    };
  }

  if (input.annualFee != null && input.annualFee > 0 && input.durationMonths != null && input.durationMonths > 0) {
    return {
      value: input.annualFee * (input.durationMonths / 12),
      basis: "Planning estimate derived from annual tuition and course duration because a direct total-course tuition amount is not loaded.",
    };
  }

  return {
    value: null,
    basis: "No suitable tuition amount is loaded for a full-course comparison.",
  };
}

export function assessCourseBudget(input: BudgetAssessmentInput): BudgetAssessment {
  const semester = semesterTuitionEstimate(input);
  const fullCourse = fullCourseTuitionEstimate(input);
  const confidence = feeConfidence(input.feeSource, input.derivedAnnual);

  const note = confidence === "higher"
    ? "This comparison uses a verified course-fee record where available. Confirm the final offer and payment schedule with the university."
    : confidence === "planning_estimate"
      ? "This is a planning comparison based on estimated, derived or course-record tuition evidence. It is not a final university quote."
      : "Fee evidence is too limited for a reliable budget comparison. Confirm tuition with the university before relying on this result.";

  return {
    semester: compareBudget(input.semesterBudget, semester.value, semester.basis),
    fullCourse: compareBudget(input.fullCourseBudget, fullCourse.value, fullCourse.basis),
    confidence,
    note,
  };
}
