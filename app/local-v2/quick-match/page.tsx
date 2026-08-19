"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CurrencyBudgetInput } from "@/components/local-v2/CurrencyBudgetInput";
import { clearLocalV2Profile, loadLocalV2Profile, saveLocalV2Profile } from "@/lib/local-v2/profile-storage";
import { rankCourses } from "@/lib/local-v2/recommendation-engine";
import type { AustralianState, MigrationImportance, StudentDecisionProfile } from "@/lib/local-v2/types";

const states: AustralianState[] = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"];
const money = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);

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

  const ResultCards = ({ migration = false }: { migration?: boolean }) => {
    const results = migration ? topMigration : topStandard;
    return (
      <div style={{ display: "grid", gap: 16 }}>
        {results.map((item, index) => (
          <article key={item.course.id} style={resultCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
              <div>
                <div style={resultEyebrowStyle}>{index === 0 ? "Best match" : `Alternative ${index}`}</div>
                <h3 style={{ margin: "7px 0 4px", fontSize: 22 }}>{item.course.name}</h3>
                <p style={{ margin: 0, fontWeight: 700 }}>{item.university.name}</p>
                <p style={{ margin: "4px 0 0", color: "#5f6573" }}>{item.campus.name} · {item.campus.state}</p>
              </div>
              <div style={scoreBubbleStyle}>{item.scores.overall}%</div>
            </div>

            <div style={scoreGridStyle}>
              <span>Academic <strong>{item.scores.academic}%</strong></span>
              <span>Career <strong>{item.scores.career}%</strong></span>
              <span>Budget <strong>{item.scores.affordability}%</strong></span>
              <span>Location <strong>{item.scores.location}%</strong></span>
              <span>Jobs <strong>{item.scores.labourMarket}%</strong></span>
              <span>Migration <strong>{item.scores.migration}%</strong></span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, paddingTop: 14, borderTop: "1px solid #e8e8ef" }}>
              <div><strong>{money(item.course.annualTuitionCents)}</strong> <span style={{ color: "#687080" }}>/ year demo tuition</span></div>
              <Link href={`/local-v2/courses/${item.course.id}`} style={textLinkStyle}>Explore details →</Link>
            </div>
          </article>
        ))}
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      <header style={siteHeaderStyle}>
        <div style={navInnerStyle}>
          <Link href="/local-v2" style={brandStyle}>
            <span style={brandMarkStyle}>U</span>
            <span>UniPath Australia</span>
          </Link>
          <nav style={navLinksStyle}>
            <Link href="/local-v2/courses" style={navLinkStyle}>Courses</Link>
            <Link href="/local-v2/universities" style={navLinkStyle}>Universities</Link>
            <Link href="/local-v2/compare" style={navLinkStyle}>Compare</Link>
            <Link href="/local-v2/course-finance" style={navLinkStyle}>Costs</Link>
            <Link href="/local-v2/dashboard" style={navLinkStyle}>Saved</Link>
          </nav>
        </div>
      </header>

      <section style={heroStyle}>
        <div style={heroInnerStyle}>
          <div style={{ maxWidth: 760 }}>
            <span style={heroBadgeStyle}>Course matching made simple</span>
            <h1 style={heroTitleStyle}>Find the right Australian course for your goals</h1>
            <p style={heroTextStyle}>
              Compare study options around your career, budget, location and future plans. Start with a quick match and refine it whenever you’re ready.
            </p>
          </div>
          <div style={heroStatsStyle}>
            <div><strong>6</strong><span>demo courses</span></div>
            <div><strong>5</strong><span>demo universities</span></div>
            <div><strong>Live</strong><span>AUD conversion</span></div>
          </div>
        </div>
      </section>

      <main style={pageStyle}>
        <div style={topUtilityStyle}>
          <div style={{ color: "#5d6270", fontSize: 14 }}>
            {restoredProfile ? "✓ Your previous answers were restored" : "✓ Your answers save automatically in this browser"}
          </div>
          <button type="button" onClick={resetSavedProfile} style={clearButtonStyle}>Clear saved answers</button>
        </div>

        {stage === "quick-input" && (
          <div style={contentGridStyle}>
            <aside style={sidebarStyle}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>Your matching journey</div>
              {[
                ["1", "Quick Match", "Active"],
                ["2", "Quick Result", "Next"],
                ["3", "Detailed Match", "Optional"],
                ["4", "Migration View", "Optional"],
              ].map(([number, label, status], index) => (
                <div key={number} style={{ ...stepRowStyle, ...(index === 0 ? activeStepRowStyle : {}) }}>
                  <span style={{ ...stepNumberStyle, ...(index === 0 ? activeStepNumberStyle : {}) }}>{number}</span>
                  <div><strong>{label}</strong><div style={stepStatusStyle}>{status}</div></div>
                </div>
              ))}
              <div style={sidebarTipStyle}>
                <strong>Why Quick Match?</strong>
                <p style={{ margin: "6px 0 0" }}>It takes only a few details to create your first ranked shortlist.</p>
              </div>
            </aside>

            <section>
              <div style={{ marginBottom: 22 }}>
                <div style={sectionEyebrowStyle}>STEP 1 · QUICK MATCH</div>
                <h2 style={{ margin: "7px 0 6px", fontSize: 31 }}>Tell us what matters to you</h2>
                <p style={{ margin: 0, color: "#626877", fontSize: 16 }}>You can change these answers later. Nothing here locks you into a choice.</p>
              </div>

              <div style={questionCardStyle}>
                <h3 style={questionTitleStyle}>Your study goal</h3>
                <p style={questionHelpStyle}>Tell us about your current education and the career you want to work towards.</p>
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
                </div>
              </div>

              <div style={questionCardStyle}>
                <h3 style={questionTitleStyle}>Your tuition budget</h3>
                <p style={questionHelpStyle}>Enter the amount in your own currency. UniPath converts it to AUD using the latest available daily rate.</p>
                <div style={{ maxWidth: 540 }}>
                  <CurrencyBudgetInput
                    label="Annual tuition budget"
                    audCents={profile.annualTuitionBudgetCents}
                    onAudCentsChange={(annualTuitionBudgetCents) => setProfile((current) => ({ ...current, annualTuitionBudgetCents }))}
                  />
                </div>
              </div>

              <div style={questionCardStyle}>
                <h3 style={questionTitleStyle}>Where would you like to study?</h3>
                <p style={questionHelpStyle}>Select as many states as you like. Leaving more options open can improve your matches.</p>
                <div style={{ fontWeight: 750, marginBottom: 10 }}>Preferred state(s)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                  {states.map((state) => {
                    const selected = profile.preferredStates.includes(state);
                    return (
                      <button key={state} type="button" onClick={() => updateState(state)} aria-pressed={selected} style={{ ...statePillStyle, ...(selected ? selectedStatePillStyle : {}) }}>
                        {selected ? "✓ " : ""}{state}
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginTop: 22, fontWeight: 750, marginBottom: 10 }}>Open to regional study?</div>
                <div style={{ display: "flex", gap: 9 }}>
                  <button type="button" onClick={() => setProfile({ ...profile, regionalAccepted: true })} style={{ ...choicePillStyle, ...(profile.regionalAccepted ? selectedChoicePillStyle : {}) }}>Yes</button>
                  <button type="button" onClick={() => setProfile({ ...profile, regionalAccepted: false })} style={{ ...choicePillStyle, ...(!profile.regionalAccepted ? selectedChoicePillStyle : {}) }}>No</button>
                </div>
              </div>

              <div style={actionPanelStyle}>
                <div>
                  <strong style={{ display: "block", fontSize: 18 }}>Ready to see your matches?</strong>
                  <span style={{ color: "#656b78" }}>You’ll get ranked courses, universities, state fit and affordability.</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setProfile((current) => ({ ...current, mode: "quick", migrationImportance: "none" })); setResultSource("quick"); setStage("quick-result"); }}
                  style={ctaButtonStyle}
                >
                  Show my matches →
                </button>
              </div>
            </section>
          </div>
        )}

        {stage === "quick-result" && (
          <>
            <section style={resultSectionStyle}>
              <div style={sectionEyebrowStyle}>STEP 2 · QUICK RESULT</div>
              <h2 style={{ margin: "7px 0 6px", fontSize: 31 }}>Your best course matches</h2>
              <p style={{ margin: "0 0 20px", color: "#626877" }}>Ranked using your current education, career goal, budget and location preferences.</p>
              <ResultCards />
            </section>
            <section style={secondaryPanelStyle}>
              <h2 style={{ marginTop: 0 }}>Want a more detailed result?</h2>
              <p>We’ll keep your current answers and only ask for the extra details needed to improve your recommendation.</p>
              <div style={buttonRowStyle}>
                <button type="button" onClick={() => setStage("detailed-input")} style={primaryButtonStyle}>Improve my result</button>
                <button type="button" onClick={() => setResultSource("quick")} style={secondaryButtonStyle}>Keep Quick Result</button>
              </div>
            </section>
            <MigrationPrompt onContinue={() => setStage("migration-result")} migrationChoice={migrationChoice} setMigrationChoice={setMigrationChoice} source="Quick Result" />
          </>
        )}

        {stage === "detailed-input" && (
          <section style={resultSectionStyle}>
            <div style={sectionEyebrowStyle}>STEP 3 · DETAILED MATCH</div>
            <h2 style={{ margin: "7px 0 6px", fontSize: 31 }}>Improve your recommendation</h2>
            <p style={{ color: "#626877" }}>Your Quick Match answers are retained. Add a little more information below.</p>
            <div style={{ ...formGridStyle, marginTop: 22 }}>
              <CurrencyBudgetInput label="Total funds available" audCents={profile.totalFundsCents} onAudCentsChange={(totalFundsCents) => setProfile((current) => ({ ...current, totalFundsCents }))} />
              <label style={labelStyle}>Years of relevant experience
                <input type="number" min={0} max={40} step={0.5} value={profile.yearsExperience ?? 0} onChange={(e) => setProfile({ ...profile, yearsExperience: Number(e.target.value) })} style={inputStyle} />
              </label>
              <label style={labelStyle}>Skills
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
              <button type="button" onClick={() => { setProfile((current) => ({ ...current, mode: "detailed", migrationImportance: "none" })); setResultSource("detailed"); setStage("detailed-result"); }} style={primaryButtonStyle}>Show detailed matches</button>
              <button type="button" onClick={() => setStage("quick-result")} style={secondaryButtonStyle}>Back</button>
            </div>
          </section>
        )}

        {stage === "detailed-result" && (
          <>
            <section style={resultSectionStyle}>
              <div style={sectionEyebrowStyle}>DETAILED RESULT</div>
              <h2 style={{ margin: "7px 0 6px", fontSize: 31 }}>Your refined matches</h2>
              <p style={{ margin: "0 0 20px", color: "#626877" }}>These rankings now include your additional profile information.</p>
              <ResultCards />
            </section>
            <MigrationPrompt onContinue={() => setStage("migration-result")} migrationChoice={migrationChoice} setMigrationChoice={setMigrationChoice} source="Detailed Result" />
          </>
        )}

        {stage === "migration-result" && (
          <section style={resultSectionStyle}>
            <div style={sectionEyebrowStyle}>OPTIONAL MIGRATION VIEW</div>
            <h2 style={{ margin: "7px 0 6px", fontSize: 31 }}>Original vs migration-aware matches</h2>
            <p style={{ color: "#626877" }}>Your original result stays unchanged. Migration-aware ranking is shown separately.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginTop: 22 }}>
              <div><h3>Original recommendation</h3><ResultCards /></div>
              <div><h3>Migration-aware recommendation</h3><ResultCards migration /></div>
            </div>
            <div style={warningStyle}>Migration values on this local page are DEMO scoring fixtures only. They are not current Australian migration rules, legal advice or a PR guarantee.</div>
            <div style={buttonRowStyle}>
              <button type="button" onClick={() => setStage(resultSource === "quick" ? "quick-result" : "detailed-result")} style={secondaryButtonStyle}>Back to result</button>
              <button type="button" onClick={resetSavedProfile} style={primaryButtonStyle}>Start again</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function MigrationPrompt({ onContinue, migrationChoice, setMigrationChoice, source }: { onContinue: () => void; migrationChoice: MigrationImportance; setMigrationChoice: (value: MigrationImportance) => void; source: string; }) {
  return (
    <section style={secondaryPanelStyle}>
      <div style={sectionEyebrowStyle}>OPTIONAL · MIGRATION PATHWAYS</div>
      <h2 style={{ margin: "7px 0 8px" }}>Would you like migration pathways considered too?</h2>
      <p style={{ color: "#626877" }}>We’ll keep your {source} unchanged and create a separate migration-aware comparison.</p>
      <div style={{ maxWidth: 520, marginTop: 16 }}>
        <label style={labelStyle}>How important is this to you?
          <select value={migrationChoice} onChange={(e) => setMigrationChoice(e.target.value as MigrationImportance)} style={inputStyle}>
            <option value="consider">Consider it, but keep course and career quality important</option>
            <option value="high">Very important</option>
            <option value="none">Not important</option>
          </select>
        </label>
      </div>
      {migrationChoice !== "none" && <button type="button" onClick={onContinue} style={{ ...primaryButtonStyle, marginTop: 18 }}>Show migration-aware comparison</button>}
    </section>
  );
}

const siteHeaderStyle = { borderBottom: "1px solid #e4e4ea", background: "#fff", position: "sticky", top: 0, zIndex: 10 } as const;
const navInnerStyle = { maxWidth: 1180, margin: "0 auto", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20 } as const;
const brandStyle = { display: "flex", gap: 10, alignItems: "center", color: "#172033", textDecoration: "none", fontWeight: 850, fontSize: 18 } as const;
const brandMarkStyle = { width: 34, height: 34, borderRadius: 10, background: "#3557b7", color: "#fff", display: "grid", placeItems: "center", fontWeight: 900 } as const;
const navLinksStyle = { display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" } as const;
const navLinkStyle = { color: "#32394b", textDecoration: "none", fontSize: 14, fontWeight: 700 } as const;
const heroStyle = { background: "#3d5db5", color: "#fff" } as const;
const heroInnerStyle = { maxWidth: 1180, margin: "0 auto", padding: "48px 20px 44px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 34, alignItems: "end" } as const;
const heroBadgeStyle = { display: "inline-block", padding: "7px 11px", borderRadius: 999, background: "rgba(255,255,255,0.16)", fontSize: 13, fontWeight: 800 } as const;
const heroTitleStyle = { margin: "16px 0 12px", maxWidth: 740, fontSize: 44, lineHeight: 1.08, letterSpacing: -0.7 } as const;
const heroTextStyle = { margin: 0, maxWidth: 720, fontSize: 18, lineHeight: 1.6, color: "rgba(255,255,255,0.9)" } as const;
const heroStatsStyle = { display: "grid", gridTemplateColumns: "repeat(3, minmax(90px, 1fr))", gap: 1, borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,0.2)" } as const;
const pageStyle = { maxWidth: 1180, margin: "0 auto", padding: "24px 20px 70px" } as const;
const topUtilityStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 22, paddingBottom: 18, borderBottom: "1px solid #ececf1" } as const;
const clearButtonStyle = { border: 0, background: "transparent", color: "#3557b7", fontWeight: 750, cursor: "pointer" } as const;
const contentGridStyle = { display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", gap: 34, alignItems: "start" } as const;
const sidebarStyle = { border: "1px solid #e1e2e8", borderRadius: 14, padding: 16, position: "sticky", top: 82, background: "#fff" } as const;
const stepRowStyle = { display: "flex", gap: 11, alignItems: "center", padding: "11px 8px", borderRadius: 10, color: "#686e7b" } as const;
const activeStepRowStyle = { background: "#f1f4ff", color: "#1e2a4a" } as const;
const stepNumberStyle = { width: 28, height: 28, borderRadius: 999, display: "grid", placeItems: "center", background: "#eff0f3", fontWeight: 800, fontSize: 13, flex: "0 0 auto" } as const;
const activeStepNumberStyle = { background: "#3557b7", color: "#fff" } as const;
const stepStatusStyle = { fontSize: 12, marginTop: 2, fontWeight: 500 } as const;
const sidebarTipStyle = { marginTop: 16, padding: 13, borderRadius: 10, background: "#f8f8fb", color: "#555c6b", fontSize: 13, lineHeight: 1.45 } as const;
const sectionEyebrowStyle = { color: "#3557b7", fontSize: 13, fontWeight: 850, letterSpacing: 0.4 } as const;
const questionCardStyle = { borderTop: "1px solid #e8e8ee", padding: "24px 0" } as const;
const questionTitleStyle = { margin: 0, fontSize: 21 } as const;
const questionHelpStyle = { margin: "6px 0 17px", color: "#687080", lineHeight: 1.5 } as const;
const formGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 } as const;
const labelStyle = { display: "grid", gap: 7, fontWeight: 750, color: "#252c3d" } as const;
const inputStyle = { width: "100%", border: "1px solid #cfd2da", borderRadius: 8, padding: "12px 12px", fontSize: 15, background: "#fff", color: "#202633" } as const;
const statePillStyle = { border: "1px solid #cfd2da", background: "#fff", color: "#303747", borderRadius: 8, padding: "10px 14px", fontWeight: 750, cursor: "pointer" } as const;
const selectedStatePillStyle = { background: "#eaf0ff", color: "#24449c", borderColor: "#6681ce" } as const;
const choicePillStyle = { border: "1px solid #cfd2da", background: "#fff", borderRadius: 8, padding: "10px 20px", fontWeight: 750, cursor: "pointer" } as const;
const selectedChoicePillStyle = { background: "#eaf0ff", borderColor: "#6681ce", color: "#24449c" } as const;
const actionPanelStyle = { marginTop: 12, padding: 20, borderRadius: 12, background: "#f4f6fb", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap" } as const;
const ctaButtonStyle = { border: 0, borderRadius: 8, background: "#e52c58", color: "#fff", padding: "13px 19px", fontSize: 16, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" } as const;
const resultSectionStyle = { maxWidth: 900, margin: "0 auto", padding: "18px 0 0" } as const;
const resultCardStyle = { border: "1px solid #dedfe5", borderRadius: 12, padding: 20, background: "#fff" } as const;
const resultEyebrowStyle = { color: "#3557b7", fontSize: 13, fontWeight: 850 } as const;
const scoreBubbleStyle = { minWidth: 64, height: 64, borderRadius: 999, background: "#eef2ff", color: "#2746a0", display: "grid", placeItems: "center", fontSize: 20, fontWeight: 900 } as const;
const scoreGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, margin: "16px 0", color: "#5d6473", fontSize: 14 } as const;
const textLinkStyle = { color: "#3557b7", fontWeight: 800, textDecoration: "none" } as const;
const secondaryPanelStyle = { maxWidth: 900, margin: "18px auto 0", border: "1px solid #e0e1e7", borderRadius: 12, padding: 20, background: "#fafafd" } as const;
const buttonRowStyle = { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 } as const;
const primaryButtonStyle = { border: 0, borderRadius: 8, background: "#3557b7", color: "#fff", padding: "11px 16px", fontWeight: 800, cursor: "pointer" } as const;
const secondaryButtonStyle = { border: "1px solid #cfd2da", borderRadius: 8, background: "#fff", color: "#282f40", padding: "11px 16px", fontWeight: 800, cursor: "pointer" } as const;
const warningStyle = { marginTop: 18, padding: 14, borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" } as const;
