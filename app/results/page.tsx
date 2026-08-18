"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BriefcaseBusiness, CheckCircle2, DollarSign, ExternalLink, GraduationCap, MapPin, Route, ShieldCheck } from "lucide-react";
import SaveCourseButton from "@/components/SaveCourseButton";
import { demoCourses } from "@/lib/demo-courses";
import { loadVerifiedCourseCandidates } from "@/lib/course-catalog";
import { rankCourses, type CourseCandidate, type StudentAssessment } from "@/lib/recommendation";

const emptyProfile: StudentAssessment = {
  qualification: "",
  field: "",
  country: "",
  currentOccupation: "",
  desiredOccupation: "",
  annualBudget: "",
  totalBudget: "",
  livingBudget: "",
  state: "",
  city: "",
  regional: "yes",
  migrationGoal: "explore",
};

const money = (value: number | null) => value === null
  ? "Not yet verified"
  : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

export default function ResultsPage() {
  const [profile, setProfile] = useState<StudentAssessment>(emptyProfile);
  const [courses, setCourses] = useState<CourseCandidate[]>(demoCourses);
  const [catalogMode, setCatalogMode] = useState<"loading" | "verified" | "fallback">("loading");

  useEffect(() => {
    let assessment = emptyProfile;
    const saved = window.localStorage.getItem("unipath-assessment");
    if (saved) {
      try {
        assessment = { ...emptyProfile, ...JSON.parse(saved) };
        setProfile(assessment);
      } catch {
        setProfile(emptyProfile);
      }
    }

    let active = true;
    loadVerifiedCourseCandidates(assessment.field)
      .then((verified) => {
        if (!active) return;
        if (verified.length) {
          setCourses(verified);
          setCatalogMode("verified");
        } else {
          setCatalogMode("fallback");
        }
      })
      .catch((error) => {
        console.error("Verified catalogue unavailable", error);
        if (active) setCatalogMode("fallback");
      });

    return () => { active = false; };
  }, []);

  const results = useMemo(() => rankCourses(profile, courses), [profile, courses]);
  const top = results[0];

  return (
    <main className="resultsPage">
      <header className="assessmentHeader shell">
        <a href="/" className="brand"><span>U</span> UniPath Australia</a>
        <div className="resultsHeaderActions"><a href="/dashboard" className="editProfile">Dashboard</a><a href="/assessment" className="editProfile"><ArrowLeft size={16}/> Edit assessment</a></div>
      </header>

      <section className="resultsHero shell">
        <div>
          <p className="sectionLabel">PERSONALISED COURSE MATCHES</p>
          <h1>Your recommended study options</h1>
          <p>Ranked using academic fit, career alignment, affordability, location preference and available pathway evidence.</p>
        </div>
        {catalogMode === "verified" ? (
          <div className="verifiedBanner"><ShieldCheck size={18}/><div><b>Verified course catalogue</b><span>Core course details come from source-dated university and CRICOS records. Missing cost, regional or pathway information stays visibly pending until verified.</span></div></div>
        ) : catalogMode === "fallback" ? (
          <div className="demoBanner"><AlertTriangle size={18}/><div><b>Demo fallback active</b><span>The live verified catalogue could not be loaded, so these results use illustrative records and must not be used for enrolment or migration decisions.</span></div></div>
        ) : (
          <div className="verifiedBanner"><ShieldCheck size={18}/><div><b>Loading verified catalogue</b><span>Checking the most relevant source-backed course records for your study area.</span></div></div>
        )}
      </section>

      {top && <section className="bestMatch shell">
        <div className="bestBadge">BEST CURRENT MATCH</div>
        <div className="bestMain">
          <div><p>{top.university}</p><h2>{top.course}</h2><div className="courseMeta"><span><MapPin size={15}/>{locationLabel(top)}</span><span><GraduationCap size={15}/>{durationLabel(top.durationMonths)}</span>{regionalStatusLabel(top) && <span>{regionalStatusLabel(top)}</span>}</div>{catalogMode === "verified" && <div className="bestMatchActions"><a className="bestDetailsLink" href={`/courses/${top.id}`}>Open full course details →</a><SaveCourseButton courseId={top.id} compact /></div>}</div>
          <div className="scoreCircle"><strong>{top.totalScore}</strong><span>/100 fit score</span></div>
        </div>
        <div className="scoreBreakdown">
          <Score label="Academic" value={top.scores.academic}/><Score label="Career" value={top.scores.career}/><Score label="Affordability" value={top.scores.affordability}/><Score label="Location" value={top.scores.location}/><Score label="Migration evidence" value={top.scores.migration}/>
        </div>
      </section>}

      <section className="resultsLayout shell">
        <div className="resultsList">
          <div className="listTitle"><h2>All recommendations</h2><span>{results.length} ranked candidate matches</span></div>
          {results.map((result, index) => (
            <article className="resultCard" key={result.id}>
              <div className="resultRank">#{index + 1}</div>
              <div className="resultTop">
                <div><small>{result.university}</small><h3>{result.course}</h3><div className="courseMeta"><span><MapPin size={14}/>{locationLabel(result)}</span>{regionalStatusLabel(result) && <span>{regionalStatusLabel(result)}</span>}{result.courseCode && <span>Code {result.courseCode}</span>}{result.cricosCode && <span>CRICOS {result.cricosCode}</span>}</div></div>
                <div className="resultScore"><strong>{result.totalScore}%</strong><span>decision fit</span></div>
              </div>

              <div className="costRow">
                <div><small>{tuitionLabel(result)}</small><b>{money(result.annualFee)}</b></div>
                <div><small>EST. LIVING / MONTH</small><b>{money(result.estimatedMonthlyLiving)}</b></div>
                <div><small>COURSE TUITION + LIVING PROJECTION</small><b>{totalProjectionLabel(result)}</b></div>
                <div><small>VERIFIED PATHWAY EVIDENCE</small><b>{pathwayEvidence(result)}</b></div>
              </div>

              {(result.accreditation || result.sourceUrl || result.feeSourceUrl || catalogMode === "verified") && <div className="evidenceRow">
                <div className="evidenceMeta">{result.accreditation && <span><ShieldCheck size={14}/>{result.accreditation}</span>}</div>
                <div className="evidenceActions">
                  {catalogMode === "verified" && <SaveCourseButton courseId={result.id} compact />}
                  {catalogMode === "verified" && <a href={`/courses/${result.id}`}>Course details →</a>}
                  {catalogMode === "verified" && index > 0 && top && <a href={`/compare?ids=${top.id},${result.id}`}>Compare with #1 →</a>}
                  {result.feeSourceUrl && <a href={result.feeSourceUrl} target="_blank" rel="noreferrer">Fee source <ExternalLink size={13}/></a>}
                  {result.sourceUrl && result.sourceUrl !== result.feeSourceUrl && <a href={result.sourceUrl} target="_blank" rel="noreferrer">Course source <ExternalLink size={13}/></a>}
                </div>
              </div>}

              <div className="reasonColumns">
                <div><h4><CheckCircle2 size={16}/> Why it matches</h4>{result.reasons.length ? result.reasons.map(reason => <p key={reason}>{reason}</p>) : <p>Complete more profile fields for a more personalised explanation.</p>}</div>
                <div className="cautions"><h4><AlertTriangle size={16}/> Things to check</h4>{result.cautions.length ? result.cautions.map(caution => <p key={caution}>{caution}</p>) : <p>No major concerns identified from the currently verified fields.</p>}</div>
              </div>
            </article>
          ))}
        </div>

        <aside className="profileSummary">
          <h3>Your decision profile</h3>
          <Summary icon={<GraduationCap/>} label="Education" value={profile.field || profile.qualification || "Not supplied"}/>
          <Summary icon={<BriefcaseBusiness/>} label="Career goal" value={profile.desiredOccupation || "Not supplied"}/>
          <Summary icon={<DollarSign/>} label="Annual tuition budget" value={profile.annualBudget ? money(Number(profile.annualBudget)) : "Not supplied"}/>
          <Summary icon={<MapPin/>} label="Preferred location" value={profile.city || profile.state || "Australia-wide"}/>
          <Summary icon={<Route/>} label="Post-study goal" value={goalLabel(profile.migrationGoal)}/>
          <a className="secondary full" href="/assessment">Change preferences</a>
          <div className="pathwayDisclaimer"><b>Important</b><p>A fit or migration-evidence score is not a probability of receiving PR, a visa, admission or employment. Migration eligibility depends on current law, skills assessment, occupation tasks and individual circumstances.</p></div>
        </aside>
      </section>
    </main>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><div className="scoreBar"><i style={{ width: `${value}%` }}/></div><b>{value}</b></div>;
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="summaryItem"><span>{icon}</span><div><small>{label}</small><b>{value}</b></div></div>;
}

function locationLabel(course: CourseCandidate) {
  if (course.city && course.state) return `${course.city}, ${course.state}`;
  if (course.state) return course.state;
  return "Campus pending verification";
}

function regionalStatusLabel(course: CourseCandidate) {
  if (!course.state && !course.city) return null;
  if (!course.regionalVerified) return "Regional status pending";
  return course.regional ? "Regional" : "Metropolitan";
}

function tuitionLabel(course: CourseCandidate) {
  if (course.feeYear) return `ANNUAL TUITION (${course.feeYear})`;
  if (course.annualFee !== null && course.totalTuition != null) return "ANNUALISED CRICOS TUITION ESTIMATE";
  return "ANNUAL TUITION";
}

function totalProjectionLabel(course: ReturnType<typeof rankCourses>[number]) {
  if (course.estimatedTotalCost !== null) return `~${money(course.estimatedTotalCost)}`;
  if (course.totalTuition != null) return `${money(course.totalTuition)} tuition · living pending`;
  return "Pending comparable data";
}

function durationLabel(months: number) {
  if (!months) return "Duration pending";
  const years = months / 12;
  return `${Number.isInteger(years) ? years : years.toFixed(1)} years`;
}

function pathwayEvidence(course: CourseCandidate) {
  if ((course.migrationEvidenceCount ?? 0) > 0) {
    return course.migrationEvidenceLabels?.join("; ") ?? `${course.migrationEvidenceCount} verified link`;
  }
  return "Pending conservative mapping";
}

function goalLabel(value: string) {
  const labels: Record<string, string> = {
    return: "Return home",
    temporary: "Work temporarily in Australia",
    explore: "Explore skilled migration",
    regional: "Open to regional pathways",
    employer: "Employer sponsorship interest",
    unsure: "Unsure",
  };
  return labels[value] || "Not supplied";
}
