"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CurrencyBudgetInput } from "@/components/local-v2/CurrencyBudgetInput";
import { SearchableDatabaseSelect, type SearchOption } from "@/components/local-v2/SearchableDatabaseSelect";
import { clearLocalV2Profile, loadLocalV2Profile, saveLocalV2Profile } from "@/lib/local-v2/profile-storage";
import type { AustralianState, EnglishTestType, MigrationImportance, ScholarshipImportance, StudentDecisionProfile } from "@/lib/local-v2/types";

const states: AustralianState[] = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"];
const money = (value: number | null | undefined, currency = "AUD") => value == null ? "Not loaded" : new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

const initialProfile: StudentDecisionProfile = {
  mode: "quick",
  age: undefined,
  highestQualification: "",
  qualificationField: "",
  academicScorePercent: undefined,
  englishTestType: "none",
  englishScore: undefined,
  desiredOccupation: "",
  preferredStudy: "",
  preferredLocation: "",
  annualTuitionBudgetCents: 0,
  semesterTuitionBudgetCents: 0,
  fullCourseBudgetCents: 0,
  scholarshipImportance: "none",
  totalFundsCents: 0,
  preferredStates: [],
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
type EntryRequirement = { course_id: string; academic_text: string | null; minimum_gpa: number | string | null; relevant_field_required: boolean | null; ielts_overall: number | string | null; pte_overall: number | string | null; source_url: string | null; verified_at: string | null };
type ScoreBreakdown = { baseCourseFit: number; qualificationReadiness: number; academicEvidence: number; englishEvidence: number; fieldEvidence: number; eligibilityEvidence: number };
type AIScore = { courseId: string; aiScore: number; eligibilityStatus: "likely_meets" | "needs_review" | "requirements_not_verified"; confidence?: "high" | "medium" | "low"; scoreBreakdown?: ScoreBreakdown; reasons: string[]; cautions: string[]; entryRequirement: EntryRequirement | null };
type LiveRecommendation = {
  course: { id: string; name: string; qualificationLevel: string | null; cricosCode: string | null; durationMonths: number | null; annualFee: number | null; totalFee: number | null; currency: string; deliveryMode: string | null; officialCourseUrl: string | null; studyField: string | null };
  university: { id: string; name: string; website: string | null; logoUrl: string | null; cricosCode: string | null };
  campus: { id: string; name: string; city: string | null; state: string | null; postcode: string | null; regional: boolean; regional_verified: boolean | null; regional_classification: string | null };
  scholarship: { id: string; name: string; percentage: number | null; amount: number | null } | null;
  livingCost: { weeklyLow: number; weeklyHigh: number; monthlyEstimate: number; status: string | null } | null;
  scores: { academic: number; career: number; affordability: number; location: number; migration: number; overall: number };
  reasons: string[];
  ai?: AIScore;
};

export default function QuickMatchPage() {
  const [profile, setProfile] = useState<StudentDecisionProfile>(initialProfile);
  const [stage, setStage] = useState<Stage>("input");
  const [step, setStep] = useState<QuickStep>(1);
  const [results, setResults] = useState<LiveRecommendation[]>([]);
  const [migrationResults, setMigrationResults] = useState<LiveRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");
  const [aiMode, setAiMode] = useState("");
  const [aiMessage, setAiMessage] = useState("");
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

  const updateState = (state: AustralianState) => setProfile((current) => ({ ...current, preferredStates: current.preferredStates.includes(state) ? current.preferredStates.filter((item) => item !== state) : [...current.preferredStates, state] }));
  const selectLocation = (option: SearchOption) => {
    const state = option.state as AustralianState | undefined;
    setProfile((current) => ({ ...current, preferredLocation: option.value, preferredStates: state && states.includes(state) ? [state] : current.preferredStates }));
  };

  const validateStep = (currentStep: QuickStep) => {
    if (currentStep === 1) {
      if (profile.age == null || !Number.isFinite(profile.age) || profile.age < 15 || profile.age > 100) return "Enter a valid age between 15 and 100.";
      if (!profile.highestQualification.trim()) return "Select your highest qualification.";
      if (!profile.qualificationField.trim()) return "Select your previous study field.";
      if (!profile.desiredOccupation.trim()) return "Select your career goal.";
    }
    if (currentStep === 2) {
      const semester = profile.semesterTuitionBudgetCents ?? 0;
      const full = profile.fullCourseBudgetCents ?? 0;
      if (semester <= 0) return "Enter your tuition budget for one semester.";
      if (full <= 0) return "Enter your maximum full course budget.";
      if (full < semester) return "Your full course budget should be at least as much as one semester budget.";
    }
    if (currentStep === 3 && !profile.preferredLocation?.trim() && profile.preferredStates.length === 0) {
      return "Choose a preferred location or at least one state.";
    }
    return "";
  };

  const goNext = () => {
    const problem = validateStep(step);
    if (problem) {
      setValidationError(problem);
      return;
    }
    setValidationError("");
    setStep((step + 1) as QuickStep);
  };

  const goBack = () => {
    setValidationError("");
    setStep(Math.max(1, step - 1) as QuickStep);
  };

  const enrichWithAI = async (base: LiveRecommendation[], migrationImportance: MigrationImportance) => {
    if (!base.length) return base;
    const response = await fetch("/api/local-v2/ai-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: {
          age: profile.age ?? null,
          highestQualification: profile.highestQualification,
          qualificationField: profile.qualificationField,
          academicScorePercent: profile.academicScorePercent ?? null,
          englishTestType: profile.englishTestType ?? "none",
          englishScore: profile.englishScore ?? null,
          desiredOccupation: profile.desiredOccupation,
          preferredStudy: profile.preferredStudy ?? "",
          preferredLocation: profile.preferredLocation ?? "",
          preferredStates: profile.preferredStates,
          regionalAccepted: profile.regionalAccepted,
          semesterBudget: (profile.semesterTuitionBudgetCents ?? 0) / 100,
          fullBudget: (profile.fullCourseBudgetCents ?? 0) / 100,
          scholarshipImportance: profile.scholarshipImportance ?? "none",
          migrationImportance,
        },
        candidates: base,
      }),
    });
    const data = await response.json() as { results?: AIScore[]; mode?: string; message?: string; error?: string; detail?: string };
    if (!response.ok) throw new Error(data.detail || data.error || "Unable to calculate match scores.");
    setAiMode(data.mode ?? "");
    setAiMessage(data.message ?? "");
    const aiMap = new Map((data.results ?? []).map((item) => [item.courseId, item]));
    return base.map((item) => ({ ...item, ai: aiMap.get(item.course.id) })).sort((a, b) => (b.ai?.aiScore ?? b.scores.overall) - (a.ai?.aiScore ?? a.scores.overall));
  };

  const loadRecommendations = async (migrationImportance: MigrationImportance, target: "standard" | "migration") => {
    setLoading(true);
    setError("");
    setAiMode("");
    setAiMessage("");
    try {
      const params = new URLSearchParams({
        study: profile.preferredStudy ?? "",
        field: profile.qualificationField,
        occupation: profile.desiredOccupation,
        location: profile.preferredLocation ?? "",
        states: profile.preferredStates.join(","),
        regionalAccepted: String(profile.regionalAccepted),
        migrationImportance,
        scholarshipImportance: profile.scholarshipImportance ?? "none",
        semesterBudget: String((profile.semesterTuitionBudgetCents ?? 0) / 100),
        fullBudget: String((profile.fullCourseBudgetCents ?? 0) / 100),
      });
      const response = await fetch(`/api/local-v2/recommendations?${params.toString()}`);
      const data = await response.json() as { recommendations?: LiveRecommendation[]; detail?: string; error?: string };
      if (!response.ok) throw new Error(data.detail || data.error || "Unable to load recommendations.");
      const scored = await enrichWithAI(data.recommendations ?? [], migrationImportance);
      if (target === "standard") setResults(scored);
      else setMigrationResults(scored);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const showQuickResult = async () => {
    setValidationError("");
    setStage("result");
    await loadRecommendations("none", "standard");
  };
  const showDetailedResult = async () => { setStage("detailed-result"); await loadRecommendations("none", "standard"); };
  const showMigrationResult = async () => { setStage("migration-result"); await loadRecommendations(migrationChoice, "migration"); };
  const reset = () => { clearLocalV2Profile(); setProfile(initialProfile); setStage("input"); setStep(1); setResults([]); setMigrationResults([]); setError(""); setValidationError(""); };

  return <main style={pageStyle}>
    <header style={{ marginBottom: 24 }}>
      <div style={topRowStyle}><span style={badgeStyle}>Quick Match · smart scoring + live database</span><button type="button" onClick={reset} style={ghostButtonStyle}>Clear saved answers</button></div>
      <h1 style={{ margin: "16px 0 8px", fontSize: 42, color: "#fff" }}>What should I study in Australia?</h1>
      <p style={heroCopyStyle}>Start with your age, education, career goal, budget and location. Add extra details only if you want a more precise match.</p>
    </header>

    {stage === "input" && <section style={shellStyle}>
      <div style={progressTextStyle}>Step {step} of 4</div><div style={progressTrackStyle}><div style={{ ...progressFillStyle, width: `${step * 25}%` }} /></div>

      {step === 1 && <div style={panelStyle}>
        <h2>Your background & career goal</h2>
        <p style={mutedStyle}>Enter your age first, then your education and the career you want to work toward.</p>
        <div style={gridStyle}>
          <label style={labelStyle}>Age<input type="number" min={15} max={100} step={1} value={profile.age ?? ""} onChange={(e) => setProfile((c) => ({ ...c, age: e.target.value === "" ? undefined : Number(e.target.value) }))} style={inputStyle} placeholder="e.g. 24" /></label>
          <SearchableDatabaseSelect label="Highest qualification" type="qualification" value={profile.highestQualification} placeholder="Search qualification" onChange={(highestQualification) => setProfile((c) => ({ ...c, highestQualification }))} />
          <SearchableDatabaseSelect label="Previous study field" type="study_field" value={profile.qualificationField} placeholder="e.g. Information Technology" onChange={(qualificationField) => setProfile((c) => ({ ...c, qualificationField }))} />
          <SearchableDatabaseSelect label="Career goal" type="occupation" value={profile.desiredOccupation} placeholder="e.g. Software Engineer" onChange={(desiredOccupation) => setProfile((c) => ({ ...c, desiredOccupation }))} />
        </div>
      </div>}

      {step === 2 && <div style={panelStyle}>
        <h2>Your budget</h2>
        <p style={mutedStyle}>Tell UniPath what tuition range is realistic for you.</p>
        <div style={gridStyle}>
          <CurrencyBudgetInput label="Budget for one semester" audCents={profile.semesterTuitionBudgetCents ?? 0} onAudCentsChange={(semesterTuitionBudgetCents) => setProfile((c) => ({ ...c, semesterTuitionBudgetCents, annualTuitionBudgetCents: semesterTuitionBudgetCents * 2 }))} />
          <CurrencyBudgetInput label="Maximum full course budget" audCents={profile.fullCourseBudgetCents ?? 0} onAudCentsChange={(fullCourseBudgetCents) => setProfile((c) => ({ ...c, fullCourseBudgetCents }))} />
        </div>
      </div>}

      {step === 3 && <div style={panelStyle}>
        <h2>Your location</h2>
        <p style={mutedStyle}>Choose a city or select one or more states if you are flexible.</p>
        <SearchableDatabaseSelect label="Preferred location" type="location" value={profile.preferredLocation ?? ""} placeholder="e.g. Melbourne, Ballarat, Sydney" onChange={(preferredLocation) => setProfile((c) => ({ ...c, preferredLocation }))} onSelect={selectLocation} />
        <div style={{ marginTop: 20 }}><strong>Preferred state(s)</strong><div style={pillRowStyle}>{states.map((state) => <button key={state} type="button" onClick={() => updateState(state)} style={{ ...pillStyle, ...(profile.preferredStates.includes(state) ? selectedPillStyle : {}) }}>{state}</button>)}</div></div>
        <div style={{ marginTop: 20 }}><strong>Open to regional Australia?</strong><div style={pillRowStyle}><button type="button" onClick={() => setProfile((c) => ({ ...c, regionalAccepted: true }))} style={{ ...pillStyle, ...(profile.regionalAccepted ? selectedPillStyle : {}) }}>Yes</button><button type="button" onClick={() => setProfile((c) => ({ ...c, regionalAccepted: false }))} style={{ ...pillStyle, ...(!profile.regionalAccepted ? selectedPillStyle : {}) }}>No</button></div></div>
      </div>}

      {step === 4 && <div style={panelStyle}>
        <h2>Optional details</h2>
        <p style={mutedStyle}>Skip anything you do not know. These details only refine the match and entry-requirement checks.</p>
        <div style={gridStyle}>
          <SearchableDatabaseSelect label="Preferred study area (optional)" type="course" value={profile.preferredStudy ?? ""} placeholder="e.g. Cyber Security" helper="Leave blank if you want UniPath to infer study areas from your career goal." onChange={(preferredStudy) => setProfile((c) => ({ ...c, preferredStudy }))} />
          <label style={labelStyle}>English test <span style={optionalLabelStyle}>Optional</span><select value={profile.englishTestType ?? "none"} onChange={(e) => setProfile((c) => ({ ...c, englishTestType: e.target.value as EnglishTestType, englishScore: e.target.value === "none" ? undefined : c.englishScore }))} style={inputStyle}><option value="none">Not taken / skip</option><option value="ielts">IELTS</option><option value="pte">PTE Academic</option></select></label>
          {(profile.englishTestType ?? "none") !== "none" && <label style={labelStyle}>{profile.englishTestType === "pte" ? "PTE overall score" : "IELTS overall score"}<input type="number" min={0} max={profile.englishTestType === "pte" ? 90 : 9} step={profile.englishTestType === "pte" ? 1 : 0.5} value={profile.englishScore ?? ""} onChange={(e) => setProfile((c) => ({ ...c, englishScore: e.target.value === "" ? undefined : Number(e.target.value) }))} style={inputStyle} /></label>}
        </div>
        <div style={{ marginTop: 20 }}><strong>Scholarship preference <span style={optionalLabelStyle}>Optional</span></strong><div style={pillRowStyle}>{([['high','Very important'],['prefer','Prefer if available'],['none','No preference']] as [ScholarshipImportance,string][]).map(([value,label]) => <button key={value} type="button" onClick={() => setProfile((c) => ({ ...c, scholarshipImportance: value }))} style={{ ...pillStyle, ...((profile.scholarshipImportance ?? "none") === value ? selectedPillStyle : {}) }}>{label}</button>)}</div></div>
      </div>}

      {validationError && <div style={errorStyle}>{validationError}</div>}
      <div style={footerStyle}><button type="button" disabled={step === 1} onClick={goBack} style={secondaryButtonStyle}>← Back</button>{step < 4 ? <button type="button" onClick={goNext} style={primaryButtonStyle}>Continue →</button> : <button type="button" onClick={showQuickResult} style={primaryButtonStyle}>Get Match Score →</button>}</div>
    </section>}

    {(stage === "result" || stage === "detailed-result") && <><section style={sectionStyle}><div style={eyebrowStyle}>SMART-SCORED LIVE RESULT</div><h2>Your best matches</h2><p style={mutedStyle}>The match score is decision support, not an admission guarantee. Missing course requirements are shown as unverified rather than guessed.</p>{aiMessage && <div style={infoBannerStyle}><strong>{aiMode === "openai" ? "Optional AI scoring active" : "Free transparent scoring"}:</strong> {aiMessage}</div>}{loading ? <p>Finding live courses and calculating match scores…</p> : error ? <ErrorBox text={error} /> : <ResultCards results={results} highestQualification={profile.highestQualification} />}</section>{stage === "result" && <section style={{ ...sectionStyle, marginTop: 16 }}><h2>Want a more detailed result?</h2><p style={mutedStyle}>Add funds, experience, skills and dependants without losing your Quick Match answers.</p><button type="button" onClick={() => setStage("detailed")} style={primaryButtonStyle}>Continue to Detailed Assessment</button></section>}<MigrationPrompt choice={migrationChoice} setChoice={setMigrationChoice} onContinue={showMigrationResult} /></>}

    {stage === "detailed" && <section style={sectionStyle}><div style={eyebrowStyle}>DETAILED ASSESSMENT</div><h2>Add more information</h2><div style={gridStyle}><CurrencyBudgetInput label="Total funds available" audCents={profile.totalFundsCents} onAudCentsChange={(totalFundsCents) => setProfile((c) => ({ ...c, totalFundsCents }))} /><label style={labelStyle}>Years of relevant experience<input type="number" min={0} max={40} step={0.5} value={profile.yearsExperience ?? 0} onChange={(e) => setProfile((c) => ({ ...c, yearsExperience: Number(e.target.value) }))} style={inputStyle} /></label><label style={labelStyle}>Skills<input value={(profile.skills ?? []).join(", ")} onChange={(e) => setProfile((c) => ({ ...c, skills: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) }))} style={inputStyle} /></label><label style={labelStyle}>Dependants<input type="number" min={0} max={10} value={profile.dependants ?? 0} onChange={(e) => setProfile((c) => ({ ...c, dependants: Number(e.target.value) }))} style={inputStyle} /></label></div><div style={footerStyle}><button type="button" onClick={() => setStage("result")} style={secondaryButtonStyle}>Back</button><button type="button" onClick={showDetailedResult} style={primaryButtonStyle}>Recalculate Match Score</button></div></section>}

    {stage === "migration-result" && <section style={sectionStyle}><div style={eyebrowStyle}>MIGRATION-AWARE COMPARISON</div><h2>Migration-aware ranking</h2><p style={mutedStyle}>This stays separate from your original result. UniPath does not guarantee PR, visa eligibility, invitation or skills assessment.</p>{loading ? <p>Calculating…</p> : error ? <ErrorBox text={error} /> : <ResultCards results={migrationResults} highestQualification={profile.highestQualification} />}<div style={warningStyle}>Migration evidence is used only where source-backed data exists. Missing evidence receives no invented advantage.</div><div style={footerStyle}><button type="button" onClick={() => setStage("result")} style={secondaryButtonStyle}>Back to original result</button><Link href="/local-v2/migration" style={linkButtonStyle}>Open Migration Explorer</Link></div></section>}
  </main>;
}

