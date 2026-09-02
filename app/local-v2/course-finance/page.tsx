"use client";

import { useMemo, useState } from "react";
import { demoCampuses, demoCourses, demoUniversities } from "@/lib/local-v2/fixtures";
import { calculateVisaFinance } from "@/lib/local-v2/visa-finance";

const money = (cents: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const panel = {
  border: "1px solid #dfe3ea",
  borderRadius: 16,
  background: "#fff",
  padding: 18,
} as const;

const input = {
  width: "100%",
  border: "1px solid #cfd5df",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
} as const;

export default function CourseFinancePage() {
  const [courseId, setCourseId] = useState(demoCourses[0]?.id ?? "");
  const [availableFundsAud, setAvailableFundsAud] = useState(70000);
  const [showReduced, setShowReduced] = useState(false);

  const course = demoCourses.find((item) => item.id === courseId) ?? demoCourses[0];
  if (!course) return <main style={{ padding: 32 }}>No demo courses available.</main>;

  const university = demoUniversities.find((item) => item.id === course.universityId);
  const campus = demoCampuses.find((item) => item.id === course.campusId);

  const firstSemesterTuitionCents = Math.round(course.annualTuitionCents / 2);

  const finance = useMemo(
    () =>
      calculateVisaFinance({
        annualTuitionCents: course.annualTuitionCents,
        firstSemesterTuitionCents,
        oshcCents: 180000,
        visaFeeCents: 200000,
        planeTicketCents: 150000,
        governmentLivingCostCents: 3000000,
        travelAllowanceCents: 200000,
        availableFundsAudCents: Math.round(availableFundsAud * 100),
      }),
    [course.annualTuitionCents, firstSemesterTuitionCents, availableFundsAud],
  );

  const currentTarget = showReduced
    ? finance.reducedShowMoneyTargetCents
    : finance.conservativeShowMoneyTargetCents;

  const difference = Math.round(availableFundsAud * 100) - currentTarget;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>
          LOCAL DEMO DATA
        </span>
        <h1 style={{ marginBottom: 8 }}>Course → Finance Connection</h1>
        <p style={{ color: "#586174", maxWidth: 760 }}>
          Choose a course and UniPath automatically loads its tuition into the three-part finance calculation. All figures on this page are demo values only.
        </p>
      </div>

      <section style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          <label style={{ display: "grid", gap: 7, fontWeight: 650 }}>
            Select course
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={input}>
              {demoCourses.map((item) => {
                const uni = demoUniversities.find((u) => u.id === item.universityId);
                return (
                  <option key={item.id} value={item.id}>
                    {item.name} — {uni?.name ?? "University"}
                  </option>
                );
              })}
            </select>
          </label>

          <label style={{ display: "grid", gap: 7, fontWeight: 650 }}>
            Available funds (AUD)
            <input
              type="number"
              min={0}
              step={1000}
              value={availableFundsAud}
              onChange={(e) => setAvailableFundsAud(Number(e.target.value) || 0)}
              style={input}
            />
          </label>
        </div>
      </section>

      <section style={{ ...panel, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Selected course</h2>
        <p><strong>{course.name}</strong></p>
        <p>{university?.name ?? "Unknown university"}</p>
        <p>{campus?.name ?? "Unknown campus"} · {campus?.state ?? ""}</p>
        <p><strong>Annual tuition:</strong> {money(course.annualTuitionCents)}</p>
        <p><strong>Demo first-semester tuition:</strong> {money(firstSemesterTuitionCents)}</p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 16 }}>
        <section style={panel}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#586174" }}>1 · ACTUAL PAYMENT BEFORE VISA</div>
          <h2>{money(finance.beforeVisaActualSpendCents)}</h2>
          <p>First semester: {money(firstSemesterTuitionCents)}</p>
          <p>OSHC demo: {money(180000)}</p>
        </section>

        <section style={panel}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#586174" }}>2 · VISA FINANCIAL CAPACITY</div>
          <h2>{money(currentTarget)}</h2>
          <p>12-month tuition: {money(course.annualTuitionCents)}</p>
          <p>Living-cost demo amount: {money(3000000)}</p>
          <p>Travel allowance demo: {money(200000)}</p>
          <p><strong>Available:</strong> {money(Math.round(availableFundsAud * 100))}</p>
          <p style={{ fontWeight: 750, color: difference >= 0 ? "#047857" : "#b91c1c" }}>
            {difference >= 0 ? "Surplus" : "Shortfall"}: {money(Math.abs(difference))}
          </p>
          <button
            type="button"
            onClick={() => setShowReduced((current) => !current)}
            style={{ border: "1px solid #cfd5df", borderRadius: 10, padding: "9px 12px", background: "#fff", cursor: "pointer" }}
          >
            {showReduced ? "Show conservative target" : "See target after deducting paid tuition"}
          </button>
          {showReduced && (
            <p style={{ marginTop: 10, color: "#586174" }}>
              Reduction shown: {money(finance.amountReducedByPaidTuitionCents)}. The conservative target remains the default planning view.
            </p>
          )}
        </section>

        <section style={panel}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#586174" }}>3 · ACTUAL COST TO REACH AUSTRALIA</div>
          <h2>{money(finance.actualCostToReachAustraliaCents)}</h2>
          <p>First semester: {money(firstSemesterTuitionCents)}</p>
          <p>OSHC demo: {money(180000)}</p>
          <p>Visa fee demo: {money(200000)}</p>
          <p>Plane ticket demo: {money(150000)}</p>
        </section>
      </div>

      <section style={{ ...panel, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>What this basic version proves</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>Changing the course changes the tuition automatically.</li>
          <li>First-semester tuition is recalculated automatically.</li>
          <li>All three finance stages update from the selected course.</li>
          <li>Available funds immediately show surplus or shortfall.</li>
          <li>The optional paid-tuition deduction can be viewed without replacing the default conservative target.</li>
        </ul>
      </section>
    </main>
  );
}
