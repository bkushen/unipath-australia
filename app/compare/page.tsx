import Link from "next/link";
import { ArrowLeft, ExternalLink, ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LivingCost = { weekly_low: number | null; weekly_high: number | null; monthly_estimate: number | null; verification_status: string };
type Campus = {
  name: string;
  city: string;
  state: string;
  regional: boolean;
  regional_verified: boolean;
  regional_classification: string | null;
  regional_source_url: string | null;
  living_costs: LivingCost[];
};
type CompareCourse = {
  id: string;
  name: string;
  qualification_level: string;
  university_course_code: string | null;
  cricos_code: string | null;
  cricos_tuition_fee_total: number | null;
  cricos_duration_weeks: number | null;
  duration_months: number | null;
  source_url: string | null;
  cricos_fee_source_url: string | null;
  universities: { name: string } | null;
  study_fields: { name: string } | null;
  course_fees: Array<{ fee_year: number; student_type: string; annual_fee: number | null; verification_status: string }>;
  course_campuses: Array<{ campuses: Campus | null }>;
  entry_requirements: Array<{ academic_text: string | null; minimum_gpa: number | null; ielts_overall: number | null; pte_overall: number | null }>;
  course_accreditations: Array<{ body_name: string; accreditation_level: string | null; status: string | null }>;
  course_occupations: Array<{ occupations: { name: string } | null }>;
  course_intakes: Array<{ month: number; year: number }>;
};

type CompareMigrationLink = {
  course_id: string;
  confidence: string;
  skilled_occupations: {
    name: string;
    assessing_authority: string | null;
    skilled_occupation_codes: Array<{ anzsco_code: string; anzsco_version: string }>;
    skilled_occupation_programs: Array<{ migration_programs: { subclass: string; name: string; stream: string; pathway_type: string } | null }>;
  } | null;
};

const money = (value: number | null) => value === null ? "Pending verification" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
const monthName = (month: number) => new Intl.DateTimeFormat("en-AU", { month: "short" }).format(new Date(2026, month - 1, 1));

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids: rawIds } = await searchParams;
  const ids = (rawIds ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 4);
  const supabase = await createClient();
  let courses: CompareCourse[] = [];
  let migrationLinks: CompareMigrationLink[] = [];

  if (ids.length) {
    const [{ data }, { data: migrationData }] = await Promise.all([
      supabase.from("courses").select(`
        id,name,qualification_level,university_course_code,cricos_code,cricos_tuition_fee_total,cricos_duration_weeks,duration_months,source_url,cricos_fee_source_url,
        universities(name),study_fields(name),course_fees(fee_year,student_type,annual_fee,verification_status),
        course_campuses(campuses(name,city,state,regional,regional_verified,regional_classification,regional_source_url,living_costs(weekly_low,weekly_high,monthly_estimate,verification_status))),
        entry_requirements(academic_text,minimum_gpa,ielts_overall,pte_overall),course_accreditations(body_name,accreditation_level,status),
        course_occupations(occupations(name)),course_intakes(month,year)
      `).in("id", ids).eq("verification_status", "VERIFIED"),
      supabase.from("course_skilled_occupation_links").select(`
        course_id,confidence,skilled_occupations(name,assessing_authority,skilled_occupation_codes(anzsco_code,anzsco_version),skilled_occupation_programs(migration_programs(subclass,name,stream,pathway_type)))
      `).in("course_id", ids)
    ]);
    const loaded = (data ?? []) as unknown as CompareCourse[];
    courses = ids.map((id) => loaded.find((course) => course.id === id)).filter((item): item is CompareCourse => Boolean(item));
    migrationLinks = (migrationData ?? []) as unknown as CompareMigrationLink[];
  }

  return (
    <main className="comparePage">
      <header className="assessmentHeader shell">
        <Link href="/" className="brand"><span>U</span> UniPath Australia</Link>
        <Link href="/courses" className="editProfile"><ArrowLeft size={16}/> Back to course explorer</Link>
      </header>

      <section className="compareHero shell">
        <p className="sectionLabel">SIDE-BY-SIDE COMPARISON</p>
        <h1>Compare up to four courses</h1>
        <p>Tuition, regional classification, living-cost and migration rows are kept separate so a missing field never turns into a guessed advantage.</p>
      </section>

      {!courses.length ? (
        <section className="compareEmpty shell"><h2>No courses selected yet</h2><p>Add two to four courses from the course explorer.</p><Link className="button" href="/courses">Browse courses</Link></section>
      ) : (
        <section className="comparisonShell shell">
          <div className="comparisonGrid" style={{ ["--course-count" as string]: courses.length }}>
            <div className="comparisonLabel headerLabel">COURSE</div>
            {courses.map((course) => <div className="comparisonCourseHead" key={course.id}><small>{course.universities?.name ?? "University"}</small><h2>{course.name}</h2><div className="compareHeadActions"><Link href={`/courses/${course.id}`}>Full details →</Link><Link aria-label={`Remove ${course.name}`} href={removeHref(ids, course.id)}><X size={13}/> Remove</Link></div></div>)}

            <CompareRow label="Exact whole-course tuition" courses={courses} render={(course) => course.cricos_tuition_fee_total && course.cricos_tuition_fee_total > 100 ? money(course.cricos_tuition_fee_total) : latestUniversityTotalFallback(course)} />
            <CompareRow label="Annual tuition comparison" courses={courses} render={latestFeeLabel} />
            <CompareRow label="Course duration" courses={courses} render={durationLabel} />
            <CompareRow label="Campus / location" courses={courses} render={campusLabel} />
            <CompareRow label="Home Affairs regional category" courses={courses} render={regionalLabel} long />
            <CompareRow label="CRICOS" courses={courses} render={(course) => course.cricos_code ?? "Pending verification"} />
            <CompareRow label="Study area" courses={courses} render={(course) => course.study_fields?.name ?? "Pending"} />
            <CompareRow label="Academic entry" courses={courses} render={(course) => course.entry_requirements[0]?.academic_text ?? "Pending university-specific verification"} long />
            <CompareRow label="IELTS overall" courses={courses} render={(course) => course.entry_requirements[0]?.ielts_overall?.toString() ?? "Pending"} />
            <CompareRow label="PTE overall" courses={courses} render={(course) => course.entry_requirements[0]?.pte_overall?.toString() ?? "Not recorded"} />
            <CompareRow label="Professional accreditation" courses={courses} render={accreditationLabel} long />
            <CompareRow label="Recorded career outcomes" courses={courses} render={careerLabel} long />
            <CompareRow label="Recorded intakes" courses={courses} render={intakeLabel} />
            <CompareRow label="Indicative living cost" courses={courses} render={livingCostLabel} />
            <CompareRow label="Verified skilled-migration evidence" courses={courses} render={(course) => migrationLabel(course, migrationLinks)} long />
          </div>

          <div className="compareEvidence"><ShieldCheck size={18}/><div><b>Evidence-first comparison</b><span>Category 2/3 means the campus postcode is currently classified as designated regional. It does not mean the course guarantees a visa, skilled occupation outcome or permanent residency.</span></div></div>

          <div className="compareSources">
            <h2>Evidence sources</h2>
            {courses.map((course) => {
              const campus = firstCampus(course);
              return <div key={course.id}><span>{course.universities?.name} — {course.name}</span><span className="compareSourceLinks">{course.source_url && <a href={course.source_url} target="_blank" rel="noreferrer">Course <ExternalLink size={12}/></a>}{course.cricos_fee_source_url && <a href={course.cricos_fee_source_url} target="_blank" rel="noreferrer">Fee <ExternalLink size={12}/></a>}{campus?.regional_source_url && <a href={campus.regional_source_url} target="_blank" rel="noreferrer">Regional <ExternalLink size={12}/></a>}</span></div>;
            })}
          </div>
        </section>
      )}
    </main>
  );
}