function ResultCards({ results, highestQualification }: { results: LiveRecommendation[]; highestQualification: string }) {
  if (!results.length) return <div style={emptyStyle}>No live course records matched these preferences. Try a broader study area or location.</div>;
  return <div style={{ display: "grid", gap: 16, marginTop: 18 }}>{results.slice(0, 8).map((item, index) => {
    const score = item.ai?.aiScore ?? item.scores.overall;
    const status = item.ai?.eligibilityStatus ?? "requirements_not_verified";
    const statusLabel = status === "likely_meets" ? "Likely meets loaded requirements" : status === "needs_review" ? "Needs eligibility review" : "Requirements not verified";
    const confidenceLabel = item.ai?.confidence ? `${item.ai.confidence.charAt(0).toUpperCase()}${item.ai.confidence.slice(1)} evidence confidence` : null;
    const progressionScore = item.ai?.scoreBreakdown?.qualificationReadiness;
    const progressionLabel = progressionScore == null ? "Not assessed" : progressionScore >= 80 ? "Strong level fit" : progressionScore >= 70 ? "Reasonable level fit" : progressionScore >= 60 ? "Pathway / requirements check" : "Closer review needed";
    return <article key={item.course.id} style={cardStyle}><div style={topRowStyle}><div><div style={rankStyle}>#{index + 1} {index === 0 ? "Best match" : "Alternative"}</div><h3 style={{ fontSize: 23, margin: "6px 0" }}>{item.course.name}</h3><div style={{ fontWeight: 800, color: "#0057b8" }}>{item.university.name}</div><div style={mutedStyle}>{item.campus.name}{item.campus.city ? ` · ${item.campus.city}` : ""}{item.campus.state ? `, ${item.campus.state}` : ""} {item.campus.regional ? "· Regional" : ""}</div></div><div style={scoreStyle}><div style={{ fontSize: 11 }}>MATCH SCORE</div>{score}%</div></div>
      <div style={status === "likely_meets" ? successStyle : status === "needs_review" ? warningStyle : neutralStyle}><strong>{statusLabel}</strong>{confidenceLabel && <span> · {confidenceLabel}</span>}{item.ai?.entryRequirement?.source_url && <a href={item.ai.entryRequirement.source_url} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>source ↗</a>}</div>
      <div style={qualificationProgressStyle}><div style={qualificationTopStyle}><strong>Qualification progression</strong><span style={qualificationBadgeStyle}>{progressionLabel}{progressionScore != null ? ` · ${progressionScore}%` : ""}</span></div><div style={qualificationPathStyle}><span>{highestQualification || "Not entered"}</span><span aria-hidden="true">→</span><span>{item.course.qualificationLevel || "Course level not loaded"}</span></div><div style={qualificationNoteStyle}>This measures study-level progression fit only. It is not proof of admission, credit, advanced standing or eligibility.</div></div>
      <div style={scoreGridStyle}><span>Course relevance <strong>{item.scores.academic}%</strong></span><span>Career <strong>{item.scores.career}%</strong></span><span>Budget <strong>{item.scores.affordability}%</strong></span><span>Location <strong>{item.scores.location}%</strong></span><span>Base score <strong>{item.scores.overall}%</strong></span>{item.ai?.scoreBreakdown && <span>Eligibility evidence <strong>{item.ai.scoreBreakdown.eligibilityEvidence}%</strong></span>}</div>
      <div style={feeGridStyle}><Info label="Annual tuition" value={money(item.course.annualFee, item.course.currency)} /><Info label="Total tuition" value={money(item.course.totalFee, item.course.currency)} /><Info label="Duration" value={item.course.durationMonths ? `${item.course.durationMonths} months` : "Not loaded"} /><Info label="Living cost" value={item.livingCost ? `${money(item.livingCost.weeklyLow)}–${money(item.livingCost.weeklyHigh)}/week` : "Not loaded"} /></div>
      {item.ai && (item.ai.reasons.length > 0 || item.ai.cautions.length > 0) && <div style={reasonStyle}><strong>Why this score</strong>{item.ai.reasons.length > 0 && <ul>{item.ai.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}{item.ai.cautions.length > 0 && <><strong>Check before applying</strong><ul>{item.ai.cautions.map((r) => <li key={r}>{r}</li>)}</ul></>}</div>}
      {item.scholarship && <div style={successStyle}><strong>Linked scholarship:</strong> {item.scholarship.name} · {item.scholarship.percentage != null ? `${item.scholarship.percentage}%` : money(item.scholarship.amount)}</div>}
      <div style={pillRowStyle}><Link href={`/local-v2/courses/${item.course.id}`} style={linkButtonStyle}>View course details</Link><Link href={`/local-v2/universities/${item.university.id}`} style={secondaryLinkStyle}>University profile</Link><Link href={`/local-v2/suburbs/${item.campus.id}`} style={secondaryLinkStyle}>Location & living costs</Link>{item.course.officialCourseUrl && <a href={item.course.officialCourseUrl} target="_blank" rel="noreferrer" style={secondaryLinkStyle}>Official course page ↗</a>}</div>
    </article>;
  })}</div>;
}

function MigrationPrompt({ choice, setChoice, onContinue }: { choice: MigrationImportance; setChoice: (value: MigrationImportance) => void; onContinue: () => void }) { return <section style={{ ...sectionStyle, marginTop: 16 }}><div style={eyebrowStyle}>OPTIONAL · MIGRATION PATHWAYS</div><h2>Should potential migration pathways matter?</h2><p style={mutedStyle}>Your original result stays unchanged.</p><div style={pillRowStyle}>{([['high','Very important'],['consider','Consider them'],['none','Not important']] as [MigrationImportance,string][]).map(([value,label]) => <button key={value} type="button" onClick={() => setChoice(value)} style={{ ...pillStyle, ...(choice === value ? selectedPillStyle : {}) }}>{label}</button>)}</div>{choice !== "none" && <button type="button" onClick={onContinue} style={{ ...primaryButtonStyle, marginTop: 14 }}>Show Migration-Aware Result</button>}</section>; }
function Info({ label, value }: { label: string; value: string }) { return <div style={infoStyle}><div style={infoLabelStyle}>{label}</div><strong>{value}</strong></div>; }
function ErrorBox({ text }: { text: string }) { return <div style={errorStyle}>{text}</div>; }

const pageStyle = { maxWidth: 1180, margin: "0 auto", minHeight: "100vh", padding: "30px 20px 70px", background: "#0057b8", color: "#101828" } as const;
const heroCopyStyle = { color: "#eaf2ff", maxWidth: 850, fontSize: 17, lineHeight: 1.55 } as const;
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
const labelStyle = { display: "grid", gap: 7, fontWeight: 750 } as const;
const optionalLabelStyle = { fontSize: 11, color: "#667085", fontWeight: 650 } as const;
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #cfd5df", borderRadius: 9, background: "#fff" } as const;
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
const scoreStyle = { minWidth: 92, textAlign: "center", background: "#eaf3ff", color: "#0057b8", borderRadius: 14, padding: "10px 12px", fontSize: 26, fontWeight: 900 } as const;
const scoreGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginTop: 16 } as const;
const feeGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 14 } as const;
const infoStyle = { border: "1px solid #e3e7ee", borderRadius: 10, padding: 11, background: "#fff" } as const;
const infoLabelStyle = { color: "#667085", fontSize: 12, marginBottom: 4 } as const;
const qualificationProgressStyle = { marginTop: 14, padding: 13, borderRadius: 11, border: "1px solid #d7e3f4", background: "#f7faff" } as const;
const qualificationTopStyle = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" } as const;
const qualificationBadgeStyle = { fontSize: 12, fontWeight: 850, color: "#0057b8", background: "#eaf3ff", borderRadius: 999, padding: "4px 8px" } as const;
const qualificationPathStyle = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8, fontSize: 13, fontWeight: 700, color: "#344054" } as const;
const qualificationNoteStyle = { marginTop: 7, color: "#667085", fontSize: 12, lineHeight: 1.45 } as const;
const reasonStyle = { marginTop: 14, padding: 14, borderRadius: 11, background: "#f6f8fb", lineHeight: 1.5 } as const;
const successStyle = { marginTop: 14, padding: 12, borderRadius: 10, background: "#ecfdf3", color: "#067647", border: "1px solid #abefc6" } as const;
const neutralStyle = { marginTop: 14, padding: 12, borderRadius: 10, background: "#f8fafc", color: "#475467", border: "1px solid #d0d5dd" } as const;
const warningStyle = { marginTop: 14, padding: 12, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", borderRadius: 10 } as const;
const infoBannerStyle = { margin: "14px 0", padding: 12, borderRadius: 10, background: "#eef4ff", border: "1px solid #c7d7fe", color: "#344054" } as const;
const errorStyle = { marginTop: 14, padding: 14, background: "#fff6f5", border: "1px solid #fecdca", color: "#b42318", borderRadius: 11 } as const;
const emptyStyle = { marginTop: 14, padding: 22, border: "1px dashed #cfd5df", borderRadius: 12, color: "#667085" } as const;
const linkButtonStyle = { textDecoration: "none", background: "#0057b8", color: "#fff", borderRadius: 9, padding: "9px 12px", fontWeight: 800 } as const;
const secondaryLinkStyle = { textDecoration: "none", background: "#fff", color: "#344054", border: "1px solid #cfd5df", borderRadius: 9, padding: "9px 12px", fontWeight: 750 } as const;
