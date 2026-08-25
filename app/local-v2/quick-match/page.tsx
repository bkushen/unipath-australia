"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BudgetAssessmentPanel } from "@/components/local-v2/BudgetAssessmentPanel";
import { CurrencyBudgetInput } from "@/components/local-v2/CurrencyBudgetInput";
import { SearchableDatabaseSelect, type SearchOption } from "@/components/local-v2/SearchableDatabaseSelect";
import { assessDetailedProfile, type DetailedAssessment } from "@/lib/local-v2/detailed-assessment";
import { assessLocation, type LocationAssessment } from "@/lib/local-v2/location-assessment";
import { assessScholarshipPreference, previousServerScholarshipAdjustment, type ScholarshipAssessment } from "@/lib/local-v2/scholarship-assessment";
import { clearLocalV2Profile, loadLocalV2Profile, saveLocalV2Profile } from "@/lib/local-v2/profile-storage";
import type { AustralianState, EnglishTestType, MigrationImportance, ScholarshipImportance, StudentDecisionProfile } from "@/lib/local-v2/types";

const states: AustralianState[] = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"];
const money = (value: number | null | undefined, currency = "AUD") => value == null ? "Not loaded" : new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

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
type EntryEvidence = { level: "source_backed" | "partial" | "loaded_unverified" | "not_loaded"; label: string; sourceBacked: boolean; checkedFields: number; note: string };
type ScoreBreakdown = { baseCourseFit: number; qualificationReadiness: number; academicEvidence: number; englishEvidence: number; fieldEvidence: number; eligibilityEvidence: number };
type AIScore = { courseId: string; aiScore: number; eligibilityStatus: "likely_meets" | "needs_review" | "requirements_not_verified"; confidence?: "high" | "medium" | "low"; entryEvidence?: EntryEvidence; detailedAssessment?: DetailedAssessment; scoreBreakdown?: ScoreBreakdown; reasons: string[]; cautions: string[]; entryRequirement: EntryRequirement | null };
type FeeEvidence = {
  source: "verified_course_fee" | "estimated_course_fee" | "course_record" | "cricos_tuition_total" | "unavailable" | string;
  feeYear: number | null;
  derivedAnnual: boolean;
  sourceUrl: string | null;
  verifiedAt: string | null;
  verificationStatus: string | null;
  note: string;
};
type CareerMatch = {
  source: "explicit_mapping" | "osca_metadata_inference" | "inferred_text" | string;
  linkedOccupations: string[];
  oscaOccupation: { code: string; name: string; sourceRelease: string | null } | null;
};
type LiveRecommendation = {
  course: { id: string; name: string; qualificationLevel: string | null; cricosCode: string | null; durationMonths: number | null; annualFee: number | null; totalFee: number | null; currency: string; deliveryMode: string | null; officialCourseUrl: string | null; studyField: string | null };
  feeEvidence?: FeeEvidence;
  careerMatch?: CareerMatch;
  university: { id: string; name: string; website: string | null; logoUrl: string | null; cricosCode: string | null };
  campus: { id: string; name: string; city: string | null; state: string | null; postcode: string | null; regional: boolean; regional_verified: boolean | null; regional_classification: string | null };
  scholarship: { id: string; name: string; percentage: number | null; amount: number | null } | null;
  scholarshipAssessment?: ScholarshipAssessment;
  livingCost: { weeklyLow: number; weeklyHigh: number; monthlyEstimate: number; status: string | null } | null;
  locationAssessment?: LocationAssessment;
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
    if (currentStep === 3 && !profile.preferredLocation?.trim() && profile.preferredStates.length === 0) return "Choose a preferred location or at least one state.";
    return "";
  };

  const goNext = () => {
    const problem = validateStep(step);
    if (problem) { setValidationError(problem); return; }
    setValidationError("");
    setStep((step + 1) as QuickStep);
  };

  const goBack = () => {
    setValidationError("");
    setStep(Math.max(1, step - 1) as QuickStep);
  };

  const applyScholarshipEvidence = (base: LiveRecommendation[]) => base.map((item) => {
    const preference = profile.scholarshipImportance ?? "none";
    const assessment = assessScholarshipPreference(preference, item.scholarship);
    const previousAdjustment = previousServerScholarshipAdjustment(preference, Boolean(item.scholarship));
    return {
      ...item,
      scholarshipAssessment: assessment,
      scores: {
        ...item.scores,
        overall: clampScore(item.scores.overall - previousAdjustment + assessment.adjustment),
      },
    };
  });

  const applyLocationEvidence = (base: LiveRecommendation[]) => base.map((item) => {
    const assessment = assessLocation({
      preferredLocation: profile.preferredLocation,
      preferredStates: profile.preferredStates,
      regionalAccepted: profile.regionalAccepted,
      campus: {
        name: item.campus.name,
        city: item.campus.city,
        state: item.campus.state,
        regional: item.campus.regional,
        regionalVerified: item.campus.regional_verified,
        regionalClassification: item.campus.regional_classification,
      },
      livingCost: item.livingCost ? {
        weeklyLow: item.livingCost.weeklyLow,
        weeklyHigh: item.livingCost.weeklyHigh,
        monthlyEstimate: item.livingCost.monthlyEstimate,
        verificationStatus: item.livingCost.status,
      } : null,
    });
    const locationDelta = (assessment.score - item.scores.location) * 0.20;
    return {
      ...item,
      locationAssessment: assessment,
      scores: {
        ...item.scores,
        location: assessment.score,
        overall: clampScore(item.scores.overall + locationDelta),
      },
    };
  });

  const enrichWithAI = async (base: LiveRecommendation[], migrationImportance: MigrationImportance, detailedMode = false) => {
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
          scholarshipImportance: "none",
          migrationImportance,
        },
        candidates: base,
      }),
    });
    const data = await response.json() as { results?: AIScore[]; mode?: string; message?: string; error?: string; detail?: string };
    if (!response.ok) throw new Error(data.detail || data.error || "Unable to calculate match scores.");
    setAiMode(data.mode ?? "");
    setAiMessage(detailedMode ? `${data.message ?? ""} Detailed profile adjustments use funds, relevant experience, entered skills and dependant planning pressure.`.trim() : data.message ?? "");
    const aiMap = new Map((data.results ?? []).map((item) => [item.courseId, item]));
    return base.map((item) => {
      const ai = aiMap.get(item.course.id);
      if (!detailedMode || !ai) return { ...item, ai };
      const detailedAssessment = assessDetailedProfile({
        baseScore: ai.aiScore,
        careerScore: item.scores.career,
        totalFunds: (profile.totalFundsCents ?? 0) / 100,
        totalFee: item.course.totalFee,
        annualFee: item.course.annualFee,
        dependants: profile.dependants ?? 0,
        yearsExperience: profile.yearsExperience ?? 0,
        skills: profile.skills ?? [],
        courseName: item.course.name,
        studyField: item.course.studyField,
        occupationName: profile.desiredOccupation,
      });
      return { ...item, ai: { ...ai, aiScore: detailedAssessment.adjustedScore, detailedAssessment } };
    }).sort((a, b) => (b.ai?.aiScore ?? b.scores.overall) - (a.ai?.aiScore ?? a.scores.overall));
  };

  const loadRecommendations = async (migrationImportance: MigrationImportance, target: "standard" | "migration", detailedMode = false) => {
    setLoading(true); setError(""); setAiMode(""); setAiMessage("");
    try {
      const params = new URLSearchParams({ study: profile.preferredStudy ?? "", field: profile.qualificationField, occupation: profile.desiredOccupation, location: profile.preferredLocation ?? "", states: profile.preferredStates.join(","), regionalAccepted: String(profile.regionalAccepted), migrationImportance, scholarshipImportance: profile.scholarshipImportance ?? "none", semesterBudget: String((profile.semesterTuitionBudgetCents ?? 0) / 100), fullBudget: String((profile.fullCourseBudgetCents ?? 0) / 100) });
      const response = await fetch(`/api/local-v2/recommendations?${params.toString()}`);
      const data = await response.json() as { recommendations?: LiveRecommendation[]; detail?: string; error?: string };
      if (!response.ok) throw new Error(data.detail || data.error || "Unable to load recommendations.");
      const scholarshipAdjusted = applyScholarshipEvidence(data.recommendations ?? []);
      const locationAdjusted = applyLocationEvidence(scholarshipAdjusted);
      const scored = await enrichWithAI(locationAdjusted, migrationImportance, detailedMode);
      if (target === "standard") setResults(scored); else setMigrationResults(scored);
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  };

  const showQuickResult = async () => { setValidationError(""); setStage("result"); await loadRecommendations("none", "standard", false); };
  const showDetailedResult = async () => { setStage("detailed-result"); await loadRecommendations("none", "standard", true); };
  const showMigrationResult = async () => { setStage("migration-result"); await loadRecommendations(migrationChoice, "migration", false); };
  const reset = () => { clearLocalV2Profile(); setProfile(initialProfile); setStage("input"); setStep(1); setResults([]); setMigrationResults([]); setError(""); setValidationError(""); };

  const semesterBudget = (profile.semesterTuitionBudgetCents ?? 0) / 100;
  const fullCourseBudget = (profile.fullCourseBudgetCents ?? 0) / 100;

  return <main style={pageStyle}>
    <header style={{ marginBottom: 24 }}><div style={topRowStyle}><span style={badgeStyle}>Quick Match · smart scoring + live database</span><button type="button" onClick={reset} style={ghostButtonStyle}>Clear saved answers</button></div><h1 style={{ margin: "16px 0 8px", fontSize: 42, color: "#fff" }}>What should I study in Australia?</h1><p style={heroCopyStyle}>Start with your age, education, career goal, budget and location. Add extra details only if you want a more precise match.</p></header>

    {stage === "input" && <section style={shellStyle}><div style={progressTextStyle}>Step {step} of 4</div><div style={progressTrackStyle}><div style={{ ...progressFillStyle, width: `${step * 25}%` }} /></div>
      {step === 1 && <div style={panelStyle}><h2>Your background & career goal</h2><p style={mutedStyle}>Enter your age first, then your education and the career you want to work toward.</p><div style={gridStyle}><label style={labelStyle}>Age<input type="number" min={15} max={100} step={1} value={profile.age ?? ""} onChange={(e) => setProfile((c) => ({ ...c, age: e.target.value === "" ? undefined : Number(e.target.value) }))} style={inputStyle} placeholder="e.g. 24" /></label><SearchableDatabaseSelect label="Highest qualification" type="qualification" value={profile.highestQualification} placeholder="Search qualification" onChange={(highestQualification) => setProfile((c) => ({ ...c, highestQualification }))} /><SearchableDatabaseSelect label="Previous study field" type="study_field" value={profile.qualificationField} placeholder="e.g. Information Technology" onChange={(qualificationField) => setProfile((c) => ({ ...c, qualificationField }))} /><SearchableDatabaseSelect label="Career goal" type="occupation" value={profile.desiredOccupation} placeholder="e.g. Software Engineer" onChange={(desiredOccupation) => setProfile((c) => ({ ...c, desiredOccupation }))} /></div></div>}
      {step === 2 && <div style={panelStyle}><h2>Your budget</h2><p style={mutedStyle}>Tell UniPath what tuition range is realistic for you.</p><div style={gridStyle}><CurrencyBudgetInput label="Budget for one semester" audCents={profile.semesterTuitionBudgetCents ?? 0} onAudCentsChange={(semesterTuitionBudgetCents) => setProfile((c) => ({ ...c, semesterTuitionBudgetCents, annualTuitionBudgetCents: semesterTuitionBudgetCents * 2 }))} /><CurrencyBudgetInput label="Maximum full course budget" audCents={profile.fullCourseBudgetCents ?? 0} onAudCentsChange={(fullCourseBudgetCents) => setProfile((c) => ({ ...c, fullCourseBudgetCents }))} /></div></div>}
      {step === 3 && <div style={panelStyle}><h2>Your location</h2><p style={mutedStyle}>Choose a city or select one or more states if you are flexible.</p><SearchableDatabaseSelect label="Preferred location" type="location" value={profile.preferredLocation ?? ""} placeholder="e.g. Melbourne, Ballarat, Sydney" onChange={(preferredLocation) => setProfile((c) => ({ ...c, preferredLocation }))} onSelect={selectLocation} /><div style={{ marginTop: 20 }}><strong>Preferred state(s)</strong><div style={pillRowStyle}>{states.map((state) => <button key={state} type="button" onClick={() => updateState(state)} style={{ ...pillStyle, ...(profile.preferredStates.includes(state) ? selectedPillStyle : {}) }}>{state}</button>)}</div></div><div style={{ marginTop: 20 }}><strong>Open to regional Australia?</strong><div style={pillRowStyle}><button type="button" onClick={() => setProfile((c) => ({ ...c, regionalAccepted: true }))} style={{ ...pillStyle, ...(profile.regionalAccepted ? selectedPillStyle : {}) }}>Yes</button><button type="button" onClick={() => setProfile((c) => ({ ...c, regionalAccepted: false }))} style={{ ...pillStyle, ...(!profile.regionalAccepted ? selectedPillStyle : {}) }}>No</button></div></div></div>}
      {step === 4 && <div style={panelStyle}><h2>Optional details</h2><p style={mutedStyle}>Skip anything you do not know. These details only refine the match and entry-requirement checks.</p><div style={gridStyle}><SearchableDatabaseSelect label="Preferred study area (optional)" type="course" value={profile.preferredStudy ?? ""} placeholder="e.g. Cyber Security" helper="Leave blank if you want UniPath to infer study areas from your career goal." onChange={(preferredStudy) => setProfile((c) => ({ ...c, preferredStudy }))} /><label style={labelStyle}>English test <span style={optionalLabelStyle}>Optional</span><select value={profile.englishTestType ?? "none"} onChange={(e) => setProfile((c) => ({ ...c, englishTestType: e.target.value as EnglishTestType, englishScore: e.target.value === "none" ? undefined : c.englishScore }))} style={inputStyle}><option value="none">Not taken / skip</option><option value="ielts">IELTS</option><option value="pte">PTE Academic</option></select></label>{(profile.englishTestType ?? "none") !== "none" && <label style={labelStyle}>{profile.englishTestType === "pte" ? "PTE overall score" : "IELTS overall score"}<input type="number" min={0} max={profile.englishTestType === "pte" ? 90 : 9} step={profile.englishTestType === "pte" ? 1 : 0.5} value={profile.englishScore ?? ""} onChange={(e) => setProfile((c) => ({ ...c, englishScore: e.target.value === "" ? undefined : Number(e.target.value) }))} style={inputStyle} /></label>}</div><div style={{ marginTop: 20 }}><strong>Scholarship preference <span style={optionalLabelStyle}>Optional</span></strong><div style={pillRowStyle}>{([["high","Very important"],["prefer","Prefer if available"],["none","No preference"]] as [ScholarshipImportance,string][]).map(([value,label]) => <button key={value} type="button" onClick={() => setProfile((c) => ({ ...c, scholarshipImportance: value }))} style={{ ...pillStyle, ...((profile.scholarshipImportance ?? "none") === value ? selectedPillStyle : {}) }}>{label}</button>)}</div></div></div>}
      {validationError && <div style={errorStyle}>{validationError}</div>}<div style={footerStyle}><button type="button" disabled={step === 1} onClick={goBack} style={secondaryButtonStyle}>← Back</button>{step < 4 ? <button type="button" onClick={goNext} style={primaryButtonStyle}>Continue →</button> : <button type="button" onClick={showQuickResult} style={primaryButtonStyle}>Get Match Score →</button>}</div></section>}

    {(stage === "result" || stage === "detailed-result") && <><section style={sectionStyle}>{loading ? <LoadingPanel /> : <><div style={eyebrowStyle}>{stage === "detailed-result" ? "DETAILED SMART-SCORED RESULT" : "SMART-SCORED LIVE RESULT"}</div><h2>{stage === "detailed-result" ? "Your detailed best matches" : "Your best matches"}</h2><p style={mutedStyle}>{stage === "detailed-result" ? "The detailed score adds transparent planning adjustments for entered funds, relevant experience, skill overlap and dependants. It still does not decide admission or visa eligibility." : "The match score is decision support, not an admission guarantee. Missing course requirements are shown as unverified rather than guessed."}</p>{aiMessage && <div style={infoBannerStyle}><strong>{aiMode === "openai" ? "Optional AI scoring active" : "Free transparent scoring"}:</strong> {aiMessage}</div>}{error ? <ErrorBox text={error} /> : <ResultCards results={results} highestQualification={profile.highestQualification} semesterBudget={semesterBudget} fullCourseBudget={fullCourseBudget} />}</>}</section>{stage === "result" && !loading && !error && <section style={{ ...sectionStyle, marginTop: 16 }}><h2>Want a more detailed result?</h2><p style={mutedStyle}>Add funds, experience, skills and dependants without losing your Quick Match answers.</p><button type="button" onClick={() => setStage("detailed")} style={primaryButtonStyle}>Continue to Detailed Assessment</button></section>}{!loading && !error && <MigrationPrompt choice={migrationChoice} setChoice={setMigrationChoice} onContinue={showMigrationResult} />}</>}

    {stage === "detailed" && <section style={sectionStyle}><div style={eyebrowStyle}>DETAILED ASSESSMENT</div><h2>Add more information</h2><p style={mutedStyle}>These inputs make small, transparent planning adjustments. Funds are compared with available tuition evidence only; UniPath does not treat this as a government financial-capacity calculation.</p><div style={gridStyle}><CurrencyBudgetInput label="Total funds available" audCents={profile.totalFundsCents} onAudCentsChange={(totalFundsCents) => setProfile((c) => ({ ...c, totalFundsCents }))} /><label style={labelStyle}>Years of relevant experience<input type="number" min={0} max={40} step={0.5} value={profile.yearsExperience ?? 0} onChange={(e) => setProfile((c) => ({ ...c, yearsExperience: Number(e.target.value) }))} style={inputStyle} /></label><label style={labelStyle}>Skills<input value={(profile.skills ?? []).join(", ")} onChange={(e) => setProfile((c) => ({ ...c, skills: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) }))} style={inputStyle} placeholder="e.g. Python, customer service, networking" /></label><label style={labelStyle}>Dependants<input type="number" min={0} max={10} value={profile.dependants ?? 0} onChange={(e) => setProfile((c) => ({ ...c, dependants: Number(e.target.value) }))} style={inputStyle} /></label></div><div style={footerStyle}><button type="button" onClick={() => setStage("result")} style={secondaryButtonStyle}>Back</button><button type="button" onClick={showDetailedResult} style={primaryButtonStyle}>Recalculate Match Score</button></div></section>}

    {stage === "migration-result" && <section style={sectionStyle}>{loading ? <LoadingPanel migration /> : <><div style={eyebrowStyle}>MIGRATION-AWARE COMPARISON</div><h2>Migration-aware ranking</h2><p style={mutedStyle}>This stays separate from your original result. UniPath does not guarantee PR, visa eligibility, invitation or skills assessment.</p>{error ? <ErrorBox text={error} /> : <ResultCards results={migrationResults} highestQualification={profile.highestQualification} semesterBudget={semesterBudget} fullCourseBudget={fullCourseBudget} />}<div style={warningStyle}>Migration evidence is used only where source-backed data exists. Missing evidence receives no invented advantage.</div><div style={footerStyle}><button type="button" onClick={() => setStage("result")} style={secondaryButtonStyle}>Back to original result</button><Link href="/local-v2/migration" style={linkButtonStyle}>Open Migration Explorer</Link></div></>}</section>}
  </main>;
}

