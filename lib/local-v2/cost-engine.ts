import type { CostAssumptions, CostResult, DemoCourse, DemoSuburb } from "./types";

export const defaultCostAssumptions: CostAssumptions = {
  annualFeeIncreaseBps: 500,
  oshcCents: 180000,
  visaAndSetupCents: 420000,
  studyMaterialsAnnualCents: 120000,
  transportWeeklyCents: 5500,
  emergencyBufferCents: 300000,
};

function assertIntegerCents(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be integer cents.`);
  }
}

function applyBps(valueCents: number, bps: number): number {
  return Math.round((valueCents * bps) / 10_000);
}

function tuitionAcrossYears(course: DemoCourse, assumptions: CostAssumptions): number {
  let annual = course.annualTuitionCents;
  let total = 0;

  for (let year = 0; year < course.durationYears; year += 1) {
    total += annual;
    annual += applyBps(annual, assumptions.annualFeeIncreaseBps);
  }

  return total;
}

export function calculateCourseCost(
  course: DemoCourse,
  suburb: DemoSuburb,
  totalFundsCents: number,
  assumptions: CostAssumptions = defaultCostAssumptions,
): CostResult {
  [
    [course.annualTuitionCents, "annual tuition"],
    [suburb.weeklyRentCents, "weekly rent"],
    [suburb.weeklyGroceriesCents, "weekly groceries"],
    [suburb.weeklyUtilitiesCents, "weekly utilities"],
    [suburb.weeklyPersonalCents, "weekly personal expenses"],
    [totalFundsCents, "total funds"],
  ].forEach(([value, label]) => assertIntegerCents(value as number, label as string));

  const grossTuitionCents = tuitionAcrossYears(course, assumptions);
  const scholarshipBps = Math.round((course.scholarshipPercent ?? 0) * 100);
  const scholarshipSavingsCents = applyBps(grossTuitionCents, scholarshipBps);
  const netTuitionCents = grossTuitionCents - scholarshipSavingsCents;

  const weeklyLivingCents =
    suburb.weeklyRentCents +
    suburb.weeklyGroceriesCents +
    suburb.weeklyUtilitiesCents +
    suburb.weeklyPersonalCents +
    assumptions.transportWeeklyCents;

  const livingCostCents = weeklyLivingCents * 52 * course.durationYears;
  const otherCostCents =
    assumptions.oshcCents +
    assumptions.visaAndSetupCents +
    assumptions.emergencyBufferCents +
    assumptions.studyMaterialsAnnualCents * course.durationYears;

  const totalEstimatedCostCents = netTuitionCents + livingCostCents + otherCostCents;
  const remainingFundsCents = totalFundsCents - totalEstimatedCostCents;
  const budgetConsumedPercent = totalFundsCents > 0
    ? Math.round((totalEstimatedCostCents / totalFundsCents) * 10_000) / 100
    : 0;

  return {
    grossTuitionCents,
    scholarshipSavingsCents,
    netTuitionCents,
    livingCostCents,
    otherCostCents,
    totalEstimatedCostCents,
    remainingFundsCents,
    budgetConsumedPercent,
    hasShortfall: remainingFundsCents < 0,
    assumptions,
  };
}

export function formatAud(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