function CompareRow({ label, courses, render, long = false }: { label: string; courses: CompareCourse[]; render: (course: CompareCourse) => string; long?: boolean }) {
  return <><div className={`comparisonLabel ${long ? "long" : ""}`}>{label}</div>{courses.map((course) => <div className={`comparisonValue ${long ? "long" : ""}`} key={`${course.id}-${label}`}>{render(course)}</div>)}</>;
}

function firstCampus(course: CompareCourse) { return course.course_campuses.find((item) => item.campuses)?.campuses ?? null; }
function campusLabel(course: CompareCourse) { const campus = firstCampus(course); return campus ? `${campus.name} · ${campus.city}, ${campus.state}` : "Pending verification"; }
function regionalLabel(course: CompareCourse) {
  const campus = firstCampus(course);
  if (!campus) return "Pending campus verification";
  if (!campus.regional_verified || !campus.regional_classification) return "Pending authoritative regional classification";
  if (campus.regional_classification.startsWith("CATEGORY_1")) return "Category 1 · Major city / not designated regional";
  if (campus.regional_classification.startsWith("CATEGORY_2")) return "Category 2 · Cities and Major Regional Centres · designated regional";
  if (campus.regional_classification.startsWith("CATEGORY_3")) return "Category 3 · Regional Centres and Other Regional Areas · designated regional";
  return campus.regional ? "Verified designated regional" : "Verified non-regional";
}
function durationLabel(course: CompareCourse) { return course.duration_months ? `${course.duration_months} months${course.cricos_duration_weeks ? ` · ${course.cricos_duration_weeks} CRICOS weeks` : ""}` : "Pending verification"; }
function latestUniversityTotalFallback(course: CompareCourse) { const fee = latestUniversityFee(course); return fee ? `${money(fee.annual_fee)} (${fee.fee_year} annual fee; whole-course total not available)` : "Pending verification"; }
function latestUniversityFee(course: CompareCourse) { return [...course.course_fees].filter((item) => item.student_type === "international" && item.verification_status === "VERIFIED" && item.annual_fee !== null).sort((a,b) => b.fee_year-a.fee_year)[0] ?? null; }
function latestFeeLabel(course: CompareCourse) {
  const fee = latestUniversityFee(course);
  if (fee) return `${money(fee.annual_fee)} (${fee.fee_year} university annual fee)`;
  if (course.cricos_tuition_fee_total !== null && course.cricos_duration_weeks && course.cricos_duration_weeks > 0) return `~${money(Math.round(course.cricos_tuition_fee_total / (course.cricos_duration_weeks / 52)))}/year · annualised from CRICOS total`;
  return "Pending verification";
}
function livingCostLabel(course: CompareCourse) { const cost = firstCampus(course)?.living_costs.find((item) => item.verification_status !== "UNVERIFIED"); if (!cost) return "Pending comparable source"; if (cost.weekly_low !== null && cost.weekly_high !== null) return `${money(cost.weekly_low*52)}–${money(cost.weekly_high*52)}/year (${cost.verification_status.toLowerCase()})`; if (cost.monthly_estimate !== null) return `${money(cost.monthly_estimate)}/month (${cost.verification_status.toLowerCase()})`; return "Pending comparable source"; }
function migrationLabel(course: CompareCourse, links: CompareMigrationLink[]) { const linked = links.filter((item) => item.course_id === course.id && item.skilled_occupations); if (!linked.length) return "No conservative course-to-skilled-occupation mapping verified yet"; return linked.map((item) => { const occupation=item.skilled_occupations!; const codes=occupation.skilled_occupation_codes.map((code)=>`${code.anzsco_code} (${code.anzsco_version})`).join("/"); const programs=occupation.skilled_occupation_programs.map((entry)=>entry.migration_programs).filter((p):p is NonNullable<typeof p>=>Boolean(p)).map((p)=>p.subclass).filter((v,i,a)=>a.indexOf(v)===i).join(", "); return `${occupation.name} — ANZSCO ${codes}; ${occupation.assessing_authority ?? "assessing authority pending"}; listed programs: ${programs}. ${item.confidence.toLowerCase()} title-correspondence evidence only.`; }).join(" | "); }
function accreditationLabel(course: CompareCourse) { return course.course_accreditations.length ? course.course_accreditations.map((item)=>[item.body_name,item.accreditation_level,item.status].filter(Boolean).join(" · ")).join("; ") : "Pending verification"; }
function careerLabel(course: CompareCourse) { const careers=course.course_occupations.map((item)=>item.occupations?.name).filter(Boolean); return careers.length ? careers.join(", ") : "Pending university-specific verification"; }
function intakeLabel(course: CompareCourse) { const intakes=[...course.course_intakes].sort((a,b)=>a.year-b.year||a.month-b.month); return intakes.length ? intakes.map((item)=>`${monthName(item.month)} ${item.year}`).join(", ") : "Pending university-specific verification"; }
function removeHref(ids: string[], removeId: string) { const next=ids.filter((id)=>id!==removeId); return next.length ? `/compare?ids=${next.join(",")}` : "/compare"; }
