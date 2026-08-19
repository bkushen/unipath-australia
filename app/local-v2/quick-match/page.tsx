"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CurrencyBudgetInput } from "@/components/local-v2/CurrencyBudgetInput";
import { SearchableDatabaseSelect, type SearchOption } from "@/components/local-v2/SearchableDatabaseSelect";
import { clearLocalV2Profile, loadLocalV2Profile, saveLocalV2Profile } from "@/lib/local-v2/profile-storage";
import type { AustralianState, MigrationImportance, ScholarshipImportance, StudentDecisionProfile } from "@/lib/local-v2/types";

const states: AustralianState[] = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"];
const money = (value: number | null | undefined, currency = "AUD") => value == null ? "Not loaded" : new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

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
  preferredSuburbId: "",
  transportPreference: "either",
  dependants: 0,
};

type Stage = "input" | "result" | "detailed" | "detailed-result" | "migration-result";
type QuickStep = 1 | 2 | 3 | 4;
type LiveRecommendation = {
  course: { id: string; name: string; qualificationLevel: string | null; cricosCode: string | null; durationMonths: number | null; annualFee: number | null; totalFee: number | null; currency: string; deliveryMode: string | null; officialCourseUrl: string | null; studyField: string | null };
  university: { id: string; name: string; website: string | null; logoUrl: string | null; cricosCode: string | null };
  campus: { id: string; name: string; city: string | null; state: string | null; postcode: string | null; regional: boolean; regional_verified: boolean | null; regional_classification: string | null };
  scholarship: { id: string; name: string; percentage: number | null; amount: number | null } | null;
  livingCost: { weeklyLow: number; weeklyHigh: number; monthlyEstimate: number; status: string | null } | null;
  scores: { academic: number; career: number; affordability: number; location: number; migration: number; overall: number };
  reasons: string[];
};

