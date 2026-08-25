"use client";

import { assessCourseBudget } from "@/lib/local-v2/budget-assessment";

type Props = {
  semesterBudget: number;
  fullCourseBudget: number;
  annualFee: number | null | undefined;
  totalFee: number | null | undefined;
  durationMonths: number | null | undefined;
  currency?: string | null;
  feeSource?: string | null;
  derivedAnnual?: boolean | null;
};

const money = (value: number | null | undefined, currency = "AUD") => value == null
  ? "Not available"
  : new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

function statusStyle(status: "within_budget" | "over_budget" | "not_assessed") {
  if (status === "within_budget") return goodStyle;
  if (status === "over_budget") return overStyle;
  return neutralStyle;
}

export function BudgetAssessmentPanel({ semesterBudget, fullCourseBudget, annualFee, totalFee, durationMonths, currency = "AUD", feeSource, derivedAnnual }: Props) {
  const assessment = assessCourseBudget({
    semesterBudget,
    fullCourseBudget,
    annualFee,
    totalFee,
    durationMonths,
    currency,
    feeSource: feeSource ?? null,
    derivedAnnual: derivedAnnual ?? null,
  });

  const confidenceLabel = assessment.confidence === "higher"
    ? "Higher-confidence fee evidence"
    : assessment.confidence === "planning_estimate"
      ? "Planning estimate"
      : "Limited fee evidence";

  return <section style={panelStyle} aria-label="Budget comparison">
    <div style={topStyle}>
      <strong>Budget comparison</strong>
      <span style={badgeStyle}>{confidenceLabel}</span>
    </div>

    <div style={gridStyle}>
      <div style={boxStyle}>
        <div style={labelStyle}>One semester</div>
        <div style={rowStyle}><span>Your budget</span><strong>{money(semesterBudget, currency)}</strong></div>
        <div style={rowStyle}><span>Estimated tuition</span><strong>{money(assessment.semester.tuition, currency)}</strong></div>
        <div style={statusStyle(assessment.semester.status)}>
          {assessment.semester.status === "within_budget" ? "✓ " : assessment.semester.status === "over_budget" ? "↑ " : ""}
          {assessment.semester.difference == null ? assessment.semester.label : `${money(Math.abs(assessment.semester.difference), currency)} ${assessment.semester.status === "within_budget" ? "under budget" : "over budget"}`}
        </div>
        <div style={basisStyle}>{assessment.semester.basis}</div>
      </div>

      <div style={boxStyle}>
        <div style={labelStyle}>Full course</div>
        <div style={rowStyle}><span>Your budget</span><strong>{money(fullCourseBudget, currency)}</strong></div>
        <div style={rowStyle}><span>Tuition used</span><strong>{money(assessment.fullCourse.tuition, currency)}</strong></div>
        <div style={statusStyle(assessment.fullCourse.status)}>
          {assessment.fullCourse.status === "within_budget" ? "✓ " : assessment.fullCourse.status === "over_budget" ? "↑ " : ""}
          {assessment.fullCourse.difference == null ? assessment.fullCourse.label : `${money(Math.abs(assessment.fullCourse.difference), currency)} ${assessment.fullCourse.status === "within_budget" ? "under budget" : "over budget"}`}
        </div>
        <div style={basisStyle}>{assessment.fullCourse.basis}</div>
      </div>
    </div>

    <div style={noteStyle}>{assessment.note}</div>
  </section>;
}

const panelStyle = { marginTop: 14, padding: 14, borderRadius: 12, border: "1px solid #d7e3f4", background: "#f7faff" } as const;
const topStyle = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" } as const;
const badgeStyle = { fontSize: 12, fontWeight: 850, color: "#175cd3", background: "#eff8ff", border: "1px solid #b2ddff", borderRadius: 999, padding: "4px 8px" } as const;
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10, marginTop: 10 } as const;
const boxStyle = { background: "#fff", border: "1px solid #e1e6ed", borderRadius: 10, padding: 12 } as const;
const labelStyle = { fontSize: 12, color: "#667085", fontWeight: 800, textTransform: "uppercase", letterSpacing: .4, marginBottom: 8 } as const;
const rowStyle = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginTop: 5, fontSize: 13 } as const;
const goodStyle = { marginTop: 9, color: "#067647", background: "#ecfdf3", border: "1px solid #abefc6", borderRadius: 8, padding: "7px 9px", fontWeight: 850, fontSize: 13 } as const;
const overStyle = { marginTop: 9, color: "#b42318", background: "#fff6f5", border: "1px solid #fecdca", borderRadius: 8, padding: "7px 9px", fontWeight: 850, fontSize: 13 } as const;
const neutralStyle = { marginTop: 9, color: "#475467", background: "#f8fafc", border: "1px solid #d0d5dd", borderRadius: 8, padding: "7px 9px", fontWeight: 800, fontSize: 13 } as const;
const basisStyle = { marginTop: 7, color: "#667085", fontSize: 11, lineHeight: 1.4 } as const;
const noteStyle = { marginTop: 9, color: "#667085", fontSize: 12, lineHeight: 1.45 } as const;
