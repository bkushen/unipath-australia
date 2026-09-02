"use client";

import { useMemo, useState } from "react";
import { rankCourses } from "@/lib/local-v2/recommendation-engine";
import type { AustralianState, StudentDecisionProfile } from "@/lib/local-v2/types";

const panelStyle = {
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

const labelStyle = {
  display: "grid",
  gap: 7,
  fontWeight: 650,
} as const;

const states: AustralianState[] = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

const demoProfiles = {
  software: {
    name: "Sample Software Candidate",
    highestQualification: "Bachelor",
    qualificationField: "Information Technology",
    currentOccupation: "Web Developer",
    desiredOccupation: "Software Engineer",
    yearsExperience: 2,
    skills: ["web", "software", "databases", "programming"],
    annualTuitionBudgetAud: 40000,
    totalFundsAud: 120000,
    preferredStates: ["VIC"] as AustralianState[],
    regionalAccepted: true,
  },
  data: {
    name: "Sample Data Candidate",
    highestQualification: "Bachelor",
    qualificationField: "Information Technology",
    currentOccupation: "Junior Data Analyst",
    desiredOccupation: "Data Scientist",
    yearsExperience: 1,
    skills: ["python", "data", "statistics", "sql"],
    annualTuitionBudgetAud: 43000,
    totalFundsAud: 130000,
    preferredStates: ["VIC", "NSW"] as AustralianState[],
    regionalAccepted: false,
  },
  cyber: {
    name: "Sample Cyber Candidate",
    highestQualification: "Diploma",
    qualificationField: "Information Technology",
    currentOccupation: "IT Support Officer",
    desiredOccupation: "Cyber Security Analyst",
    yearsExperience: 3,
    skills: ["networking", "security", "windows", "cloud"],
    annualTuitionBudgetAud: 39000,
    totalFundsAud: 110000,
    preferredStates: ["QLD", "SA"] as AustralianState[],
    regionalAccepted: true,
  },
};

type DemoKey = keyof typeof demoProfiles;

type EditableProfile = {
  name: string;
  highestQualification: string;
  qualificationField: string;
  currentOccupation: string;
  desiredOccupation: string;
  yearsExperience: number;
  skills: string[];
  annualTuitionBudgetAud: number;
  totalFundsAud: number;
  preferredStates: AustralianState[];
  regionalAccepted: boolean;
};

export default function CvReviewPage() {
  const [selectedDemo, setSelectedDemo] = useState<DemoKey>("software");
  const [profile, setProfile] = useState<EditableProfile>(demoProfiles.software);
  const [reviewed, setReviewed] = useState(false);

  const recommendationProfile = useMemo<StudentDecisionProfile>(() => ({
    mode: "detailed",
    highestQualification: profile.highestQualification,
    qualificationField: profile.qualificationField,
    desiredOccupation: profile.desiredOccupation,
    annualTuitionBudgetCents: Math.round(profile.annualTuitionBudgetAud * 100),
    totalFundsCents: Math.round(profile.totalFundsAud * 100),
    preferredStates: profile.preferredStates,
    regionalAccepted: profile.regionalAccepted,
    migrationImportance: "none",
    skills: profile.skills,
    yearsExperience: profile.yearsExperience,
    transportPreference: "either",
    dependants: 0,
  }), [profile]);

  const recommendations = useMemo(
    () => reviewed ? rankCourses(recommendationProfile).slice(0, 3) : [],
    [reviewed, recommendationProfile],
  );

  const loadDemo = (key: DemoKey) => {
    setSelectedDemo(key);
    setProfile({ ...demoProfiles[key], preferredStates: [...demoProfiles[key].preferredStates], skills: [...demoProfiles[key].skills] });
    setReviewed(false);
  };

  const toggleState = (state: AustralianState) => {
    setProfile((current) => ({
      ...current,
      preferredStates: current.preferredStates.includes(state)
        ? current.preferredStates.filter((item) => item !== state)
        : [...current.preferredStates, state],
    }));
  };

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>
          LOCAL SAMPLE CV FLOW
        </span>
        <h1 style={{ marginBottom: 8 }}>UniPath CV / Profile Review</h1>
        <p style={{ color: "#586174", maxWidth: 780 }}>
          This basic version simulates CV extraction using sample profiles. The student reviews and edits the extracted information before UniPath uses it for recommendations.
        </p>
      </div>

      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>1. Choose a sample CV profile</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <label style={labelStyle}>
            Sample profile
            <select value={selectedDemo} onChange={(e) => loadDemo(e.target.value as DemoKey)} style={inputStyle}>
              <option value="software">Software / Web Candidate</option>
              <option value="data">Data Candidate</option>
              <option value="cyber">IT Support / Cyber Candidate</option>
            </select>
          </label>
          <div style={{ padding: 14, borderRadius: 12, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
            <strong>Real upload comes later</strong>
            <p style={{ marginBottom: 0, color: "#586174" }}>PDF/DOCX upload and parsing will replace these sample profiles after the basic flow is proven.</p>
          </div>
        </div>
      </section>

      <section style={{ ...panelStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>2. Review extracted profile</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          <label style={labelStyle}>Name
            <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Highest qualification
            <input value={profile.highestQualification} onChange={(e) => setProfile({ ...profile, highestQualification: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Qualification field
            <input value={profile.qualificationField} onChange={(e) => setProfile({ ...profile, qualificationField: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Current occupation
            <input value={profile.currentOccupation} onChange={(e) => setProfile({ ...profile, currentOccupation: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Desired occupation
            <input value={profile.desiredOccupation} onChange={(e) => setProfile({ ...profile, desiredOccupation: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Years experience
            <input type="number" min={0} step={0.5} value={profile.yearsExperience} onChange={(e) => setProfile({ ...profile, yearsExperience: Number(e.target.value) })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Skills (comma separated)
            <input value={profile.skills.join(", ")} onChange={(e) => setProfile({ ...profile, skills: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Annual tuition budget (AUD)
            <input type="number" min={0} step={1000} value={profile.annualTuitionBudgetAud} onChange={(e) => setProfile({ ...profile, annualTuitionBudgetAud: Number(e.target.value) })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Total funds (AUD)
            <input type="number" min={0} step={1000} value={profile.totalFundsAud} onChange={(e) => setProfile({ ...profile, totalFundsAud: Number(e.target.value) })} style={inputStyle} />
          </label>
        </div>

        <fieldset style={{ marginTop: 18, border: "1px solid #e2e6ed", borderRadius: 12, padding: 14 }}>
          <legend style={{ fontWeight: 700 }}>Preferred state(s)</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
            {states.map((state) => (
              <label key={state} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={profile.preferredStates.includes(state)} onChange={() => toggleState(state)} /> {state}
              </label>
            ))}
          </div>
        </fieldset>

        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
          <input type="checkbox" checked={profile.regionalAccepted} onChange={(e) => setProfile({ ...profile, regionalAccepted: e.target.checked })} />
          Open to regional study locations
        </label>

        <button type="button" onClick={() => setReviewed(true)} style={{ marginTop: 18, border: 0, borderRadius: 10, padding: "11px 16px", background: "#111827", color: "#fff", fontWeight: 750, cursor: "pointer" }}>
          Confirm Profile & Get Recommendations
        </button>
      </section>

      {reviewed && (
        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>3. Recommendations from reviewed profile</h2>
          <p style={{ color: "#586174" }}>The recommendation engine only uses the reviewed profile, not the original sample values.</p>
          <div style={{ display: "grid", gap: 14 }}>
            {recommendations.map((item, index) => (
              <article key={item.course.id} style={{ border: "1px solid #e2e6ed", borderRadius: 14, padding: 16, background: "#fbfcfe" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 750, color: "#586174" }}>#{index + 1}</div>
                    <h3 style={{ margin: "6px 0" }}>{item.course.name}</h3>
                    <p style={{ margin: 0 }}>{item.university.name}</p>
                    <p style={{ margin: "4px 0 0", color: "#586174" }}>{item.campus.name} · {item.campus.state}</p>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>{item.scores.overall}%</div>
                </div>
                <p style={{ marginBottom: 4 }}><strong>Career:</strong> {item.scores.career}% · <strong>Budget:</strong> {item.scores.affordability}% · <strong>Location:</strong> {item.scores.location}%</p>
                {item.reasons[0] && <p style={{ marginBottom: 0, color: "#374151" }}>{item.reasons[0]}</p>}
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
