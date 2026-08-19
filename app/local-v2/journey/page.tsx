"use client";

import { useMemo, useState } from "react";
import { demoCampuses, demoCourses, demoRouteFixtures, demoSuburbs, demoUniversities } from "@/lib/local-v2/fixtures";
import { chooseRecommendedRoute } from "@/lib/local-v2/routing-provider";
import { calculateVisaFinance } from "@/lib/local-v2/visa-finance";

const money = (cents: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);

const panel = {
  border: "1px solid #dfe3ea",
  borderRadius: 16,
  padding: 18,
  background: "#fff",
} as const;

const input = {
  width: "100%",
  border: "1px solid #cfd5df",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
} as const;

export default function JourneyPage() {
  const [career, setCareer] = useState("Software Engineer");
  const [budget, setBudget] = useState(40000);
  const [regional, setRegional] = useState(true);
  const [courseId, setCourseId] = useState(demoCourses[0]?.id ?? "");
  const [suburbId, setSuburbId] = useState("s-ballarat");
  const [transport, setTransport] = useState<"car" | "public_transport" | "either">("either");
  const [funds, setFunds] = useState(90000);
  const [saved, setSaved] = useState(false);

  const ranked = useMemo(() => {
    return [...demoCourses]
      .map((course) => {
        const careerMatch = course.occupations.some((o) => o.toLowerCase().includes(career.toLowerCase().split(" ")[0])) ? 35 : 18;
        const affordability = course.annualTuitionCents / 100 <= budget ? 30 : Math.max(0, 30 - Math.round((course.annualTuitionCents / 100 - budget) / 1000) * 3);
        const campus = demoCampuses.find((c) => c.id === course.campusId);
        const regionalScore = regional && campus?.regional ? 15 : !regional ? 10 : 4;
        const labour = Math.round(course.labourMarketScore * 0.2);
        return { course, score: careerMatch + affordability + regionalScore + labour };
      })
      .sort((a, b) => b.score - a.score);
  }, [career, budget, regional]);

  const selectedCourse = demoCourses.find((c) => c.id === courseId) ?? ranked[0]?.course;
  const campus = demoCampuses.find((c) => c.id === selectedCourse?.campusId);
  const university = demoUniversities.find((u) => u.id === selectedCourse?.universityId);
  const routes = campus ? demoRouteFixtures[`${suburbId}:${campus.id}`] ?? [] : [];
  const route = chooseRecommendedRoute(routes, transport);

  const finance = selectedCourse
    ? calculateVisaFinance({
        annualTuitionCents: selectedCourse.annualTuitionCents,
        firstSemesterTuitionCents: Math.round(selectedCourse.annualTuitionCents / 2),
        oshcCents: 160000,
        visaFeeCents: 200000,
        planeTicketCents: 150000,
        governmentLivingCostCents: 3000000,
        travelAllowanceCents: 200000,
        availableFundsAudCents: Math.round(funds * 100),
      })
    : null;

  const savePlan = () => {
    if (!selectedCourse) return;
    const payload = {
      savedAt: new Date().toISOString(),
      career,
      budget,
      regional,
      courseId: selectedCourse.id,
      suburbId,
      transport,
      funds,
    };
    localStorage.setItem("unipath-v2-current-plan", JSON.stringify(payload));
    setSaved(true);
  };

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#dcfce7", fontWeight: 800 }}>CONNECTED LOCAL DEMO</span>
        <h1 style={{ marginBottom: 8 }}>UniPath End-to-End Student Journey</h1>
        <p style={{ color: "#586174", maxWidth: 820 }}>A single basic flow connecting recommendation, course selection, finance, commute and saving. All course, cost, labour-market, migration and route values are demo data.</p>
      </div>

      <section style={panel}>
        <h2 style={{ marginTop: 0 }}>1. Quick profile</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <label>Career goal<input value={career} onChange={(e) => setCareer(e.target.value)} style={input} /></label>
          <label>Annual tuition budget (AUD)<input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} style={input} /></label>
          <label>Regional preference<select value={regional ? "yes" : "no"} onChange={(e) => setRegional(e.target.value === "yes")} style={input}><option value="yes">Prefer regional</option><option value="no">No preference</option></select></label>
        </div>
      </section>

      <section style={{ ...panel, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>2. Recommended courses</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
          {ranked.slice(0, 3).map(({ course, score }) => {
            const uni = demoUniversities.find((u) => u.id === course.universityId);
            return <button key={course.id} onClick={() => setCourseId(course.id)} style={{ textAlign: "left", border: course.id === selectedCourse?.id ? "2px solid #2563eb" : "1px solid #dfe3ea", borderRadius: 14, padding: 15, background: "#fff", cursor: "pointer" }}>
              <strong>{course.name}</strong><div style={{ marginTop: 6 }}>{uni?.name}</div><div>{money(course.annualTuitionCents)} / year</div><div style={{ marginTop: 6, fontWeight: 700 }}>Match score: {score}</div>
            </button>;
          })}
        </div>
      </section>

      {selectedCourse && finance && <>
        <section style={{ ...panel, marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>3. Selected course + finance</h2>
          <p><strong>{selectedCourse.name}</strong> · {university?.name} · {campus?.name}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div><small>Annual tuition</small><div style={{ fontSize: 24, fontWeight: 800 }}>{money(selectedCourse.annualTuitionCents)}</div></div>
            <div><small>Actual payment before visa</small><div style={{ fontSize: 24, fontWeight: 800 }}>{money(finance.beforeVisaActualSpendCents)}</div></div>
            <div><small>Conservative show-money target</small><div style={{ fontSize: 24, fontWeight: 800 }}>{money(finance.conservativeShowMoneyTargetCents)}</div></div>
            <div><small>Actual cost to reach Australia</small><div style={{ fontSize: 24, fontWeight: 800 }}>{money(finance.actualCostToReachAustraliaCents)}</div></div>
          </div>
          <label style={{ display: "block", marginTop: 14 }}>Available funds (AUD)<input type="number" value={funds} onChange={(e) => setFunds(Number(e.target.value))} style={input} /></label>
          <p style={{ marginBottom: 0 }}><strong>Show-money position:</strong> {finance.conservativeSurplusOrShortfallCents >= 0 ? "Surplus " : "Shortfall "}{money(Math.abs(finance.conservativeSurplusOrShortfallCents))}</p>
        </section>

        <section style={{ ...panel, marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>4. Commute</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <label>Living suburb<select value={suburbId} onChange={(e) => setSuburbId(e.target.value)} style={input}>{demoSuburbs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label>Transport<select value={transport} onChange={(e) => setTransport(e.target.value as typeof transport)} style={input}><option value="either">Either</option><option value="car">Car</option><option value="public_transport">Public transport</option></select></label>
          </div>
          <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: route ? "#ecfdf5" : "#fff7ed" }}>
            {route ? <><strong>Recommended:</strong> {route.summary} · {route.durationMinutes} min · {route.distanceKm} km</> : <>No demo route exists yet for this suburb and selected campus.</>}
          </div>
        </section>

        <section style={{ ...panel, marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>5. Save plan</h2>
          <p>Save the current connected plan in this browser so we can later replace this with authenticated Supabase storage.</p>
          <button onClick={savePlan} style={{ border: 0, borderRadius: 10, padding: "11px 16px", background: "#111827", color: "white", fontWeight: 800, cursor: "pointer" }}>Save current plan</button>
          {saved && <span style={{ marginLeft: 12, fontWeight: 700, color: "#047857" }}>Saved.</span>}
        </section>
      </>}
    </main>
  );
}