function LoadingPanel({ migration = false }: { migration?: boolean }) { return <div style={loadingPanelStyle} role="status" aria-live="polite" aria-busy="true"><svg width="64" height="64" viewBox="0 0 50 50" aria-hidden="true" style={{ flex: "0 0 auto" }}><circle cx="25" cy="25" r="19" fill="none" stroke="#dbe8f8" strokeWidth="6" /><path d="M25 6a19 19 0 0 1 19 19" fill="none" stroke="#0057b8" strokeWidth="6" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite" /></path></svg><div><div style={loadingTitleStyle}>{migration ? "Rechecking with migration evidence…" : "Finding your best matches…"}</div><div style={loadingCopyStyle}>{migration ? "Comparing the current shortlist with source-backed migration evidence where it exists." : "Checking live courses, career alignment, tuition, location and available entry evidence."}</div><div style={loadingDotsStyle} aria-hidden="true"><span>●</span><span>●</span><span>●</span></div></div></div>; }

function feeEvidencePresentation(evidence?: FeeEvidence) { if (!evidence) return { label: "Fee evidence not supplied", style: feeEvidenceNeutralStyle }; if (evidence.source === "verified_course_fee") return { label: evidence.feeYear ? `Verified ${evidence.feeYear} fee` : "Verified course fee", style: feeEvidenceVerifiedStyle }; if (evidence.source === "estimated_course_fee") return { label: evidence.feeYear ? `Estimated ${evidence.feeYear} fee` : "Estimated course fee", style: feeEvidenceEstimatedStyle }; if (evidence.source === "cricos_tuition_total") return { label: "CRICOS-derived tuition", style: feeEvidenceDerivedStyle }; if (evidence.source === "course_record") return { label: "Course-record fee", style: feeEvidenceNeutralStyle }; return { label: "Fee unavailable", style: feeEvidenceMissingStyle }; }
function careerEvidencePresentation(match?: CareerMatch) { if (!match) return { label: "Career evidence not supplied", style: careerEvidenceNeutralStyle, note: "No structured career-match evidence was returned for this result." }; if (match.source === "explicit_mapping") return { label: "Explicit UniPath mapping", style: careerEvidenceMappedStyle, note: "An explicit course-to-career mapping is loaded in UniPath. This is still not an employment, registration, skills-assessment or migration guarantee." }; if (match.source === "osca_metadata_inference") return { label: "OSCA-informed inference", style: careerEvidenceInferredStyle, note: "UniPath inferred course relevance using the selected ABS OSCA occupation identity and metadata. ABS does not recommend or endorse this course." }; return { label: "UniPath text inference", style: careerEvidenceNeutralStyle, note: "Career relevance was inferred from course and study-field text because no stronger structured mapping was available." }; }
function entryEvidencePresentation(evidence?: EntryEvidence) { if (!evidence || evidence.level === "not_loaded") return { label: "Requirements not loaded", style: entryEvidenceMissingStyle, note: evidence?.note ?? "No course-specific entry requirement record is currently loaded. UniPath lowers confidence instead of guessing eligibility." }; if (evidence.level === "source_backed") return { label: evidence.label, style: entryEvidenceVerifiedStyle, note: evidence.note }; if (evidence.level === "partial") return { label: evidence.label, style: entryEvidencePartialStyle, note: evidence.note }; return { label: evidence.label, style: entryEvidenceNeutralStyle, note: evidence.note }; }

function DetailedAssessmentPanel({ assessment }: { assessment: DetailedAssessment }) { return <div style={detailedAssessmentPanelStyle}><div style={qualificationTopStyle}><strong>Detailed profile adjustment</strong><span style={qualificationBadgeStyle}>{assessment.adjustment >= 0 ? "+" : ""}{assessment.adjustment} points</span></div><div style={scoreGridStyle}><span>Funds <strong>{assessment.funding.score}%</strong></span><span>Experience <strong>{assessment.experience.score}%</strong></span><span>Skills <strong>{assessment.skills.score}%</strong></span><span>Dependants planning <strong>{assessment.dependants.score}%</strong></span></div><div style={qualificationNoteStyle}><strong>{assessment.funding.label}:</strong> {assessment.funding.note}</div><div style={qualificationNoteStyle}><strong>{assessment.experience.label}:</strong> {assessment.experience.note}</div><div style={qualificationNoteStyle}><strong>{assessment.skills.label}:</strong> {assessment.skills.note}</div><div style={qualificationNoteStyle}><strong>{assessment.dependants.label}:</strong> {assessment.dependants.note}</div></div>; }

function LocationAssessmentPanel({ assessment, livingCost }: { assessment: LocationAssessment; livingCost: LiveRecommendation["livingCost"] }) {
  const badgeStyleForLiving = assessment.livingEvidence === "source_backed" ? entryEvidenceVerifiedStyle : assessment.livingEvidence === "estimate_loaded" ? entryEvidencePartialStyle : entryEvidenceMissingStyle;
  return <div style={locationAssessmentPanelStyle}><div style={qualificationTopStyle}><strong>Location & living-cost evidence</strong><span style={qualificationBadgeStyle}>Location fit · {assessment.score}%</span></div><div style={entryEvidenceMetaStyle}><span>{assessment.stateMatch ? "State preference matched" : "Outside preferred state"}</span><span>{assessment.locationMatch ? "Location matched" : "Location needs review"}</span><span>{assessment.regionalPreference === "verified_match" ? "Verified regional flag" : assessment.regionalPreference === "unverified_regional" ? "Regional flag not verified" : assessment.regionalPreference === "regional_not_accepted" ? "Regional not accepted" : "Non-regional"}</span></div><div style={{ ...qualificationTopStyle, marginTop: 9 }}><strong style={{ fontSize: 13 }}>Living costs</strong><span style={badgeStyleForLiving}>{assessment.livingEvidenceLabel}</span></div><div style={qualificationNoteStyle}>{livingCost ? `${money(livingCost.weeklyLow)}–${money(livingCost.weeklyHigh)}/week · ${money(livingCost.monthlyEstimate)}/month planning estimate. ` : "No campus-specific living-cost amount is loaded. "}{assessment.note}</div></div>;
}

function ScholarshipAssessmentPanel({ assessment, scholarship }: { assessment: ScholarshipAssessment; scholarship: LiveRecommendation["scholarship"] }) {
  const badge = assessment.linked ? entryEvidencePartialStyle : entryEvidenceNeutralStyle;
  return <div style={scholarshipAssessmentPanelStyle}><div style={qualificationTopStyle}><strong>Scholarship evidence</strong><span style={badge}>{assessment.label}</span></div>{scholarship && <div style={entryEvidenceMetaStyle}><span>{scholarship.name}</span><span>{scholarship.percentage != null ? `${scholarship.percentage}% listed value` : scholarship.amount != null ? `${money(scholarship.amount)} listed value` : "Value not loaded"}</span><span>{assessment.adjustment > 0 ? `+${assessment.adjustment} preference point${assessment.adjustment === 1 ? "" : "s"}` : "No ranking boost"}</span></div>}<div style={qualificationNoteStyle}>{assessment.note}</div></div>;
}

function ResultCards({ results, highestQualification, semesterBudget, fullCourseBudget }: { results: LiveRecommendation[]; highestQualification: string; semesterBudget: number; fullCourseBudget: number }) {
  if (!results.length) return <div style={emptyStyle}>No live course records matched these preferences. Try a broader study area or location.</div>;
  return <div style={{ display: "grid", gap: 16, marginTop: 18 }}>{results.slice(0, 8).map((item, index) => {
    const score = item.ai?.aiScore ?? item.scores.overall; const status = item.ai?.eligibilityStatus ?? "requirements_not_verified"; const statusLabel = status === "likely_meets" ? "Likely meets loaded requirements" : status === "needs_review" ? "Needs eligibility review" : "Requirements not verified"; const confidenceLabel = item.ai?.confidence ? `${item.ai.confidence.charAt(0).toUpperCase()}${item.ai.confidence.slice(1)} evidence confidence` : null; const progressionScore = item.ai?.scoreBreakdown?.qualificationReadiness; const progressionLabel = progressionScore == null ? "Not assessed" : progressionScore >= 80 ? "Strong level fit" : progressionScore >= 70 ? "Reasonable level fit" : progressionScore >= 60 ? "Pathway / requirements check" : "Closer review needed"; const feeEvidence = feeEvidencePresentation(item.feeEvidence); const careerEvidence = careerEvidencePresentation(item.careerMatch); const entryEvidence = entryEvidencePresentation(item.ai?.entryEvidence); const osca = item.careerMatch?.oscaOccupation;
    return <article key={item.course.id} style={cardStyle}><div style={topRowStyle}><div><div style={rankStyle}>#{index + 1} {index === 0 ? "Best match" : "Alternative"}</div><h3 style={{ fontSize: 23, margin: "6px 0" }}>{item.course.name}</h3><div style={{ fontWeight: 800, color: "#0057b8" }}>{item.university.name}</div><div style={mutedStyle}>{item.campus.name}{item.campus.city ? ` · ${item.campus.city}` : ""}{item.campus.state ? `, ${item.campus.state}` : ""} {item.campus.regional ? "· Regional" : ""}</div></div><div style={scoreStyle}><div style={{ fontSize: 11 }}>MATCH SCORE</div>{score}%</div></div>
      <div style={status === "likely_meets" ? successStyle : status === "needs_review" ? warningStyle : neutralStyle}><strong>{statusLabel}</strong>{confidenceLabel && <span> · {confidenceLabel}</span>}{item.ai?.entryRequirement?.source_url && <a href={item.ai.entryRequirement.source_url} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>source ↗</a>}</div>
      {item.ai?.detailedAssessment && <DetailedAssessmentPanel assessment={item.ai.detailedAssessment} />}
      {item.locationAssessment && <LocationAssessmentPanel assessment={item.locationAssessment} livingCost={item.livingCost} />}
      {item.scholarshipAssessment && <ScholarshipAssessmentPanel assessment={item.scholarshipAssessment} scholarship={item.scholarship} />}
      <div style={entryEvidencePanelStyle}><div style={qualificationTopStyle}><strong>Entry requirement evidence</strong><span style={entryEvidence.style}>{entryEvidence.label}</span></div><div style={entryEvidenceMetaStyle}><span>{item.ai?.entryEvidence ? `${item.ai.entryEvidence.checkedFields} structured field${item.ai.entryEvidence.checkedFields === 1 ? "" : "s"} loaded` : "No structured requirement fields returned"}</span>{item.ai?.entryRequirement?.verified_at && <span>Verified {new Date(item.ai.entryRequirement.verified_at).toLocaleDateString("en-AU")}</span>}</div><div style={qualificationNoteStyle}>{entryEvidence.note} This evidence classification supports confidence and ranking only; it is not an admission decision.{item.ai?.entryRequirement?.source_url && <a href={item.ai.entryRequirement.source_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>entry source ↗</a>}</div></div>
      <div style={qualificationProgressStyle}><div style={qualificationTopStyle}><strong>Qualification progression</strong><span style={qualificationBadgeStyle}>{progressionLabel}{progressionScore != null ? ` · ${progressionScore}%` : ""}</span></div><div style={qualificationPathStyle}><span>{highestQualification || "Not entered"}</span><span aria-hidden="true">→</span><span>{item.course.qualificationLevel || "Course level not loaded"}</span></div><div style={qualificationNoteStyle}>This measures study-level progression fit only. It is not proof of admission, credit, advanced standing or eligibility.</div></div>
      <div style={careerEvidencePanelStyle}><div style={qualificationTopStyle}><strong>Career evidence</strong><span style={careerEvidence.style}>{careerEvidence.label}</span></div>{osca && <div style={careerPathStyle}><span>{osca.name}</span><span style={oscaCodeStyle}>OSCA {osca.code}</span>{osca.sourceRelease && <span style={careerSourceStyle}>{osca.sourceRelease}</span>}</div>}<div style={qualificationNoteStyle}>{careerEvidence.note}{item.careerMatch?.linkedOccupations?.length ? ` Linked UniPath occupation records: ${item.careerMatch.linkedOccupations.slice(0, 3).join(", ")}${item.careerMatch.linkedOccupations.length > 3 ? "…" : ""}.` : ""}</div></div>
      <div style={scoreGridStyle}><span>Course relevance <strong>{item.scores.academic}%</strong></span><span>Career <strong>{item.scores.career}%</strong></span><span>Budget <strong>{item.scores.affordability}%</strong></span><span>Location <strong>{item.scores.location}%</strong></span><span>Base score <strong>{item.scores.overall}%</strong></span>{item.ai?.scoreBreakdown && <span>Eligibility evidence <strong>{item.ai.scoreBreakdown.eligibilityEvidence}%</strong></span>}</div>
      <div style={feeEvidencePanelStyle}><div style={qualificationTopStyle}><strong>Tuition evidence</strong><span style={feeEvidence.style}>{feeEvidence.label}</span></div><div style={qualificationNoteStyle}>{item.feeEvidence?.note ?? "No fee-source metadata was returned for this result. Confirm tuition with the university before applying."}{item.feeEvidence?.derivedAnnual ? " The annual amount is derived rather than a direct annual quote." : ""}{item.feeEvidence?.sourceUrl && <a href={item.feeEvidence.sourceUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>fee source ↗</a>}</div></div>
      <div style={feeGridStyle}><Info label="Annual tuition" value={money(item.course.annualFee, item.course.currency)} /><Info label="Total tuition" value={money(item.course.totalFee, item.course.currency)} /><Info label="Duration" value={item.course.durationMonths ? `${item.course.durationMonths} months` : "Not loaded"} /><Info label="Living cost" value={item.livingCost ? `${money(item.livingCost.weeklyLow)}–${money(item.livingCost.weeklyHigh)}/week` : "Not loaded"} /></div>
      <BudgetAssessmentPanel semesterBudget={semesterBudget} fullCourseBudget={fullCourseBudget} annualFee={item.course.annualFee} totalFee={item.course.totalFee} durationMonths={item.course.durationMonths} currency={item.course.currency} feeSource={item.feeEvidence?.source} derivedAnnual={item.feeEvidence?.derivedAnnual} />
      {item.ai && (item.ai.reasons.length > 0 || item.ai.cautions.length > 0) && <div style={reasonStyle}><strong>Why this score</strong>{item.ai.reasons.length > 0 && <ul>{item.ai.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}{item.ai.cautions.length > 0 && <><strong>Check before applying</strong><ul>{item.ai.cautions.map((r) => <li key={r}>{r}</li>)}</ul></>}</div>}
      <div style={pillRowStyle}><Link href={`/local-v2/courses/${item.course.id}`} style={linkButtonStyle}>View course details</Link><Link href={`/local-v2/universities/${item.university.id}`} style={secondaryLinkStyle}>University profile</Link><Link href={`/local-v2/suburbs/${item.campus.id}`} style={secondaryLinkStyle}>Location & living costs</Link>{item.course.officialCourseUrl && <a href={item.course.officialCourseUrl} target="_blank" rel="noreferrer" style={secondaryLinkStyle}>Official course page ↗</a>}</div>
    </article>;
  })}</div>;
}

function MigrationPrompt({ choice, setChoice, onContinue }: { choice: MigrationImportance; setChoice: (value: MigrationImportance) => void; onContinue: () => void }) { return <section style={{ ...sectionStyle, marginTop: 16 }}><div style={eyebrowStyle}>OPTIONAL · MIGRATION PATHWAYS</div><h2>Should potential migration pathways matter?</h2><p style={mutedStyle}>Your original result stays unchanged.</p><div style={pillRowStyle}>{([["high","Very important"],["consider","Consider them"],["none","Not important"]] as [MigrationImportance,string][]).map(([value,label]) => <button key={value} type="button" onClick={() => setChoice(value)} style={{ ...pillStyle, ...(choice === value ? selectedPillStyle : {}) }}>{label}</button>)}</div>{choice !== "none" && <button type="button" onClick={onContinue} style={{ ...primaryButtonStyle, marginTop: 14 }}>Show Migration-Aware Result</button>}</section>; }
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
const loadingPanelStyle = { minHeight: 240, display: "flex", alignItems: "center", justifyContent: "center", gap: 20, padding: "28px 12px", textAlign: "left" } as const;
const loadingTitleStyle = { fontSize: 24, fontWeight: 900, color: "#101828", marginBottom: 7 } as const;
const loadingCopyStyle = { color: "#667085", lineHeight: 1.55, maxWidth: 650 } as const;
const loadingDotsStyle = { display: "flex", gap: 5, marginTop: 12, color: "#0057b8", fontSize: 10, letterSpacing: 2 } as const;
const cardStyle = { border: "1px solid #e1e6ed", borderRadius: 16, padding: 20, background: "#fbfcfe" } as const;
const rankStyle = { fontSize: 13, fontWeight: 850, color: "#475467" } as const;
const scoreStyle = { minWidth: 92, textAlign: "center", background: "#eaf3ff", color: "#0057b8", borderRadius: 14, padding: "10px 12px", fontSize: 26, fontWeight: 900 } as const;
const scoreGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginTop: 16 } as const;
const feeGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 10 } as const;
const infoStyle = { border: "1px solid #e3e7ee", borderRadius: 10, padding: 11, background: "#fff" } as const;
const infoLabelStyle = { color: "#667085", fontSize: 12, marginBottom: 4 } as const;
const detailedAssessmentPanelStyle = { marginTop: 14, padding: 13, borderRadius: 11, border: "1px solid #c7d7fe", background: "#f5f8ff" } as const;
const locationAssessmentPanelStyle = { marginTop: 14, padding: 13, borderRadius: 11, border: "1px solid #b2ddff", background: "#f5fbff" } as const;
const scholarshipAssessmentPanelStyle = { marginTop: 14, padding: 13, borderRadius: 11, border: "1px solid #fedf89", background: "#fffdf5" } as const;
const entryEvidencePanelStyle = { marginTop: 14, padding: 13, borderRadius: 11, border: "1px solid #d7e3f4", background: "#fcfdff" } as const;
const entryEvidenceMetaStyle = { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, color: "#475467", fontSize: 12, fontWeight: 700 } as const;
const entryEvidenceVerifiedStyle = { fontSize: 12, fontWeight: 850, color: "#067647", background: "#ecfdf3", border: "1px solid #abefc6", borderRadius: 999, padding: "4px 8px" } as const;
const entryEvidencePartialStyle = { fontSize: 12, fontWeight: 850, color: "#9a6700", background: "#fffaeb", border: "1px solid #fedf89", borderRadius: 999, padding: "4px 8px" } as const;
const entryEvidenceNeutralStyle = { fontSize: 12, fontWeight: 850, color: "#475467", background: "#f8fafc", border: "1px solid #d0d5dd", borderRadius: 999, padding: "4px 8px" } as const;
const entryEvidenceMissingStyle = { fontSize: 12, fontWeight: 850, color: "#b42318", background: "#fff6f5", border: "1px solid #fecdca", borderRadius: 999, padding: "4px 8px" } as const;
const qualificationProgressStyle = { marginTop: 14, padding: 13, borderRadius: 11, border: "1px solid #d7e3f4", background: "#f7faff" } as const;
const qualificationTopStyle = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" } as const;
const qualificationBadgeStyle = { fontSize: 12, fontWeight: 850, color: "#0057b8", background: "#eaf3ff", borderRadius: 999, padding: "4px 8px" } as const;
const qualificationPathStyle = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8, fontSize: 13, fontWeight: 700, color: "#344054" } as const;
const qualificationNoteStyle = { marginTop: 7, color: "#667085", fontSize: 12, lineHeight: 1.45 } as const;
const careerEvidencePanelStyle = { marginTop: 14, padding: 13, borderRadius: 11, border: "1px solid #d8e5f7", background: "#f8fbff" } as const;
const careerEvidenceMappedStyle = { fontSize: 12, fontWeight: 850, color: "#067647", background: "#ecfdf3", border: "1px solid #abefc6", borderRadius: 999, padding: "4px 8px" } as const;
const careerEvidenceInferredStyle = { fontSize: 12, fontWeight: 850, color: "#175cd3", background: "#eff8ff", border: "1px solid #b2ddff", borderRadius: 999, padding: "4px 8px" } as const;
const careerEvidenceNeutralStyle = { fontSize: 12, fontWeight: 850, color: "#475467", background: "#f8fafc", border: "1px solid #d0d5dd", borderRadius: 999, padding: "4px 8px" } as const;
const careerPathStyle = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8, fontSize: 13, fontWeight: 750, color: "#344054" } as const;
const oscaCodeStyle = { fontSize: 12, fontWeight: 850, color: "#175cd3", background: "#eff8ff", borderRadius: 999, padding: "3px 7px" } as const;
const careerSourceStyle = { fontSize: 11, color: "#667085", fontWeight: 650 } as const;
const feeEvidencePanelStyle = { marginTop: 14, padding: 13, borderRadius: 11, border: "1px solid #e1e6ed", background: "#fff" } as const;
const feeEvidenceVerifiedStyle = { fontSize: 12, fontWeight: 850, color: "#067647", background: "#ecfdf3", border: "1px solid #abefc6", borderRadius: 999, padding: "4px 8px" } as const;
const feeEvidenceEstimatedStyle = { fontSize: 12, fontWeight: 850, color: "#9a3412", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 999, padding: "4px 8px" } as const;
const feeEvidenceDerivedStyle = { fontSize: 12, fontWeight: 850, color: "#344054", background: "#f2f4f7", border: "1px solid #d0d5dd", borderRadius: 999, padding: "4px 8px" } as const;
const feeEvidenceNeutralStyle = { fontSize: 12, fontWeight: 850, color: "#475467", background: "#f8fafc", border: "1px solid #d0d5dd", borderRadius: 999, padding: "4px 8px" } as const;
const feeEvidenceMissingStyle = { fontSize: 12, fontWeight: 850, color: "#b42318", background: "#fff6f5", border: "1px solid #fecdca", borderRadius: 999, padding: "4px 8px" } as const;
const reasonStyle = { marginTop: 14, padding: 14, borderRadius: 11, background: "#f6f8fb", lineHeight: 1.5 } as const;
const successStyle = { marginTop: 14, padding: 12, borderRadius: 10, background: "#ecfdf3", color: "#067647", border: "1px solid #abefc6" } as const;
const neutralStyle = { marginTop: 14, padding: 12, borderRadius: 10, background: "#f8fafc", color: "#475467", border: "1px solid #d0d5dd" } as const;
const warningStyle = { marginTop: 14, padding: 12, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", borderRadius: 10 } as const;
const infoBannerStyle = { margin: "14px 0", padding: 12, borderRadius: 10, background: "#eef4ff", border: "1px solid #c7d7fe", color: "#344054" } as const;
const errorStyle = { marginTop: 14, padding: 14, background: "#fff6f5", border: "1px solid #fecdca", color: "#b42318", borderRadius: 11 } as const;
const emptyStyle = { marginTop: 14, padding: 22, border: "1px dashed #cfd5df", borderRadius: 12, color: "#667085" } as const;
const linkButtonStyle = { textDecoration: "none", background: "#0057b8", color: "#fff", borderRadius: 9, padding: "9px 12px", fontWeight: 800 } as const;
const secondaryLinkStyle = { textDecoration: "none", background: "#fff", color: "#344054", border: "1px solid #cfd5df", borderRadius: 9, padding: "9px 12px", fontWeight: 750 } as const;
