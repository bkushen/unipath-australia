"use client";

import { useMemo, useState } from "react";
import { demoCampuses, demoCourses, demoSuburbs, demoUniversities } from "@/lib/local-v2/fixtures";
import { calculateCourseCost, formatAud } from "@/lib/local-v2/cost-engine";
import { calculateVisaFinance } from "@/lib/local-v2/visa-finance";

const cardStyle = {
  border: "1px solid #dfe3ea",
  borderRadius: 16,
  padding: 18,
  background: "#fff",
} as const;

const inputStyle = {
  width: "100%",
  border: "1px solid #cfd5df",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
} as const;

const selectableCourses = demoCourses.slice(0, 6);

export default function ComparePage() {
  const [courseIds, setCourseIds] = useState<string[]>([
    selectableCourses[0]?.id ?? "",
    selectableCourses[1]?.id ?? "",
    selectableCourses[4]?.id ?? selectableCourses[2]?.id ?? "",
  ]);
  const [availableFunds, setAvailableFunds] = useState(7000000);

  const selected = useMemo(
    () => courseIds.map((id) => demoCourses.find((course) => course.id === id)).filter(Boolean),
    [courseIds],
  );

  const rows = selected.map((course) => {
    if (!course) return null;
    const university = demoUniversities.find((item) => item.id === course.universityId);
    const campus = demoCampuses.find((item) => item.id === course.campusId);
    const suburb = campus ? demoSuburbs.find((item) => item.id === campus.suburbId) : undefined;

    const totalCost = suburb ? calculateCourseCost(course, suburb, availableFunds * 100) : null;
    const firstSemesterTuitionCents = Math.round(course.annualTuitionCents / 2);
    const visaFinance = calculateVisaFinance({
      annualTuitionCents: course.annualTuitionCents,
      firstSemesterTuitionCents,
      oshcCents: 180000,
      visaFeeCents: 200000,
      planeTicketCents: 150000,
      governmentLivingCostCents: 2971000,
      travelAllowanceCents: 200000,
      availableFundsAudCents: availableFunds * 100,
    });

    return { course, university, campus, suburb, totalCost, visaFinance };
  }).filter(Boolean);

  const updateCourse = (index: number, value: string) => {
    setCourseIds((current) => current.map((id, i) => (i === index ? value : id)));
  };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>
          LOCAL DEMO COMPARISON
        </span>
        <h1 style={{ marginBottom: 8 }}>Compare 3 UniPath Course Options</h1>
        <p style={{ color: "#586174", maxWidth: 780 }}>
          Choose three courses and compare tuition, state, campus, scholarship, show-money target, actual cost to reach Australia and full estimated study cost.
        </p>
      </div>

      <section style={cardStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {[0, 1, 2].map((index) => (
            <label key={index} style={{ display: "grid", gap: 7, fontWeight: 650 }}>
              Course {index + 1}
              <select value={courseIds[index]} onChange={(e) => updateCourse(index, e.target.value)} style={inputStyle}>
                {selectableCourses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </label>
          ))}

          <label style={{ display: "grid", gap: 7, fontWeight: 650 }}>
            Available funds (AUD)
            <input
              type="number"
              min={0}
              step={1000}
              value={availableFunds}
              onChange={(e) => setAvailableFunds(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>
        </div>
      </section>

      <section style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980, background: "#fff" }}>
          <thead>
            <tr>
              <th style={thStyle}>Factor</th>
              {rows.map((row) => <th key={row!.course.id} style={thStyle}>{row!.course.name}</th>)}
            </tr>
          </thead>
          <tbody>
            <CompareRow label="University" values={rows.map((r) => r!.university?.name ?? "—")} />
            <CompareRow label="Campus / state" values={rows.map((r) => `${r!.campus?.name ?? "—"} · ${r!.campus?.state ?? "—"}`)} />
            <CompareRow label="Annual tuition" values={rows.map((r) => formatAud(r!.course.annualTuitionCents))} />
            <CompareRow label="First semester tuition" values={rows.map((r) => formatAud(Math.round(r!.course.annualTuitionCents / 2)))} />
            <CompareRow label="Scholarship" values={rows.map((r) => `${r!.course.scholarshipPercent ?? 0}%`)} />
            <CompareRow label="Demo labour-market score" values={rows.map((r) => `${r!.course.labourMarketScore}%`)} />
            <CompareRow label="Demo migration alignment" values={rows.map((r) => `${r!.course.migrationAlignmentScore}%`)} />
            <CompareRow label="Conservative show-money target" values={rows.map((r) => formatAud(r!.visaFinance.conservativeShowMoneyTargetCents))} />
            <CompareRow label="Actual cost to reach Australia" values={rows.map((r) => formatAud(r!.visaFinance.actualCostToReachAustraliaCents))} />
            <CompareRow label="Full estimated study cost" values={rows.map((r) => r!.totalCost ? formatAud(r!.totalCost.totalEstimatedCostCents) : "—")} />
            <CompareRow label="Funds remaining after full estimate" values={rows.map((r) => r!.totalCost ? formatAud(r!.totalCost.remainingFundsCents) : "—")} />
          </tbody>
        </table>
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>What this basic version proves</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>Three course selections can be compared side by side.</li>
          <li>Course tuition automatically drives the finance calculation.</li>
          <li>University, campus and state information changes with the selected course.</li>
          <li>Show-money planning and actual travel-stage cost are displayed separately.</li>
          <li>Full estimated study cost and funds remaining are shown for each option.</li>
        </ul>
        <p style={{ marginBottom: 0, marginTop: 12, color: "#92400e" }}>
          All fees, labour-market and migration figures on this page are DEMO data only.
        </p>
      </section>
    </main>
  );
}

function CompareRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <td style={labelCellStyle}>{label}</td>
      {values.map((value, index) => <td key={`${label}-${index}`} style={tdStyle}>{value}</td>)}
    </tr>
  );
}

const thStyle = { border: "1px solid #dfe3ea", padding: 12, textAlign: "left", background: "#f8fafc", verticalAlign: "top" } as const;
const tdStyle = { border: "1px solid #e5e7eb", padding: 12, verticalAlign: "top" } as const;
const labelCellStyle = { ...tdStyle, fontWeight: 750, background: "#fbfcfe", minWidth: 210 } as const;