export default function QuickMatchPage() {
  const [profile, setProfile] = useState<StudentDecisionProfile>(initialProfile);
  const [stage, setStage] = useState<Stage>("input");
  const [step, setStep] = useState<QuickStep>(1);
  const [results, setResults] = useState<LiveRecommendation[]>([]);
  const [migrationResults, setMigrationResults] = useState<LiveRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [migrationChoice, setMigrationChoice] = useState<MigrationImportance>("consider");
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const saved = loadLocalV2Profile();
    if (saved) setProfile({ ...initialProfile, ...saved });
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (storageReady) saveLocalV2Profile(profile);
  }, [profile, storageReady]);

  const updateState = (state: AustralianState) => setProfile((current) => ({
    ...current,
    preferredStates: current.preferredStates.includes(state) ? current.preferredStates.filter((item) => item !== state) : [...current.preferredStates, state],
  }));

  const selectLocation = (option: SearchOption) => {
    const state = option.state as AustralianState | undefined;
    setProfile((current) => ({ ...current, preferredLocation: option.value, preferredStates: state && states.includes(state) ? [state] : current.preferredStates }));
  };

  const loadRecommendations = async (migrationImportance: MigrationImportance, target: "standard" | "migration") => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        study: profile.preferredStudy ?? "",
        field: profile.qualificationField,
        occupation: profile.desiredOccupation,
        location: profile.preferredLocation ?? "",
        states: profile.preferredStates.join(","),
        regionalAccepted: String(profile.regionalAccepted),
        migrationImportance,
        scholarshipImportance: profile.scholarshipImportance ?? "prefer",
        semesterBudget: String((profile.semesterTuitionBudgetCents ?? profile.annualTuitionBudgetCents / 2) / 100),
        fullBudget: String((profile.fullCourseBudgetCents ?? profile.annualTuitionBudgetCents * 2) / 100),
      });
      const response = await fetch(`/api/local-v2/recommendations?${params.toString()}`);
      const data = await response.json() as { recommendations?: LiveRecommendation[]; detail?: string; error?: string };
      if (!response.ok) throw new Error(data.detail || data.error || "Unable to load recommendations.");
      if (target === "standard") setResults(data.recommendations ?? []);
      else setMigrationResults(data.recommendations ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const showQuickResult = async () => {
    setProfile((current) => ({ ...current, mode: "quick", migrationImportance: "none" }));
    await loadRecommendations("none", "standard");
    setStage("result");
  };

  const showDetailedResult = async () => {
    setProfile((current) => ({ ...current, mode: "detailed", migrationImportance: "none" }));
    await loadRecommendations("none", "standard");
    setStage("detailed-result");
  };

  const showMigrationResult = async () => {
    await loadRecommendations(migrationChoice, "migration");
    setStage("migration-result");
  };

  const reset = () => {
    clearLocalV2Profile();
    setProfile(initialProfile);
    setStage("input");
    setStep(1);
    setResults([]);
    setMigrationResults([]);
    setError("");
  };

  return (
    <main style={pageStyle}>
      <header style={{ marginBottom: 24 }}>
        <div style={topRowStyle}><span style={badgeStyle}>Quick Match · live database</span><button type="button" onClick={reset} style={ghostButtonStyle}>Clear saved answers</button></div>
        <h1 style={{ margin: "16px 0 8px", fontSize: 42 }}>What should I study in Australia?</h1>
        <p style={heroCopyStyle}>Get course, university and location matches using live Supabase course, campus, scholarship and living-cost records.</p>
      </header>

      {stage === "input" && <section style={shellStyle}>
        <div style={progressTextStyle}>Step {step} of 4</div>
        <div style={progressTrackStyle}><div style={{ ...progressFillStyle, width: `${step * 25}%` }} /></div>

        {step === 1 && <div style={panelStyle}><h2>Your education</h2><p style={mutedStyle}>Tell us your current study background.</p><div style={gridStyle}>
          <SearchableDatabaseSelect label="Highest qualification" type="qualification" value={profile.highestQualification} placeholder="Search qualification" onChange={(highestQualification) => setProfile((current) => ({ ...current, highestQualification }))} />
          <SearchableDatabaseSelect label="Previous study field" type="study_field" value={profile.qualificationField} placeholder="e.g. Information Technology" onChange={(qualificationField) => setProfile((current) => ({ ...current, qualificationField }))} />
        </div></div>}

        {step === 2 && <div style={panelStyle}><h2>Your future</h2><p style={mutedStyle}>Choose a career goal and optional preferred study area.</p><div style={gridStyle}>
          <SearchableDatabaseSelect label="Career goal" type="occupation" value={profile.desiredOccupation} placeholder="e.g. Software Engineer" onChange={(desiredOccupation) => setProfile((current) => ({ ...current, desiredOccupation }))} />
          <SearchableDatabaseSelect label="Preferred course or study area" type="course" value={profile.preferredStudy ?? ""} placeholder="e.g. Cyber Security" onChange={(preferredStudy) => setProfile((current) => ({ ...current, preferredStudy }))} />
        </div></div>}

        {step === 3 && <div style={panelStyle}><h2>Your budget</h2><p style={mutedStyle}>Enter the amount you can comfortably spend.</p><div style={gridStyle}>
          <CurrencyBudgetInput label="Budget for one semester" audCents={profile.semesterTuitionBudgetCents ?? profile.annualTuitionBudgetCents / 2} onAudCentsChange={(semesterTuitionBudgetCents) => setProfile((current) => ({ ...current, semesterTuitionBudgetCents, annualTuitionBudgetCents: semesterTuitionBudgetCents * 2 }))} />
          <CurrencyBudgetInput label="Maximum full course budget" audCents={profile.fullCourseBudgetCents ?? profile.annualTuitionBudgetCents * 2} onAudCentsChange={(fullCourseBudgetCents) => setProfile((current) => ({ ...current, fullCourseBudgetCents }))} />
        </div><div style={{ marginTop: 20 }}><strong>Scholarship importance</strong><div style={pillRowStyle}>{([['high','Very important'],['prefer','Prefer if available'],['none','Not important']] as [ScholarshipImportance,string][]).map(([value,label]) => <button key={value} type="button" onClick={() => setProfile((current) => ({ ...current, scholarshipImportance: value }))} style={{ ...pillStyle, ...((profile.scholarshipImportance ?? "prefer") === value ? selectedPillStyle : {}) }}>{label}</button>)}</div></div></div>}

        {step === 4 && <div style={panelStyle}><h2>Your location</h2><p style={mutedStyle}>Location, regional status and source-dated living costs now feed directly into ranking.</p>
          <SearchableDatabaseSelect label="Preferred location" type="location" value={profile.preferredLocation ?? ""} placeholder="e.g. Melbourne, Ballarat, Sydney" onChange={(preferredLocation) => setProfile((current) => ({ ...current, preferredLocation }))} onSelect={selectLocation} />
          <div style={{ marginTop: 20 }}><strong>Preferred state(s)</strong><div style={pillRowStyle}>{states.map((state) => <button key={state} type="button" onClick={() => updateState(state)} style={{ ...pillStyle, ...(profile.preferredStates.includes(state) ? selectedPillStyle : {}) }}>{state}</button>)}</div></div>
          <div style={{ marginTop: 20 }}><strong>Open to regional Australia?</strong><div style={pillRowStyle}><button type="button" onClick={() => setProfile((current) => ({ ...current, regionalAccepted: true }))} style={{ ...pillStyle, ...(profile.regionalAccepted ? selectedPillStyle : {}) }}>Yes</button><button type="button" onClick={() => setProfile((current) => ({ ...current, regionalAccepted: false }))} style={{ ...pillStyle, ...(!profile.regionalAccepted ? selectedPillStyle : {}) }}>No</button></div></div>
        </div>}

        <div style={footerStyle}><button type="button" disabled={step === 1} onClick={() => setStep((Math.max(1, step - 1)) as QuickStep)} style={secondaryButtonStyle}>← Back</button>{step < 4 ? <button type="button" onClick={() => setStep((step + 1) as QuickStep)} style={primaryButtonStyle}>Continue →</button> : <button type="button" onClick={showQuickResult} style={primaryButtonStyle}>Show My Matches →</button>}</div>
      </section>}

      {(stage === "result" || stage === "detailed-result") && <>
        <section style={sectionStyle}><div style={eyebrowStyle}>LIVE RESULT</div><h2>Your best matches</h2><p style={mutedStyle}>These rankings use current UniPath production records. Missing fee, scholarship or living-cost fields are not invented.</p>{loading ? <p>Calculating live matches…</p> : error ? <ErrorBox text={error} /> : <ResultCards results={results} />}</section>
        {stage === "result" && <section style={{ ...sectionStyle, marginTop: 16 }}><h2>Want a more detailed result?</h2><p style={mutedStyle}>Add funds, experience, skills, dependants and transport preferences without losing your Quick Match answers.</p><button type="button" onClick={() => setStage("detailed")} style={primaryButtonStyle}>Continue to Detailed Assessment</button></section>}
        <MigrationPrompt choice={migrationChoice} setChoice={setMigrationChoice} onContinue={showMigrationResult} />
      </>}

      {stage === "detailed" && <section style={sectionStyle}><div style={eyebrowStyle}>DETAILED ASSESSMENT</div><h2>Add more information</h2><div style={gridStyle}>
        <CurrencyBudgetInput label="Total funds available" audCents={profile.totalFundsCents} onAudCentsChange={(totalFundsCents) => setProfile((current) => ({ ...current, totalFundsCents }))} />
        <label style={labelStyle}>Years of relevant experience<input type="number" min={0} max={40} step={0.5} value={profile.yearsExperience ?? 0} onChange={(e) => setProfile((current) => ({ ...current, yearsExperience: Number(e.target.value) }))} style={inputStyle} /></label>
        <label style={labelStyle}>Skills<input value={(profile.skills ?? []).join(", ")} onChange={(e) => setProfile((current) => ({ ...current, skills: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) }))} style={inputStyle} /></label>
        <label style={labelStyle}>Dependants<input type="number" min={0} max={10} value={profile.dependants ?? 0} onChange={(e) => setProfile((current) => ({ ...current, dependants: Number(e.target.value) }))} style={inputStyle} /></label>
        <label style={labelStyle}>Transport preference<select value={profile.transportPreference} onChange={(e) => setProfile((current) => ({ ...current, transportPreference: e.target.value as StudentDecisionProfile["transportPreference"] }))} style={inputStyle}><option value="either">Either</option><option value="car">Car</option><option value="public_transport">Public transport</option></select></label>
      </div><div style={footerStyle}><button type="button" onClick={() => setStage("result")} style={secondaryButtonStyle}>Back</button><button type="button" onClick={showDetailedResult} style={primaryButtonStyle}>Get Detailed Result</button></div></section>}

      {stage === "migration-result" && <section style={sectionStyle}><div style={eyebrowStyle}>MIGRATION-AWARE COMPARISON</div><h2>Migration-aware ranking</h2><p style={mutedStyle}>This is a separate comparison. Course or occupation links never guarantee PR, skills assessment, visa eligibility or invitation.</p>{loading ? <p>Calculating migration-aware matches…</p> : error ? <ErrorBox text={error} /> : <ResultCards results={migrationResults} />}<div style={warningStyle}>Migration evidence is shown only where the production database has source-dated skilled-occupation links. Missing evidence receives no invented migration advantage.</div><div style={footerStyle}><button type="button" onClick={() => setStage("result")} style={secondaryButtonStyle}>Back to original result</button><Link href="/local-v2/migration" style={linkButtonStyle}>Open Migration Explorer</Link></div></section>}
    </main>
  );
}

