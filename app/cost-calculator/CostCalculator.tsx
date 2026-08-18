"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, WalletCards } from "lucide-react";
import styles from "./cost-calculator.module.css";

type InitialCourse = {
  name: string;
  university: string;
  totalTuition: number | null;
  durationMonths: number | null;
  feeEvidence: string;
};

type Inputs = {
  tuition: number;
  months: number;
  monthlyLiving: number;
  oshc: number;
  visaAndApplication: number;
  travelAndSetup: number;
  booksAndEquipment: number;
  placementAndOther: number;
  emergencyBuffer: number;
  availableBudget: number;
};

const AUD = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export default function CostCalculator({ course }: { course: InitialCourse | null }) {
  const [values, setValues] = useState<Inputs>({
    tuition: course?.totalTuition ?? 0,
    months: course?.durationMonths ?? 24,
    monthlyLiving: 2500,
    oshc: 1600,
    visaAndApplication: 2500,
    travelAndSetup: 3500,
    booksAndEquipment: 1500,
    placementAndOther: 1000,
    emergencyBuffer: 5000,
    availableBudget: 0,
  });

  const result = useMemo(() => {
    const living = values.monthlyLiving * Math.max(values.months, 0);
    const nonTuition = living + values.oshc + values.visaAndApplication + values.travelAndSetup + values.booksAndEquipment + values.placementAndOther + values.emergencyBuffer;
    const total = values.tuition + nonTuition;
    const gap = values.availableBudget > 0 ? values.availableBudget - total : null;
    const annualised = values.months > 0 ? total / (values.months / 12) : total;
    return { living, nonTuition, total, gap, annualised };
  }, [values]);

  function set(key: keyof Inputs, raw: string) {
    const value = Number(raw);
    setValues((current) => ({ ...current, [key]: Number.isFinite(value) ? Math.max(0, value) : 0 }));
  }

  return (
    <div className={styles.layout}>
      <section className={styles.formCard}>
        {course && <div className={styles.courseBanner}><WalletCards size={18}/><div><b>{course.name}</b><span>{course.university} · {course.feeEvidence}</span></div></div>}
        <h2>Build your study budget</h2>
        <p className={styles.help}>Change any value to model your own situation. User-entered amounts are estimates, not official visa financial-capacity requirements.</p>

        <div className={styles.fields}>
          <MoneyField label="Whole-course tuition" value={values.tuition} onChange={(v) => set("tuition", v)} hint={course ? course.feeEvidence : "Enter the tuition evidence you want to model"}/>
          <NumberField label="Course duration (months)" value={values.months} onChange={(v) => set("months", v)}/>
          <MoneyField label="Living costs per month" value={values.monthlyLiving} onChange={(v) => set("monthlyLiving", v)} hint="Rent, food, utilities and local transport"/>
          <MoneyField label="OSHC / health cover" value={values.oshc} onChange={(v) => set("oshc", v)}/>
          <MoneyField label="Visa + application costs" value={values.visaAndApplication} onChange={(v) => set("visaAndApplication", v)}/>
          <MoneyField label="Travel + initial setup" value={values.travelAndSetup} onChange={(v) => set("travelAndSetup", v)}/>
          <MoneyField label="Books + equipment" value={values.booksAndEquipment} onChange={(v) => set("booksAndEquipment", v)}/>
          <MoneyField label="Placement + other study costs" value={values.placementAndOther} onChange={(v) => set("placementAndOther", v)}/>
          <MoneyField label="Emergency buffer" value={values.emergencyBuffer} onChange={(v) => set("emergencyBuffer", v)}/>
          <MoneyField label="Your available total budget" value={values.availableBudget} onChange={(v) => set("availableBudget", v)} hint="Optional — used only to calculate your gap"/>
        </div>
      </section>

      <aside className={styles.summaryCard}>
        <p className="sectionLabel">FINANCIAL READINESS</p>
        <div className={styles.total}><span>Projected study budget</span><b>{AUD.format(result.total)}</b><small>current-input projection</small></div>
        <div className={styles.breakdown}>
          <Row label="Tuition" value={values.tuition}/>
          <Row label={`Living (${values.months} months)`} value={result.living}/>
          <Row label="OSHC" value={values.oshc}/>
          <Row label="Visa / application" value={values.visaAndApplication}/>
          <Row label="Travel / setup" value={values.travelAndSetup}/>
          <Row label="Books / equipment" value={values.booksAndEquipment}/>
          <Row label="Placement / other" value={values.placementAndOther}/>
          <Row label="Emergency buffer" value={values.emergencyBuffer}/>
        </div>
        <div className={styles.annualised}><span>Average budget per year</span><b>{AUD.format(result.annualised)}</b></div>

        {result.gap !== null && (
          <div className={`${styles.gap} ${result.gap >= 0 ? styles.positive : styles.negative}`}>
            {result.gap >= 0 ? <CheckCircle2 size={19}/> : <AlertTriangle size={19}/>}<div><b>{result.gap >= 0 ? `${AUD.format(result.gap)} buffer` : `${AUD.format(Math.abs(result.gap))} funding gap`}</b><span>Compared with your entered total budget.</span></div>
          </div>
        )}

        <div className={styles.disclaimer}><b>Important</b><p>This calculator is budgeting support, not financial or migration advice. Official visa requirements can use different prescribed amounts and rules. UniPath keeps those official benchmarks separate from your real-world planning assumptions.</p></div>
      </aside>
    </div>
  );
}

function MoneyField({ label, value, onChange, hint }: { label: string; value: number; onChange: (value: string) => void; hint?: string }) {
  return <label><span>{label}</span><div className={styles.moneyInput}><b>AUD</b><input type="number" min="0" step="100" value={value} onChange={(event) => onChange(event.target.value)}/></div>{hint && <small>{hint}</small>}</label>;
}
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input className={styles.numberInput} type="number" min="1" step="1" value={value} onChange={(event) => onChange(event.target.value)}/></label>;
}
function Row({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><b>{AUD.format(value)}</b></div>; }
