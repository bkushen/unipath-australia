"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { BudgetAssessmentPanel } from "@/components/local-v2/BudgetAssessmentPanel";
import { CurrencyBudgetInput } from "@/components/local-v2/CurrencyBudgetInput";
import { SearchableDatabaseSelect, type SearchOption } from "@/components/local-v2/SearchableDatabaseSelect";
import { assessDetailedProfile, type DetailedAssessment } from "@/lib/local-v2/detailed-assessment";
import { assessLocation, type LocationAssessment } from "@/lib/local-v2/location-assessment";
import { assessScholarshipPreference, previousServerScholarshipAdjustment, type ScholarshipAssessment } from "@/lib/local-v2/scholarship-assessment";
import { clearLocalV2Profile, loadLocalV2Profile, saveLocalV2Profile } from "@/lib/local-v2/profile-storage";
import type { AustralianState, EnglishTestType, MigrationImportance, ScholarshipImportance, StudentDecisionProfile } from "@/lib/local-v2/types";

const states: AustralianState[] = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"];
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const money = (value: number | null | undefined, currency = "AUD") => value == null ? "Not loaded" : new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

const initialProfile: StudentDecisionProfile = {
  mode: "quick", age: undefined, highestQualification: "", qualificationField: "", academicScorePercent: undefined,
  englishTestType: "none", englishScore: undefined, desiredOccupation: "", preferredStudy: "", preferredLocation: "",
  annualTuitionBudgetCents: 0, semesterTuitionBudgetCents: 0, fullCourseBudgetCents: 0, scholarshipImportance: "none",
  totalFundsCents: 0, preferredStates: [], regionalAccepted: true, migrationImportance: "none", skills: [], yearsExperience: 0,
  preferredSuburbId: "", transportPreference: "either", dependants: 0,
};

type Stage = "input" | "result" | "detailed" | "detailed-result" | "migration-result";
type QuickStep = 1 | 2 | 3 | 4;
type EntryEvidence = { level: string; label: string; checkedFields: number; note: string };
type EntryRequirement = { source_url: string | null; verified_at: string | null };
type AIScore = {
  courseId: string; aiScore: number; eligibilityStatus: "likely_meets" | "needs_review" | "requirements_not_verified";
  confidence?: "high" | "medium" | "low"; entryEvidence?: EntryEvidence; detailedAssessment?: DetailedAssessment;
  scoreBreakdown?: { qualificationReadiness: number; eligibilityEvidence: number }; reasons: string[]; cautions: string[]; entryRequirement: EntryRequirement | null;
};
type FeeEvidence = { source: string; feeYear: number | null; derivedAnnual: boolean; sourceUrl: string | null; note: string };
type CareerMatch = { source: string; linkedOccupations: string[]; oscaOccupation: { code: string; name: string; sourceRelease: string | null } | null };
type LiveRecommendation = {
  course: { id: string; name: string; qualificationLevel: string | null; cricosCode: string | null; durationMonths: number | null; annualFee: number | null; totalFee: number | null; currency: string; deliveryMode: string | null; officialCourseUrl: string | null; studyField: string | null };
  feeEvidence?: FeeEvidence; careerMatch?: CareerMatch;
  university: { id: string; name: string; website: string | null };
  campus: { id: string; name: string; city: string | null; state: string | null; postcode: string | null; regional: boolean; regional_verified: boolean | null; regional_classification: string | null };
  scholarship: { id: string; name: string; percentage: number | null; amount: number | null } | null;
  scholarshipAssessment?: ScholarshipAssessment;
  livingCost: { weeklyLow: number; weeklyHigh: number; monthlyEstimate: number; status: string | null } | null;
  locationAssessment?: LocationAssessment;
  scores: { academic: number; career: number; affordability: number; location: number; migration: number; overall: number };
  ai?: AIScore;
};
type RequestSpec = { migrationImportance: MigrationImportance; target: "standard" | "migration"; detailedMode: boolean };
type ComparisonSetter = Dispatch<SetStateAction<string[]>> | (() => void);

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const preview = (await response.text()).replace(/\s+/g, " ").slice(0, 140);
    console.error("Quick Match API returned non-JSON", response.status, preview);
    throw new Error(response.status === 404 ? "Quick Match API was not found. Restart the development server after pulling the latest code." : fallback);
  }
  return await response.json() as T;
}

