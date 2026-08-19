"use client";

import { useMemo, useState } from "react";
import { rankCourses } from "@/lib/local-v2/recommendation-engine";
import type { AustralianState, MigrationImportance, StudentDecisionProfile } from "@/lib/local-v2/types";

const states: AustralianState[] = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

const money = (cents: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);

const initialProfile: StudentDecisionProfile = {
  mode: "quick",
  highestQualification: "Bachelor",
  qualificationField: "Information Technology",
  desiredOccupation: "Software Engineer",
  annualTuitionBudgetCents: 4000000,
  totalFundsCents: 12000000,
  preferredStates: ["VIC"],
  regionalAccepted: true,
  migrationImportance: "none",
  skills: [],
  yearsExperience: 0,
  preferredSuburbId: "s-ballarat",
  transportPreference: "either",
  dependants: 0,
};

type Stage = "quick-input" | "quick-result" | "detailed-input" | "detailed-result" | "migration-result";

type ResultSource = "quick" | "detailed";

export default function QuickMatchPage() {
  const [profile, setProfile] = useState<StudentDecisionProfile>(initialProfile);
  const [stage, setStage] = useState<Stage>("quick-input");
  const [resultSource, setResultSource] = useState<ResultSource>("quick");
  const [migrationChoice, setMigrationChoice] = useState<MigrationImportance>("consider");

  const standardResults = useMemo(
    () => rankCourses({ ...profile, migrationImportance: "none" }),
    [profile],
  );

  const migrationResults = useMemo(
    () => rankCourses({ ...profile, migrationImportance: migrationChoice }),
    [profile, migrationChoice],
  );

  const topStandard = standardResults.slice(0, 3);
  const topMigration = migrationResults.slice(0, 3);

  const updateState = (state: AustralianState) => {
    setProfile((current) => ({
      ...current,
      preferredStates: current.preferredStates.includes(state)
        ? current.preferredStates.filter((item) => item !== state)
        : [...current.preferredStates, state],
    }));
  };

  const showQuickResult = () => {
    setProfile((current) => ({ ...current, mode: "quick", migrationImportance: "none" }));
    setResultSource("quick");
    setStage("quick-result");
  };

  const showDetailedResult = () => {
    setProfile((current) => ({ ...current, mode: "detailed", migrationImportance: "none" }));
    setResultSource("detailed");
    setStage("detailed-result");
  };

  const runMigrationAware = () => setStage("migration-result");

  const ResultCards = ({ migration = false }: { migration?: boolean }) => {
    const results = migration ? topMigration : topStandard;
    return (
      <div style={{ display: "grid", gap: 14 }}>
        {results.map((item, index) => (
          <article key={item.course.id} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <div style={rankStyle}>#{index + 1} {index === 0 ? "Best match" : "Alternative"}</div>
                <h3 style={{ margin: "8px 0 4px" }}>{item.course.name}</h3>
                <p style={{ margin: 0 }}>{item.university.name}</p>
                <p style={{ margin: "3px 0 0", color: "#586174" }}>{item.campus.name} · {item.campus.state}</p>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{item.scores.overall}%</div>
            </div>
            <div style={scoreGridStyle}>
              <span>Academic <strong>{item.scores.academic}%</strong></span>
              <span>Career <strong>{item.scores.career}%</strong></span>
              <span>Budget <strong>{item.scores.affordability}%</strong></span>
              <span>Location <strong>{item.scores.location}%</strong></span>
              <span>Jobs <strong>{item.scores.labourMarket}%</strong></span>
              <span>Migration <strong>{item.scores.migration}%</strong></span>
            </div>
            <p style={{ marginBottom: 5 }}><strong>Demo tuition:</strong> {money(item.course.annualTuitionCents)}/year</p>
            {item.reasons.length > 0 && <p style={{ margin: 0, color: "#374151" }}>{item.reasons[0]}</p>}
          </article>
        ))}
      </div>
    );
  };

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 18px 70px" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={demoBadgeStyle}>LOCAL DEMO DATA</span>
        <h1 style={{ marginBottom: 8 }}>UniPath Quick → Detailed → PR Pathway Flow</h1>
        <p style={{ color: "#586174", maxWidth: 800 }}>
          This is the first interactive V2 flow. Quick Match gives a fast result, then asks whether the user wants a detailed assessment. After every result, UniPath separately asks whether PR/migration pathways should be considered.
        </p>
      </div>

      {stage === "quick-input" && (
        <section style={sectionStyle}>
          <div style={stepStyle}>STEP 1 · QUICK MATCH</div>
          <h2>Tell us the essentials</h2>
          <div style={formGridStyle}>
            <label style={labelStyle}>Highest qualification
              <select value={profile.highestQualification} onChange={(e) => setProfile({ ...profile, highestQualification: e.target.value })} style={inputStyle}>
                <option>Bachelor</option><option>Diploma</option><option>Master</option><option>High School</option>
              </select>
            </label>
            <label style={labelStyle}>Study field
              <select value={profile.qualificationField} onChange={(e) => setProfile({ ...profile, qualificationField: e.target.value })} style={inputStyle}>
                <option>Information Technology</option><option>Engineering</option><option>Business</option><option>Health</option>
              </select>
            </label>
            <label style={labelStyle}>Career goal
              <select value={profile.desiredOccupation} onChange={(e) => setProfile({ ...profile, desiredOccupation: e.target.value })} style={inputStyle}>
                <option>Software Engineer</option><option>Software Developer</option><option>Data Scientist</option><option>Cyber Security Analyst</option><option>ICT Business Analyst</option>
              </select>
            </label>
            <label style={labelStyle}>Annual tuition budget (AUD)
              <input type="number" min={10000} step={1000} value={profile.annualTuitionBudgetCents / 100} onChange={(e) => setProfile({ ...profile, annualTuitionBudgetCents: Number(e.target.value) * 100 })} style={inputStyle} />
            </label>
          </div>

          <fieldset style={fieldsetStyle}>
            <legend style={{ fontWeight: 700 }}>Preferred state(s)</legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {states.map((state) => (
                <label key={state} style={checkStyle}>
                  <input type="checkbox" checked={profile.preferredStates.includes(state)} onChange={() => updateState(state)} /> {state}
                </label>
              ))}
            </div>
          </fieldset>

          <label style={{ ...checkStyle, marginTop: 16 }}>
            <input type="checkbox" checked={profile.regionalAccepted} onChange={(e) => setProfile({ ...profile, regionalAccepted: e.target.checked })} /> I am open to regional study locations
          </label>

          <div style={{ marginTop: 22 }}>
            <button type="button" onClick={showQuickResult} style={primaryButtonStyle}>Get Quick Result</button>
          </div>
        </section>
      )}

      {stage === "quick-result" && (
        <>
          <section style={sectionStyle}>
            <div style={stepStyle}>STEP 2 · QUICK RESULT</div>
            <h2>Your quick matches</h2>
            <ResultCards />
          </section>

          <section style={{ ...sectionStyle, marginTop: 16 }}>
            <h2>Do you want a more detailed result?</h2>
            <p>We will keep your Quick Match answers and ask about experience, skills, total funds, dependants and transport preferences.</p>
            <div style={buttonRowStyle}>
              <button type="button" onClick={() => setStage("detailed-input")} style={primaryButtonStyle}>Yes, improve my result</button>
              <button type="button" onClick={() => setResultSource("quick")} style={secondaryButtonStyle}>No, keep Quick Result</button>
            </div>
          </section>

          <MigrationPrompt onContinue={runMigrationAware} migrationChoice={migrationChoice} setMigrationChoice={setMigrationChoice} source="Quick Result" />
        </>
      )}

      {stage === "detailed-input" && (
        <section style={sectionStyle}>
          <div style={stepStyle}>STEP 3 · DETAILED ASSESSMENT</div>
          <h2>Improve your recommendation</h2>
          <p>Your Quick Match answers are retained. Add more information below.</p>
          <div style={formGridStyle}>
            <label style={labelStyle}>Total funds available (AUD)
              <input type="number" min={10000} step={1000} value={profile.totalFundsCents / 100} onChange={(e) => setProfile({ ...profile, totalFundsCents: Number(e.target.value) * 100 })} style={inputStyle} />
            </label>
            <label style={labelStyle}>Years of relevant experience
              <input type="number" min={0} max={40} step={0.5} value={profile.yearsExperience ?? 0} onChange={(e) => setProfile({ ...profile, yearsExperience: Number(e.target.value) })} style={inputStyle} />
            </label>
            <label style={labelStyle}>Skills (comma separated)
              <input value={(profile.skills ?? []).join(", ")} onChange={(e) => setProfile({ ...profile, skills: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} style={inputStyle} placeholder="software, web, databases" />
            </label>
            <label style={labelStyle}>Dependants
              <input type="number" min={0} max={10} value={profile.dependants ?? 0} onChange={(e) => setProfile({ ...profile, dependants: Number(e.target.value) })} style={inputStyle} />
            </label>
            <label style={labelStyle}>Transport preference
              <select value={profile.transportPreference} onChange={(e) => setProfile({ ...profile, transportPreference: e.target.value as StudentDecisionProfile["transportPreference"] })} style={inputStyle}>
                <option value="either">Either</option><option value="car">Car</option><option value="public_transport">Public transport</option>
              </select>
            </label>
          </div>
          <div style={buttonRowStyle}>
            <button type="button" onClick={showDetailedResult} style={primaryButtonStyle}>Get Detailed Result</button>
            <button type="button" onClick={() => setStage("quick-result")} style={secondaryButtonStyle}>Back</button>
          </div>
        </section>
      )}

      {stage === "detailed-result" && (
        <>
          <section style={sectionStyle}>
            <div style={stepStyle}>STEP 4 · DETAILED RESULT</div>
            <h2>Your detailed matches</h2>
            <p>These results reuse the same explainable engine with the additional profile information you supplied.</p>
            <ResultCards />
          </section>
          <MigrationPrompt onContinue={runMigrationAware} migrationChoice={migrationChoice} setMigrationChoice={setMigrationChoice} source="Detailed Result" />
        </>
      )}

      {stage === "migration-result" && (
        <>
          <section style={sectionStyle}>
            <div style={stepStyle}>FINAL STEP · MIGRATION-AWARE COMPARISON</div>
            <h2>Original vs migration-aware result</h2>
            <p>
              UniPath keeps the original {resultSource === "quick" ? "Quick" : "Detailed"} Result and creates a separate migration-aware ranking. It never silently replaces the original recommendation.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
              <div>
                <h3>Original recommendation</h3>
                <ResultCards />
              </div>
              <div>
                <h3>Migration-aware recommendation</h3>
                <ResultCards migration />
              </div>
            </div>
            <div style={warningStyle}>
              Migration values on this local page are DEMO scoring fixtures only. They are not current Australian migration rules, legal advice or a PR guarantee.
            </div>
            <div style={buttonRowStyle}>
              <button type="button" onClick={() => setStage(resultSource === "quick" ? "quick-result" : "detailed-result")} style={secondaryButtonStyle}>Back to result</button>
              <button type="button" onClick={() => { setProfile(initialProfile); setStage("quick-input"); }} style={primaryButtonStyle}>Start again</button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function MigrationPrompt({ onContinue, migrationChoice, setMigrationChoice, source }: {
  onContinue: () => void;
  migrationChoice: MigrationImportance;
  setMigrationChoice: (value: MigrationImportance) => void;
  source: string;
}) {
  return (
    <section style={{ ...sectionStyle, marginTop: 16 }}>
      <div style={stepStyle}>OPTIONAL · PR / MIGRATION PATHWAY</div>
      <h2>Do you want UniPath to consider potential PR / migration pathways after the course?</h2>
      <p>This question appears after the {source}. If enabled, UniPath creates a separate migration-aware result using the same student profile.</p>
      <div style={formGridStyle}>
        <label style={labelStyle}>How important is this to you?
          <select value={migrationChoice} onChange={(e) => setMigrationChoice(e.target.value as MigrationImportance)} style={inputStyle}>
            <option value="consider">Consider it, but keep career/course quality important</option>
            <option value="high">Very important</option>
            <option value="none">Not important</option>
          </select>
        </label>
      </div>
      {migrationChoice === "none" ? (
        <p style={{ color: "#586174" }}>No migration-aware re-ranking will be applied.</p>
      ) : (
        <button type="button" onClick={onContinue} style={primaryButtonStyle}>Show Migration-Aware Result</button>
      )}
    </section>
  );
}

const sectionStyle = { border: "1px solid #dfe3ea", borderRadius: 18, background: "#fff", padding: 22 } as const;
const cardStyle = { border: "1px solid #e2e6ed", borderRadius: 14, padding: 16, background: "#fbfcfe" } as const;
const formGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 } as const;
const labelStyle = { display: "grid", gap: 7, fontWeight: 650 } as const;
const inputStyle = { width: "100%", border: "1px solid #cfd5df", borderRadius: 10, padding: "10px 12px", fontSize: 16, background: "#fff" } as const;
const fieldsetStyle = { border: "1px solid #dfe3ea", borderRadius: 12, padding: 12, marginTop: 16 } as const;
const checkStyle = { display: "flex", gap: 7, alignItems: "center" } as const;
const primaryButtonStyle = { border: 0, borderRadius: 10, padding: "11px 16px", background: "#173b73", color: "#fff", fontWeight: 750, cursor: "pointer" } as const;
const secondaryButtonStyle = { border: "1px solid #b9c1ce", borderRadius: 10, padding: "11px 16px", background: "#fff", color: "#1f2937", fontWeight: 700, cursor: "pointer" } as const;
const buttonRowStyle = { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 } as const;
const scoreGridStyle = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 14, fontSize: 14 } as const;
const stepStyle = { fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: "#48627f" } as const;
const rankStyle = { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "#eef4ff", fontWeight: 750, fontSize: 13 } as const;
const demoBadgeStyle = { display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff0bf", fontWeight: 800, fontSize: 13 } as const;
const warningStyle = { marginTop: 18, padding: 14, borderRadius: 12, background: "#fff5dc", color: "#704b00" } as const;
