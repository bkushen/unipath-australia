import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, BriefcaseBusiness, CalendarDays, DollarSign, ExternalLink, GraduationCap, MapPin, Route, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LivingCost = {
  category: string;
  weekly_low: number | null;
  weekly_high: number | null;
  monthly_estimate: number | null;
  source_url: string | null;
  verification_status: string;
};

type CourseDetail = {
  id: string;
  name: string;
  qualification_level: string;
  university_course_code: string | null;
  cricos_code: string | null;
  duration_months: number | null;
  description: string | null;
  delivery_mode: string | null;
  source_url: string | null;
  verified_at: string | null;
  universities: { name: string; website: string | null } | null;
  study_fields: { name: string } | null;
  course_fees: Array<{ fee_year: number; student_type: string; annual_fee: number | null; total_fee: number | null; notes: string | null; source_url: string | null; verification_status: string }>;
  course_campuses: Array<{ campuses: { name: string; city: string; state: string; regional: boolean; living_costs: LivingCost[] } | null }>;
  entry_requirements: Array<{ academic_text: string | null; minimum_gpa: number | null; ielts_overall: number | null; pte_overall: number | null; source_url: string | null }>;
  course_occupations: Array<{ alignment_score: number | null; occupations: { name: string; code: string | null; assessing_authority: string | null; source_url: string | null } | null }>;
  course_accreditations: Array<{ body_name: string; accreditation_level: string | null; status: string | null; valid_from: string | null; valid_to: string | null; source_url: string | null }>;
  course_intakes: Array<{ month: number; year: number }>;
  course_scholarships: Array<{ scholarships: { name: string; amount: number | null; percentage: number | null; eligibility: string | null; source_url: string | null } | null }>;
};

type MigrationLink = {
  evidence_basis: string;
  confidence: string;
  notes: string | null;
  skilled_occupations: {
    name: string;
    assessing_authority: string | null;
    source_url: string;
    skilled_occupation_codes: Array<{ anzsco_code: string; anzsco_version: string; program_scope: string }>;
    skilled_occupation_lists: Array<{ list_code: string }>;
    skilled_occupation_programs: Array<{
      migration_programs: { subclass: string; name: string; stream: string; pathway_type: string } | null;
    }>;
  } | null;
};

const money = (value: number | null) => value === null
  ? "Not yet verified"
  : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