function ResultCards({ results }: { results: LiveRecommendation[] }) {
  if (results.length === 0) return <div style={emptyStyle}>No live course records matched these preferences. Try a broader study area or location.</div>;
  return <div style={{ display: "grid", gap: 16, marginTop: 18 }}>{results.slice(0, 6).map((item, index) => <article key={item.course.id} style={cardStyle}>
    <div style={topRowStyle}><div><div style={rankStyle}>#{index + 1} {index === 0 ? "Best match" : "Alternative"}</div><h3 style={{ fontSize: 23, margin: "6px 0" }}>{item.course.name}</h3><div style={{ fontWeight: 800, color: "#0057b8" }}>{item.university.name}</div><div style={mutedStyle}>{item.campus.name}{item.campus.city ? ` · ${item.campus.city}` : ""}{item.campus.state ? `, ${item.campus.state}` : ""} {item.campus.regional ? "· Regional" : ""}</div></div><div style={scoreStyle}>{item.scores.overall}%</div></div>
    <div style={scoreGridStyle}><span>Academic <strong>{item.scores.academic}%</strong></span><span>Career <strong>{item.scores.career}%</strong></span><span>Budget <strong>{item.scores.affordability}%</strong></span><span>Location <strong>{item.scores.location}%</strong></span><span>Migration evidence <strong>{item.scores.migration}%</strong></span></div>
    <div style={feeGridStyle}><Info label="Annual tuition" value={money(item.course.annualFee, item.course.currency)} /><Info label="Total tuition" value={money(item.course.totalFee, item.course.currency)} /><Info label="Duration" value={item.course.durationMonths ? `${item.course.durationMonths} months` : "Not loaded"} /><Info label="Living cost" value={item.livingCost ? `${money(item.livingCost.weeklyLow)}–${money(item.livingCost.weeklyHigh)}/week` : "Not loaded"} /></div>
    {item.scholarship && <div style={successStyle}><strong>Linked scholarship:</strong> {item.scholarship.name} · {item.scholarship.percentage != null ? `${item.scholarship.percentage}%` : money(item.scholarship.amount)}</div>}
    {item.reasons.length > 0 && <div style={reasonStyle}><strong>Why it matches</strong><ul style={{ marginBottom: 0 }}>{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
    <div style={pillRowStyle}><Link href={`/local-v2/courses/${item.course.id}`} style={linkButtonStyle}>View course details</Link><Link href={`/local-v2/universities/${item.university.id}`} style={secondaryLinkStyle}>University profile</Link><Link href={`/local-v2/suburbs/${item.campus.id}`} style={secondaryLinkStyle}>Location & living costs</Link>{item.course.officialCourseUrl && <a href={item.course.officialCourseUrl} target="_blank" rel="noreferrer" style={secondaryLinkStyle}>Official course page ↗</a>}</div>
  </article>)}</div>;
}

function MigrationPrompt({ choice, setChoice, onContinue }: { choice: MigrationImportance; setChoice: (value: MigrationImportance) => void; onContinue: () => void }) {
  return <section style={{ ...sectionStyle, marginTop: 16 }}><div style={eyebrowStyle}>OPTIONAL · MIGRATION PATHWAYS</div><h2>Should potential migration pathways matter to your decision?</h2><p style={mutedStyle}>Your original recommendation stays unchanged. This creates a separate comparison.</p><div style={pillRowStyle}>{([['high','Very important'],['consider','Consider them'],['none','Not important']] as [MigrationImportance,string][]).map(([value,label]) => <button key={value} type="button" onClick={() => setChoice(value)} style={{ ...pillStyle, ...(choice === value ? selectedPillStyle : {}) }}>{label}</button>)}</div>{choice !== "none" && <button type="button" onClick={onContinue} style={{ ...primaryButtonStyle, marginTop: 14 }}>Show Migration-Aware Result</button>}</section>;
}

function Info({ label, value }: { label: string; value: string }) { return <div style={infoStyle}><div style={infoLabelStyle}>{label}</div><strong>{value}</strong></div>; }
function ErrorBox({ text }: { text: string }) { return <div style={errorStyle}>{text}</div>; }

const pageStyle = { maxWidth: 1180, margin: "0 auto", minHeight: "100vh", padding: "30px 20px 70px", background: "#0057b8", color: "#101828" } as const;
const heroCopyStyle = { color: "#eaf2ff", maxWidth: 820, fontSize: 17, lineHeight: 1.55 } as const;
const topRowStyle = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" } as const;
const badgeStyle = { display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff", color: "#0057b8", fontWeight: 850 } as const;
const ghostButtonStyle = { border: "1px solid rgba(255,255,255,.7)", background: "transparent", color: "#fff", borderRadius: 9, padding: "8px 11px", cursor: "pointer" } as const;
const shellStyle = { borderRadius: 22, background: "#fff", padding: 26, boxShadow: "0 14px 40px rgba(16,24,40,.16)" } as const;
const sectionStyle = { borderRadius: 20, background: "#fff", padding: 26, boxShadow: "0 10px 30px rgba(16,24,40,.1)" } as const;
const panelStyle = { padding: "22px 0" } as const;
const progressTextStyle = { fontWeight: 850, marginBottom: 8 } as const;
const progressTrackStyle = { height: 8, background: "#e9edf2", borderRadius: 999, overflow: "hidden" } as const;
const progressFillStyle = { height: "100%", background: "#d81b60", borderRadius: 999 } as const;
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 16 } as const;
const pillRowStyle = { display: "flex", gap: 9, flexWrap: "wrap", marginTop: 10 } as const;
const pillStyle = { border: "1px solid #cfd5df", background: "#fff", borderRadius: 9, padding: "9px 13px", fontWeight: 750, cursor: "pointer" } as const;
const selectedPillStyle = { background: "#eaf3ff", borderColor: "#73aaf5", color: "#004594" } as const;
const footerStyle = { display: "flex", justifyContent: "space-between", gap: 10, marginTop: 20, paddingTop: 18, borderTop: "1px solid #eaecf0", flexWrap: "wrap" } as const;
const primaryButtonStyle = { border: 0, borderRadius: 9, background: "#d81b60", color: "#fff", padding: "11px 16px", fontWeight: 850, cursor: "pointer" } as const;
const secondaryButtonStyle = { border: "1px solid #cfd5df", borderRadius: 9, background: "#fff", color: "#111827", padding: "11px 16px", fontWeight: 750, cursor: "pointer" } as const;
const mutedStyle = { color: "#667085", lineHeight: 1.55 } as const;
const eyebrowStyle = { color: "#475467", fontSize: 12, fontWeight: 850, letterSpacing: .8 } as const;
const cardStyle = { border: "1px solid #e1e6ed", borderRadius: 16, padding: 20, background: "#fbfcfe" } as const;
const rankStyle = { fontSize: 13, fontWeight: 850, color: "#475467" } as const;
const scoreStyle = { minWidth: 82, textAlign: "center", background: "#eaf3ff", color: "#0057b8", borderRadius: 14, padding: "10px 12px", fontSize: 26, fontWeight: 900 } as const;
const scoreGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginTop: 16 } as const;
const feeGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 14 } as const;
const infoStyle = { padding: 12, border: "1px solid #eaecf0", background: "#fff", borderRadius: 10 } as const;
const infoLabelStyle = { color: "#667085", fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 4 } as const;
const successStyle = { marginTop: 14, background: "#ecfdf3", color: "#027a48", borderRadius: 10, padding: 12 } as const;
const reasonStyle = { marginTop: 14, padding: 14, background: "#f5f8fb", borderRadius: 11, color: "#475467" } as const;
const linkButtonStyle = { display: "inline-block", padding: "9px 12px", borderRadius: 9, background: "#0057b8", color: "#fff", textDecoration: "none", fontWeight: 800 } as const;
const secondaryLinkStyle = { display: "inline-block", padding: "9px 12px", borderRadius: 9, border: "1px solid #d0d5dd", color: "#344054", textDecoration: "none", fontWeight: 750, background: "#fff" } as const;
const labelStyle = { display: "grid", gap: 7, fontWeight: 700 } as const;
const inputStyle = { width: "100%", border: "1px solid #cfd5df", borderRadius: 10, padding: "11px 12px", background: "#fff" } as const;
const warningStyle = { marginTop: 16, padding: 14, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", borderRadius: 11 } as const;
const errorStyle = { marginTop: 14, padding: 14, background: "#fff6f5", border: "1px solid #fecdca", color: "#b42318", borderRadius: 11 } as const;
const emptyStyle = { marginTop: 14, padding: 22, border: "1px dashed #cfd5df", borderRadius: 12, color: "#667085" } as const;