export default function QuickMatchPageClient() {
  const [profile, setProfile] = useState<StudentDecisionProfile>(initialProfile);
  const [stage, setStage] = useState<Stage>("input");
  const [step, setStep] = useState<QuickStep>(1);
  const [results, setResults] = useState<LiveRecommendation[]>([]);
  const [migrationResults, setMigrationResults] = useState<LiveRecommendation[]>([]);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [migrationChoice, setMigrationChoice] = useState<MigrationImportance>("consider");
  const [lastRequest, setLastRequest] = useState<RequestSpec | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => { const saved = loadLocalV2Profile(); if (saved) setProfile({ ...initialProfile, ...saved }); setStorageReady(true); }, []);
  useEffect(() => { if (storageReady) saveLocalV2Profile(profile); }, [profile, storageReady]);

  const semesterBudget = (profile.semesterTuitionBudgetCents ?? 0) / 100;
  const fullCourseBudget = (profile.fullCourseBudgetCents ?? 0) / 100;

  const validateStep = (s: QuickStep) => {
    if (s === 1) {
      if (profile.age == null || profile.age < 15 || profile.age > 100) return "Enter a valid age between 15 and 100.";
      if (!profile.highestQualification.trim()) return "Select your highest qualification.";
      if (!profile.qualificationField.trim()) return "Select your previous study field.";
      if (!profile.desiredOccupation.trim()) return "Select your career goal.";
    }
    if (s === 2) {
      if (semesterBudget <= 0) return "Enter your tuition budget for one semester.";
      if (fullCourseBudget <= 0) return "Enter your maximum full course budget.";
      if (fullCourseBudget < semesterBudget) return "Your full course budget should be at least as much as one semester budget.";
    }
    if (s === 3 && !profile.preferredLocation?.trim() && profile.preferredStates.length === 0) return "Choose a preferred location or at least one state.";
    return "";
  };

  const updateState = (state: AustralianState) => setProfile((c) => ({ ...c, preferredStates: c.preferredStates.includes(state) ? c.preferredStates.filter((x) => x !== state) : [...c.preferredStates, state] }));
  const selectLocation = (option: SearchOption) => { const state = option.state as AustralianState | undefined; setProfile((c) => ({ ...c, preferredLocation: option.value, preferredStates: state && states.includes(state) ? [state] : c.preferredStates })); };
  const editAnswers = (target: QuickStep) => { setEditing(true); setStage("input"); setStep(target); setError(""); setValidationError(""); };
  const reset = () => { clearLocalV2Profile(); setProfile(initialProfile); setStage("input"); setStep(1); setResults([]); setMigrationResults([]); setComparisonIds([]); setEditing(false); setError(""); setLastRequest(null); };

  const applyLocalEvidence = (items: LiveRecommendation[]) => items.map((item) => {
    const scholarship = assessScholarshipPreference(profile.scholarshipImportance ?? "none", item.scholarship);
    const oldScholarship = previousServerScholarshipAdjustment(profile.scholarshipImportance ?? "none", Boolean(item.scholarship));
    const location = assessLocation({
      preferredLocation: profile.preferredLocation, preferredStates: profile.preferredStates, regionalAccepted: profile.regionalAccepted,
      campus: { name: item.campus.name, city: item.campus.city, state: item.campus.state, regional: item.campus.regional, regionalVerified: item.campus.regional_verified, regionalClassification: item.campus.regional_classification },
      livingCost: item.livingCost ? { weeklyLow: item.livingCost.weeklyLow, weeklyHigh: item.livingCost.weeklyHigh, monthlyEstimate: item.livingCost.monthlyEstimate, verificationStatus: item.livingCost.status } : null,
    });
    const afterScholarship = item.scores.overall - oldScholarship + scholarship.adjustment;
    const overall = clamp(afterScholarship + (location.score - item.scores.location) * .20);
    return { ...item, scholarshipAssessment: scholarship, locationAssessment: location, scores: { ...item.scores, location: location.score, overall } };
  });

  const scoreItems = async (base: LiveRecommendation[], detailedMode: boolean, migrationImportance: MigrationImportance) => {
    if (!base.length) return base;
    const response = await fetch("/api/local-v2/ai-score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: {
      age: profile.age ?? null, highestQualification: profile.highestQualification, qualificationField: profile.qualificationField,
      englishTestType: profile.englishTestType ?? "none", englishScore: profile.englishScore ?? null, desiredOccupation: profile.desiredOccupation,
      preferredStudy: profile.preferredStudy ?? "", preferredLocation: profile.preferredLocation ?? "", preferredStates: profile.preferredStates,
      regionalAccepted: profile.regionalAccepted, semesterBudget, fullBudget: fullCourseBudget, scholarshipImportance: "none", migrationImportance,
    }, candidates: base }) });
    const data = await readJson<{ results?: AIScore[]; message?: string; error?: string; detail?: string }>(response, "Unable to calculate match scores right now.");
    if (!response.ok) throw new Error(data.detail || data.error || "Unable to calculate match scores right now.");
    setAiMessage(data.message ?? "UniPath used transparent evidence-aware scoring.");
    const map = new Map((data.results ?? []).map((x) => [x.courseId, x]));
    return base.map((item) => {
      const ai = map.get(item.course.id);
      if (!ai || !detailedMode) return { ...item, ai };
      const detailedAssessment = assessDetailedProfile({ baseScore: ai.aiScore, careerScore: item.scores.career, totalFunds: (profile.totalFundsCents ?? 0) / 100,
        totalFee: item.course.totalFee, annualFee: item.course.annualFee, dependants: profile.dependants ?? 0, yearsExperience: profile.yearsExperience ?? 0,
        skills: profile.skills ?? [], courseName: item.course.name, studyField: item.course.studyField, occupationName: profile.desiredOccupation });
      return { ...item, ai: { ...ai, aiScore: detailedAssessment.adjustedScore, detailedAssessment } };
    }).sort((a, b) => (b.ai?.aiScore ?? b.scores.overall) - (a.ai?.aiScore ?? a.scores.overall));
  };

  const loadRecommendations = async (spec: RequestSpec) => {
    setLastRequest(spec); setLoading(true); setError(""); setAiMessage("");
    try {
      const params = new URLSearchParams({ study: profile.preferredStudy ?? "", field: profile.qualificationField, occupation: profile.desiredOccupation,
        location: profile.preferredLocation ?? "", states: profile.preferredStates.join(","), regionalAccepted: String(profile.regionalAccepted),
        migrationImportance: spec.migrationImportance, scholarshipImportance: profile.scholarshipImportance ?? "none", semesterBudget: String(semesterBudget), fullBudget: String(fullCourseBudget) });
      const response = await fetch(`/api/local-v2/recommendations?${params}`);
      const data = await readJson<{ recommendations?: LiveRecommendation[]; error?: string; detail?: string }>(response, "Unable to load recommendations right now.");
      if (!response.ok) throw new Error(data.detail || data.error || "Unable to load recommendations right now.");
      const scored = await scoreItems(applyLocalEvidence(data.recommendations ?? []), spec.detailedMode, spec.migrationImportance);
      if (spec.target === "standard") { setResults(scored); setComparisonIds((ids) => ids.filter((id) => scored.some((x) => x.course.id === id))); }
      else setMigrationResults(scored);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load recommendations right now."); }
    finally { setLoading(false); }
  };

  const getResults = async () => { setEditing(false); setStage("result"); await loadRecommendations({ migrationImportance: "none", target: "standard", detailedMode: false }); };
  const getDetailed = async () => { setStage("detailed-result"); await loadRecommendations({ migrationImportance: "none", target: "standard", detailedMode: true }); };
  const getMigration = async () => { setStage("migration-result"); await loadRecommendations({ migrationImportance: migrationChoice, target: "migration", detailedMode: false }); };
  const retry = () => { if (lastRequest) void loadRecommendations(lastRequest); };

  return <main style={page}>
    <header style={{ marginBottom: 22 }}><div style={row}><span style={badge}>Quick Match · live database</span><button onClick={reset} style={ghost}>Clear saved answers</button></div><h1 style={{ color: "white", fontSize: 40, marginBottom: 8 }}>What should I study in Australia?</h1><p style={hero}>Compare career fit, qualification progression, tuition evidence, location and available entry evidence.</p></header>

    {stage === "input" && <section style={panel}>
      {editing && results.length > 0 && <div style={info}><strong>Editing saved answers.</strong> Your current results stay available until you recalculate. <button onClick={() => { setEditing(false); setStage("result"); }} style={smallButton}>Cancel editing</button></div>}
      <div style={{ fontWeight: 800 }}>Step {step} of 4</div><div style={track}><div style={{ ...fill, width: `${step * 25}%` }} /></div>
      {step === 1 && <div style={section}><h2>Background & career goal</h2><div style={grid}><label style={label}>Age<input style={input} type="number" min={15} max={100} value={profile.age ?? ""} onChange={(e) => setProfile((c) => ({ ...c, age: e.target.value ? Number(e.target.value) : undefined }))} /></label><SearchableDatabaseSelect label="Highest qualification" type="qualification" value={profile.highestQualification} onChange={(highestQualification) => setProfile((c) => ({ ...c, highestQualification }))} /><SearchableDatabaseSelect label="Previous study field" type="study_field" value={profile.qualificationField} onChange={(qualificationField) => setProfile((c) => ({ ...c, qualificationField }))} /><SearchableDatabaseSelect label="Career goal" type="occupation" value={profile.desiredOccupation} onChange={(desiredOccupation) => setProfile((c) => ({ ...c, desiredOccupation }))} /></div></div>}
      {step === 2 && <div style={section}><h2>Budget</h2><div style={grid}><CurrencyBudgetInput label="Budget for one semester" audCents={profile.semesterTuitionBudgetCents ?? 0} onAudCentsChange={(v) => setProfile((c) => ({ ...c, semesterTuitionBudgetCents: v, annualTuitionBudgetCents: v * 2 }))} /><CurrencyBudgetInput label="Maximum full course budget" audCents={profile.fullCourseBudgetCents ?? 0} onAudCentsChange={(v) => setProfile((c) => ({ ...c, fullCourseBudgetCents: v }))} /></div></div>}
      {step === 3 && <div style={section}><h2>Location</h2><SearchableDatabaseSelect label="Preferred location" type="location" value={profile.preferredLocation ?? ""} onChange={(preferredLocation) => setProfile((c) => ({ ...c, preferredLocation }))} onSelect={selectLocation} /><div style={pills}>{states.map((s) => <button key={s} onClick={() => updateState(s)} style={{ ...pill, ...(profile.preferredStates.includes(s) ? selected : {}) }}>{s}</button>)}</div><div style={pills}><button onClick={() => setProfile((c) => ({ ...c, regionalAccepted: true }))} style={{ ...pill, ...(profile.regionalAccepted ? selected : {}) }}>Regional OK</button><button onClick={() => setProfile((c) => ({ ...c, regionalAccepted: false }))} style={{ ...pill, ...(!profile.regionalAccepted ? selected : {}) }}>No regional</button></div></div>}
      {step === 4 && <div style={section}><h2>Optional details</h2><div style={grid}><SearchableDatabaseSelect label="Preferred study area" type="course" value={profile.preferredStudy ?? ""} onChange={(preferredStudy) => setProfile((c) => ({ ...c, preferredStudy }))} /><label style={label}>English test<select style={input} value={profile.englishTestType ?? "none"} onChange={(e) => setProfile((c) => ({ ...c, englishTestType: e.target.value as EnglishTestType, englishScore: e.target.value === "none" ? undefined : c.englishScore }))}><option value="none">Skip</option><option value="ielts">IELTS</option><option value="pte">PTE Academic</option></select></label>{profile.englishTestType !== "none" && <label style={label}>Overall score<input style={input} type="number" value={profile.englishScore ?? ""} onChange={(e) => setProfile((c) => ({ ...c, englishScore: e.target.value ? Number(e.target.value) : undefined }))} /></label>}</div><div style={pills}>{([["high","Very important"],["prefer","Prefer"],["none","No preference"]] as [ScholarshipImportance,string][]).map(([v,l]) => <button key={v} onClick={() => setProfile((c) => ({ ...c, scholarshipImportance: v }))} style={{ ...pill, ...(profile.scholarshipImportance === v ? selected : {}) }}>{l}</button>)}</div></div>}
      {validationError && <div style={errorBox} role="alert">{validationError}</div>}
      <div style={footer}><button disabled={step === 1} onClick={() => { setValidationError(""); setStep(Math.max(1, step - 1) as QuickStep); }} style={secondary}>← Back</button>{step < 4 ? <button onClick={() => { const issue = validateStep(step); if (issue) setValidationError(issue); else { setValidationError(""); setStep((step + 1) as QuickStep); } }} style={primary}>Continue →</button> : <button onClick={getResults} style={primary}>{editing ? "Recalculate Match Score →" : "Get Match Score →"}</button>}</div>
    </section>}

    {(stage === "result" || stage === "detailed-result") && <ResultSection title={stage === "detailed-result" ? "Your detailed best matches" : "Your best matches"} loading={loading} error={error} retry={retry} items={results} profile={profile} aiMessage={aiMessage} comparisonIds={comparisonIds} setComparisonIds={setComparisonIds} onEdit={editAnswers} semesterBudget={semesterBudget} fullCourseBudget={fullCourseBudget} />}
    {stage === "result" && !loading && !error && results.length > 0 && <section style={{ ...panel, marginTop: 16 }}><h2>Want a more detailed result?</h2><p style={muted}>Add funds, experience, skills and dependants.</p><button onClick={() => setStage("detailed")} style={primary}>Continue to Detailed Assessment</button></section>}
    {stage === "detailed" && <section style={panel}><h2>Detailed assessment</h2><div style={grid}><CurrencyBudgetInput label="Total funds available" audCents={profile.totalFundsCents} onAudCentsChange={(v) => setProfile((c) => ({ ...c, totalFundsCents: v }))} /><label style={label}>Years relevant experience<input style={input} type="number" min={0} value={profile.yearsExperience ?? 0} onChange={(e) => setProfile((c) => ({ ...c, yearsExperience: Number(e.target.value) }))} /></label><label style={label}>Skills<input style={input} value={(profile.skills ?? []).join(", ")} onChange={(e) => setProfile((c) => ({ ...c, skills: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }))} /></label><label style={label}>Dependants<input style={input} type="number" min={0} value={profile.dependants ?? 0} onChange={(e) => setProfile((c) => ({ ...c, dependants: Number(e.target.value) }))} /></label></div><div style={footer}><button onClick={() => setStage("result")} style={secondary}>Back</button><button onClick={getDetailed} style={primary}>Recalculate Match Score</button></div></section>}
    {(stage === "result" || stage === "detailed-result") && !loading && !error && results.length > 0 && <MigrationPrompt choice={migrationChoice} setChoice={setMigrationChoice} onContinue={getMigration} />}
    {stage === "migration-result" && <ResultSection title="Migration-aware ranking" loading={loading} error={error} retry={retry} items={migrationResults} profile={profile} aiMessage={aiMessage} comparisonIds={[]} setComparisonIds={() => undefined} onEdit={() => setStage("result")} semesterBudget={semesterBudget} fullCourseBudget={fullCourseBudget} migration />}
  </main>;
}