const monthName = (month: number) => new Intl.DateTimeFormat("en-AU", { month: "long" }).format(new Date(2026, month - 1, 1));

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select(`
      id,
      name,
      qualification_level,
      university_course_code,
      cricos_code,
      duration_months,
      description,
      delivery_mode,
      source_url,
      verified_at,
      universities(name, website),
      study_fields(name),
      course_fees(fee_year, student_type, annual_fee, total_fee, notes, source_url, verification_status),
      course_campuses(campuses(name, city, state, regional, living_costs(category, weekly_low, weekly_high, monthly_estimate, source_url, verification_status))),
      entry_requirements(academic_text, minimum_gpa, ielts_overall, pte_overall, source_url),
      course_occupations(alignment_score, occupations(name, code, assessing_authority, source_url)),
      course_accreditations(body_name, accreditation_level, status, valid_from, valid_to, source_url),
      course_intakes(month, year),
      course_scholarships(scholarships(name, amount, percentage, eligibility, source_url))
    `)
    .eq("id", id)
    .eq("verification_status", "VERIFIED")
    .maybeSingle();

  if (error || !data) notFound();

  const { data: migrationData } = await supabase
    .from("course_skilled_occupation_links")
    .select(`
      evidence_basis,
      confidence,
      notes,
      skilled_occupations(
        name,
        assessing_authority,
        source_url,
        skilled_occupation_codes(anzsco_code, anzsco_version, program_scope),
        skilled_occupation_lists(list_code),
        skilled_occupation_programs(migration_programs(subclass, name, stream, pathway_type))
      )
    `)
    .eq("course_id", id);

  const course = data as unknown as CourseDetail;
  const migrationLinks = (migrationData ?? []) as unknown as MigrationLink[];
  const campus = course.course_campuses.find((item) => item.campuses)?.campuses ?? null;
  const livingCost = campus?.living_costs.find((item) => item.verification_status !== "UNVERIFIED") ?? null;
  const latestFee = course.course_fees
    .filter((fee) => fee.student_type === "international" && fee.verification_status === "VERIFIED")
    .sort((a, b) => b.fee_year - a.fee_year)[0] ?? null;
  const requirements = course.entry_requirements[0] ?? null;
  const careers = course.course_occupations.map((item) => item.occupations).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const intakes = [...course.course_intakes].sort((a, b) => a.year - b.year || a.month - b.month);
  const scholarships = course.course_scholarships.map((item) => item.scholarships).filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <main className="coursePage">
      <header className="assessmentHeader shell">
        <a href="/" className="brand"><span>U</span> UniPath Australia</a>
        <a href="/results" className="editProfile"><ArrowLeft size={16}/> Back to recommendations</a>
      </header>

      <section className="courseHero shell">
        <div>
          <div className="verifiedPill"><ShieldCheck size={15}/> Source-verified course record</div>
          <p className="courseUniversity">{course.universities?.name ?? "University"}</p>
          <h1>{course.name}</h1>
          <p>{course.description ?? "Detailed course description is being verified."}</p>
          <div className="courseHeroMeta">
            {campus && <span><MapPin size={15}/>{campus.name} · {campus.city}, {campus.state}</span>}
            {course.duration_months && <span><GraduationCap size={15}/>{course.duration_months / 12} years full course duration</span>}
            {course.delivery_mode && <span>{course.delivery_mode}</span>}
          </div>
        </div>
        <aside className="courseFactCard">
          <small>LATEST VERIFIED INTERNATIONAL FEE</small>
          <strong>{money(latestFee?.annual_fee ?? null)}</strong>
          <span>{latestFee ? `Annual fee · ${latestFee.fee_year}` : "Fee verification pending"}</span>
          <div><b>Course code</b><span>{course.university_course_code ?? "Pending"}</span></div>
          <div><b>CRICOS</b><span>{course.cricos_code ?? "Pending verification"}</span></div>
          <div><b>Study area</b><span>{course.study_fields?.name ?? "Pending"}</span></div>
          {course.source_url && <a href={course.source_url} target="_blank" rel="noreferrer">Official university source <ExternalLink size={13}/></a>}
        </aside>
      </section>

      <section className="courseContent shell">
        <div className="courseMainColumn">
          <CourseSection icon={<DollarSign/>} title="Fees and affordability">
            <div className="detailGrid">
              {course.course_fees.length ? course.course_fees.sort((a,b)=>b.fee_year-a.fee_year).map((fee) => <div className="detailTile" key={`${fee.fee_year}-${fee.student_type}`}><small>{fee.fee_year} · {fee.student_type}</small><strong>{money(fee.annual_fee)}</strong><span>{fee.notes ?? "Annual tuition record"}</span></div>) : <EmptyText text="International tuition data is still being verified." />}
              {livingCost && <div className="detailTile"><small>{livingCost.verification_status} LOCATION BUDGET</small><strong>{livingRange(livingCost)}</strong><span>{livingCost.monthly_estimate !== null ? `Indicative midpoint ${money(livingCost.monthly_estimate)}/month. Actual spending varies by lifestyle and housing.` : "Indicative source range."}</span>{livingCost.source_url && <a className="tileSource" href={livingCost.source_url} target="_blank" rel="noreferrer">Living-cost source <ExternalLink size={12}/></a>}</div>}
            </div>
            {!livingCost && <div className="detailNotice">A comparable source-backed living-cost estimate has not yet been loaded for this campus. UniPath will not manufacture a total-study-cost figure.</div>}
            {livingCost && <div className="detailNotice">Living costs are estimates, not visa financial-capacity amounts or guaranteed spending. Tuition may also change in later academic years, so UniPath does not multiply one year&apos;s fee into a falsely precise whole-degree total.</div>}
          </CourseSection>

          <CourseSection icon={<BadgeCheck/>} title="Entry requirements">
            {requirements ? <div className="requirementBox"><p>{requirements.academic_text ?? "Academic requirement text pending."}</p><div>{requirements.minimum_gpa !== null && <span>Minimum GPA: <b>{requirements.minimum_gpa}</b></span>}{requirements.ielts_overall !== null && <span>IELTS overall: <b>{requirements.ielts_overall}</b></span>}{requirements.pte_overall !== null && <span>PTE overall: <b>{requirements.pte_overall}</b></span>}</div></div> : <EmptyText text="Detailed entry requirements are still being verified." />}
          </CourseSection>

          <CourseSection icon={<BriefcaseBusiness/>} title="Career outcomes">
            {careers.length ? <div className="tagCloud">{careers.map((career) => <span key={career.name}>{career.name}</span>)}</div> : <EmptyText text="Verified career-outcome records are not available yet." />}
          </CourseSection>

          <CourseSection icon={<Route/>} title="Skilled migration pathway evidence">
            {migrationLinks.length ? <div className="migrationList">{migrationLinks.map((link) => {
              const occupation = link.skilled_occupations;
              if (!occupation) return null;
              const programs = occupation.skilled_occupation_programs.map((item) => item.migration_programs).filter((item): item is NonNullable<typeof item> => Boolean(item));
              return <article className="migrationCard" key={occupation.name}>
                <div className="migrationCardHead"><div><small>{link.confidence} EVIDENCE · {link.evidence_basis}</small><h3>{occupation.name}</h3><span>Assessing authority: {occupation.assessing_authority ?? "Pending"}</span></div><a href={occupation.source_url} target="_blank" rel="noreferrer">Home Affairs source <ExternalLink size={12}/></a></div>
                <div className="migrationMeta"><div><b>ANZSCO</b><span>{occupation.skilled_occupation_codes.map((code) => `${code.anzsco_code} (${code.anzsco_version})`).join(", ")}</span></div><div><b>Lists</b><span>{occupation.skilled_occupation_lists.map((item) => item.list_code).join(", ") || "Not recorded"}</span></div></div>
                <div className="programTags">{programs.map((program) => <span key={`${program.subclass}-${program.stream}`}>{program.subclass} · {program.name}{program.stream ? ` (${program.stream})` : ""}</span>)}</div>
                <p>{link.notes}</p>
              </article>;
            })}</div> : <EmptyText text="No course-to-skilled-occupation correspondence has been verified yet. UniPath will not infer a PR pathway simply from the degree title." />}
            <div className="detailNotice">A listed occupation or visa program does not mean you qualify for that occupation, skills assessment, nomination, invitation or visa. State nomination criteria, points, work experience and occupation tasks must be checked separately against current official rules.</div>
          </CourseSection>

          <CourseSection icon={<ShieldCheck/>} title="Professional accreditation">
            {course.course_accreditations.length ? <div className="accreditationList">{course.course_accreditations.map((item) => <div key={item.body_name}><ShieldCheck/><div><b>{item.body_name}</b><span>{[item.accreditation_level,item.status].filter(Boolean).join(" · ")}</span></div></div>)}</div> : <EmptyText text="No verified accreditation record has been loaded yet." />}
          </CourseSection>

          <CourseSection icon={<CalendarDays/>} title="Upcoming recorded intakes">
            {intakes.length ? <div className="tagCloud">{intakes.map((intake) => <span key={`${intake.year}-${intake.month}`}>{monthName(intake.month)} {intake.year}</span>)}</div> : <EmptyText text="Intake dates have not yet been loaded for this course." />}
          </CourseSection>

          <CourseSection icon={<GraduationCap/>} title="Scholarships">
            {scholarships.length ? <div className="detailGrid">{scholarships.map((item) => <div className="detailTile" key={item.name}><small>SCHOLARSHIP</small><strong>{item.name}</strong><span>{item.percentage ? `${item.percentage}%` : item.amount ? money(item.amount) : "See eligibility"}</span></div>)}</div> : <EmptyText text="No verified course-linked scholarships are loaded yet." />}
          </CourseSection>
        </div>

        <aside className="courseSideColumn">
          <div className="sourcePanel">
            <h3>Data confidence</h3>
            <div><ShieldCheck/><span><b>Course record</b>Verified</span></div>
            <div><ShieldCheck/><span><b>University source</b>{course.source_url ? "Available" : "Pending"}</span></div>
            <div><ShieldCheck/><span><b>Living cost</b>{livingCost ? `${livingCost.verification_status.toLowerCase()} source range` : "Pending comparable source"}</span></div>
            <div><ShieldCheck/><span><b>Migration evidence</b>{migrationLinks.length ? `${migrationLinks.length} conservative occupation link${migrationLinks.length === 1 ? "" : "s"}` : "Pending verified mapping"}</span></div>
            <div><ShieldCheck/><span><b>Last database verification</b>{course.verified_at ? new Date(course.verified_at).toLocaleDateString("en-AU") : "Pending"}</span></div>
            <p>UniPath separates university career outcomes from Home Affairs skilled occupations and never treats course completion as a guarantee of permanent residency.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}

function CourseSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="courseSection"><div className="courseSectionTitle"><span>{icon}</span><h2>{title}</h2></div>{children}</section>;
}

function EmptyText({ text }: { text: string }) {
  return <p className="emptyDetail">{text}</p>;
}

function livingRange(cost: LivingCost) {
  if (cost.weekly_low !== null && cost.weekly_high !== null) {
    const annualLow = cost.weekly_low * 52;
    const annualHigh = cost.weekly_high * 52;
    return `${money(annualLow)}–${money(annualHigh)}/year`;
  }
  return cost.monthly_estimate !== null ? `${money(cost.monthly_estimate)}/month` : "Estimate pending";
}
