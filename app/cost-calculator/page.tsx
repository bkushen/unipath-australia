import Link from "next/link";
import { ArrowLeft, Calculator, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CostCalculator from "./CostCalculator";
import styles from "./cost-calculator.module.css";

export const dynamic = "force-dynamic";

type CourseSeed = {
  name: string;
  duration_months: number | null;
  cricos_tuition_fee_total: number | null;
  annual_fee: number | null;
  universities: { name: string } | null;
};

export default async function CostCalculatorPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const { course: courseId } = await searchParams;
  const supabase = await createClient();
  let initialCourse: { name: string; university: string; totalTuition: number | null; durationMonths: number | null; feeEvidence: string } | null = null;

  if (courseId) {
    const { data } = await supabase.from("courses").select("name,duration_months,cricos_tuition_fee_total,annual_fee,universities(name)").eq("id", courseId).eq("verification_status", "VERIFIED").maybeSingle();
    const course = data as unknown as CourseSeed | null;
    if (course) {
      const total = course.cricos_tuition_fee_total && course.cricos_tuition_fee_total > 100
        ? course.cricos_tuition_fee_total
        : course.annual_fee && course.duration_months
          ? Math.round(course.annual_fee * (course.duration_months / 12))
          : null;
      initialCourse = {
        name: course.name,
        university: course.universities?.name ?? "Australian university",
        totalTuition: total,
        durationMonths: course.duration_months,
        feeEvidence: course.cricos_tuition_fee_total && course.cricos_tuition_fee_total > 100 ? "official CRICOS whole-course tuition" : course.annual_fee ? "projection from verified annual fee" : "tuition pending verification",
      };
    }
  }

  return (
    <main className={styles.page}>
      <header className={`${styles.header} shell`}>
        <Link href="/" className="brand"><span>U</span> UniPath Australia</Link>
        <Link className={styles.back} href={courseId ? `/courses/${courseId}` : "/courses"}><ArrowLeft size={15}/> {courseId ? "Back to course" : "Back to courses"}</Link>
      </header>
      <section className={`${styles.hero} shell`}>
        <div><p className="sectionLabel">TOTAL COST PLANNER</p><h1>Plan for more than tuition.</h1><p>Estimate the full study budget using tuition evidence plus your own living, health cover, travel, setup, placement and emergency assumptions.</p></div>
        <div className={styles.trust}><Calculator size={20}/><span><b>Scenario calculator</b>Every non-source-backed amount is editable and treated as your planning assumption.</span></div>
      </section>
      <section className="shell"><CostCalculator course={initialCourse}/></section>
      <section className={`${styles.method} shell`}>
        <ShieldCheck size={18}/><div><b>How UniPath treats cost evidence</b><p>Verified whole-course CRICOS tuition is used when available. A university annual fee may be projected across duration only when the exact course total is unavailable. Living and personal costs remain user-adjustable estimates unless a comparable source has been verified.</p></div>
      </section>
    </main>
  );
}
