"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UniversitySummary = {
  id: string;
  name: string;
  slug: string | null;
  website: string | null;
  logo_url: string | null;
  cricos_code: string | null;
  description: string | null;
  campus_count: number;
  regional_campus_count: number;
  course_count: number;
  average_annual_fee: number | null;
};

const ensureUrl = (value: string | null | undefined) => {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const money = (value: number | null | undefined) => value == null
  ? "Fee data not loaded"
  : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(value));

export default function UniversitiesPage() {
  const [universities, setUniversities] = useState<UniversitySummary[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [regionalOnly, setRegionalOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const supabase = createClient();
        const { data, error: rpcError } = await supabase.rpc("unipath_university_catalogue");
        if (rpcError) throw rpcError;
        if (active) setUniversities((data ?? []) as UniversitySummary[]);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load universities.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const visibleUniversities = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = universities.filter((university) => {
      const matchesQuery = !q || [university.name, university.cricos_code ?? "", university.description ?? ""]
        .some((value) => value.toLowerCase().includes(q));
      const matchesRegional = !regionalOnly || Number(university.regional_campus_count) > 0;
      return matchesQuery && matchesRegional;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "courses") return Number(b.course_count) - Number(a.course_count);
      if (sort === "campuses") return Number(b.campus_count) - Number(a.campus_count);
      if (sort === "fee-low") return (a.average_annual_fee ?? Number.MAX_SAFE_INTEGER) - (b.average_annual_fee ?? Number.MAX_SAFE_INTEGER);
      return a.name.localeCompare(b.name);
    });
  }, [universities, query, regionalOnly, sort]);

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={heroInnerStyle}>
          <div style={eyebrowStyle}>UNIPATH AUSTRALIA · LIVE UNIVERSITY DATABASE</div>
          <h1 style={titleStyle}>Explore Australian universities</h1>
          <p style={heroTextStyle}>Browse UniPath&apos;s live university records, campuses and linked international courses, then open a university profile or continue to its official website.</p>

          <div style={searchShellStyle}>
            <span aria-hidden="true" style={{ fontSize: 20 }}>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search university name or CRICOS provider code" style={searchInputStyle} />
            {query && <button type="button" onClick={() => setQuery("")} style={clearButtonStyle}>Clear</button>}
          </div>
        </div>
      </section>

      <section style={tabsStyle}>
        <Link href="/local-v2/courses" style={tabStyle}>Courses</Link>
        <Link href="/local-v2/universities" style={{ ...tabStyle, ...activeTabStyle }}>Universities</Link>
        <Link href="/local-v2/careers" style={tabStyle}>Careers</Link>
      </section>

      <div style={contentStyle}>
        <div style={toolbarStyle}>
          <div>
            <div style={countStyle}>{loading ? "Loading universities…" : `${visibleUniversities.length} of ${universities.length} universities`}</div>
            <div style={subtextStyle}>Live Supabase university catalogue</div>
          </div>
          <div style={toolControlsStyle}>
            <label style={checkLabelStyle}><input type="checkbox" checked={regionalOnly} onChange={(event) => setRegionalOnly(event.target.checked)} /> Has regional campus</label>
            <label style={sortLabelStyle}>Sort by
              <select value={sort} onChange={(event) => setSort(event.target.value)} style={selectStyle}>
                <option value="name">University name</option>
                <option value="courses">Most courses</option>
                <option value="campuses">Most campuses</option>
                <option value="fee-low">Lowest average loaded fee</option>
              </select>
            </label>
          </div>
        </div>

        {error && <div style={errorStyle}><strong>Couldn&apos;t load universities.</strong><div style={{ marginTop: 5 }}>{error}</div></div>}

        {!loading && !error && visibleUniversities.length === 0 ? (
          <div style={emptyStyle}><h2 style={{ marginTop: 0 }}>No universities match this search</h2><button type="button" onClick={() => { setQuery(""); setRegionalOnly(false); }} style={primaryButtonStyle}>Clear filters</button></div>
        ) : (
          <section style={gridStyle}>
            {visibleUniversities.map((university) => {
              const logoUrl = ensureUrl(university.logo_url);
              const website = ensureUrl(university.website);
              const initials = university.name.split(/\s+/).filter(Boolean).slice(0, 3).map((word) => word[0]).join("").toUpperCase();
              return (
                <article key={university.id} style={cardStyle}>
                  <div style={brandRowStyle}>
                    <div style={logoShellStyle}>{logoUrl ? <img src={logoUrl} alt={`${university.name} logo`} style={logoImageStyle} /> : <span style={logoFallbackStyle}>{initials}</span>}</div>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={cardTitleStyle}>{university.name}</h2>
                      <div style={metaStyle}>{university.cricos_code ? `CRICOS provider ${university.cricos_code}` : "CRICOS provider code not loaded"}</div>
                    </div>
                  </div>

                  <div style={statsGridStyle}>
                    <Stat label="Courses" value={Number(university.course_count).toLocaleString()} />
                    <Stat label="Campuses" value={Number(university.campus_count).toLocaleString()} />
                    <Stat label="Regional campuses" value={Number(university.regional_campus_count).toLocaleString()} />
                    <Stat label="Avg loaded annual fee" value={money(university.average_annual_fee)} />
                  </div>

                  {university.description && <p style={descriptionStyle}>{university.description.length > 170 ? `${university.description.slice(0, 170)}…` : university.description}</p>}

                  <div style={actionsStyle}>
                    <Link href={`/local-v2/universities/${university.id}`} style={primaryLinkStyle}>View UniPath profile</Link>
                    {website && <a href={website} target="_blank" rel="noreferrer" style={secondaryLinkStyle}>Official website ↗</a>}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div style={statStyle}><div style={statLabelStyle}>{label}</div><strong>{value}</strong></div>;
}

const pageStyle = { minHeight: "100vh", background: "#f5f7fa", color: "#101828" } as const;
const heroStyle = { background: "#0057b8", color: "#fff", padding: "42px 20px 30px" } as const;
const heroInnerStyle = { maxWidth: 1180, margin: "0 auto" } as const;
const eyebrowStyle = { fontSize: 12, letterSpacing: .8, fontWeight: 850, opacity: .86 } as const;
const titleStyle = { margin: "10px 0", fontSize: 42, lineHeight: 1.08 } as const;
const heroTextStyle = { maxWidth: 820, margin: 0, color: "#e8f0fb", fontSize: 17, lineHeight: 1.55 } as const;
const searchShellStyle = { marginTop: 24, display: "flex", alignItems: "center", gap: 10, background: "#fff", color: "#101828", borderRadius: 14, padding: "5px 7px 5px 16px", maxWidth: 760, boxShadow: "0 12px 30px rgba(0,0,0,.14)" } as const;
const searchInputStyle = { flex: 1, border: 0, outline: 0, padding: "13px 4px", fontSize: 16, minWidth: 0 } as const;
const clearButtonStyle = { border: 0, background: "#f2f4f7", borderRadius: 9, padding: "9px 11px", cursor: "pointer", fontWeight: 700 } as const;
const tabsStyle = { maxWidth: 1180, margin: "0 auto", padding: "0 20px", display: "flex", gap: 4, background: "#fff", borderBottom: "1px solid #e4e7ec" } as const;
const tabStyle = { padding: "16px 18px", color: "#475467", textDecoration: "none", fontWeight: 750, borderBottom: "3px solid transparent" } as const;
const activeTabStyle = { color: "#0057b8", borderBottomColor: "#0057b8" } as const;
const contentStyle = { maxWidth: 1180, margin: "0 auto", padding: "26px 20px 70px" } as const;
const toolbarStyle = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 18, flexWrap: "wrap" } as const;
const countStyle = { fontSize: 21, fontWeight: 850 } as const;
const subtextStyle = { color: "#667085", fontSize: 13, marginTop: 2 } as const;
const toolControlsStyle = { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" } as const;
const checkLabelStyle = { display: "flex", gap: 8, alignItems: "center", color: "#344054", fontSize: 14, fontWeight: 700 } as const;
const sortLabelStyle = { display: "flex", gap: 8, alignItems: "center", color: "#475467", fontSize: 13, fontWeight: 700 } as const;
const selectStyle = { border: "1px solid #d0d5dd", borderRadius: 9, padding: "9px 10px", background: "#fff" } as const;
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 } as const;
const cardStyle = { border: "1px solid #e1e6ed", borderRadius: 18, padding: 20, background: "#fff", boxShadow: "0 3px 12px rgba(16,24,40,.04)" } as const;
const brandRowStyle = { display: "flex", gap: 14, alignItems: "center" } as const;
const logoShellStyle = { width: 76, height: 76, border: "1px solid #e4e7ec", borderRadius: 13, background: "#fff", display: "grid", placeItems: "center", overflow: "hidden", flex: "0 0 auto" } as const;
const logoImageStyle = { width: "100%", height: "100%", objectFit: "contain", padding: 7 } as const;
const logoFallbackStyle = { fontWeight: 900, color: "#0057b8", fontSize: 18 } as const;
const cardTitleStyle = { margin: 0, fontSize: 22, lineHeight: 1.25 } as const;
const metaStyle = { marginTop: 6, color: "#667085", fontSize: 13 } as const;
const statsGridStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 9, marginTop: 18 } as const;
const statStyle = { border: "1px solid #eaecf0", borderRadius: 11, background: "#f9fafb", padding: 11 } as const;
const statLabelStyle = { color: "#667085", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .3, marginBottom: 4 } as const;
const descriptionStyle = { color: "#475467", lineHeight: 1.55, fontSize: 14, margin: "15px 0 0" } as const;
const actionsStyle = { display: "flex", gap: 9, flexWrap: "wrap", marginTop: 18, paddingTop: 16, borderTop: "1px solid #eef1f4" } as const;
const primaryLinkStyle = { padding: "10px 13px", background: "#0057b8", color: "#fff", borderRadius: 9, textDecoration: "none", fontWeight: 800 } as const;
const secondaryLinkStyle = { padding: "10px 13px", border: "1px solid #d0d5dd", color: "#344054", borderRadius: 9, textDecoration: "none", fontWeight: 750, background: "#fff" } as const;
const errorStyle = { marginBottom: 14, border: "1px solid #fecdca", borderRadius: 12, background: "#fff6f5", color: "#b42318", padding: 14 } as const;
const emptyStyle = { border: "1px solid #e4e7ec", borderRadius: 16, background: "#fff", padding: 28, textAlign: "center" } as const;
const primaryButtonStyle = { border: 0, borderRadius: 9, background: "#0057b8", color: "#fff", padding: "10px 14px", fontWeight: 800, cursor: "pointer" } as const;