function ResultSection({ title, loading: isLoading, error, retry, items, profile, aiMessage, comparisonIds, setComparisonIds, onEdit, semesterBudget, fullCourseBudget, migration = false }: { title: string; loading: boolean; error: string; retry: () => void; items: LiveRecommendation[]; profile: StudentDecisionProfile; aiMessage: string; comparisonIds: string[]; setComparisonIds: ComparisonSetter; onEdit: (step: QuickStep) => void; semesterBudget: number; fullCourseBudget: number; migration?: boolean }) {
  if (isLoading) return <section style={panel}><Loading /></section>;
  return <section style={panel}><div style={row}><div><div style={eyebrow}>{migration ? "MIGRATION-AWARE COMPARISON" : "SMART-SCORED LIVE RESULT"}</div><h2 style={{ marginBottom: 4 }}>{title}</h2></div>{!migration && <button onClick={() => onEdit(1)} style={secondary}>Edit answers</button>}</div>
    {migration && <p style={muted}>Migration evidence stays separate from the original result and does not guarantee PR, visa eligibility, invitation or skills assessment.</p>}
    {!migration && <div style={pills}><button onClick={() => onEdit(1)} style={smallButton}>Background & career</button><button onClick={() => onEdit(2)} style={smallButton}>Budget</button><button onClick={() => onEdit(3)} style={smallButton}>Location</button><button onClick={() => onEdit(4)} style={smallButton}>Optional details</button></div>}
    {aiMessage && <div style={info}>{aiMessage}</div>}
    {error ? <StatePanel title="We couldn't load your recommendations" text={error} primaryLabel="Retry" onPrimary={retry} secondaryLabel="Edit answers" onSecondary={() => onEdit(1)} danger /> : items.length === 0 ? <StatePanel title="No suitable matches found" text="UniPath did not find a live course record that fits this combination of career, study and location filters. Broaden one preference rather than treating this as a negative eligibility decision." primaryLabel="Try again" onPrimary={retry} secondaryLabel="Broaden location" onSecondary={() => onEdit(3)} /> : <ResultCards items={items} highestQualification={profile.highestQualification} comparisonIds={comparisonIds} setComparisonIds={setComparisonIds} semesterBudget={semesterBudget} fullCourseBudget={fullCourseBudget} />}
    {migration && <div style={footer}><button onClick={() => onEdit(1)} style={secondary}>Back to original result</button><Link href="/local-v2/migration" style={linkButton}>Open Migration Explorer</Link></div>}
  </section>;
}

