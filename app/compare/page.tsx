import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LivingCost = { weekly_low: number | null; weekly_high: number | null; monthly_estimate: number | null; verification_status: string };
type CompareCourse = {
  id: string;
  name: string;
  qualification_level: string;
  university_course_code: string | null;
  cricos_code: string | null;
  duration_months: number | null;
  source_url: string | null;
  universities: { name: string } | null;
  study_fields: { name: string } | null;
  course_fees: Array<{ fee_year: number; student_type: string; annual_fee: number | null; verification_status: string }>;
  course_campuses: Array<{ campuses: { name: string; city: string; state: string; regional: boolean; living_costs: LivingCost[] } | null }>;
  entry_requirements: Array<{ academic_text: string | null; minimum_gpa: number | null; ielts_overall: number | null; pte_overall: number | null }>;
  course_accreditations: Array<{ body_name: string; accreditation_level: string | null; status: string | null }>;
  course_occupations: Array<{ occupations: { name: string } | null }>;
  course_intakes: Array<{ month: number; year: number }>;
};

const money = (value: number | null) => value === null
  ? "Pending verification"
  : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

const monthName = (month: number) => new Intl.DateTimeFormat("en-AU", { month: "short" }).format(new Date(2026, month - 1, 1));

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids: rawIds } = await searchParams;
  const ids = (rawIds ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 4);
  const supabase = await createClient();
  let courses: CompareCourse[] = [];

  if (ids.length) {
    const { data } = await supabase
      .from("courses")
      .select(`
        id,
        name,
        qualification_level,
        university_course_code,
        cricos_code,
        duration_months,
        source_url,
        universities(name),
        study_fields(name),
        course_fees(fee_year, student_type, annual_fee, verification_status),
        course_campuses(campuses(name, city, state, regional, living_costs(weekly_low, weekly_high, monthly_estimate, verification_status))),
        entry_requirements(academic_text, minimum_gpa, ielts_overall, pte_overall),
        course_accreditations(body_name, accreditation_level, status),
        course_occupations(occupations(name)),
        course_intakes(month, year)
      `)
      .in("id", ids)
      .eq("verification_status", "VERIFIED");

    const loaded = (data ?? []) as unknown as CompareCourse[];
    courses = ids.map((id) => loaded.find((course) => course.id === id)).filter((item): item is CompareCourse => Boolean(item));
  }

  return (
    <main className="comparePage">
      <header className="assessmentHeader shell">
        <a href="/" className="brand"><span>U</span> UniPath Australia</a>
        <a href="/results" className="editProfile"><ArrowLeft size={16}/> Back to recommendations</a>
      </header>

      <section className="compareHero shell">
        <p className="sectionLabel">SIDE-BY-SIDE COMPARISON</p>
        <h1>Compare your shortlisted courses</h1>
        <p>Only source-backed fields are compared. Missing living-cost or migration information stays visibly pending until it is verified.</p>
      </section>

      {!courses.length ? (
        <section className="compareEmpty shell"><h2>No courses selected yet</h2><p>Open your recommendations and choose a course to compare with your top match.</p><a className="button" href="/results">View recommendations</a></section>
      ) : (
        <section className="comparisonShell shell">
          <div className="comparisonGrid" style={{ ["--course-count" as string]: courses.length }}>
            <div className="comparisonLabel headerLabel">COURSE</div>
            {courses.map((course) => <div className="comparisonCourseHead" key={course.id}><small>{course.universities?.name ?? "University"}</small><h2>{course.name}</h2><a href={`/courses/${course.id}`}>Full details →</a></div>)}

            <CompareRow label="Latest verified international fee" courses={courses} render={latestFeeLabel} />
            <CompareRow label="Course duration" courses={courses} render={(course) => course.duration_months ? `${course.duration_months / 12} years` : "Pending verification"} />
            <CompareRow label="Campus / location" courses={courses} render={campusLabel} />
            <CompareRow label="Regional status" courses={courses} render={(course) => { const campus = firstCampus(course); return campus ? (campus.regional ? "Regional" : "Metropolitan") : "Pending verification"; }} />
            <CompareRow label="Course code" courses={courses} render={(course) => course.university_course_code ?? "Pending"} />
            <CompareRow label="CRICOS" courses={courses} render={(course) => course.cricos_code ?? "Pending verification"} />
            <CompareRow label="Study area" courses={courses} render={(course) => course.study_fields?.name ?? "Pending"} />
            <CompareRow label="Academic entry" courses={courses} render={(course) => course.entry_requirements[0]?.academic_text ?? "Pending verification"} long />
            <CompareRow label="IELTS overall" courses={courses} render={(course) => course.entry_requirements[0]?.ielts_overall?.toString() ?? "Pending"} />
            <CompareRow label="PTE overall" courses={courses} render={(course) => course.entry_requirements[0]?.pte_overall?.toString() ?? "Not recorded"} />
            <CompareRow label="Professional accreditation" courses={courses} render={accreditationLabel} long />
            <CompareRow label="Recorded career outcomes" courses={courses} render={careerLabel} long />
            <CompareRow label="Recorded intakes" courses={courses} render={intakeLabel} />
            <CompareRow label="Indicative living cost" courses={courses} render={livingCostLabel} />
            <CompareRow label="Migration pathway mapping" courses={courses} render={() => "Pending government-verified occupation mapping"} />
          </div>

          <div className="compareEvidence">
            <ShieldCheck size={18}/><div><b>Evidence-first comparison</b><span>Fee years are shown explicitly so different academic years are not silently treated as equivalent. Living costs remain estimates. Migration information is not inferred from a course name.</span></div>
          </div>

          <div className="compareSources">
            <h2>Official course sources</h2>
            {courses.map((course) => <div key={course.id}><span>{course.universities?.name} — {course.name}</span>{course.source_url ? <a href={course.source_url} target="_blank" rel="noreferrer">Open source <ExternalLink size={13}/></a> : <b>Source pending</b>}</div>)}
          </div>
        </section>
      )}
    </main>
  );
}

