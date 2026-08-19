"use client";

import { useMemo, useState } from "react";
import { demoCampuses, demoCourses, demoUniversities } from "@/lib/local-v2/fixtures";
import { rankCourses } from "@/lib/local-v2/recommendation-engine";
import type { AustralianState, StudentDecisionProfile } from "@/lib/local-v2/types";

const states: AustralianState[] = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

const inputStyle = { width: "100%", border: "1px solid #cfd5df", borderRadius: 10, padding: "10px 12px", background: "#fff" } as const;
const panelStyle = { border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" } as const;

export default function StateCareerPage() {
  const [career, setCareer] = useState("Software Engineer");
  const [field, setField] = useState("Information Technology");
  const [budget, setBudget] = useState(40000);
  const [regionalAccepted, setRegionalAccepted] = useState(true);

  const profile = useMemo<StudentDecisionProfile>(() => ({
    mode: "quick",
    highestQualification: "Bachelor",
    qualificationField: field,
    desiredOccupation: career,
    annualTuitionBudgetCents: budget * 100,
    totalFundsCents: 12000000,
    preferredStates: [],
    regionalAccepted,
    migrationImportance: "none",
    skills: ["software", "web", "databases"],
    yearsExperience: 2,
    transportPreference: "either",
    dependants: 0,
  }), [career, field, budget, regionalAccepted]);

  const ranked = useMemo(() => rankCourses(profile), [profile]);

  const careerGroups = useMemo(() => {
    const map = new Map<string, { score: number; courseCount: number }>();
    for (const result of ranked) {
      for (const occupation of result.course.occupations) {
        const current = map.get(occupation) ?? { score: 0, courseCount: 0 };
        current.score += result.scores.career;
        current.courseCount += 1;
        map.set(occupation, current);
      }
    }
    return [...map.entries()]
      .map(([occupation, value]) => ({ occupation, averageCareerScore: Math.round(value.score / value.courseCount), courseCount: value.courseCount }))
      .sort((a, b) => b.averageCareerScore - a.averageCareerScore)
      .slice(0, 5);
  }, [ranked]);

  const stateResults = useMemo(() => {
    return states.map((state) => {
      const stateCourses = ranked.filter((item) => item.campus.state === state);
      if (stateCourses.length === 0) {
        return { state, score: 0, career: 0, affordability: 0, jobs: 0, options: 0, regionalOptions: 0 };
      }
      const avg = (key: "career" | "affordability" | "labourMarket") =>
        Math.round(stateCourses.reduce((sum, item) => sum + item.scores[key], 0) / stateCourses.length);
      const careerScore = avg("career");
      const affordability = avg("affordability");
      const jobs = avg("labourMarket");
      const options = stateCourses.length;
      const regionalOptions = stateCourses.filter((item) => item.campus.regional).length;
      const score = Math.round(careerScore * 0.4 + affordability * 0.3 + jobs * 0.3);
      return { state, score, career: careerScore, affordability, jobs, options, regionalOptions };
    }).sort((a, b) => b.score - a.score);
  }, [ranked]);

  const bestState = stateResults.find((item) => item.options > 0);
  const bestCareer = careerGroups[0];

  return (
    <main style={{ maxWidth: 1050, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>LOCAL DEMO DATA</span>
        <h1 style={{ marginBottom: 8 }}>State + Career Recommendation</h1>
        <p style={{ color: "#586174", maxWidth: 800 }}>Basic function for ranking careers and Australian states from the current demo course data. Scores are explainable and not migration advice.</p>
      </div>

      <section style={panelStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <label style={{ display: "grid", gap: 7, fontWeight: 650 }}>Career goal
            <select value={career} onChange={(e) => setCareer(e.target.value)} style={inputStyle}>
              <option>Software Engineer</option><option>Software Developer</option><option>Data Scientist</option><option>Cyber Security Analyst</option><option>ICT Business Analyst</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 7, fontWeight: 650 }}>Study field
            <select value={field} onChange={(e) => setField(e.target.value)} style={inputStyle}>
              <option>Information Technology</option><option>Engineering</option><option>Business</option><option>Health</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 7, fontWeight: 650 }}>Annual tuition budget (AUD)
            <input type="number" min={10000} step={1000} value={budget} onChange={(e) => setBudget(Number(e.target.value) || 0)} style={inputStyle} />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 30 }}>
            <input type="checkbox" checked={regionalAccepted} onChange={(e) => setRegionalAccepted(e.target.checked)} /> Open to regional locations
          </label>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 16 }}>
        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>Best career direction</h2>
          {bestCareer ? <>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{bestCareer.occupation}</div>
            <p><strong>Career fit:</strong> {bestCareer.averageCareerScore}%</p>
            <p><strong>Matching demo courses:</strong> {bestCareer.courseCount}</p>
          </> : <p>No career result available.</p>}
          <hr style={{ border: 0, borderTop: "1px solid #e5e7eb", margin: "16px 0" }} />
          {careerGroups.map((item, index) => (
            <div key={item.occupation} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: index < careerGroups.length - 1 ? "1px solid #eef0f3" : undefined }}>
              <span>#{index + 1} {item.occupation}</span><strong>{item.averageCareerScore}%</strong>
            </div>
          ))}
        </section>

        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>Best state</h2>
          {bestState ? <>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{bestState.state}</div>
            <p><strong>Overall state fit:</strong> {bestState.score}%</p>
            <p><strong>Career:</strong> {bestState.career}% · <strong>Budget:</strong> {bestState.affordability}% · <strong>Jobs:</strong> {bestState.jobs}%</p>
            <p><strong>Course options:</strong> {bestState.options} · <strong>Regional options:</strong> {bestState.regionalOptions}</p>
          </> : <p>No state result available.</p>}
        </section>
      </div>

      <section style={{ ...panelStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>State ranking</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>State</th><th style={th}>Overall</th><th style={th}>Career</th><th style={th}>Affordability</th><th style={th}>Jobs</th><th style={th}>Course options</th></tr></thead>
            <tbody>{stateResults.map((item) => <tr key={item.state}><td style={td}>{item.state}</td><td style={td}>{item.options ? `${item.score}%` : "—"}</td><td style={td}>{item.options ? `${item.career}%` : "—"}</td><td style={td}>{item.options ? `${item.affordability}%` : "—"}</td><td style={td}>{item.options ? `${item.jobs}%` : "—"}</td><td style={td}>{item.options}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section style={{ ...panelStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Demo data coverage</h2>
        <p>{demoUniversities.length} universities · {demoCampuses.length} campuses · {demoCourses.length} courses</p>
        <p style={{ marginBottom: 0, color: "#586174" }}>Later we will replace this simple aggregation with verified labour-market, state, salary, course availability, living-cost and migration datasets.</p>
      </section>
    </main>
  );
}

const th = { textAlign: "left", borderBottom: "1px solid #dfe3ea", padding: "10px 8px" } as const;
const td = { borderBottom: "1px solid #eef0f3", padding: "10px 8px" } as const;