function StatePanel({ title, text, primaryLabel, onPrimary, secondaryLabel, onSecondary, danger = false }: { title: string; text: string; primaryLabel: string; onPrimary: () => void; secondaryLabel: string; onSecondary: () => void; danger?: boolean }) { return <div role={danger ? "alert" : "status"} style={{ ...statePanel, ...(danger ? { borderColor: "#fecdca", background: "#fff6f5" } : {}) }}><h3 style={{ marginTop: 0 }}>{title}</h3><p style={muted}>{text}</p><div style={pills}><button onClick={onPrimary} style={primary}>{primaryLabel}</button><button onClick={onSecondary} style={secondary}>{secondaryLabel}</button></div></div>; }
function Loading() { return <div role="status" aria-live="polite" aria-busy="true" style={loadingStyle}><div style={spinner} /><div><strong>Finding your best matches…</strong><div style={muted}>Checking live courses, career alignment, tuition, location and available evidence.</div></div></div>; }

function ResultCards({ items, highestQualification, comparisonIds, setComparisonIds, semesterBudget, fullCourseBudget }: { items: LiveRecommendation[]; highestQualification: string; comparisonIds: string[]; setComparisonIds: ComparisonSetter; semesterBudget: number; fullCourseBudget: number }) {
  const selectedItems = useMemo(() => items.filter((x) => comparisonIds.includes(x.course.id)).slice(0, 3), [items, comparisonIds]);
  const toggle = (id: string) => { (setComparisonIds as Dispatch<SetStateAction<string[]>>)((current) => current.includes(id) ? current.filter((x) => x !== id) : current.length >= 3 ? current : [...current, id]); };
  return <div style={{ marginTop: 16 }}><div style={info}><strong>Compare courses:</strong> select up to 3 recommendations. {comparisonIds.length}/3 selected.</div><div style={{ display: "grid", gap: 16, marginTop: 14 }}>{items.slice(0, 8).map((item, index) => { const scoreValue = item.ai?.aiScore ?? item.scores.overall; const selectedForCompare = comparisonIds.includes(item.course.id); return <article key={item.course.id} style={{ ...card, ...(selectedForCompare ? { borderColor: "#73aaf5", borderWidth: 2 } : {}) }}><div style={row}><div><div style={eyebrow}>#{index + 1} {index === 0 ? "BEST MATCH" : "ALTERNATIVE"}</div><h3 style={{ margin: "6px 0" }}>{item.course.name}</h3><strong style={{ color: "#0057b8" }}>{item.university.name}</strong><div style={muted}>{item.campus.name}{item.campus.city ? ` · ${item.campus.city}` : ""}{item.campus.state ? `, ${item.campus.state}` : ""}</div></div><div style={score}>{scoreValue}%</div></div>
        <button onClick={() => toggle(item.course.id)} disabled={!selectedForCompare && comparisonIds.length >= 3} style={smallButton}>{selectedForCompare ? "✓ Selected for comparison" : "+ Add to comparison"}</button>
        <div style={scoreGrid}><Metric label="Course relevance" value={`${item.scores.academic}%`} /><Metric label="Career" value={`${item.scores.career}%`} /><Metric label="Budget" value={`${item.scores.affordability}%`} /><Metric label="Location" value={`${item.scores.location}%`} /><Metric label="Qualification" value={item.ai?.scoreBreakdown ? `${item.ai.scoreBreakdown.qualificationReadiness}%` : "Not assessed"} /></div>
        {item.locationAssessment && <Evidence title="Location & living costs" badge={`${item.locationAssessment.score}% fit`} text={`${item.livingCost ? `${money(item.livingCost.weeklyLow)}–${money(item.livingCost.weeklyHigh)}/week. ` : "Living cost not loaded. "}${item.locationAssessment.note}`} />}
        {item.scholarshipAssessment && <Evidence title="Scholarship evidence" badge={item.scholarshipAssessment.label} text={item.scholarshipAssessment.note} />}
        <Evidence title="Entry requirement evidence" badge={item.ai?.entryEvidence?.label ?? "Requirements not loaded"} text={`${item.ai?.entryEvidence?.note ?? "No course-specific entry requirement record is loaded."} This is not an admission decision.`} />
        <Evidence title="Qualification progression" badge={item.ai?.scoreBreakdown ? `${item.ai.scoreBreakdown.qualificationReadiness}%` : "Not assessed"} text={`${highestQualification || "Not entered"} → ${item.course.qualificationLevel || "Course level not loaded"}. This is progression guidance only, not proof of admission or credit.`} />
        <Evidence title="Career evidence" badge={item.careerMatch?.source === "explicit_mapping" ? "Explicit mapping" : item.careerMatch?.oscaOccupation ? "OSCA-informed inference" : "Text inference"} text={item.careerMatch?.oscaOccupation ? `${item.careerMatch.oscaOccupation.name} · OSCA ${item.careerMatch.oscaOccupation.code}. OSCA identifies occupations; it does not recommend this course.` : "Career relevance is inferred from available UniPath data and is not an employment or registration guarantee."} />
        <div style={scoreGrid}><Metric label="Annual tuition" value={money(item.course.annualFee, item.course.currency)} /><Metric label="Total tuition" value={money(item.course.totalFee, item.course.currency)} /><Metric label="Duration" value={item.course.durationMonths ? `${item.course.durationMonths} months` : "Not loaded"} /></div>
        <BudgetAssessmentPanel semesterBudget={semesterBudget} fullCourseBudget={fullCourseBudget} annualFee={item.course.annualFee} totalFee={item.course.totalFee} durationMonths={item.course.durationMonths} currency={item.course.currency} feeSource={item.feeEvidence?.source} derivedAnnual={item.feeEvidence?.derivedAnnual} />
        {item.ai && <div style={info}><strong>Why this score</strong>{item.ai.reasons.length > 0 && <ul>{item.ai.reasons.map((x) => <li key={x}>{x}</li>)}</ul>}{item.ai.cautions.length > 0 && <><strong>Check before applying</strong><ul>{item.ai.cautions.map((x) => <li key={x}>{x}</li>)}</ul></>}</div>}
        <div style={pills}><Link href={`/local-v2/courses/${item.course.id}`} style={linkButton}>View course details</Link><Link href={`/local-v2/universities/${item.university.id}`} style={secondaryLink}>University profile</Link>{item.course.officialCourseUrl && <a href={item.course.officialCourseUrl} target="_blank" rel="noreferrer" style={secondaryLink}>Official course page ↗</a>}</div>
      </article>; })}</div>{selectedItems.length >= 2 && <Comparison items={selectedItems} />}</div>;
}

