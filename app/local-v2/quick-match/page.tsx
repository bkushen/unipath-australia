"use client";

import { useEffect, useMemo, useState } from "react";
import { CurrencyBudgetInput } from "@/components/local-v2/CurrencyBudgetInput";
import { clearLocalV2Profile, loadLocalV2Profile, saveLocalV2Profile } from "@/lib/local-v2/profile-storage";
import { rankCourses } from "@/lib/local-v2/recommendation-engine";
import type { AustralianState, MigrationImportance, ScholarshipImportance, StudentDecisionProfile } from "@/lib/local-v2/types";

const states: AustralianState[] = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"];
const money = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);

const initialProfile: StudentDecisionProfile = {
  mode: "quick",
  highestQualification: "Bachelor",
  qualificationField: "Information Technology",
  desiredOccupation: "Software Engineer",
  annualTuitionBudgetCents: 4000000,
  semesterTuitionBudgetCents: 2000000,
  fullCourseBudgetCents: 8000000,
  scholarshipImportance: "prefer",
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
  const [storageReady, setStorageReady] = useState(false);
  const [restoredProfile, setRestoredProfile] = useState(false);

  useEffect(() => {
    const saved = loadLocalV2Profile();
    if (saved) {
      setProfile({ ...initialProfile, ...saved });
      setRestoredProfile(true);
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (storageReady) saveLocalV2Profile(profile);
  }, [profile, storageReady]);

  const standardResults = useMemo(() => rankCourses({ ...profile, migrationImportance: "none" }), [profile]);
  const migrationResults = useMemo(() => rankCourses({ ...profile, migrationImportance: migrationChoice }), [profile, migrationChoice]);
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

  const resetSavedProfile = () => {
    clearLocalV2Profile();
    setProfile(initialProfile);
    setStage("quick-input");
    setResultSource("quick");
    setMigrationChoice("consider");
    setRestoredProfile(false);
  };

  const updateSemesterBudget = (semesterTuitionBudgetCents: number) => {
    setProfile((current) => ({
      ...current,
      semesterTuitionBudgetCents,
      annualTuitionBudgetCents: semesterTuitionBudgetCents * 2,
    }));
  };

  const ResultCards = ({ migration = false }: { migration?: boolean }) => {
    const results = migration ? topMigration : topStandard;
    return (
      <div style={{ display: "grid", gap: 14 }}>
        {results.map((item, index) => {
          const semesterFee = Math.round(item.course.annualTuitionCents / 2);
          const fullCourseFee = Math.round(item.course.annualTuitionCents * item.course.durationYears);
          const scholarshipPercent = item.course.scholarshipPercent ?? 0;
          const scholarshipSaving = Math.round(fullCourseFee * scholarshipPercent / 100);
          const afterScholarship = fullCourseFee - scholarshipSaving;
          return (
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

              <div style={feeGridStyle}>
                <div><span style={feeLabelStyle}>1 semester</span><strong>{money(semesterFee)}</strong></div>
                <div><span style={feeLabelStyle}>Full course</span><strong>{money(fullCourseFee)}</strong></div>
                <div><span style={feeLabelStyle}>Scholarship</span><strong>{scholarshipPercent}%</strong></div>
                <div><span style={feeLabelStyle}>After scholarship</span><strong>{money(afterScholarship)}</strong></div>
              </div>
              {scholarshipPercent > 0 && <div style={savingStyle}>Estimated scholarship saving: {money(scholarshipSaving)}</div>}

              <div style={scoreGridStyle}>
                <span>Academic <strong>{item.scores.academic}%</strong></span>
                <span>Career <strong>{item.scores.career}%</strong></span>
                <span>Budget <strong>{item.scores.affordability}%</strong></span>
                <span>Location <strong>{item.scores.location}%</strong></span>
                <span>Jobs <strong>{item.scores.labourMarket}%</strong></span>
                <span>Migration <strong>{item.scores.migration}%</strong></span>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  return (
    <main style={pageStyle}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <span style={demoBadgeStyle}>Demo version · live currency conversion</span>
          <button type="button" onClick={resetSavedProfile} style={tinyButtonStyle}>Clear saved answers</button>
        </div>
        <h1 style={{ margin: "18px 0 8px", fontSize: 40, lineHeight: 1.1 }}>Find your best course in Australia</h1>
        <p style={{ color: "#e7efff", maxWidth: 760, fontSize: 17, lineHeight: 1.55, margin: 0 }}>
          Compare course fit, university options, locations, scholarships and study costs in one guided search.
        </p>
        <div style={saveNoticeStyle}>✓ {restoredProfile ? "Your previous answers were restored." : "Your answers are saved automatically in this browser."}</div>
      </header>

      {stage === "quick-input" && (
        <div style={mainGridStyle}>
          <aside style={journeyStyle}>
            <div style={journeyTitleStyle}>Your matching journey</div>
            <JourneyStep number="1" title="Quick Match" active />
            <JourneyStep number="2" title="Your Matches" />
            <JourneyStep number="3" title="Detailed Assessment" />
            <JourneyStep number="4" title="Migration-aware options" />
          </aside>

          <section style={sectionStyle}>
            <div style={progressWrapStyle}>
              <div style={{ fontWeight: 800 }}>Step 1 of 4</div>
              <div style={progressTrackStyle}><div style={{ ...progressFillStyle, width: "25%" }} /></div>
            </div>
            <h2 style={{ margin: "0 0 6px", fontSize: 28 }}>Quick Match</h2>
            <p style={mutedStyle}>Start with the essentials. You can add more details after seeing your first recommendations.</p>

            <div style={subsectionStyle}>
              <div style={subsectionHeaderStyle}><span style={subsectionIconStyle}>1</span><div><strong>Study goal</strong><div style={helperStyle}>Tell us your current study background and the career you want.</div></div></div>
              <div style={formGridStyle}>
                <label style={labelStyle}>Highest qualification
                  <select value={profile.highestQualification} onChange={(e) => setProfile({ ...profile, highestQualification: e.target.value })} style={inputStyle}>
                    <option>Bachelor</option><option>Diploma</option><option>Master</option><option>High School</option>
                  </select>
                </label>
                <label style={labelStyle}>Previous study field
                  <select value={profile.qualificationField} onChange={(e) => setProfile({ ...profile, qualificationField: e.target.value })} style={inputStyle}>
                    <option>Information Technology</option><option>Engineering</option><option>Business</option><option>Health</option>
                  </select>
                </label>
                <label style={labelStyle}>Career goal
                  <select value={profile.desiredOccupation} onChange={(e) => setProfile({ ...profile, desiredOccupation: e.target.value })} style={inputStyle}>
                    <option>Software Engineer</option><option>Software Developer</option><option>Data Scientist</option><option>Cyber Security Analyst</option><option>ICT Business Analyst</option>
                  </select>
                </label>
              </div>
            </div>

            <div style={subsectionStyle}>
              <div style={subsectionHeaderStyle}><span style={subsectionIconStyle}>2</span><div><strong>Study budget</strong><div style={helperStyle}>We use both your semester affordability and your total course budget.</div></div></div>
              <div style={budgetGridStyle}>
                <div style={budgetCardStyle}>
                  <CurrencyBudgetInput label="Budget for one semester" audCents={profile.semesterTuitionBudgetCents ?? profile.annualTuitionBudgetCents / 2} onAudCentsChange={updateSemesterBudget} />
                  <div style={budgetHintStyle}>Used to check whether the course is realistically payable semester by semester.</div>
                </div>
                <div style={budgetCardStyle}>
                  <CurrencyBudgetInput label="Maximum full course budget" audCents={profile.fullCourseBudgetCents ?? profile.annualTuitionBudgetCents * 2} onAudCentsChange={(fullCourseBudgetCents) => setProfile((current) => ({ ...current, fullCourseBudgetCents }))} />
                  <div style={budgetHintStyle}>Used to compare the total tuition across the complete course duration.</div>
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <div style={{ fontWeight: 800, marginBottom: 9 }}>How important is a scholarship?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                  {([
                    ["high", "Very important"],
                    ["prefer", "Prefer if available"],
                    ["none", "Not important"],
                  ] as [ScholarshipImportance, string][]).map(([value, label]) => {
                    const selected = (profile.scholarshipImportance ?? "prefer") === value;
                    return <button key={value} type="button" onClick={() => setProfile({ ...profile, scholarshipImportance: value })} style={{ ...choicePillStyle, ...(selected ? selectedChoicePillStyle : {}) }}>{selected ? "✓ " : ""}{label}</button>;
                  })}
                </div>
                <div style={helperStyle}>UniPath will later match course and university scholarships from the database and show the estimated saving automatically.</div>
              </div>
            </div>

            <div style={{ ...subsectionStyle, marginBottom: 0 }}>
              <div style={subsectionHeaderStyle}><span style={subsectionIconStyle}>3</span><div><strong>Location preferences</strong><div style={helperStyle}>Choose one or more states. You can leave this flexible.</div></div></div>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Preferred state(s)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                {states.map((state) => {
                  const selected = profile.preferredStates.includes(state);
                  return <button key={state} type="button" onClick={() => updateState(state)} style={{ ...statePillStyle, ...(selected ? selectedStatePillStyle : {}) }}>{selected ? "✓ " : ""}{state}</button>;
                })}
              </div>

              <div style={{ marginTop: 20 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Open to regional study?</div>
                <div style={{ display: "flex", gap: 9 }}>
                  <button type="button" onClick={() => setProfile({ ...profile, regionalAccepted: true })} style={{ ...choicePillStyle, ...(profile.regionalAccepted ? selectedChoicePillStyle : {}) }}>Yes</button>
                  <button type="button" onClick={() => setProfile({ ...profile, regionalAccepted: false })} style={{ ...choicePillStyle, ...(!profile.regionalAccepted ? selectedChoicePillStyle : {}) }}>No</button>
                </div>
              </div>
            </div>

            <div style={benefitBoxStyle}>
              <strong>What you’ll get</strong>
              <div style={benefitGridStyle}><span>✓ Top course matches</span><span>✓ Semester affordability</span><span>✓ Full course cost</span><span>✓ Scholarship estimate</span><span>✓ University options</span><span>✓ Best-fit states</span></div>
            </div>

            <button type="button" onClick={() => { setProfile((current) => ({ ...current, mode: "quick", migrationImportance: "none" })); setResultSource("quick"); setStage("quick-result"); }} style={ctaButtonStyle}>Show My Quick Result →</button>
          </section>
        </div>
      )}

      {stage === "quick-result" && (
        <>
          <section style={sectionStyle}><div style={stepStyle}>STEP 2 · QUICK RESULT</div><h2>Your quick matches</h2><ResultCards /></section>
          <section style={{ ...sectionStyle, marginTop: 16 }}><h2>Want a more detailed result?</h2><p>We’ll keep your answers and only ask for the extra details needed to improve your recommendation.</p><div style={buttonRowStyle}><button type="button" onClick={() => setStage("detailed-input")} style={primaryButtonStyle}>Yes, improve my result</button><button type="button" onClick={() => setResultSource("quick")} style={secondaryButtonStyle}>Keep Quick Result</button></div></section>
          <MigrationPrompt onContinue={() => setStage("migration-result")} migrationChoice={migrationChoice} setMigrationChoice={setMigrationChoice} source="Quick Result" />
        </>
      )}

      {stage === "detailed-input" && (
        <section style={sectionStyle}>
          <div style={stepStyle}>STEP 3 · DETAILED ASSESSMENT</div><h2>Improve your recommendation</h2><p>Your Quick Match answers are retained. Add more information below.</p>
          <div style={formGridStyle}>
            <CurrencyBudgetInput label="Total funds available" audCents={profile.totalFundsCents} onAudCentsChange={(totalFundsCents) => setProfile((current) => ({ ...current, totalFundsCents }))} />
            <label style={labelStyle}>Years of relevant experience<input type="number" min={0} max={40} step={0.5} value={profile.yearsExperience ?? 0} onChange={(e) => setProfile({ ...profile, yearsExperience: Number(e.target.value) })} style={inputStyle} /></label>
            <label style={labelStyle}>Skills<input value={(profile.skills ?? []).join(", ")} onChange={(e) => setProfile({ ...profile, skills: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} style={inputStyle} placeholder="software, web, databases" /></label>
            <label style={labelStyle}>Dependants<input type="number" min={0} max={10} value={profile.dependants ?? 0} onChange={(e) => setProfile({ ...profile, dependants: Number(e.target.value) })} style={inputStyle} /></label>
            <label style={labelStyle}>Transport preference<select value={profile.transportPreference} onChange={(e) => setProfile({ ...profile, transportPreference: e.target.value as StudentDecisionProfile["transportPreference"] })} style={inputStyle}><option value="either">Either</option><option value="car">Car</option><option value="public_transport">Public transport</option></select></label>
          </div>
          <div style={buttonRowStyle}><button type="button" onClick={() => { setProfile((current) => ({ ...current, mode: "detailed", migrationImportance: "none" })); setResultSource("detailed"); setStage("detailed-result"); }} style={primaryButtonStyle}>Get Detailed Result</button><button type="button" onClick={() => setStage("quick-result")} style={secondaryButtonStyle}>Back</button></div>
        </section>
      )}

      {stage === "detailed-result" && <><section style={sectionStyle}><div style={stepStyle}>STEP 4 · DETAILED RESULT</div><h2>Your detailed matches</h2><ResultCards /></section><MigrationPrompt onContinue={() => setStage("migration-result")} migrationChoice={migrationChoice} setMigrationChoice={setMigrationChoice} source="Detailed Result" /></>}

      {stage === "migration-result" && <section style={sectionStyle}><div style={stepStyle}>FINAL STEP · MIGRATION-AWARE COMPARISON</div><h2>Original vs migration-aware result</h2><p>UniPath keeps the original {resultSource === "quick" ? "Quick" : "Detailed"} Result and creates a separate migration-aware ranking.</p><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}><div><h3>Original recommendation</h3><ResultCards /></div><div><h3>Migration-aware recommendation</h3><ResultCards migration /></div></div><div style={warningStyle}>Migration values on this local page are DEMO scoring fixtures only. They are not current Australian migration rules, legal advice or a PR guarantee.</div><div style={buttonRowStyle}><button type="button" onClick={() => setStage(resultSource === "quick" ? "quick-result" : "detailed-result")} style={secondaryButtonStyle}>Back to result</button><button type="button" onClick={resetSavedProfile} style={primaryButtonStyle}>Start again</button></div></section>}
    </main>
  );
}

function JourneyStep({ number, title, active = false }: { number: string; title: string; active?: boolean }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", opacity: active ? 1 : 0.62 }}><span style={{ ...journeyNumberStyle, ...(active ? journeyNumberActiveStyle : {}) }}>{number}</span><span style={{ fontWeight: active ? 800 : 650 }}>{title}</span></div>;
}

function MigrationPrompt({ onContinue, migrationChoice, setMigrationChoice, source }: { onContinue: () => void; migrationChoice: MigrationImportance; setMigrationChoice: (value: MigrationImportance) => void; source: string; }) {
  return <section style={{ ...sectionStyle, marginTop: 16 }}><div style={stepStyle}>OPTIONAL · PR / MIGRATION PATHWAY</div><h2>Would you like UniPath to consider potential PR / migration pathways?</h2><p>We’ll keep your {source} unchanged and create a separate migration-aware comparison.</p><div style={formGridStyle}><label style={labelStyle}>How important is this to you?<select value={migrationChoice} onChange={(e) => setMigrationChoice(e.target.value as MigrationImportance)} style={inputStyle}><option value="consider">Consider it, but keep career/course quality important</option><option value="high">Very important</option><option value="none">Not important</option></select></label></div>{migrationChoice === "none" ? <p style={{ color: "#586174" }}>No migration-aware re-ranking will be applied.</p> : <button type="button" onClick={onContinue} style={primaryButtonStyle}>Show Migration-Aware Result</button>}</section>;
}

const pageStyle = { maxWidth: 1180, margin: "0 auto", padding: "30px 20px 70px", background: "#0057b8", minHeight: "100vh" } as const;
const mainGridStyle = { display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", gap: 22, alignItems: "start" } as const;
const journeyStyle = { borderRadius: 20, background: "#fff", padding: 20, position: "sticky", top: 20, boxShadow: "0 8px 30px rgba(16,24,40,0.08)" } as const;
const journeyTitleStyle = { fontWeight: 850, marginBottom: 8, fontSize: 15 } as const;
const journeyNumberStyle = { width: 28, height: 28, borderRadius: 999, border: "1px solid #cbd5e1", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13 } as const;
const journeyNumberActiveStyle = { background: "#0057b8", color: "#fff", borderColor: "#0057b8" } as const;
const sectionStyle = { border: "1px solid #dfe3ea", borderRadius: 22, background: "#fff", padding: 26, boxShadow: "0 8px 30px rgba(16,24,40,0.08)" } as const;
const subsectionStyle = { borderTop: "1px solid #eef1f5", paddingTop: 24, marginTop: 24, marginBottom: 24 } as const;
const subsectionHeaderStyle = { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 } as const;
const subsectionIconStyle = { display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 999, background: "#0057b8", color: "#fff", fontWeight: 800, flex: "0 0 auto" } as const;
const formGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 } as const;
const budgetGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 } as const;
const budgetCardStyle = { border: "1px solid #dce4ee", borderRadius: 16, padding: 16, background: "#f9fbfd" } as const;
const budgetHintStyle = { color: "#667085", fontSize: 12, lineHeight: 1.45, marginTop: 10 } as const;
const labelStyle = { display: "grid", gap: 7, fontWeight: 700 } as const;
const inputStyle = { width: "100%", border: "1px solid #cfd5df", borderRadius: 10, padding: "12px 12px", fontSize: 15, background: "#fff" } as const;
const statePillStyle = { border: "1px solid #cfd5df", background: "#fff", color: "#344054", borderRadius: 8, padding: "10px 15px", fontWeight: 750, cursor: "pointer" } as const;
const selectedStatePillStyle = { background: "#0057b8", color: "#fff", borderColor: "#0057b8" } as const;
const choicePillStyle = { border: "1px solid #cfd5df", background: "#fff", borderRadius: 8, padding: "10px 15px", fontWeight: 750, cursor: "pointer" } as const;
const selectedChoicePillStyle = { background: "#eaf3ff", borderColor: "#73aaf5", color: "#004594" } as const;
const benefitBoxStyle = { marginTop: 24, padding: 18, borderRadius: 14, background: "#f3f7fb", border: "1px solid #dce7f4" } as const;
const benefitGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 10, color: "#475467" } as const;
const ctaButtonStyle = { width: "100%", marginTop: 20, border: 0, borderRadius: 8, background: "#d81b60", color: "#fff", padding: "15px 18px", fontSize: 17, fontWeight: 850, cursor: "pointer" } as const;
const progressWrapStyle = { display: "grid", gridTemplateColumns: "auto minmax(120px, 1fr)", gap: 14, alignItems: "center", marginBottom: 22, color: "#475467" } as const;
const progressTrackStyle = { height: 8, borderRadius: 999, background: "#e9edf2", overflow: "hidden" } as const;
const progressFillStyle = { height: "100%", borderRadius: 999, background: "#0057b8" } as const;
const saveNoticeStyle = { display: "inline-block", marginTop: 14, padding: "8px 11px", borderRadius: 8, background: "#e8f7ef", color: "#0f6a42", fontSize: 13, fontWeight: 700 } as const;
const tinyButtonStyle = { border: "1px solid rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: "#fff" } as const;
const mutedStyle = { color: "#667085", margin: 0, lineHeight: 1.55 } as const;
const helperStyle = { color: "#667085", fontSize: 13, marginTop: 3, fontWeight: 500 } as const;
const cardStyle = { border: "1px solid #e2e6ed", borderRadius: 14, padding: 18, background: "#fbfcfe" } as const;
const feeGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, margin: "16px 0 10px" } as const;
const feeLabelStyle = { display: "block", color: "#667085", fontSize: 12, marginBottom: 3 } as const;
const savingStyle = { display: "inline-block", background: "#ecfdf3", color: "#027a48", padding: "7px 9px", borderRadius: 8, fontSize: 13, fontWeight: 750 } as const;
const buttonRowStyle = { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 } as const;
const primaryButtonStyle = { border: 0, borderRadius: 8, background: "#0057b8", color: "#fff", padding: "11px 16px", fontWeight: 750, cursor: "pointer" } as const;
const secondaryButtonStyle = { border: "1px solid #cfd5df", borderRadius: 8, background: "#fff", color: "#111827", padding: "11px 16px", fontWeight: 750, cursor: "pointer" } as const;
const demoBadgeStyle = { display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff", color: "#0057b8", fontWeight: 800, fontSize: 13 } as const;
const stepStyle = { color: "#475467", fontSize: 13, fontWeight: 800, letterSpacing: 0.5 } as const;
const rankStyle = { color: "#344054", fontSize: 13, fontWeight: 800 } as const;
const scoreGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, margin: "14px 0" } as const;
const warningStyle = { marginTop: 18, padding: 14, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" } as const;
