import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const money = (value: number | null | undefined, currency = "AUD") => value == null
  ? "Not loaded"
  : new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));

const ensureUrl = (value: string | null | undefined) => {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const verifiedDate = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(new Date(value))
  : null;

export default async function CareerDetailPage({ params }: { params: Promise<{ careerSlug: string }> }) {
  const { careerSlug } = await params;
  const supabase = getSupabase();

  const { data: occupations, error: occupationError } = await supabase
    .from("occupations")
    .select("id,code,name,description,assessing_authority,source_url,verified_at")
    .order("name");
  if (occupationError) throw new Error(occupationError.message);

  const occupation = (occupations ?? []).find((item) => slugify(item.name) === careerSlug);
  if (!occupation) notFound();

  const { data: mappings, error: mappingError } = await supabase
    .from("course_occupations")
    .select("course_id,alignment_score")
    .eq("occupation_id", occupation.id)
    .order("alignment_score", { ascending: false });
  if (mappingError) throw new Error(mappingError.message);

  const courseIds = (mappings ?? []).map((row) => row.course_id);
  const { data: courses, error: courseError } = courseIds.length
    ? await supabase
        .from("courses")
        .select("id,university_id,name,qualification_level,cricos_code,duration_months,annual_fee,total_fee,currency,delivery_mode,official_course_url,source_url,cricos_expired")
        .in("id", courseIds)
        .or("cricos_expired.is.null,cricos_expired.eq.false")
    : { data: [], error: null };
  if (courseError) throw new Error(courseError.message);

  const universityIds = Array.from(new Set((courses ?? []).map((course) => course.university_id).filter(Boolean)));
  const [{ data: universities }, { data: courseCampusRows }] = await Promise.all([
    universityIds.length
      ? supabase.from("universities").select("id,name,website,logo_url").in("id", universityIds)
      : Promise.resolve({ data: [] }),
    courseIds.length
      ? supabase.from("course_campuses").select("course_id,campus_id").in("course_id", courseIds)
      : Promise.resolve({ data: [] }),
  ]);

  const campusIds = Array.from(new Set((courseCampusRows ?? []).map((row) => row.campus_id)));
  const { data: campuses } = campusIds.length
    ? await supabase.from("campuses").select("id,name,city,state,regional").in("id", campusIds)
    : { data: [] };

  const universityMap = new Map((universities ?? []).map((item) => [item.id, item]));
  const campusMap = new Map((campuses ?? []).map((item) => [item.id, item]));
  const campusIdsByCourse = new Map<string, string[]>();
  for (const row of courseCampusRows ?? []) {
    const current = campusIdsByCourse.get(row.course_id) ?? [];
    current.push(row.campus_id);
    campusIdsByCourse.set(row.course_id, current);
  }
  const mappingMap = new Map((mappings ?? []).map((item) => [item.course_id, item.alignment_score]));

  const resolvedCourses = (courses ?? []).map((course) => ({
    ...course,
    university: universityMap.get(course.university_id) ?? null,
    campuses: (campusIdsByCourse.get(course.id) ?? []).map((id) => campusMap.get(id)).filter(Boolean),
    alignmentScore: mappingMap.get(course.id) ?? null,
  })).sort((a, b) => (Number(b.alignmentScore) || 0) - (Number(a.alignmentScore) || 0));

  const states = Array.from(new Set(resolvedCourses.flatMap((course) => course.campuses.map((campus) => campus!.state).filter(Boolean)))).sort();
  const universitiesCount = new Set(resolvedCourses.map((course) => course.university_id)).size;
  const feeValues = resolvedCourses.map((course) => course.annual_fee == null ? null : Number(course.annual_fee)).filter((value): value is number => value != null);
  const averageAnnualFee = feeValues.length ? Math.round(feeValues.reduce((sum, value) => sum + value, 0) / feeValues.length) : null;
  const scored = resolvedCourses.map((course) => course.alignmentScore).filter((value): value is number => typeof value === "number");
  const averageAlignment = scored.length ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length) : null;

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={heroInnerStyle}>
          <Link href="/local-v2/careers" style={backLinkStyle}>← Back to careers</Link>
          <div style={eyebrowStyle}>LIVE CAREER PROFILE</div>
          <h1 style={titleStyle}>{occupation.name}</h1>
          {occupation.description ? <p style={heroTextStyle}>{occupation.description}</p> : <p style={heroTextStyle}>UniPath career profile linked to verified course records currently stored in the database.</p>}
          <div style={heroMetaStyle}>
            {occupation.code && <span>Occupation code {occupation.code}</span>}
            {occupation.assessing_authority && <span>Assessing authority: {occupation.assessing_authority}</span>}
            {occupation.verified_at && <span>Source checked {verifiedDate(occupation.verified_at)}</span>}
          </div>
          <div style={heroActionsStyle}>
            {occupation.source_url && <a href={occupation.source_url} target="_blank" rel="noreferrer" style={primaryLinkStyle}>Occupation source ↗</a>}
            <Link href={`/local-v2/courses?career=${encodeURIComponent(occupation.name)}`} style={secondaryHeroLinkStyle}>Browse courses</Link>
          </div>
        </div>
      </section>

      <div style={contentStyle}>
        <section style={summaryGridStyle}>
          <Stat label="Linked active courses" value={resolvedCourses.length.toString()} />
          <Stat label="Universities" value={universitiesCount.toString()} />
          <Stat label="States" value={states.length ? states.join(", ") : "Not linked"} />
          <Stat label="Average annual tuition" value={money(averageAnnualFee)} />
          <Stat label="Average course alignment" value={averageAlignment == null ? "Not scored" : `${averageAlignment}/100`} />
        </section>

        <section style={panelStyle}>
          <h2 style={panelTitleStyle}>Courses connected to this career</h2>
          <p style={mutedStyle}>These are explicit course-to-career mappings stored in UniPath. They are not a guarantee of employment, skills assessment or migration eligibility.</p>
          {resolvedCourses.length === 0 ? (
            <p style={mutedStyle}>No active course mappings are currently loaded for this career.</p>
          ) : (
            <div style={stackStyle}>
              {resolvedCourses.map((course) => {
                const university = course.university;
                const campus = course.campuses[0];
                const logoUrl = ensureUrl(university?.logo_url);
                const officialUrl = ensureUrl(course.official_course_url) || ensureUrl(university?.website);
                const initials = (university?.name ?? "University").split(/\s+/).filter(Boolean).slice(0, 3).map((word) => word[0]).join("").toUpperCase();
                return (
                  <article key={course.id} style={courseCardStyle}>
                    <div style={courseTopStyle}>
                      <div style={brandStyle}>
                        <div style={logoShellStyle}>{logoUrl ? <img src={logoUrl} alt={`${university?.name ?? "University"} logo`} style={logoImageStyle} /> : <span style={logoFallbackStyle}>{initials}</span>}</div>
                        <div>
                          <div style={universityStyle}>{university?.name ?? "University not linked"}</div>
                          <h3 style={courseTitleStyle}>{course.name}</h3>
                          <div style={metaStyle}>{[course.qualification_level, course.cricos_code ? `CRICOS ${course.cricos_code}` : null].filter(Boolean).join(" · ")}</div>
                        </div>
                      </div>
                      {typeof course.alignmentScore === "number" && <span style={alignmentChipStyle}>{course.alignmentScore}/100 alignment</span>}
                    </div>
                    <div style={courseStatsStyle}>
                      <MiniStat label="Annual tuition" value={money(course.annual_fee == null ? null : Number(course.annual_fee), course.currency || "AUD")} />
                      <MiniStat label="Duration" value={course.duration_months ? `${course.duration_months} months` : "Not loaded"} />
                      <MiniStat label="Campus" value={campus ? `${campus!.city || campus!.name}${campus!.state ? `, ${campus!.state}` : ""}` : "Not linked"} />
                    </div>
                    <div style={actionsStyle}>
                      <Link href={`/local-v2/courses/${course.id}`} style={primaryLinkStyle}>View course</Link>
                      {officialUrl && <a href={officialUrl} target="_blank" rel="noreferrer" style={secondaryLinkStyle}>{course.official_course_url ? "Official course page ↗" : "University website ↗"}</a>}
                      <Link href={`/local-v2/compare?course=${course.id}`} style={secondaryLinkStyle}>+ Compare</Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <article style={statStyle}><div style={smallLabelStyle}>{label}</div><div style={{ marginTop: 5, fontSize: 20, fontWeight: 800 }}>{value}</div></article>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div style={miniStatStyle}><div style={smallLabelStyle}>{label}</div><strong>{value}</strong></div>;
}

const pageStyle = { minHeight: "100vh", background: "#f5f7fa", color: "#101828" } as const;
const heroStyle = { background: "#0057b8", color: "#fff", padding: "34px 20px 30px" } as const;
const heroInnerStyle = { maxWidth: 1120, margin: "0 auto" } as const;
const backLinkStyle = { color: "#fff", fontWeight: 750, textDecoration: "none", display: "inline-block", marginBottom: 18 } as const;
const eyebrowStyle = { fontSize: 12, letterSpacing: .8, fontWeight: 850, opacity: .84 } as const;
const titleStyle = { margin: "8px 0 10px", fontSize: 42, lineHeight: 1.08 } as const;
const heroTextStyle = { maxWidth: 820, color: "#e8f0fb", lineHeight: 1.55, fontSize: 17 } as const;
const heroMetaStyle = { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 14, fontSize: 13, color: "#e8f0fb" } as const;
const heroActionsStyle = { display: "flex", flexWrap: "wrap", gap: 9, marginTop: 20 } as const;
const secondaryHeroLinkStyle = { padding: "10px 13px", border: "1px solid rgba(255,255,255,.6)", color: "#fff", borderRadius: 9, textDecoration: "none", fontWeight: 800 } as const;
const contentStyle = { maxWidth: 1120, margin: "0 auto", padding: "26px 20px 70px" } as const;
const summaryGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 } as const;
const statStyle = { border: "1px solid #e1e6ed", borderRadius: 14, padding: 16, background: "#fff" } as const;
const smallLabelStyle = { color: "#667085", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .35 } as const;
const panelStyle = { marginTop: 18, border: "1px solid #e1e6ed", borderRadius: 18, padding: 20, background: "#fff" } as const;
const panelTitleStyle = { marginTop: 0 } as const;
const mutedStyle = { color: "#667085", lineHeight: 1.55 } as const;
const stackStyle = { display: "grid", gap: 13, marginTop: 16 } as const;
const courseCardStyle = { border: "1px solid #e4e7ec", borderRadius: 14, padding: 16, background: "#fbfcfe" } as const;
const courseTopStyle = { display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" } as const;
const brandStyle = { display: "flex", gap: 12, minWidth: 0, flex: "1 1 520px" } as const;
const logoShellStyle = { width: 58, height: 58, border: "1px solid #e4e7ec", borderRadius: 10, background: "#fff", display: "grid", placeItems: "center", overflow: "hidden", flex: "0 0 auto" } as const;
const logoImageStyle = { width: "100%", height: "100%", objectFit: "contain", padding: 6 } as const;
const logoFallbackStyle = { fontWeight: 900, color: "#0057b8", fontSize: 15 } as const;
const universityStyle = { color: "#0057b8", fontWeight: 850, fontSize: 13 } as const;
const courseTitleStyle = { margin: "3px 0", fontSize: 20 } as const;
const metaStyle = { color: "#667085", fontSize: 12 } as const;
const alignmentChipStyle = { padding: "6px 9px", borderRadius: 999, background: "#eaf3ff", color: "#0057b8", border: "1px solid #b9d4f5", fontWeight: 800, fontSize: 12 } as const;
const courseStatsStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 9, marginTop: 14 } as const;
const miniStatStyle = { border: "1px solid #eaecf0", borderRadius: 10, padding: 10, background: "#fff" } as const;
const actionsStyle = { display: "flex", flexWrap: "wrap", gap: 9, marginTop: 14 } as const;
const primaryLinkStyle = { padding: "10px 13px", background: "#0057b8", color: "#fff", borderRadius: 9, textDecoration: "none", fontWeight: 800 } as const;
const secondaryLinkStyle = { padding: "10px 13px", border: "1px solid #d0d5dd", color: "#344054", borderRadius: 9, textDecoration: "none", fontWeight: 750, background: "#fff" } as const;
