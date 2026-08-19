import Link from "next/link";
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

function verifiedDate(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(new Date(value)) : null;
}

export default async function CareersPage() {
  const supabase = getSupabase();
  const [{ data: occupations, error: occupationError }, { data: links, error: linkError }] = await Promise.all([
    supabase.from("occupations").select("id,code,name,description,assessing_authority,source_url,verified_at").order("name"),
    supabase.from("course_occupations").select("occupation_id,course_id,alignment_score"),
  ]);

  if (occupationError) throw new Error(occupationError.message);
  if (linkError) throw new Error(linkError.message);

  const linksByOccupation = new Map<string, Array<{ course_id: string; alignment_score: number | null }>>();
  for (const row of links ?? []) {
    const current = linksByOccupation.get(row.occupation_id) ?? [];
    current.push({ course_id: row.course_id, alignment_score: row.alignment_score });
    linksByOccupation.set(row.occupation_id, current);
  }

  const totalLinkedCourses = new Set((links ?? []).map((row) => row.course_id)).size;

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={heroInnerStyle}>
          <div style={eyebrowStyle}>UNIPATH AUSTRALIA · LIVE CAREER DATABASE</div>
          <h1 style={heroTitleStyle}>Explore careers and the courses that lead to them</h1>
          <p style={heroTextStyle}>Browse verified occupation records in UniPath, see which Australian courses are currently linked to each career, and continue into course and university comparisons.</p>
          <div style={summaryRowStyle}>
            <Summary value={(occupations ?? []).length.toString()} label="career records" />
            <Summary value={totalLinkedCourses.toString()} label="linked courses" />
            <Summary value={(links ?? []).length.toString()} label="course-career mappings" />
          </div>
        </div>
      </section>

      <section style={tabsStyle}>
        <Link href="/local-v2/courses" style={tabStyle}>Courses</Link>
        <Link href="/local-v2/universities" style={tabStyle}>Universities</Link>
        <Link href="/local-v2/careers" style={{ ...tabStyle, ...activeTabStyle }}>Careers</Link>
      </section>

      <section style={contentStyle}>
        {(occupations ?? []).length === 0 ? (
          <div style={emptyStyle}>No career records are currently loaded.</div>
        ) : (
          <div style={gridStyle}>
            {occupations!.map((occupation) => {
              const careerLinks = linksByOccupation.get(occupation.id) ?? [];
              const scoredLinks = careerLinks.filter((item) => typeof item.alignment_score === "number");
              const averageAlignment = scoredLinks.length
                ? Math.round(scoredLinks.reduce((sum, item) => sum + Number(item.alignment_score), 0) / scoredLinks.length)
                : null;
              return (
                <article key={occupation.id} style={cardStyle}>
                  <div style={cardTopStyle}>
                    <div>
                      <div style={smallLabelStyle}>CAREER</div>
                      <h2 style={cardTitleStyle}>{occupation.name}</h2>
                    </div>
                    {occupation.code && <span style={codeChipStyle}>{occupation.code}</span>}
                  </div>

                  {occupation.description ? <p style={descriptionStyle}>{occupation.description}</p> : <p style={mutedStyle}>A full occupation description has not been loaded yet.</p>}

                  <div style={statsGridStyle}>
                    <Stat label="Linked courses" value={careerLinks.length.toString()} />
                    <Stat label="Average course alignment" value={averageAlignment == null ? "Not scored" : `${averageAlignment}/100`} />
                  </div>

                  {occupation.assessing_authority && <div style={infoStyle}><strong>Assessing authority:</strong> {occupation.assessing_authority}</div>}
                  {occupation.verified_at && <div style={verifiedStyle}>Source checked {verifiedDate(occupation.verified_at)}</div>}

                  <div style={actionsStyle}>
                    <Link href={`/local-v2/careers/${slugify(occupation.name)}`} style={primaryLinkStyle}>View career details</Link>
                    {occupation.source_url && <a href={occupation.source_url} target="_blank" rel="noreferrer" style={secondaryLinkStyle}>Source ↗</a>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Summary({ value, label }: { value: string; label: string }) {
  return <div style={summaryCardStyle}><strong style={{ fontSize: 24 }}>{value}</strong><span style={{ opacity: .88 }}>{label}</span></div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div style={statStyle}><div style={smallLabelStyle}>{label}</div><strong>{value}</strong></div>;
}

const pageStyle = { minHeight: "100vh", background: "#f5f7fa", color: "#101828" } as const;
const heroStyle = { background: "#0057b8", color: "#fff", padding: "42px 20px 30px" } as const;
const heroInnerStyle = { maxWidth: 1180, margin: "0 auto" } as const;
const eyebrowStyle = { fontSize: 12, letterSpacing: .8, fontWeight: 850, opacity: .86 } as const;
const heroTitleStyle = { margin: "10px 0", fontSize: 40, lineHeight: 1.08, maxWidth: 900 } as const;
const heroTextStyle = { maxWidth: 850, margin: 0, color: "#e8f0fb", fontSize: 17, lineHeight: 1.55 } as const;
const summaryRowStyle = { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 } as const;
const summaryCardStyle = { display: "flex", flexDirection: "column", gap: 2, minWidth: 150, padding: "12px 14px", background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.24)", borderRadius: 12 } as const;
const tabsStyle = { maxWidth: 1180, margin: "0 auto", padding: "0 20px", display: "flex", gap: 4, background: "#fff", borderBottom: "1px solid #e4e7ec" } as const;
const tabStyle = { padding: "16px 18px", color: "#475467", textDecoration: "none", fontWeight: 750, borderBottom: "3px solid transparent" } as const;
const activeTabStyle = { color: "#0057b8", borderBottomColor: "#0057b8" } as const;
const contentStyle = { maxWidth: 1180, margin: "0 auto", padding: "26px 20px 70px" } as const;
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 } as const;
const cardStyle = { border: "1px solid #e1e6ed", borderRadius: 18, padding: 20, background: "#fff", boxShadow: "0 3px 12px rgba(16,24,40,.04)" } as const;
const cardTopStyle = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" } as const;
const cardTitleStyle = { margin: "3px 0 0", fontSize: 23, lineHeight: 1.25 } as const;
const codeChipStyle = { padding: "6px 9px", borderRadius: 999, background: "#f2f4f7", color: "#344054", fontWeight: 800, fontSize: 12 } as const;
const descriptionStyle = { color: "#475467", lineHeight: 1.55, minHeight: 48 } as const;
const mutedStyle = { color: "#667085", lineHeight: 1.5 } as const;
const statsGridStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 15 } as const;
const statStyle = { border: "1px solid #eaecf0", borderRadius: 11, background: "#f9fafb", padding: 12 } as const;
const smallLabelStyle = { color: "#667085", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .35, marginBottom: 4 } as const;
const infoStyle = { marginTop: 14, color: "#344054", fontSize: 13 } as const;
const verifiedStyle = { marginTop: 8, color: "#667085", fontSize: 12 } as const;
const actionsStyle = { display: "flex", flexWrap: "wrap", gap: 9, marginTop: 18, paddingTop: 16, borderTop: "1px solid #eef1f4" } as const;
const primaryLinkStyle = { padding: "10px 13px", background: "#0057b8", color: "#fff", borderRadius: 9, textDecoration: "none", fontWeight: 800 } as const;
const secondaryLinkStyle = { padding: "10px 13px", border: "1px solid #d0d5dd", color: "#344054", borderRadius: 9, textDecoration: "none", fontWeight: 750, background: "#fff" } as const;
const emptyStyle = { border: "1px solid #e4e7ec", borderRadius: 16, background: "#fff", padding: 28, textAlign: "center" } as const;