function Evidence({ title, badge: badgeText, text }: { title: string; badge: string; text: string }) { return <div style={evidence}><div style={row}><strong>{title}</strong><span style={miniBadge}>{badgeText}</span></div><p style={{ ...muted, fontSize: 12, marginBottom: 0 }}>{text}</p></div>; }
function Metric({ label: metricLabel, value }: { label: string; value: string }) { return <div style={metric}><span style={{ ...muted, fontSize: 12 }}>{metricLabel}</span><strong>{value}</strong></div>; }
function Comparison({ items }: { items: LiveRecommendation[] }) {
  const comparisonRows: Array<[string, (item: LiveRecommendation) => string]> = [
    ["Match score", (item) => `${item.ai?.aiScore ?? item.scores.overall}%`],
    ["Career fit", (item) => `${item.scores.career}%`],
    ["Budget fit", (item) => `${item.scores.affordability}%`],
    ["Location fit", (item) => `${item.scores.location}%`],
    ["Annual tuition", (item) => money(item.course.annualFee, item.course.currency)],
    ["Total tuition", (item) => money(item.course.totalFee, item.course.currency)],
    ["Entry evidence", (item) => item.ai?.entryEvidence?.label ?? "Not loaded"],
    ["Scholarship", (item) => item.scholarship ? `Linked: ${item.scholarship.name}` : "No linked scholarship"],
  ];
  return <div style={comparison}><h3>Compare selected courses</h3><div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}><thead><tr><th style={cell}>Factor</th>{items.map((item) => <th key={item.course.id} style={cell}>{item.course.name}<div style={muted}>{item.university.name}</div></th>)}</tr></thead><tbody>{comparisonRows.map(([name, value]) => <tr key={name}><th style={cell}>{name}</th>{items.map((item) => <td key={item.course.id} style={cell}>{value(item)}</td>)}</tr>)}</tbody></table></div><div style={warning}>Comparison supports decisions only. It does not prove admission, scholarship eligibility, registration, visa eligibility or PR outcomes.</div></div>;
}
function MigrationPrompt({ choice, setChoice, onContinue }: { choice: MigrationImportance; setChoice: (x: MigrationImportance) => void; onContinue: () => void }) { return <section style={{ ...panel, marginTop: 16 }}><div style={eyebrow}>OPTIONAL · MIGRATION PATHWAYS</div><h2>Should potential migration pathways matter?</h2><p style={muted}>Your original result stays unchanged.</p><div style={pills}>{([["high","Very important"],["consider","Consider them"],["none","Not important"]] as [MigrationImportance,string][]).map(([v,l]) => <button key={v} onClick={() => setChoice(v)} style={{ ...pill, ...(choice === v ? selected : {}) }}>{l}</button>)}</div>{choice !== "none" && <button onClick={onContinue} style={{ ...primary, marginTop: 12 }}>Show Migration-Aware Result</button>}</section>; }

