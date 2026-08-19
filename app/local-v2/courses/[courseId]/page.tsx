import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

const ensureUrl = (value: string | null | undefined) => {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const money = (value: number | null | undefined, currency = "AUD") => value == null
  ? "Not loaded"
  : new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));

const monthName = (month: number) => new Intl.DateTimeFormat("en-AU", { month: "long" }).format(new Date(2026, Math.max(0, month - 1), 1));
const verifiedDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(new Date(value)) : null;

export default async function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = getSupabase();

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id,university_id,study_field_id,name,slug,qualification_level,cricos_code,university_course_code,duration_months,annual_fee,total_fee,currency,description,delivery_mode,course_language,dual_qualification,foundation_studies,work_component,work_component_hours_week,work_component_weeks,work_component_total_hours,cricos_duration_weeks,cricos_tuition_fee_total,cricos_non_tuition_fee_total,cricos_estimated_total_cost,official_course_url,official_course_url_verified_at,source_url,verified_at,verification_status,cricos_source_url,cricos_retrieved_at,cricos_expired")
    .eq("id", courseId)
    .maybeSingle();

  if (courseError) throw new Error(courseError.message);
  if (!course) notFound();

  const [{ data: university }, { data: studyField }, { data: courseCampusRows }, { data: fees }, { data: intakes }, { data: requirements }, { data: accreditations }, { data: courseOccupationRows }, { data: courseScholarshipRows }, { data: skilledLinks }] = await Promise.all([
    supabase.from("universities").select("id,name,slug,website,logo_url,cricos_code,description").eq("id", course.university_id).maybeSingle(),
    course.study_field_id ? supabase.from("study_fields").select("id,name,slug").eq("id", course.study_field_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("course_campuses").select("campus_id").eq("course_id", courseId),
    supabase.from("course_fees").select("id,fee_year,student_type,annual_fee,total_fee,currency,notes,source_url,verified_at,verification_status").eq("course_id", courseId).order("fee_year", { ascending: false }),
    supabase.from("course_intakes").select("id,month,year").eq("course_id", courseId).order("year").order("month"),
    supabase.from("entry_requirements").select("id,academic_text,minimum_gpa,relevant_field_required,ielts_overall,pte_overall,source_url,verified_at").eq("course_id", courseId),
    supabase.from("course_accreditations").select("id,body_name,accreditation_level,status,valid_from,valid_to,source_url,verified_at").eq("course_id", courseId),
    supabase.from("course_occupations").select("occupation_id,alignment_score").eq("course_id", courseId).order("alignment_score", { ascending: false }),
    supabase.from("course_scholarships").select("scholarship_id").eq("course_id", courseId),
    supabase.from("course_skilled_occupation_links").select("skilled_occupation_id,evidence_basis,confidence,notes,source_url,verified_at").eq("course_id", courseId),
  ]);

  const campusIds = (courseCampusRows ?? []).map((row) => row.campus_id);
  const occupationIds = (courseOccupationRows ?? []).map((row) => row.occupation_id);
  const scholarshipIds = (courseScholarshipRows ?? []).map((row) => row.scholarship_id);
  const skilledOccupationIds = (skilledLinks ?? []).map((row) => row.skilled_occupation_id);

  const [{ data: campuses }, { data: occupations }, { data: scholarships }, { data: skilledOccupations }] = await Promise.all([
    campusIds.length ? supabase.from("campuses").select("id,name,city,state,postcode,regional,address_line_1,address_line_2,source_url,verified_at").in("id", campusIds) : Promise.resolve({ data: [] }),
    occupationIds.length ? supabase.from("occupations").select("id,code,name,description,assessing_authority,source_url,verified_at").in("id", occupationIds) : Promise.resolve({ data: [] }),
    scholarshipIds.length ? supabase.from("scholarships").select("id,name,amount,percentage,eligibility,source_url,verified_at").in("id", scholarshipIds) : Promise.resolve({ data: [] }),
    skilledOccupationIds.length ? supabase.from("skilled_occupations").select("id,name,assessing_authority,source_url,verified_at").in("id", skilledOccupationIds) : Promise.resolve({ data: [] }),
  ]);

  const occupationMap = new Map((occupations ?? []).map((item) => [item.id, item]));
  const skilledMap = new Map((skilledOccupations ?? []).map((item) => [item.id, item]));
  const officialUrl = ensureUrl(course.official_course_url) || ensureUrl(university?.website);
  const logoUrl = ensureUrl(university?.logo_url);
  const initials = (university?.name ?? "University").split(/\s+/).filter(Boolean).slice(0, 3).map((word) => word[0]).join("").toUpperCase();
  const latestInternationalFee = (fees ?? []).find((fee) => fee.student_type?.toLowerCase().includes("international")) ?? fees?.[0];
  const annualFee = latestInternationalFee?.annual_fee != null ? Number(latestInternationalFee.annual_fee) : course.annual_fee == null ? null : Number(course.annual_fee);
  const totalFee = latestInternationalFee?.total_fee != null ? Number(latestInternationalFee.total_fee) : course.total_fee == null ? null : Number(course.total_fee);
  const currency = latestInternationalFee?.currency || course.currency || "AUD";

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={heroInnerStyle}>
          <Link href="/local-v2/courses" style={backLinkStyle}>← Back to courses</Link>
          <div style={heroGridStyle}>
            <div style={brandRowStyle}>
              <div style={logoShellStyle}>{logoUrl ? <img src={logoUrl} alt={`${university?.name ?? "University"} logo`} style={logoImageStyle} /> : <span style={logoFallbackStyle}>{initials}</span>}</div>
              <div>
                <div style={universityStyle}>{university?.name ?? "University"}</div>
                <h1 style={titleStyle}>{course.name}</h1>
                <div style={metaStyle}>
                  {course.qualification_level && <span>{course.qualification_level}</span>}
                  {course.cricos_code && <span>CRICOS {course.cricos_code}</span>}
                  {course.university_course_code && <span>Course code {course.university_course_code}</span>}
                </div>
              </div>
            </div>
            <div style={heroActionsStyle}>
              {officialUrl && <a href={officialUrl} target="_blank" rel="noreferrer" style={primaryLinkStyle}>{course.official_course_url ? "Official course page ↗" : "University website ↗"}</a>}
              <Link href={`/local-v2/compare?course=${course.id}`} style={secondaryLinkStyle}>+ Compare</Link>
              <Link href={`/local-v2/course-finance?course=${course.id}`} style={secondaryLinkStyle}>Finance view</Link>
            </div>
          </div>
        </div>
      </section>

      <div style={contentStyle}>
        <section style={summaryGridStyle}>
          <Stat label="Annual tuition" value={money(annualFee, currency)} />
          <Stat label="Total tuition" value={money(totalFee, currency)} />
          <Stat label="Duration" value={course.duration_months ? `${course.duration_months} months` : course.cricos_duration_weeks ? `${course.cricos_duration_weeks} weeks` : "Not loaded"} />
          <Stat label="Delivery" value={course.delivery_mode || "Not loaded"} />
          <Stat label="Study field" value={studyField?.name || course.cricos_field_1_detailed || course.cricos_field_1_narrow || "Not loaded"} />
          <Stat label="Language" value={course.course_language || "Not loaded"} />
        </section>

        <section style={twoColStyle}>
          <article style={panelStyle}>
            <h2 style={panelTitleStyle}>Course overview</h2>
            {course.description ? <p style={bodyTextStyle}>{course.description}</p> : <p style={mutedStyle}>A detailed university description has not been loaded yet.</p>}
            <InfoRow label="Dual qualification" value={course.dual_qualification ? "Yes" : "No"} />
            <InfoRow label="Foundation studies" value={course.foundation_studies ? "Yes" : "No"} />
            <InfoRow label="Work component" value={course.work_component ? "Yes" : "No"} />
            {course.work_component && <InfoRow label="Work component detail" value={[course.work_component_total_hours && `${course.work_component_total_hours} total hours`, course.work_component_hours_week && `${course.work_component_hours_week} hours/week`, course.work_component_weeks && `${course.work_component_weeks} weeks`].filter(Boolean).join(" · ") || "Included"} />}
          </article>

          <article style={panelStyle}>
            <h2 style={panelTitleStyle}>Campuses</h2>
            {(campuses ?? []).length ? <div style={stackStyle}>{campuses!.map((campus) => <div key={campus.id} style={miniCardStyle}><strong>{campus.name}</strong><div style={mutedStyle}>{[campus.address_line_1, campus.address_line_2, campus.city, campus.state, campus.postcode].filter(Boolean).join(", ")}</div><div style={chipRowStyle}>{campus.regional && <span style={greenChipStyle}>Regional</span>}</div></div>)}</div> : <p style={mutedStyle}>Campus information has not been linked yet.</p>}
          </article>
        </section>

        <section style={twoColStyle}>
          <article style={panelStyle}>
            <h2 style={panelTitleStyle}>Entry requirements</h2>
            {(requirements ?? []).length ? requirements!.map((req) => <div key={req.id} style={stackStyle}>
              {req.academic_text && <p style={bodyTextStyle}>{req.academic_text}</p>}
              <InfoRow label="Minimum GPA" value={req.minimum_gpa == null ? "Not specified" : String(req.minimum_gpa)} />
              <InfoRow label="Relevant field required" value={req.relevant_field_required == null ? "Not specified" : req.relevant_field_required ? "Yes" : "No"} />
              <InfoRow label="IELTS overall" value={req.ielts_overall == null ? "Not loaded" : String(req.ielts_overall)} />
              <InfoRow label="PTE overall" value={req.pte_overall == null ? "Not loaded" : String(req.pte_overall)} />
              {req.source_url && <SourceLink href={req.source_url} label="Entry requirements source" verifiedAt={req.verified_at} />}
            </div>) : <p style={mutedStyle}>Verified entry requirements have not been loaded for this course yet.</p>}
          </article>

          <article style={panelStyle}>
            <h2 style={panelTitleStyle}>Intakes</h2>
            {(intakes ?? []).length ? <div style={chipRowStyle}>{intakes!.map((intake) => <span key={intake.id} style={blueChipStyle}>{monthName(intake.month)} {intake.year}</span>)}</div> : <p style={mutedStyle}>Intake dates have not been loaded yet.</p>}
            <h3 style={{ marginTop: 24 }}>Accreditation</h3>
            {(accreditations ?? []).length ? <div style={stackStyle}>{accreditations!.map((item) => <div key={item.id} style={miniCardStyle}><strong>{item.body_name}</strong><div style={mutedStyle}>{[item.accreditation_level, item.status].filter(Boolean).join(" · ") || "Accreditation record"}</div>{item.source_url && <SourceLink href={item.source_url} label="Accreditation source" verifiedAt={item.verified_at} />}</div>)}</div> : <p style={mutedStyle}>Accreditation information has not been loaded yet.</p>}
          </article>
        </section>

        <section style={twoColStyle}>
          <article style={panelStyle}>
            <h2 style={panelTitleStyle}>Career outcomes</h2>
            {(courseOccupationRows ?? []).length ? <div style={stackStyle}>{courseOccupationRows!.map((row) => { const occupation = occupationMap.get(row.occupation_id); return <div key={row.occupation_id} style={miniCardStyle}><strong>{occupation?.name ?? "Occupation"}</strong>{occupation?.code && <div style={mutedStyle}>Code {occupation.code}</div>}<div style={mutedStyle}>Course alignment: {row.alignment_score ?? "Not scored"}{typeof row.alignment_score === "number" ? "/100" : ""}</div>{occupation?.assessing_authority && <div style={mutedStyle}>Assessing authority: {occupation.assessing_authority}</div>}</div>; })}</div> : <p style={mutedStyle}>Career mappings have not been loaded for this course yet.</p>}
          </article>

          <article style={panelStyle}>
            <h2 style={panelTitleStyle}>Scholarships</h2>
            {(scholarships ?? []).length ? <div style={stackStyle}>{scholarships!.map((item) => <div key={item.id} style={miniCardStyle}><strong>{item.name}</strong><div style={mutedStyle}>{item.percentage ? `${item.percentage}%` : item.amount ? money(Number(item.amount), currency) : "Value not loaded"}</div>{item.eligibility && <p style={bodyTextStyle}>{item.eligibility}</p>}{item.source_url && <SourceLink href={item.source_url} label="Scholarship source" verifiedAt={item.verified_at} />}</div>)}</div> : <p style={mutedStyle}>No course-linked scholarship record is loaded yet.</p>}
          </article>
        </section>

        <section style={panelStyle}>
          <h2 style={panelTitleStyle}>Migration / skilled occupation connections</h2>
          <p style={warningTextStyle}>These records are informational links only. A course does not guarantee permanent residency, a skills assessment or visa eligibility.</p>
          {(skilledLinks ?? []).length ? <div style={stackStyle}>{skilledLinks!.map((link) => { const occupation = skilledMap.get(link.skilled_occupation_id); return <div key={link.skilled_occupation_id} style={miniCardStyle}><strong>{occupation?.name ?? "Skilled occupation"}</strong>{occupation?.assessing_authority && <div style={mutedStyle}>Assessing authority: {occupation.assessing_authority}</div>}<div style={mutedStyle}>Confidence: {link.confidence || "Not stated"}</div>{link.evidence_basis && <p style={bodyTextStyle}>{link.evidence_basis}</p>}{link.notes && <p style={mutedStyle}>{link.notes}</p>}{link.source_url && <SourceLink href={link.source_url} label="Migration evidence source" verifiedAt={link.verified_at} />}</div>; })}</div> : <p style={mutedStyle}>No verified skilled-occupation mapping is loaded for this course yet.</p>}
        </section>

        <section style={panelStyle}>
          <h2 style={panelTitleStyle}>Fees and source verification</h2>
          {(fees ?? []).length ? <div style={stackStyle}>{fees!.map((fee) => <div key={fee.id} style={miniCardStyle}><strong>{fee.fee_year} · {fee.student_type || "Student type not specified"}</strong><div style={feeGridStyle}><span>Annual: {money(fee.annual_fee == null ? null : Number(fee.annual_fee), fee.currency || currency)}</span><span>Total: {money(fee.total_fee == null ? null : Number(fee.total_fee), fee.currency || currency)}</span></div>{fee.notes && <p style={mutedStyle}>{fee.notes}</p>}{fee.source_url && <SourceLink href={fee.source_url} label="Fee source" verifiedAt={fee.verified_at} />}</div>)}</div> : <p style={mutedStyle}>No separate verified fee history is loaded yet. The summary above uses the current course record.</p>}
          <div style={{ marginTop: 18 }}>
            {course.official_course_url && <SourceLink href={course.official_course_url} label="Official university course page" verifiedAt={course.official_course_url_verified_at} />}
            {course.cricos_source_url && <SourceLink href={course.cricos_source_url} label="CRICOS source" verifiedAt={course.cricos_retrieved_at} />}
            {course.source_url && <SourceLink href={course.source_url} label="Course data source" verifiedAt={course.verified_at} />}
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <article style={statStyle}><div style={smallLabelStyle}>{label}</div><strong style={statValueStyle}>{value}</strong></article>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <div style={infoRowStyle}><span style={mutedStyle}>{label}</span><strong>{value}</strong></div>; }
function SourceLink({ href, label, verifiedAt }: { href: string; label: string; verifiedAt?: string | null }) { return <div style={{ marginTop: 8 }}><a href={ensureUrl(href) ?? href} target="_blank" rel="noreferrer" style={sourceLinkStyle}>{label} ↗</a>{verifiedAt && <span style={sourceDateStyle}> · verified {verifiedDate(verifiedAt)}</span>}</div>; }

