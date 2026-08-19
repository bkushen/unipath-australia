"use client";

import { useMemo, useState } from "react";
import { rankCourses } from "@/lib/local-v2/recommendation-engine";
import type { AustralianState, StudentDecisionProfile } from "@/lib/local-v2/types";

const states: AustralianState[] = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

const sectionStyle = {
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

const labelStyle = { display: "grid", gap: 7, fontWeight: 650 } as const;
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 } as const;

export default function DetailedAssessmentPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    highestQualification: "Bachelor",
    qualificationField: "Information Technology",
    institution: "",
    country: "Sri Lanka",
    graduationYear: "2025",
    marks: "",
    currentOccupation: "Software Developer",
    desiredOccupation: "Software Engineer",
    yearsExperience: 2,
    skills: "software, web, databases",
    certifications: "",
    qualificationLevel: "Master",
    preferredSpecialisation: "Software Engineering",
    preferredIntake: "February",
    annualTuitionBudget: 40000,
    totalFunds: 120000,
    preferredStates: ["VIC"] as AustralianState[],
    regionalAccepted: true,
    suburb: "Ballarat Central",
    transportPreference: "either" as StudentDecisionProfile["transportPreference"],
    maxCommuteMinutes: 45,
    dependants: 0,
    englishTest: "PTE",
    englishScore: "65",
    futurePlan: "Australian work experience",
  });

  const profile = useMemo<StudentDecisionProfile>(() => ({
    mode: "detailed",
    highestQualification: form.highestQualification,
    qualificationField: form.qualificationField,
    desiredOccupation: form.desiredOccupation,
    annualTuitionBudgetCents: Math.round(form.annualTuitionBudget * 100),
    totalFundsCents: Math.round(form.totalFunds * 100),
    preferredStates: form.preferredStates,
    regionalAccepted: form.regionalAccepted,
    migrationImportance: "none",
    skills: form.skills.split(",").map((item) => item.trim()).filter(Boolean),
    yearsExperience: form.yearsExperience,
    preferredSuburbId: "s-ballarat",
    transportPreference: form.transportPreference,
    dependants: form.dependants,
  }), [form]);

  const results = useMemo(() => rankCourses(profile).slice(0, 3), [profile]);

  const toggleState = (state: AustralianState) => {
    setForm((current) => ({
      ...current,
      preferredStates: current.preferredStates.includes(state)
        ? current.preferredStates.filter((item) => item !== state)
        : [...current.preferredStates, state],
    }));
  };

  return (
    <main style={{ maxWidth: 1050, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>
          LOCAL DEMO DATA
        </span>
        <h1 style={{ marginBottom: 8 }}>UniPath Detailed Assessment</h1>
        <p style={{ color: "#586174", maxWidth: 820 }}>
          This basic version collects the main detailed-profile fields and produces a ranked recommendation using the local explainable engine.
        </p>
      </div>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>1. Education</h2>
        <div style={gridStyle}>
          <label style={labelStyle}>Highest qualification
            <select value={form.highestQualification} onChange={(e) => setForm({ ...form, highestQualification: e.target.value })} style={inputStyle}>
              <option>High School</option><option>Diploma</option><option>Bachelor</option><option>Master</option>
            </select>
          </label>
          <label style={labelStyle}>Study field
            <select value={form.qualificationField} onChange={(e) => setForm({ ...form, qualificationField: e.target.value })} style={inputStyle}>
              <option>Information Technology</option><option>Engineering</option><option>Business</option><option>Health</option>
            </select>
          </label>
          <label style={labelStyle}>Institution
            <input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} style={inputStyle} placeholder="University / college" />
          </label>
          <label style={labelStyle}>Country
            <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Graduation year
            <input value={form.graduationYear} onChange={(e) => setForm({ ...form, graduationYear: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>GPA / marks
            <input value={form.marks} onChange={(e) => setForm({ ...form, marks: e.target.value })} style={inputStyle} placeholder="e.g. 3.2/4 or 70%" />
          </label>
        </div>
      </section>

      <section style={{ ...sectionStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>2. Career</h2>
        <div style={gridStyle}>
          <label style={labelStyle}>Current occupation
            <input value={form.currentOccupation} onChange={(e) => setForm({ ...form, currentOccupation: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Desired profession
            <select value={form.desiredOccupation} onChange={(e) => setForm({ ...form, desiredOccupation: e.target.value })} style={inputStyle}>
              <option>Software Engineer</option><option>Software Developer</option><option>Data Scientist</option><option>Cyber Security Analyst</option><option>ICT Business Analyst</option>
            </select>
          </label>
          <label style={labelStyle}>Years of experience
            <input type="number" min={0} step={0.5} value={form.yearsExperience} onChange={(e) => setForm({ ...form, yearsExperience: Number(e.target.value) })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Skills
            <input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} style={inputStyle} placeholder="software, cloud, networking" />
          </label>
          <label style={labelStyle}>Certifications
            <input value={form.certifications} onChange={(e) => setForm({ ...form, certifications: e.target.value })} style={inputStyle} placeholder="Optional" />
          </label>
        </div>
      </section>

      <section style={{ ...sectionStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>3. Study preferences</h2>
        <div style={gridStyle}>
          <label style={labelStyle}>Preferred study level
            <select value={form.qualificationLevel} onChange={(e) => setForm({ ...form, qualificationLevel: e.target.value })} style={inputStyle}>
              <option>Bachelor</option><option>Graduate Diploma</option><option>Master</option>
            </select>
          </label>
          <label style={labelStyle}>Preferred specialisation
            <input value={form.preferredSpecialisation} onChange={(e) => setForm({ ...form, preferredSpecialisation: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Preferred intake
            <select value={form.preferredIntake} onChange={(e) => setForm({ ...form, preferredIntake: e.target.value })} style={inputStyle}>
              <option>February</option><option>July</option><option>November</option><option>Any</option>
            </select>
          </label>
        </div>
      </section>

      <section style={{ ...sectionStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>4. Money</h2>
        <div style={gridStyle}>
          <label style={labelStyle}>Annual tuition budget (AUD)
            <input type="number" min={0} step={1000} value={form.annualTuitionBudget} onChange={(e) => setForm({ ...form, annualTuitionBudget: Number(e.target.value) })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Total available funds (AUD for this demo)
            <input type="number" min={0} step={1000} value={form.totalFunds} onChange={(e) => setForm({ ...form, totalFunds: Number(e.target.value) })} style={inputStyle} />
          </label>
        </div>
      </section>

      <section style={{ ...sectionStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>5. Location & transport</h2>
        <div style={{ marginBottom: 14 }}>
          <strong>Preferred state(s)</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {states.map((state) => (
              <label key={state} style={{ border: "1px solid #dfe3ea", borderRadius: 999, padding: "8px 11px", background: "#fff" }}>
                <input type="checkbox" checked={form.preferredStates.includes(state)} onChange={() => toggleState(state)} /> {state}
              </label>
            ))}
          </div>
        </div>
        <div style={gridStyle}>
          <label style={labelStyle}>Preferred suburb
            <input value={form.suburb} onChange={(e) => setForm({ ...form, suburb: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Transport preference
            <select value={form.transportPreference} onChange={(e) => setForm({ ...form, transportPreference: e.target.value as StudentDecisionProfile["transportPreference"] })} style={inputStyle}>
              <option value="either">Either</option><option value="car">Car</option><option value="public_transport">Public transport</option>
            </select>
          </label>
          <label style={labelStyle}>Maximum commute (minutes)
            <input type="number" min={0} value={form.maxCommuteMinutes} onChange={(e) => setForm({ ...form, maxCommuteMinutes: Number(e.target.value) })} style={inputStyle} />
          </label>
        </div>
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", marginTop: 14 }}>
          <input type="checkbox" checked={form.regionalAccepted} onChange={(e) => setForm({ ...form, regionalAccepted: e.target.checked })} /> Open to regional study locations
        </label>
      </section>

      <section style={{ ...sectionStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>6. Personal & English</h2>
        <div style={gridStyle}>
          <label style={labelStyle}>Dependants
            <input type="number" min={0} value={form.dependants} onChange={(e) => setForm({ ...form, dependants: Number(e.target.value) })} style={inputStyle} />
          </label>
          <label style={labelStyle}>English test
            <select value={form.englishTest} onChange={(e) => setForm({ ...form, englishTest: e.target.value })} style={inputStyle}>
              <option>IELTS</option><option>PTE</option><option>TOEFL</option><option>Not taken</option>
            </select>
          </label>
          <label style={labelStyle}>English score
            <input value={form.englishScore} onChange={(e) => setForm({ ...form, englishScore: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Future plan
            <select value={form.futurePlan} onChange={(e) => setForm({ ...form, futurePlan: e.target.value })} style={inputStyle}>
              <option>Return home</option><option>Australian work experience</option><option>Long-term career in Australia</option><option>Unsure</option>
            </select>
          </label>
        </div>
      </section>

      <div style={{ marginTop: 18 }}>
        <button type="button" onClick={() => setSubmitted(true)} style={{ border: 0, borderRadius: 10, padding: "12px 18px", background: "#111827", color: "#fff", fontWeight: 750, cursor: "pointer" }}>
          Get Detailed Result
        </button>
      </div>

      {submitted && (
        <section style={{ ...sectionStyle, marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>Detailed Result</h2>
          <p style={{ color: "#586174" }}>Top 3 local demo recommendations based on the detailed profile.</p>
          <div style={{ display: "grid", gap: 14 }}>
            {results.map((item, index) => (
              <article key={item.course.id} style={{ border: "1px solid #e2e6ed", borderRadius: 14, padding: 16, background: "#fbfcfe" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
                  <div>
                    <strong>#{index + 1}</strong>
                    <h3 style={{ margin: "6px 0 4px" }}>{item.course.name}</h3>
                    <div>{item.university.name}</div>
                    <div style={{ color: "#586174" }}>{item.campus.name} · {item.campus.state}</div>
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 800 }}>{item.scores.overall}%</div>
                </div>
                <p style={{ marginBottom: 5 }}><strong>Career:</strong> {item.scores.career}% · <strong>Budget:</strong> {item.scores.affordability}% · <strong>Jobs:</strong> {item.scores.labourMarket}%</p>
                {item.reasons[0] && <p style={{ margin: 0, color: "#374151" }}>{item.reasons[0]}</p>}
              </article>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa" }}>
            Next basic step after this page: CV/profile review. Migration-aware analysis remains a separate optional step after the main result.
          </div>
        </section>
      )}
    </main>
  );
}