const page = { maxWidth: 1180, margin: "0 auto", minHeight: "100vh", padding: "30px 20px 70px", background: "#0057b8", color: "#101828" } as const;
const panel = { borderRadius: 20, background: "#fff", padding: 26, boxShadow: "0 10px 30px rgba(16,24,40,.1)" } as const;
const section = { padding: "20px 0" } as const;
const row = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" } as const;
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 15 } as const;
const label = { display: "grid", gap: 7, fontWeight: 750 } as const;
const input = { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #cfd5df", borderRadius: 9, background: "#fff" } as const;
const hero = { color: "#eaf2ff", maxWidth: 850, lineHeight: 1.55 } as const;
const badge = { padding: "6px 10px", borderRadius: 999, background: "#fff", color: "#0057b8", fontWeight: 850 } as const;
const ghost = { border: "1px solid rgba(255,255,255,.7)", background: "transparent", color: "#fff", borderRadius: 9, padding: "8px 11px", cursor: "pointer" } as const;
const primary = { border: 0, borderRadius: 9, background: "#d81b60", color: "#fff", padding: "10px 15px", fontWeight: 850, cursor: "pointer" } as const;
const secondary = { border: "1px solid #cfd5df", borderRadius: 9, background: "#fff", color: "#111827", padding: "10px 15px", fontWeight: 750, cursor: "pointer" } as const;
const smallButton = { ...secondary, padding: "7px 10px", fontSize: 12 } as const;
const footer = { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 20, paddingTop: 18, borderTop: "1px solid #eaecf0" } as const;
const pills = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 } as const;
const pill = { ...smallButton, borderRadius: 999 } as const;
const selected = { background: "#eaf3ff", borderColor: "#73aaf5", color: "#004594" } as const;
const muted = { color: "#667085", lineHeight: 1.5 } as const;
const info = { marginTop: 14, padding: 12, borderRadius: 10, background: "#eef4ff", border: "1px solid #c7d7fe", color: "#344054" } as const;
const warning = { marginTop: 14, padding: 12, borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" } as const;
const errorBox = { ...warning, background: "#fff6f5", borderColor: "#fecdca", color: "#b42318" } as const;
const statePanel = { marginTop: 18, padding: 20, border: "1px dashed #b2ddff", borderRadius: 14, background: "#f8fbff" } as const;
const loadingStyle = { minHeight: 230, display: "flex", alignItems: "center", justifyContent: "center", gap: 18 } as const;
const spinner = { width: 44, height: 44, border: "5px solid #dbe8f8", borderTopColor: "#0057b8", borderRadius: "50%" } as const;
const track = { height: 8, background: "#e9edf2", borderRadius: 999, overflow: "hidden", marginTop: 8 } as const;
const fill = { height: "100%", background: "#d81b60" } as const;
const card = { border: "1px solid #e1e6ed", borderRadius: 16, padding: 20, background: "#fbfcfe" } as const;
const score = { minWidth: 80, textAlign: "center", padding: 12, borderRadius: 13, background: "#eaf3ff", color: "#0057b8", fontWeight: 900, fontSize: 25 } as const;
const scoreGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 9, marginTop: 14 } as const;
const metric = { display: "grid", gap: 4, padding: 10, border: "1px solid #e3e7ee", borderRadius: 9, background: "#fff" } as const;
const evidence = { marginTop: 12, padding: 12, border: "1px solid #d7e3f4", borderRadius: 10, background: "#fff" } as const;
const miniBadge = { fontSize: 12, fontWeight: 850, color: "#0057b8", background: "#eaf3ff", borderRadius: 999, padding: "4px 8px" } as const;
const eyebrow = { color: "#475467", fontSize: 12, fontWeight: 850, letterSpacing: .6 } as const;
const comparison = { marginTop: 20, padding: 16, border: "1px solid #b2ddff", borderRadius: 12, background: "#fff" } as const;
const cell = { padding: 10, borderBottom: "1px solid #eaecf0", textAlign: "left", verticalAlign: "top" } as const;
const linkButton = { textDecoration: "none", background: "#0057b8", color: "#fff", borderRadius: 9, padding: "9px 12px", fontWeight: 800 } as const;
const secondaryLink = { textDecoration: "none", background: "#fff", color: "#344054", border: "1px solid #cfd5df", borderRadius: 9, padding: "9px 12px", fontWeight: 750 } as const;
