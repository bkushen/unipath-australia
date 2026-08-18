"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, GraduationCap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const steps = ["Education", "Career", "Budget", "Location", "Migration", "Review"];

export default function AssessmentPage() {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
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
  });

  const progress = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step]);
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const finish = async () => {
    setSaving(true);
    window.localStorage.setItem("unipath-assessment", JSON.stringify(form));

    try {
      const supabase = createClient();
      const { data: claimsData } = await supabase.auth.getClaims();
      const userId = claimsData?.claims?.sub;

      if (userId) {
        const numeric = (value: string) => value ? Number(value) : null;

        await supabase.from("assessments").insert({
          user_id: userId,
          payload: form,
        });

        await supabase.from("student_profiles").upsert({
          user_id: userId,
          current_country: form.country || null,
          highest_qualification: form.qualification || null,
          qualification_field: form.field || null,
          current_occupation: form.currentOccupation || null,
          desired_occupation: form.desiredOccupation || null,
          annual_tuition_budget: numeric(form.annualBudget),
          total_budget: numeric(form.totalBudget),
          monthly_living_budget: numeric(form.livingBudget),
          preferred_states: form.state ? [form.state] : [],
          preferred_cities: form.city ? [form.city] : [],
          regional_accepted: form.regional !== "no",
          migration_goal: form.migrationGoal,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
    } catch (error) {
      console.error("Assessment persistence failed; continuing with local results.", error);
    }

    window.location.href = "/results";
  };

  return (
    <main className="assessmentPage">
      <header className="assessmentHeader shell">
        <a href="/" className="brand"><span>U</span> UniPath Australia</a>
        <div className="assessmentProgress"><b>{progress}%</b><span><i style={{ width: `${progress}%` }} /></span></div>
      </header>

      <section className="assessmentWrap shell">
        <aside className="steps">
          <p>STUDENT ASSESSMENT</p>
          {steps.map((label, index) => (
            <div className={`step ${index === step ? "active" : ""} ${index < step ? "done" : ""}`} key={label}>
              <span>{index < step ? <Check size={15}/> : index + 1}</span>{label}
            </div>
          ))}
        </aside>

        <section className="formPanel">
          {step === 0 && <div>
            <div className="formIcon"><GraduationCap/></div><p className="sectionLabel">STEP 1 OF 6</p><h1>Your education</h1><p className="muted">We use this to identify academically suitable courses and avoid recommending qualifications that do not fit your background.</p>
            <div className="formGrid">
              <label>Highest qualification<select value={form.qualification} onChange={e=>update("qualification",e.target.value)}><option value="">Select qualification</option><option>Bachelor&apos;s degree</option><option>Master&apos;s degree</option><option>Graduate diploma</option><option>Diploma</option><option>Advanced diploma</option><option>High school / Year 12</option><option>Other</option></select></label>
              <label>Field of study<input placeholder="e.g. Software Engineering" value={form.field} onChange={e=>update("field",e.target.value)}/></label>
              <label>Country of qualification<input placeholder="e.g. Sri Lanka" value={form.country} onChange={e=>update("country",e.target.value)}/></label>
            </div>
          </div>}

          {step === 1 && <div><p className="sectionLabel">STEP 2 OF 6</p><h1>Your career direction</h1><p className="muted">Tell us where you are now and where you want the qualification to take you.</p><div className="formGrid"><label>Current profession<input placeholder="e.g. Software Developer" value={form.currentOccupation} onChange={e=>update("currentOccupation",e.target.value)}/></label><label>Future profession<input placeholder="e.g. Cyber Security Analyst" value={form.desiredOccupation} onChange={e=>update("desiredOccupation",e.target.value)}/></label></div></div>}

          {step === 2 && <div><p className="sectionLabel">STEP 3 OF 6</p><h1>Your budget</h1><p className="muted">UniPath will compare tuition and estimated living expenses, not tuition alone.</p><div className="formGrid"><label>Maximum tuition per year (AUD)<input type="number" min="0" placeholder="35000" value={form.annualBudget} onChange={e=>update("annualBudget",e.target.value)}/></label><label>Total available study budget (AUD)<input type="number" min="0" placeholder="90000" value={form.totalBudget} onChange={e=>update("totalBudget",e.target.value)}/></label><label>Monthly living budget (AUD)<input type="number" min="0" placeholder="2200" value={form.livingBudget} onChange={e=>update("livingBudget",e.target.value)}/></label></div></div>}

          {step === 3 && <div><p className="sectionLabel">STEP 4 OF 6</p><h1>Where would you like to live?</h1><p className="muted">Location affects rent, transport, lifestyle, university choice and some regional pathway considerations.</p><div className="formGrid"><label>Preferred state<select value={form.state} onChange={e=>update("state",e.target.value)}><option value="">Anywhere in Australia</option>{["VIC","NSW","QLD","SA","WA","TAS","ACT","NT"].map(s=><option key={s}>{s}</option>)}</select></label><label>Preferred city<input placeholder="e.g. Melbourne" value={form.city} onChange={e=>update("city",e.target.value)}/></label><label>Would you consider a regional area?<select value={form.regional} onChange={e=>update("regional",e.target.value)}><option value="yes">Yes</option><option value="maybe">Maybe</option><option value="no">No</option></select></label></div></div>}

          {step === 4 && <div><p className="sectionLabel">STEP 5 OF 6</p><h1>Your plans after graduation</h1><p className="muted">We do not treat any course as a guarantee of permanent residency. We use this answer to show relevant, current pathway information alongside career suitability.</p><div className="choiceList">{[["return","Return to my home country"],["temporary","Work temporarily in Australia"],["explore","Explore skilled migration options"],["regional","I am open to regional pathways"],["employer","Employer sponsorship interests me"],["unsure","I am not sure yet"]].map(([value,label])=><button type="button" className={form.migrationGoal===value?"selected":""} onClick={()=>update("migrationGoal",value)} key={value}>{form.migrationGoal===value?<Check size={17}/>:<span/>}{label}</button>)}</div></div>}

          {step === 5 && <div><p className="sectionLabel">STEP 6 OF 6</p><h1>Profile review</h1><p className="muted">This profile will become the input for the recommendation engine. If you are signed in, it will also be saved securely to your account.</p><div className="reviewGrid"><div><small>EDUCATION</small><b>{form.qualification || "Not supplied"}</b><span>{form.field || "Field not supplied"}</span></div><div><small>CAREER GOAL</small><b>{form.desiredOccupation || "Not supplied"}</b><span>Current: {form.currentOccupation || "Not supplied"}</span></div><div><small>BUDGET</small><b>{form.annualBudget ? `$${Number(form.annualBudget).toLocaleString()}/year` : "Not supplied"}</b><span>Total: {form.totalBudget ? `$${Number(form.totalBudget).toLocaleString()}` : "Not supplied"}</span></div><div><small>LOCATION</small><b>{form.city || form.state || "Australia-wide"}</b><span>Regional: {form.regional}</span></div></div><div className="notice">Recommendation results distinguish verified data, estimates and pathway interpretation. Migration information is educational and not migration advice.</div></div>}

          <div className="formActions"><button className="back" disabled={step===0 || saving} onClick={()=>setStep(s=>Math.max(0,s-1))}><ArrowLeft size={17}/> Back</button>{step < steps.length-1 ? <button className="button" onClick={()=>setStep(s=>Math.min(steps.length-1,s+1))}>Continue <ArrowRight size={17}/></button> : <button className="button" disabled={saving} onClick={finish}>{saving ? "Saving..." : "Generate recommendations"} {!saving && <ArrowRight size={17}/>}</button>}</div>
        </section>
      </section>
    </main>
  );
}