const pageStyle = { minHeight: "100vh", background: "#f5f7fa", color: "#101828" } as const;
const heroStyle = { background: "#0057b8", color: "#fff", padding: "28px 20px 32px" } as const;
const heroInnerStyle = { maxWidth: 1180, margin: "0 auto" } as const;
const backLinkStyle = { color: "#fff", fontWeight: 750, textDecoration: "none" } as const;
const heroGridStyle = { display: "flex", justifyContent: "space-between", gap: 24, flexWrap: "wrap", alignItems: "flex-end", marginTop: 22 } as const;
const brandRowStyle = { display: "flex", gap: 18, alignItems: "flex-start", flex: "1 1 650px" } as const;
const logoShellStyle = { width: 88, height: 88, borderRadius: 14, background: "#fff", display: "grid", placeItems: "center", overflow: "hidden", flex: "0 0 auto" } as const;
const logoImageStyle = { width: "100%", height: "100%", objectFit: "contain", padding: 8 } as const;
const logoFallbackStyle = { color: "#0057b8", fontSize: 22, fontWeight: 900 } as const;
const universityStyle = { fontWeight: 850, color: "#dcecff", marginBottom: 6 } as const;
const titleStyle = { margin: 0, fontSize: 38, lineHeight: 1.12 } as const;
const metaStyle = { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, color: "#e8f1fb", fontSize: 14 } as const;
const heroActionsStyle = { display: "flex", gap: 9, flexWrap: "wrap" } as const;
const primaryLinkStyle = { padding: "11px 14px", borderRadius: 10, background: "#fff", color: "#0057b8", textDecoration: "none", fontWeight: 850 } as const;
const secondaryLinkStyle = { padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.5)", color: "#fff", textDecoration: "none", fontWeight: 800 } as const;
const contentStyle = { maxWidth: 1180, margin: "0 auto", padding: "24px 20px 70px", display: "grid", gap: 16 } as const;
const summaryGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 } as const;
const statStyle = { background: "#fff", border: "1px solid #e1e6ed", borderRadius: 14, padding: 15 } as const;
const smallLabelStyle = { color: "#667085", fontSize: 11, fontWeight: 850, textTransform: "uppercase", letterSpacing: .4, marginBottom: 5 } as const;
const statValueStyle = { fontSize: 18, lineHeight: 1.3 } as const;
const twoColStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 } as const;
const panelStyle = { background: "#fff", border: "1px solid #e1e6ed", borderRadius: 16, padding: 19 } as const;
const panelTitleStyle = { margin: "0 0 14px", fontSize: 22 } as const;
const bodyTextStyle = { color: "#344054", lineHeight: 1.65 } as const;
const mutedStyle = { color: "#667085", lineHeight: 1.55 } as const;
const stackStyle = { display: "grid", gap: 10 } as const;
const miniCardStyle = { border: "1px solid #eaecf0", borderRadius: 12, padding: 13, background: "#fafbfc" } as const;
const chipRowStyle = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 } as const;
const greenChipStyle = { background: "#ecfdf3", color: "#027a48", borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 800 } as const;
const blueChipStyle = { background: "#eaf3ff", color: "#0057b8", borderRadius: 999, padding: "6px 10px", fontSize: 13, fontWeight: 800 } as const;
const infoRowStyle = { display: "flex", justifyContent: "space-between", gap: 18, padding: "9px 0", borderTop: "1px solid #f0f2f5" } as const;
const warningTextStyle = { padding: 12, borderRadius: 10, background: "#fff7ed", color: "#9a3412", lineHeight: 1.55 } as const;
const sourceLinkStyle = { color: "#0057b8", fontWeight: 750, textDecoration: "none" } as const;
const sourceDateStyle = { color: "#667085", fontSize: 12 } as const;
const feeGridStyle = { display: "flex", flexWrap: "wrap", gap: 16, marginTop: 6, color: "#344054" } as const;
