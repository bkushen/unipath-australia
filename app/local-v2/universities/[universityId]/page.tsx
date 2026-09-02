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

const verifiedDate = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(new Date(value))
  : null;

export default async function UniversityDetailPage({ params }: { params: Promise<{ universityId: string }> }) {
  const { universityId } = await params;
  const supabase = getSupabase();

  const { data: university, error: universityError } = await supabase
    .from("universities")
    .select("id,name,slug,website,logo_url,cricos_code,description,study_australia_listed,canonical_source_url,canonical_verified_at")
    .eq("id", universityId)
    .maybeSingle();

  if (universityError) throw new Error(universityError.message);
  if (!university) notFound();

  const [{ data: campuses, error: campusError }, { data: courses, error: courseError }, { data: scholarships, error: scholarshipError }] = await Promise.all([
    supabase
      .from("campuses")
      .select("id,name,city,state,postcode,regional,address_line_1,address_line_2,source_url,verified_at,regional_verified,regional_classification,regional_source_url,regional_verified_at")
      .eq("university_id", universityId)
      .order("state")
      .order("city"),
    supabase
      .from("courses")
      .select("id,name,qualification_level,cricos_code,duration_months,annual_fee,total_fee,currency,delivery_mode,official_course_url,official_course_url_verified_at,cricos_expired")
      .eq("university_id", universityId)
      .or("cricos_expired.is.null,cricos_expired.eq.false")
      .order("name")
      .limit(1000),
    supabase
      .from("scholarships")
      .select("id,name,amount,percentage,eligibility,source_url,verified_at")
      .eq("university_id", universityId)
      .order("name"),
  ]);

  if (campusError) throw new Error(campusError.message);
  if (courseError) throw new Error(courseError.message);
  if (scholarshipError) throw new Error(scholarshipError.message);

  const activeCourses = courses ?? [];
  const loadedAnnualFees = activeCourses
    .map((course) => course.annual_fee == null ? null : Number(course.annual_fee))
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  const avgAnnualFee = loadedAnnualFees.length
    ? loadedAnnualFees.reduce((sum, value) => sum + value, 0) / loadedAnnualFees.length
    : null;
  const regionalCampusCount = (campuses ?? []).filter((campus) => campus.regional).length;
  const states = Array.from(new Set((campuses ?? []).map((campus) => campus.state).filter((value): value is string => Boolean(value)))).sort();
  const website = ensureUrl(university.website);
  const logoUrl = ensureUrl(university.logo_url);
  const initials = university.name.split(/\s+/).filter(Boolean).slice(0, 3).map((word: string) => word[0]).join("").toUpperCase();

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={heroInnerStyle}>
          <Link href="/local-v2/universities" style={backLinkStyle}>← Back to universities</Link>
          <div style={heroGridStyle}>
            <div style={brandRowStyle}>
              <div style={logoShellStyle}>{logoUrl ? <img src={logoUrl} alt={`${university.name} logo`} style={logoImageStyle} /> : <span style={logoFallbackStyle}>{initials}</span>}</div>
              <div style={{ minWidth: 0 }}>
                <div style={eyebrowStyle}>UNIPATH UNIVERSITY PROFILE</div>
                <h1 style={titleStyle}>{university.name}</h1>
                <div style={metaRowStyle}>
                  {university.cricos_code && <span>CRICOS provider {university.cricos_code}</span>}
                  {states.length > 0 && <span>{states.join(" · ")}</span>}
                  {university.study_australia_listed && <span>Study Australia listed</span>}
                </div>
              </div>
            </div>
            <div style={heroActionsStyle}>
              {website && <a href={website} target="_blank" rel="noreferrer" style={primaryLinkStyle}>Official university website ↗</a>}
              <Link href="/local-v2/courses" style={secondaryLinkStyle}>Browse all courses</Link>
            </div>
          </div>
        </div>
      </section>

      <div style={contentStyle}>
        <section style={summaryGridStyle}>
          <Stat label="Active courses" value={activeCourses.length.toLocaleString()} />
          <Stat label="Campuses" value={(campuses ?? []).length.toLocaleString()} />
          <Stat label="Regional campuses" value={regionalCampusCount.toLocaleString()} />
          <Stat label="States / territories" value={states.length ? states.join(", ") : "Not loaded"} />
          <Stat label="Avg loaded annual fee" value={money(avgAnnualFee)} />
          <Stat label="University scholarships" value={(scholarships ?? []).length.toLocaleString()} />
        </section>

        <section style={twoColStyle}>
          <article style={panelStyle}>
            <h2 style={panelTitleStyle}>About this university</h2>
            {university.description ? <p style={bodyTextStyle}>{university.description}</p> : <p style={mutedStyle}>A detailed university description has not been loaded yet.</p>}
            {university.canonical_source_url && <SourceLink href={university.canonical_source_url} label="University source" verifiedAt={university.canonical_verified_at} />}
          </article>

          <article style={panelStyle}>
            <h2 style={panelTitleStyle}>Quick links</h2>
            <div style={linkStackStyle}>
              {website && <a href={website} target="_blank" rel="noreferrer" style={textLinkStyle}>Official website ↗</a>}
              <Link href="/local-v2/courses" style={textLinkStyle}>Search UniPath course catalogue →</Link>
              <Link href="/local-v2/compare" style={textLinkStyle}>Compare courses →</Link>
              <Link href="/local-v2/scholarships" style={textLinkStyle}>Explore scholarships →</Link>
            </div>
          </article>
        </section>

        <section style={panelStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={panelTitleStyle}>Campuses</h2>
              <p style={sectionSubtextStyle}>Live campus records linked to {university.name}.</p>
            </div>
          </div>
          {(campuses ?? []).length ? (
            <div style={campusGridStyle}>
              {campuses!.map((campus) => (
                <article key={campus.id} style={miniCardStyle}>
                  <div style={miniHeaderStyle}>
                    <strong>{campus.name}</strong>
                    {campus.regional && <span style={greenChipStyle}>Regional</span>}
                  </div>
                  <div style={mutedStyle}>{[campus.address_line_1, campus.address_line_2, campus.city, campus.state, campus.postcode].filter(Boolean).join(", ") || "Address not loaded"}</div>
                  {campus.regional_classification && <div style={smallMetaStyle}>Regional classification: {campus.regional_classification}</div>}
                  <div style={sourceRowStyle}>
                    {campus.source_url && <SourceLink href={campus.source_url} label="Campus source" verifiedAt={campus.verified_at} />}
                    {campus.regional_source_url && <SourceLink href={campus.regional_source_url} label="Regional source" verifiedAt={campus.regional_verified_at} />}
                  </div>
                </article>
              ))}
            </div>
          ) : <p style={mutedStyle}>No campus records are linked yet.</p>}
        </section>

        <section style={panelStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={panelTitleStyle}>Courses at {university.name}</h2>
              <p style={sectionSubtextStyle}>All {activeCourses.length.toLocaleString()} active UniPath course records for this university are listed below.</p>
            </div>
          </div>
          {activeCourses.length ? (
            <div style={courseListStyle}>
              {activeCourses.map((course) => {
                const officialCourseUrl = ensureUrl(course.official_course_url);
                return (
                  <article key={course.id} style={courseRowStyle}>
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/local-v2/courses/${course.id}`} style={courseTitleLinkStyle}>{course.name}</Link>
                      <div style={courseMetaStyle}>
                        {course.qualification_level && <span>{course.qualification_level}</span>}
                        {course.cricos_code && <span>CRICOS {course.cricos_code}</span>}
                        {course.duration_months && <span>{course.duration_months} months</span>}
                        {course.delivery_mode && <span>{course.delivery_mode}</span>}
                      </div>
                    </div>
                    <div style={courseRightStyle}>
                      <strong>{money(course.annual_fee == null ? null : Number(course.annual_fee), course.currency || "AUD")}</strong>
                      <div style={courseActionsStyle}>
                        <Link href={`/local-v2/courses/${course.id}`} style={compactLinkStyle}>UniPath details</Link>
                        {officialCourseUrl && <a href={officialCourseUrl} target="_blank" rel="noreferrer" style={compactSecondaryLinkStyle}>Official page ↗</a>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : <p style={mutedStyle}>No active courses are linked yet.</p>}
        </section>

        <section style={panelStyle}>
          <h2 style={panelTitleStyle}>Scholarships</h2>
          {(scholarships ?? []).length ? (
            <div style={campusGridStyle}>
              {scholarships!.map((scholarship) => (
                <article key={scholarship.id} style={miniCardStyle}>
                  <strong>{scholarship.name}</strong>
                  <div style={scholarshipValueStyle}>{scholarship.percentage ? `${scholarship.percentage}%` : scholarship.amount ? money(Number(scholarship.amount)) : "Value not loaded"}</div>
                  {scholarship.eligibility && <p style={bodyTextStyle}>{scholarship.eligibility}</p>}
                  {scholarship.source_url && <SourceLink href={scholarship.source_url} label="Scholarship source" verifiedAt={scholarship.verified_at} />}
                </article>
              ))}
            </div>
          ) : <p style={mutedStyle}>No university-linked scholarship records are loaded yet.</p>}
        </section>

        <section style={noticeStyle}>
          <strong>Data note:</strong> UniPath shows verified/source-dated records where available. Missing course fees, scholarships, campus classifications or direct course links are shown as not loaded rather than guessed.
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <article style={statStyle}><div style={statLabelStyle}>{label}</div><div style={statValueStyle}>{value}</div></article>;
}

function SourceLink({ href, label, verifiedAt }: { href: string; label: string; verifiedAt?: string | null }) {
  const url = ensureUrl(href);
  if (!url) return null;
  const date = verifiedDate(verifiedAt);
  return <a href={url} target="_blank" rel="noreferrer" style={sourceLinkStyle}>{label} ↗{date ? ` · verified ${date}` : ""}</a>;
}

const pageStyle = { minHeight: "100vh", background: "#f5f7fa", color: "#101828" } as const;
const heroStyle = { background: "#0057b8", color: "#fff", padding: "32px 20px 28px" } as const;
const heroInnerStyle = { maxWidth: 1180, margin: "0 auto" } as const;
const backLinkStyle = { color: "#fff", textDecoration: "none", fontWeight: 750, opacity: .92 } as const;
const heroGridStyle = { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-end", marginTop: 22, flexWrap: "wrap" } as const;
const brandRowStyle = { display: "flex", gap: 18, alignItems: "center", flex: "1 1 650px", minWidth: 0 } as const;
const logoShellStyle = { width: 96, height: 96, border: "1px solid rgba(255,255,255,.5)", borderRadius: 16, background: "#fff", display: "grid", placeItems: "center", overflow: "hidden", flex: "0 0 auto" } as const;
const logoImageStyle = { width: "100%", height: "100%", objectFit: "contain", padding: 8 } as const;
const logoFallbackStyle = { fontWeight: 900, color: "#0057b8", fontSize: 22 } as const;
const eyebrowStyle = { fontSize: 12, letterSpacing: .8, fontWeight: 850, opacity: .82 } as const;
const titleStyle = { margin: "7px 0 8px", fontSize: 40, lineHeight: 1.08 } as const;
const metaRowStyle = { display: "flex", gap: 9, flexWrap: "wrap", color: "#e8f0fb", fontSize: 13 } as const;
const heroActionsStyle = { display: "flex", gap: 9, flexWrap: "wrap" } as const;
const primaryLinkStyle = { padding: "11px 14px", background: "#fff", color: "#0057b8", borderRadius: 9, textDecoration: "none", fontWeight: 850 } as const;
const secondaryLinkStyle = { padding: "11px 14px", border: "1px solid rgba(255,255,255,.65)", color: "#fff", borderRadius: 9, textDecoration: "none", fontWeight: 800 } as const;
const contentStyle = { maxWidth: 1180, margin: "0 auto", padding: "24px 20px 70px" } as const;
const summaryGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 } as const;
const statStyle = { border: "1px solid #e1e6ed", borderRadius: 14, padding: 15, background: "#fff" } as const;
const statLabelStyle = { color: "#667085", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .35, marginBottom: 5 } as const;
const statValueStyle = { fontSize: 20, fontWeight: 850 } as const;
const twoColStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, marginTop: 16 } as const;
const panelStyle = { marginTop: 16, border: "1px solid #e1e6ed", borderRadius: 16, padding: 20, background: "#fff" } as const;
const panelTitleStyle = { margin: 0, fontSize: 22 } as const;
const bodyTextStyle = { color: "#344054", lineHeight: 1.65 } as const;
const mutedStyle = { color: "#667085", lineHeight: 1.5, fontSize: 14 } as const;
const linkStackStyle = { display: "grid", gap: 10, marginTop: 14 } as const;
const textLinkStyle = { color: "#0057b8", fontWeight: 750, textDecoration: "none" } as const;
const sectionHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" } as const;
const sectionSubtextStyle = { color: "#667085", margin: "5px 0 0", fontSize: 13 } as const;
const campusGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 } as const;
const miniCardStyle = { border: "1px solid #eaecf0", borderRadius: 12, padding: 14, background: "#fcfcfd" } as const;
const miniHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" } as const;
const greenChipStyle = { padding: "5px 8px", borderRadius: 999, background: "#ecfdf3", color: "#027a48", border: "1px solid #abefc6", fontWeight: 800, fontSize: 11 } as const;
const smallMetaStyle = { color: "#475467", fontSize: 12, marginTop: 7 } as const;
const sourceRowStyle = { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 9 } as const;
const sourceLinkStyle = { color: "#0057b8", fontSize: 11, fontWeight: 750, textDecoration: "none" } as const;
const courseListStyle = { display: "grid", gap: 8 } as const;
const courseRowStyle = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", border: "1px solid #eaecf0", borderRadius: 11, padding: "12px 14px", background: "#fcfcfd", flexWrap: "wrap" } as const;
const courseTitleLinkStyle = { color: "#101828", fontWeight: 800, textDecoration: "none", fontSize: 15 } as const;
const courseMetaStyle = { display: "flex", gap: 7, flexWrap: "wrap", color: "#667085", fontSize: 12, marginTop: 5 } as const;
const courseRightStyle = { display: "grid", gap: 6, justifyItems: "end" } as const;
const courseActionsStyle = { display: "flex", gap: 7, flexWrap: "wrap" } as const;
const compactLinkStyle = { color: "#fff", background: "#0057b8", borderRadius: 7, padding: "6px 8px", fontSize: 11, fontWeight: 800, textDecoration: "none" } as const;
const compactSecondaryLinkStyle = { color: "#344054", border: "1px solid #d0d5dd", borderRadius: 7, padding: "6px 8px", fontSize: 11, fontWeight: 750, textDecoration: "none", background: "#fff" } as const;
const scholarshipValueStyle = { color: "#0057b8", fontSize: 18, fontWeight: 850, marginTop: 6 } as const;
const noticeStyle = { marginTop: 16, border: "1px solid #b9d4f5", borderRadius: 14, padding: 16, background: "#f0f7ff", color: "#344054", lineHeight: 1.55 } as const;
