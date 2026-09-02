export interface VisaFinanceInputs {
  annualTuitionCents: number;
  firstSemesterTuitionCents: number;
  oshcCents: number;
  visaFeeCents: number;
  planeTicketCents: number;
  otherActualPreTravelCents?: number;
  governmentLivingCostCents: number;
  travelAllowanceCents: number;
  partnerLivingCostCents?: number;
  childLivingCostCents?: number;
  schoolCostCents?: number;
  availableFundsAudCents: number;
}

export interface VisaFinanceResult {
  beforeVisaActualSpendCents: number;
  conservativeShowMoneyTargetCents: number;
  reducedShowMoneyTargetCents: number;
  amountReducedByPaidTuitionCents: number;
  conservativeSurplusOrShortfallCents: number;
  reducedSurplusOrShortfallCents: number;
  actualCostToReachAustraliaCents: number;
}

function assertIntegerCents(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer number of cents.`);
  }
}

export function calculateVisaFinance(inputs: VisaFinanceInputs): VisaFinanceResult {
  const values: Array<[number, string]> = [
    [inputs.annualTuitionCents, "annual tuition"],
    [inputs.firstSemesterTuitionCents, "first-semester tuition"],
    [inputs.oshcCents, "OSHC"],
    [inputs.visaFeeCents, "visa fee"],
    [inputs.planeTicketCents, "plane ticket"],
    [inputs.otherActualPreTravelCents ?? 0, "other actual pre-travel cost"],
    [inputs.governmentLivingCostCents, "government living-cost amount"],
    [inputs.travelAllowanceCents, "travel allowance"],
    [inputs.partnerLivingCostCents ?? 0, "partner living-cost amount"],
    [inputs.childLivingCostCents ?? 0, "child living-cost amount"],
    [inputs.schoolCostCents ?? 0, "school-cost amount"],
    [inputs.availableFundsAudCents, "available funds"],
  ];

  values.forEach(([value, label]) => assertIntegerCents(value, label));

  const familyComponentsCents =
    (inputs.partnerLivingCostCents ?? 0) +
    (inputs.childLivingCostCents ?? 0) +
    (inputs.schoolCostCents ?? 0);

  // UniPath's default planning figure deliberately keeps the full 12-month tuition amount.
  // It does not subtract first-semester tuition already paid.
  const conservativeShowMoneyTargetCents =
    inputs.annualTuitionCents +
    inputs.governmentLivingCostCents +
    inputs.travelAllowanceCents +
    familyComponentsCents;

  // Optional comparison only. This lets the user see how much the target would reduce
  // if they choose to account for tuition already paid, without changing the default view.
  const amountReducedByPaidTuitionCents = Math.min(
    inputs.firstSemesterTuitionCents,
    inputs.annualTuitionCents,
  );

  const reducedShowMoneyTargetCents =
    conservativeShowMoneyTargetCents - amountReducedByPaidTuitionCents;

  const beforeVisaActualSpendCents =
    inputs.firstSemesterTuitionCents +
    inputs.oshcCents +
    (inputs.otherActualPreTravelCents ?? 0);

  const actualCostToReachAustraliaCents =
    beforeVisaActualSpendCents +
    inputs.visaFeeCents +
    inputs.planeTicketCents;

  return {
    beforeVisaActualSpendCents,
    conservativeShowMoneyTargetCents,
    reducedShowMoneyTargetCents,
    amountReducedByPaidTuitionCents,
    conservativeSurplusOrShortfallCents:
      inputs.availableFundsAudCents - conservativeShowMoneyTargetCents,
    reducedSurplusOrShortfallCents:
      inputs.availableFundsAudCents - reducedShowMoneyTargetCents,
    actualCostToReachAustraliaCents,
  };
}
