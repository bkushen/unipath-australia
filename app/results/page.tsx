"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BriefcaseBusiness, CheckCircle2, DollarSign, GraduationCap, MapPin, Route } from "lucide-react";
import { demoCourses } from "@/lib/demo-courses";
import { rankCourses, type StudentAssessment } from "@/lib/recommendation";

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

const money = (value: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

export default function ResultsPage() {
  const [profile, setProfile] = useState<StudentAssessment>(emptyProfile);

  useEffect(() => {
    const saved = window.localStorage.getItem("unipath-assessment");
    if (saved) {
      try { setProfile(JSON.parse(saved)); } catch { setProfile(emptyProfile); }
    }
  }, []);

  const results = useMemo(() => rankCourses(profile, demoCourses), [profile]);
  const top = results[0];

  return (
    <main className="resultsPage">
      <header className="assessmentHeader shell">
        <a href="/" className="brand"><span>U</span> UniPath Australia</a>
        <a href="/assessment" className="editProfile"><ArrowLeft size={16}/> Edit assessment</a>
      </header>

      <section className="resultsHero shell">
        <div>
          <p className="sectionLabel">PERSONALISED COURSE MATCHES</p>
          <h1>Your recommended study options</h1>
          <p>Ranked using academic fit, career alignment, affordability, location preference and migration-pathway alignment.</p>
        </div>
        <div className="demoBanner"><AlertTriangle size={18}/><div><b>Prototype data</b><span>Course names, fees, living costs and pathway indicators below are illustrative demo records. Production launch will use source-dated verified records.</span></div></div>
      </section>

      {top && <section className="bestMatch shell">
        <div className="bestBadge">BEST CURRENT MATCH</div>
        <div className="bestMain">
          <div><p>{top.university}</p><h2>{top.course}</h2><div className="courseMeta"><span><MapPin size={15}/>{top.city}, {top.state}</span><span><GraduationCap size={15}/>{top.durationMonths / 12} years</span><span>{top.regional ? "Regional" : "Metropolitan"}</span></div></div>
          <div className="scoreCircle"><strong>{top.totalScore}</strong><span>/100 match</span></div>
        </div>
        <div className="scoreBreakdown">
          <Score label="Academic" value={top.scores.academic}/><Score label="Career" value={top.scores.career}/><Score label="Affordability" value={top.scores.affordability}/><Score label="Location" value={top.scores.location}/><Score label="Pathways" value={top.scores.migration}/>
        </div>
      </section>}

      <section className="resultsLayout shell">
        <div className="resultsList">
          <div className="listTitle"><h2>All recommendations</h2><span>{results.length} prototype matches</span></div>
          {results.map((result, index) => (
            <article className="resultCard" key={result.id}>
              <div className="resultRank">#{index + 1}</div>
              <div className="resultTop">
                <div><small>{result.university}</small><h3>{result.course}</h3><div className="courseMeta"><span><MapPin size={14}/>{result.city}, {result.state}</span><span>{result.regional ? "Regional" : "Metro"}</span></div></div>
                <div className="resultScore"><strong>{result.totalScore}%</strong><span>overall match</span></div>
              </div>

              <div className="costRow">
                <div><small>ANNUAL TUITION</small><b>{money(result.annualFee)}</b></div>
                <div><small>EST. LIVING / MONTH</small><b>{money(result.estimatedMonthlyLiving)}</b></div>
                <div><small>EST. TOTAL COURSE + LIVING</small><b>{money(result.estimatedTotalCost)}</b></div>
                <div><small>PATHWAY ALIGNMENT</small><b>{result.migrationAlignment}</b></div>
              </div>

              <div className="reasonColumns">
                <div><h4><CheckCircle2 size={16}/> Why it matches</h4>{result.reasons.length ? result.reasons.map(reason => <p key={reason}>{reason}</p>) : <p>Complete more profile fields for a more personalised explanation.</p>}</div>
                <div className="cautions"><h4><AlertTriangle size={16}/> Things to check</h4>{result.cautions.length ? result.cautions.map(caution => <p key={caution}>{caution}</p>) : <p>No major prototype concerns identified from the supplied profile.</p>}</div>
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
          <div className="pathwayDisclaimer"><b>Important</b><p>A pathway score is not a probability of receiving PR or a visa. Eligibility depends on current law and individual circumstances.</p></div>
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
