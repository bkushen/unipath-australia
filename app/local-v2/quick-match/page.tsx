"use client";

import { useEffect, useMemo, useState } from "react";
import { CurrencyBudgetInput } from "@/components/local-v2/CurrencyBudgetInput";
import { SearchableDatabaseSelect, type SearchOption } from "@/components/local-v2/SearchableDatabaseSelect";
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
  preferredStudy: "",
  preferredLocation: "",
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

type QuickStep = 1 | 2 | 3 | 4;

const quickSteps: { number: QuickStep; title: string; short: string }[] = [
  { number: 1, title: "Your education", short: "Education" },
  { number: 2, title: "Your future", short: "Career" },
  { number: 3, title: "Your budget", short: "Budget" },
  { number: 4, title: "Your location", short: "Location" },
];

export default function QuickMatchPage() {
  const [profile, setProfile] = useState<StudentDecisionProfile>(initialProfile);
  const [stage, setStage] = useState<Stage>("quick-input");
  const [quickStep, setQuickStep] = useState<QuickStep>(1);
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

  const selectLocation = (option: SearchOption) => {
    const state = option.state as AustralianState | undefined;
    setProfile((current) => ({
      ...current,
      preferredLocation: option.value,
      preferredStates: state && states.includes(state) ? [state] : current.preferredStates,
    }));
  };

  const resetSavedProfile = () => {
    clearLocalV2Profile();
    setProfile(initialProfile);
    setStage("quick-input");
    setQuickStep(1);
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

  const nextQuickStep = () => {
    if (quickStep < 4) setQuickStep((quickStep + 1) as QuickStep);
  };

  const previousQuickStep = () => {
    if (quickStep > 1) setQuickStep((quickStep - 1) as QuickStep);
  };

  const showQuickResult = () => {
    setProfile((current) => ({ ...current, mode: "quick", migrationImportance: "none" }));
    setResultSource("quick");
    setStage("quick-result");
  };

  const ResultCards = ({ migration = false }: { migration?: boolean }) => {
    const results = migration ? topMigration : topStandard;
    return (
      <div style={{ display: "grid", gap: 16 }}>
        {results.map((item, index) => {
          const semesterFee = Math.round(item.course.annualTuitionCents / 2);
          const fullCourseFee = Math.round(item.course.annualTuitionCents * item.course.durationYears);
          const scholarshipPercent = item.course.scholarshipPercent ?? 0;
          const scholarshipSaving = Math.round((fullCourseFee * scholarshipPercent) / 100);
          const afterScholarship = fullCourseFee - scholarshipSaving;
          return (
            <article key={item.course.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
                <div>
                  <div style={rankStyle}>#{index + 1} {index === 0 ? "Best match" : "Alternative"}</div>
                  <h3 style={{ margin: "8px 0 4px", fontSize: 22 }}>{item.course.name}</h3>
                  <p style={{ margin: 0, fontWeight: 700 }}>{item.university.name}</p>
                  <p style={{ margin: "4px 0 0", color: "#667085" }}>{item.campus.name} · {item.campus.state}</p>
                </div>
                <div style={matchScoreStyle}>{item.scores.overall}%</div>
              </div>

              <div style={reasonBoxStyle}>
                <strong>Why it matches</strong>
                <div style={reasonGridStyle}>
                  <span>✓ Academic fit {item.scores.academic}%</span>
                  <span>✓ Career fit {item.scores.career}%</span>
                  <span>✓ Budget fit {item.scores.affordability}%</span>
                  <span>✓ Job-market fit {item.scores.labourMarket}%</span>
                </div>
              </div>

              <div style={feeGridStyle}>
                <div><span style={feeLabelStyle}>1 semester</span><strong>{money(semesterFee)}</strong></div>
                <div><span style={feeLabelStyle}>Full course</span><strong>{money(fullCourseFee)}</strong></div>
                <div><span style={feeLabelStyle}>Scholarship</span><strong>{scholarshipPercent}%</strong></div>
                <div><span style={feeLabelStyle}>After scholarship</span><strong>{money(afterScholarship)}</strong></div>
              </div>
              {scholarshipPercent > 0 && <div style={savingStyle}>Estimated scholarship saving: {money(scholarshipSaving)}</div>}

              <div style={scoreGridStyle}>
                <span>Location <strong>{item.scores.location}%</strong></span>
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
          <span style={demoBadgeStyle}>Quick Match · about 2–3 minutes</span>
          <button type="button" onClick={resetSavedProfile} style={tinyButtonStyle}>Clear saved answers</button>
        </div>
        <h1 style={{ margin: "18px 0 8px", fontSize: 42, lineHeight: 1.08 }}>What should I study in Australia?</h1>
        <p style={{ color: "#eaf2ff", maxWidth: 780, fontSize: 17, lineHeight: 1.55, margin: 0 }}>
          Answer a few questions and UniPath will match you with courses, universities and locations based on your education, career goals and budget.
        </p>
        <div style={saveNoticeStyle}>✓ {restoredProfile ? "Your previous answers were restored." : "Your answers are saved automatically in this browser."}</div>
      </header>

      {stage === "quick-input" && (
        <div style={quizShellStyle}>
          <div style={stepTopStyle}>
            <div>
              <div style={eyebrowStyle}>QUICK MATCH</div>
              <div style={{ fontWeight: 850, fontSize: 16 }}>Step {quickStep} of 4</div>
            </div>
            <div style={stepChipsStyle}>
              {quickSteps.map((step) => (
                <button
                  key={step.number}
                  type="button"
                  onClick={() => setQuickStep(step.number)}
                  style={{ ...stepChipStyle, ...(quickStep === step.number ? activeStepChipStyle : {}) }}
                >
                  <span style={stepNumberStyle}>{step.number}</span>{step.short}
                </button>
              ))}
            </div>
          </div>

          <div style={progressTrackStyle}><div style={{ ...progressFillStyle, width: `${quickStep * 25}%` }} /></div>

          {quickStep === 1 && (
            <section style={questionPanelStyle}>
              <div style={questionNumberStyle}>01</div>
              <h2 style={questionTitleStyle}>What have you studied so far?</h2>
              <p style={questionCopyStyle}>This helps us understand which Australian courses are academically relevant to your background.</p>
              <div style={twoColumnStyle}>
                <SearchableDatabaseSelect
                  label="Highest qualification"
                  type="qualification"
                  value={profile.highestQualification}
                  placeholder="Search qualification level"
                  helper="Choose the closest level from the UniPath database."
                  onChange={(highestQualification) => setProfile((current) => ({ ...current, highestQualification }))}
                />
                <SearchableDatabaseSelect
                  label="Previous study field"
                  type="study_field"
                  value={profile.qualificationField}
                  placeholder="e.g. Information Technology"
                  helper="Start typing your study field."
                  onChange={(qualificationField) => setProfile((current) => ({ ...current, qualificationField }))}
                />
              </div>
            </section>
          )}

          {quickStep === 2 && (
            <section style={questionPanelStyle}>
              <div style={questionNumberStyle}>02</div>
              <h2 style={questionTitleStyle}>What do you want to do in the future?</h2>
              <p style={questionCopyStyle}>Tell us the career direction you want. If you already know a course or study area, add it too.</p>
              <div style={twoColumnStyle}>
                <SearchableDatabaseSelect
                  label="Career goal"
                  type="occupation"
                  value={profile.desiredOccupation}
                  placeholder="e.g. Software Engineer"
                  helper="Search occupations from the UniPath database."
                  onChange={(desiredOccupation) => setProfile((current) => ({ ...current, desiredOccupation }))}
                />
                <SearchableDatabaseSelect
                  label="Preferred study area or course (optional)"
                  type="course"
                  value={profile.preferredStudy ?? ""}
                  placeholder="e.g. Cyber Security"
                  helper="Leave blank if you want UniPath to suggest the study direction."
                  onChange={(preferredStudy) => setProfile((current) => ({ ...current, preferredStudy }))}
                />
              </div>
              <button type="button" onClick={() => setProfile((current) => ({ ...current, desiredOccupation: "Not sure yet", preferredStudy: "" }))} style={softButtonStyle}>I’m not sure yet</button>
            </section>
          )}

          {quickStep === 3 && (
            <section style={questionPanelStyle}>
              <div style={questionNumberStyle}>03</div>
              <h2 style={questionTitleStyle}>What can you comfortably spend?</h2>
              <p style={questionCopyStyle}>Enter your budget in your own currency. UniPath converts it to AUD and checks both semester and full-course affordability.</p>
              <div style={budgetGridStyle}>
                <div style={budgetCardStyle}>
                  <CurrencyBudgetInput label="Budget for one semester" audCents={profile.semesterTuitionBudgetCents ?? profile.annualTuitionBudgetCents / 2} onAudCentsChange={updateSemesterBudget} />
                  <div style={budgetHintStyle}>Used to test whether the course is manageable semester by semester.</div>
                </div>
                <div style={budgetCardStyle}>
                  <CurrencyBudgetInput label="Maximum full course budget" audCents={profile.fullCourseBudgetCents ?? profile.annualTuitionBudgetCents * 2} onAudCentsChange={(fullCourseBudgetCents) => setProfile((current) => ({ ...current, fullCourseBudgetCents }))} />
                  <div style={budgetHintStyle}>Used to compare the total tuition across the whole degree.</div>
                </div>
              </div>

              <div style={{ marginTop: 22 }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>How important is a scholarship?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {([
                    ["high", "Very important"],
                    ["prefer", "Prefer if available"],
                    ["none", "Not important"],
                  ] as [ScholarshipImportance, string][]).map(([value, label]) => {
                    const selected = (profile.scholarshipImportance ?? "prefer") === value;
                    return <button key={value} type="button" onClick={() => setProfile((current) => ({ ...current, scholarshipImportance: value }))} style={{ ...choicePillStyle, ...(selected ? selectedChoicePillStyle : {}) }}>{selected ? "✓ " : ""}{label}</button>;
                  })}
                </div>
              </div>
            </section>
          )}

          {quickStep === 4 && (
            <section style={questionPanelStyle}>
              <div style={questionNumberStyle}>04</div>
              <h2 style={questionTitleStyle}>Where would you like to live and study?</h2>
              <p style={questionCopyStyle}>Search a city or campus area, choose one or more states, or keep your options flexible.</p>
              <div style={{ maxWidth: 620 }}>
                <SearchableDatabaseSelect
                  label="Preferred location (optional)"
                  type="location"
                  value={profile.preferredLocation ?? ""}
                  placeholder="e.g. Melbourne, Ballarat, Sydney"
                  helper="Selecting a location automatically sets its state preference."
                  onChange={(preferredLocation) => setProfile((current) => ({ ...current, preferredLocation }))}
                  onSelect={selectLocation}
                />
              </div>

              <div style={{ marginTop: 24 }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>Preferred state(s)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                  {states.map((state) => {
                    const selected = profile.preferredStates.includes(state);
                    return <button key={state} type="button" onClick={() => updateState(state)} style={{ ...statePillStyle, ...(selected ? selectedStatePillStyle : {}) }}>{selected ? "✓ " : ""}{state}</button>;
                  })}
                </div>
              </div>

              <div style={{ marginTop: 24 }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>Open to regional Australia?</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setProfile((current) => ({ ...current, regionalAccepted: true }))} style={{ ...choicePillStyle, ...(profile.regionalAccepted ? selectedChoicePillStyle : {}) }}>Yes</button>
                  <button type="button" onClick={() => setProfile((current) => ({ ...current, regionalAccepted: false }))} style={{ ...choicePillStyle, ...(!profile.regionalAccepted ? selectedChoicePillStyle : {}) }}>No</button>
                  <button type="button" onClick={() => setProfile((current) => ({ ...current, preferredLocation: "", preferredStates: [] }))} style={choicePillStyle}>Anywhere in Australia</button>
                </div>
              </div>

              <div style={benefitBoxStyle}>
                <strong>Your Quick Match will include</strong>
                <div style={benefitGridStyle}><span>✓ Top course matches</span><span>✓ University options</span><span>✓ Semester affordability</span><span>✓ Full-course cost</span><span>✓ Scholarship estimate</span><span>✓ Best-fit locations</span></div>
              </div>
            </section>
          )}

          <div style={quizFooterStyle}>
            <button type="button" onClick={previousQuickStep} disabled={quickStep === 1} style={{ ...secondaryButtonStyle, opacity: quickStep === 1 ? 0.45 : 1, cursor: quickStep === 1 ? "default" : "pointer" }}>← Back</button>
            {quickStep < 4 ? (
              <button type="button" onClick={nextQuickStep} style={ctaButtonStyle}>Continue →</button>
            ) : (
              <button type="button" onClick={showQuickResult} style={ctaButtonStyle}>Show My Matches →</button>
            )}
          </div>
        </div>
      )}

      {stage === "quick-result" && (
        <>
          <section style={sectionStyle}>
            <div style={eyebrowStyle}>STEP 5 · YOUR MATCHES</div>
            <h2 style={{ fontSize: 30, marginBottom: 6 }}>Your best course matches</h2>
            <p style={mutedStyle}>These recommendations combine your current profile with the local UniPath scoring model.</p>
            <div style={{ marginTop: 20 }}><ResultCards /></div>
            <div style={buttonRowStyle}><button type="button" onClick={() => { setStage("quick-input"); setQuickStep(1); }} style={secondaryButtonStyle}>Edit Quick Match</button></div>
          </section>
          <section style={{ ...sectionStyle, marginTop: 16 }}>
            <h2>Want a more accurate recommendation?</h2>
            <p>Add work experience, available funds, skills, dependants and transport preferences without losing your Quick Match answers.</p>
            <div style={buttonRowStyle}><button type="button" onClick={() => setStage("detailed-input")} style={primaryButtonStyle}>Continue to Detailed Assessment</button><button type="button" onClick={() => setResultSource("quick")} style={secondaryButtonStyle}>Keep Quick Result</button></div>
          </section>
          <MigrationPrompt onContinue={() => setStage("migration-result")} migrationChoice={migrationChoice} setMigrationChoice={setMigrationChoice} source="Quick Result" />
        </>
      )}

      {stage === "detailed-input" && (
        <section style={sectionStyle}>
          <div style={eyebrowStyle}>DETAILED ASSESSMENT</div>
          <h2>Improve your recommendation</h2>
          <p>Your Quick Match answers are retained. Add more information below.</p>
          <div style={formGridStyle}>
            <CurrencyBudgetInput label="Total funds available" audCents={profile.totalFundsCents} onAudCentsChange={(totalFundsCents) => setProfile((current) => ({ ...current, totalFundsCents }))} />
            <label style={labelStyle}>Years of relevant experience<input type="number" min={0} max={40} step={0.5} value={profile.yearsExperience ?? 0} onChange={(e) => setProfile((current) => ({ ...current, yearsExperience: Number(e.target.value) }))} style={inputStyle} /></label>
            <label style={labelStyle}>Skills<input value={(profile.skills ?? []).join(", ")} onChange={(e) => setProfile((current) => ({ ...current, skills: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) }))} style={inputStyle} placeholder="software, web, databases" /></label>
            <label style={labelStyle}>Dependants<input type="number" min={0} max={10} value={profile.dependants ?? 0} onChange={(e) => setProfile((current) => ({ ...current, dependants: Number(e.target.value) }))} style={inputStyle} /></label>
            <label style={labelStyle}>Transport preference<select value={profile.transportPreference} onChange={(e) => setProfile((current) => ({ ...current, transportPreference: e.target.value as StudentDecisionProfile["transportPreference"] }))} style={inputStyle}><option value="either">Either</option><option value="car">Car</option><option value="public_transport">Public transport</option></select></label>
          </div>
          <div style={buttonRowStyle}><button type="button" onClick={() => { setProfile((current) => ({ ...current, mode: "detailed", migrationImportance: "none" })); setResultSource("detailed"); setStage("detailed-result"); }} style={primaryButtonStyle}>Get Detailed Result</button><button type="button" onClick={() => setStage("quick-result")} style={secondaryButtonStyle}>Back</button></div>
        </section>
      )}

      {stage === "detailed-result" && <><section style={sectionStyle}><div style={eyebrowStyle}>DETAILED RESULT</div><h2>Your detailed matches</h2><ResultCards /></section><MigrationPrompt onContinue={() => setStage("migration-result")} migrationChoice={migrationChoice} setMigrationChoice={setMigrationChoice} source="Detailed Result" /></>}

      {stage === "migration-result" && <section style={sectionStyle}><div style={eyebrowStyle}>MIGRATION-AWARE COMPARISON</div><h2>Original vs migration-aware result</h2><p>UniPath keeps the original {resultSource === "quick" ? "Quick" : "Detailed"} Result and creates a separate migration-aware ranking.</p><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}><div><h3>Original recommendation</h3><ResultCards /></div><div><h3>Migration-aware recommendation</h3><ResultCards migration /></div></div><div style={warningStyle}>Migration values on this local page are DEMO scoring fixtures only. They are not current Australian migration rules, legal advice or a PR guarantee.</div><div style={buttonRowStyle}><button type="button" onClick={() => setStage(resultSource === "quick" ? "quick-result" : "detailed-result")} style={secondaryButtonStyle}>Back to result</button><button type="button" onClick={resetSavedProfile} style={primaryButtonStyle}>Start again</button></div></section>}
    </main>
  );
}

function MigrationPrompt({ onContinue, migrationChoice, setMigrationChoice, source }: { onContinue: () => void; migrationChoice: MigrationImportance; setMigrationChoice: (value: MigrationImportance) => void; source: string; }) {
  return <section style={{ ...sectionStyle, marginTop: 16 }}><div style={eyebrowStyle}>OPTIONAL · MIGRATION PATHWAYS</div><h2>Should migration pathways matter to your decision?</h2><p>We’ll keep your {source} unchanged and create a separate migration-aware comparison.</p><div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{([['high','Very important'],['consider','Consider them'],['none','Not important']] as [MigrationImportance,string][]).map(([value,label]) => <button key={value} type="button" onClick={() => setMigrationChoice(value)} style={{ ...choicePillStyle, ...(migrationChoice === value ? selectedChoicePillStyle : {}) }}>{migrationChoice === value ? '✓ ' : ''}{label}</button>)}</div>{migrationChoice === "none" ? <p style={{ color: "#667085" }}>No migration-aware re-ranking will be applied.</p> : <button type="button" onClick={onContinue} style={{ ...primaryButtonStyle, marginTop: 16 }}>Show Migration-Aware Result</button>}</section>;
}

const pageStyle = { maxWidth: 1180, margin: "0 auto", padding: "30px 20px 70px", background: "#0057b8", minHeight: "100vh" } as const;
const quizShellStyle = { borderRadius: 24, background: "#fff", padding: 28, boxShadow: "0 14px 40px rgba(16,24,40,0.16)" } as const;
const stepTopStyle = { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", flexWrap: "wrap", marginBottom: 16 } as const;
const stepChipsStyle = { display: "flex", gap: 8, flexWrap: "wrap" } as const;
const stepChipStyle = { border: "1px solid #d0d5dd", background: "#fff", color: "#475467", borderRadius: 999, padding: "7px 10px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 700, fontSize: 12 } as const;
const activeStepChipStyle = { background: "#eaf3ff", color: "#0057b8", borderColor: "#7fb0ee" } as const;
const stepNumberStyle = { width: 21, height: 21, borderRadius: 999, background: "#f2f4f7", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 850 } as const;
const progressTrackStyle = { height: 8, borderRadius: 999, background: "#e9edf2", overflow: "hidden" } as const;
const progressFillStyle = { height: "100%", borderRadius: 999, background: "#d81b60", transition: "width .2s ease" } as const;
const questionPanelStyle = { padding: "36px 2px 26px", minHeight: 390 } as const;
const questionNumberStyle = { color: "#d81b60", fontWeight: 900, letterSpacing: 1.2, fontSize: 13 } as const;
const questionTitleStyle = { fontSize: 31, lineHeight: 1.15, margin: "8px 0" } as const;
const questionCopyStyle = { color: "#667085", lineHeight: 1.6, maxWidth: 720, margin: "0 0 26px" } as const;
const twoColumnStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 } as const;
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
const softButtonStyle = { marginTop: 18, border: "1px dashed #98a2b3", background: "#f9fafb", color: "#475467", borderRadius: 10, padding: "10px 14px", fontWeight: 750, cursor: "pointer" } as const;
const benefitBoxStyle = { marginTop: 28, padding: 18, borderRadius: 14, background: "#f3f7fb", border: "1px solid #dce7f4" } as const;
const benefitGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 10, color: "#475467" } as const;
const quizFooterStyle = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", borderTop: "1px solid #eaecf0", paddingTop: 20 } as const;
const ctaButtonStyle = { border: 0, borderRadius: 9, background: "#d81b60", color: "#fff", padding: "13px 20px", fontSize: 16, fontWeight: 850, cursor: "pointer" } as const;
const sectionStyle = { border: "1px solid #dfe3ea", borderRadius: 22, background: "#fff", padding: 26, boxShadow: "0 8px 30px rgba(16,24,40,0.08)" } as const;
const saveNoticeStyle = { display: "inline-block", marginTop: 14, padding: "8px 11px", borderRadius: 8, background: "#e8f7ef", color: "#0f6a42", fontSize: 13, fontWeight: 700 } as const;
const tinyButtonStyle = { border: "1px solid rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: "#fff" } as const;
const demoBadgeStyle = { display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff", color: "#0057b8", fontWeight: 800, fontSize: 13 } as const;
const eyebrowStyle = { color: "#475467", fontSize: 12, fontWeight: 850, letterSpacing: 0.8 } as const;
const mutedStyle = { color: "#667085", margin: 0, lineHeight: 1.55 } as const;
const cardStyle = { border: "1px solid #e2e6ed", borderRadius: 16, padding: 20, background: "#fbfcfe" } as const;
const matchScoreStyle = { minWidth: 82, textAlign: "center", background: "#eaf3ff", color: "#0057b8", borderRadius: 14, padding: "10px 12px", fontSize: 26, fontWeight: 900 } as const;
const rankStyle = { color: "#344054", fontSize: 13, fontWeight: 800 } as const;
const reasonBoxStyle = { marginTop: 16, background: "#f5f8fb", borderRadius: 12, padding: 14 } as const;
const reasonGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 7, marginTop: 8, color: "#475467", fontSize: 13 } as const;
const feeGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, margin: "16px 0 10px" } as const;
const feeLabelStyle = { display: "block", color: "#667085", fontSize: 12, marginBottom: 3 } as const;
const savingStyle = { display: "inline-block", background: "#ecfdf3", color: "#027a48", padding: "7px 9px", borderRadius: 8, fontSize: 13, fontWeight: 750 } as const;
const scoreGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, margin: "14px 0" } as const;
const buttonRowStyle = { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 } as const;
const primaryButtonStyle = { border: 0, borderRadius: 8, background: "#0057b8", color: "#fff", padding: "11px 16px", fontWeight: 750, cursor: "pointer" } as const;
const secondaryButtonStyle = { border: "1px solid #cfd5df", borderRadius: 8, background: "#fff", color: "#111827", padding: "11px 16px", fontWeight: 750, cursor: "pointer" } as const;
const warningStyle = { marginTop: 18, padding: 14, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" } as const;