function CompareRow({ label, courses, render, long = false }: { label: string; courses: CompareCourse[]; render: (course: CompareCourse) => string; long?: boolean }) {
  return <><div className={`comparisonLabel ${long ? "long" : ""}`}>{label}</div>{courses.map((course) => <div className={`comparisonValue ${long ? "long" : ""}`} key={`${course.id}-${label}`}>{render(course)}</div>)}</>;
}

function firstCampus(course: CompareCourse) {
  return course.course_campuses.find((item) => item.campuses)?.campuses ?? null;
}

function campusLabel(course: CompareCourse) {
  const campus = firstCampus(course);
  return campus ? `${campus.name} · ${campus.city}, ${campus.state}` : "Pending verification";
}

function latestFeeLabel(course: CompareCourse) {
  const fee = [...course.course_fees].filter((item) => item.student_type === "international" && item.verification_status === "VERIFIED").sort((a, b) => b.fee_year - a.fee_year)[0];
  return fee ? `${money(fee.annual_fee)} (${fee.fee_year})` : "Pending verification";
}

function livingCostLabel(course: CompareCourse) {
  const cost = firstCampus(course)?.living_costs.find((item) => item.verification_status !== "UNVERIFIED");
  if (!cost) return "Pending comparable source";
  if (cost.weekly_low !== null && cost.weekly_high !== null) return `${money(cost.weekly_low * 52)}–${money(cost.weekly_high * 52)}/year (${cost.verification_status.toLowerCase()})`;
  if (cost.monthly_estimate !== null) return `${money(cost.monthly_estimate)}/month (${cost.verification_status.toLowerCase()})`;
  return "Pending comparable source";
}

function accreditationLabel(course: CompareCourse) {
  if (!course.course_accreditations.length) return "Pending verification";
  return course.course_accreditations.map((item) => [item.body_name, item.accreditation_level, item.status].filter(Boolean).join(" · ")).join("; ");
}

function careerLabel(course: CompareCourse) {
  const careers = course.course_occupations.map((item) => item.occupations?.name).filter(Boolean);
  return careers.length ? careers.join(", ") : "Pending verification";
}

function intakeLabel(course: CompareCourse) {
  const intakes = [...course.course_intakes].sort((a, b) => a.year - b.year || a.month - b.month);
  return intakes.length ? intakes.map((item) => `${monthName(item.month)} ${item.year}`).join(", ") : "Pending verification";
}
