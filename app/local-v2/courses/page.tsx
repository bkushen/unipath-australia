"use client";

import { useEffect, useState } from "react";

type CatalogueCourse = {
  id: string;
  name: string;
  slug: string | null;
  qualificationLevel: string | null;
  cricosCode: string | null;
  durationMonths: number | null;
  annualFee: number | null;
  totalFee: number | null;
  currency: string;
  description: string | null;
  deliveryMode: string | null;
  verifiedAt: string | null;
  verificationStatus: string | null;
  officialCourseUrl: string | null;
  officialCourseUrlVerifiedAt?: string | null;
  sourceUrl: string | null;
  university: {
    id: string;
    name: string;
    slug: string | null;
    website: string | null;
    logoUrl: string | null;
    cricosCode: string | null;
  } | null;
  campuses: Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    postcode: string | null;
    regional: boolean;
  }>;
};

type CatalogueResponse = {
  courses?: CatalogueCourse[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
  qualificationOptions?: string[];
  error?: string;
  detail?: string;
};

const states = ["ALL", "VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"];
const PAGE_SIZE = 100;
const money = (value: number | null, currency = "AUD") => value == null
  ? "Fee not loaded"
  : new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD", maximumFractionDigits: 0 }).format(value);

export default function CoursesPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [courses, setCourses] = useState<CatalogueCourse[]>([]);
  const [qualificationOptions, setQualificationOptions] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [state, setState] = useState("ALL");
  const [regionalOnly, setRegionalOnly] = useState(false);
  const [qualification, setQualification] = useState("ALL");
  const [maxAnnualFee, setMaxAnnualFee] = useState(80000);
  const [debouncedMaxAnnualFee, setDebouncedMaxAnnualFee] = useState(80000);
  const [sort, setSort] = useState("name");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedMaxAnnualFee(maxAnnualFee);
      setPage(1);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [maxAnnualFee]);

  useEffect(() => {
    setPage(1);
  }, [state, regionalOnly, qualification, sort]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          q: debouncedQuery,
          page: String(page),
          pageSize: String(PAGE_SIZE),
          sort,
          maxAnnualFee: String(debouncedMaxAnnualFee),
        });
        if (state !== "ALL") params.set("state", state);
        if (regionalOnly) params.set("regional", "true");
        if (qualification !== "ALL") params.set("qualification", qualification);

        const response = await fetch(`/api/local-v2/courses?${params.toString()}`, { signal: controller.signal });
        const data = (await response.json()) as CatalogueResponse;
        if (!response.ok) throw new Error(data.detail || data.error || "Unable to load courses.");
        setCourses(data.courses ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setQualificationOptions(data.qualificationOptions ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
          setCourses([]);
          setTotal(0);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [debouncedQuery, page, state, regionalOnly, qualification, debouncedMaxAnnualFee, sort]);

  const clearFilters = () => {
    setQuery("");
    setState("ALL");
    setRegionalOnly(false);
    setQualification("ALL");
    setMaxAnnualFee(80000);
    setDebouncedMaxAnnualFee(80000);
    setSort("name");
    setPage(1);
  };

  const goToPage = (nextPage: number) => {
    setPage(Math.min(Math.max(nextPage, 1), totalPages));
    window.scrollTo({ top: 320, behavior: "smooth" });
  };

  const firstItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(page * PAGE_SIZE, total);

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={heroInnerStyle}>
          <div style={eyebrowStyle}>UNIPATH AUSTRALIA · FULL LIVE COURSE DATABASE</div>
          <h1 style={heroTitleStyle}>Search courses across Australia</h1>
          <p style={heroTextStyle}>Browse the complete UniPath course database. Search and filters now run across the full catalogue, while results load 100 at a time for speed.</p>

          <div style={searchShellStyle}>
            <span style={{ fontSize: 20 }}>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search course, qualification or study area" style={heroSearchStyle} />
            {query && <button type="button" onClick={() => setQuery("")} style={clearSearchButtonStyle}>Clear</button>}
          </div>

          <div style={quickLinksStyle}>
            <button type="button" onClick={() => setQuery("software")} style={quickLinkStyle}>Software</button>
            <button type="button" onClick={() => setQuery("cyber")} style={quickLinkStyle}>Cyber Security</button>
            <button type="button" onClick={() => setQuery("data science")} style={quickLinkStyle}>Data Science</button>
            <a href="/local-v2/quick-match" style={quickMatchLinkStyle}>Not sure? Try Quick Match →</a>
          </div>
        </div>
      </section>

      <section style={tabsStyle}>
        <a href="/local-v2/courses" style={{ ...tabStyle, ...activeTabStyle }}>Courses</a>
        <a href="/local-v2/universities" style={tabStyle}>Universities</a>
        <a href="/local-v2/careers" style={tabStyle}>Careers</a>
      </section>

      <div style={contentGridStyle}>
        <aside style={filterPanelStyle}>
          <div style={filterHeaderStyle}><strong>Filters</strong><button type="button" onClick={clearFilters} style={resetButtonStyle}>Clear all</button></div>
          <FilterGroup title="Qualification level">
            <select value={qualification} onChange={(event) => setQualification(event.target.value)} style={controlStyle}>
              <option value="ALL">All levels</option>
              {qualificationOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </FilterGroup>
          <FilterGroup title="State">
            <select value={state} onChange={(event) => setState(event.target.value)} style={controlStyle}>
              {states.map((item) => <option key={item} value={item}>{item === "ALL" ? "All states" : item}</option>)}
            </select>
          </FilterGroup>
          <FilterGroup title="Study location"><label style={checkRowStyle}><input type="checkbox" checked={regionalOnly} onChange={(event) => setRegionalOnly(event.target.checked)} /> Regional only</label></FilterGroup>
          <FilterGroup title="Maximum annual tuition">
            <input type="range" min="20000" max="80000" step="1000" value={maxAnnualFee} onChange={(event) => setMaxAnnualFee(Number(event.target.value))} style={{ width: "100%" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, color: "#475467", fontSize: 13 }}><span>A$20k</span><strong>{money(maxAnnualFee)}</strong></div>
          </FilterGroup>
          <div style={filterNoteStyle}>These filters apply to the complete Supabase catalogue, not just the 100 records currently shown.</div>
        </aside>

        <section>
          <div style={resultsHeaderStyle}>
            <div>
              <div style={resultCountStyle}>{loading ? "Loading courses…" : `${total.toLocaleString()} course${total === 1 ? "" : "s"} found`}</div>
              <div style={resultSubtextStyle}>{!loading && total > 0 ? `Showing ${firstItem.toLocaleString()}–${lastItem.toLocaleString()} · Page ${page} of ${totalPages.toLocaleString()}` : "Supabase-backed UniPath catalogue"}</div>
            </div>
            <label style={sortWrapStyle}><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)} style={sortStyle}><option value="name">Course name</option><option value="fee-low">Lowest fee</option><option value="fee-high">Highest fee</option></select></label>
          </div>

          {error && <div style={errorStyle}><strong>Couldn’t load the catalogue.</strong><div style={{ marginTop: 5 }}>{error}</div></div>}

          {!loading && !error && courses.length === 0 ? (
            <div style={emptyStyle}><h2 style={{ marginTop: 0 }}>No courses match these filters</h2><p style={{ color: "#667085" }}>Try another keyword, state, qualification or fee range.</p><button type="button" onClick={clearFilters} style={primaryButtonStyle}>Clear filters</button></div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>{courses.map((course) => <CourseCard key={course.id} course={course} />)}</div>
          )}

          {!loading && !error && totalPages > 1 && (
            <nav aria-label="Course catalogue pagination" style={paginationStyle}>
              <button type="button" disabled={page <= 1} onClick={() => goToPage(1)} style={pageButtonStyle}>« First</button>
              <button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)} style={pageButtonStyle}>← Previous</button>
              <span style={pageInfoStyle}>Page <strong>{page.toLocaleString()}</strong> of <strong>{totalPages.toLocaleString()}</strong></span>
              <button type="button" disabled={page >= totalPages} onClick={() => goToPage(page + 1)} style={pageButtonStyle}>Next →</button>
              <button type="button" disabled={page >= totalPages} onClick={() => goToPage(totalPages)} style={pageButtonStyle}>Last »</button>
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}

function CourseCard({ course }: { course: CatalogueCourse }) {
  const university = course.university;
  const firstCampus = course.campuses[0];
  const duration = course.durationMonths ? `${course.durationMonths} months` : "Duration not loaded";
  const officialUrl = course.officialCourseUrl || university?.website || null;
  const externalLabel = course.officialCourseUrl ? "Official course page ↗" : "University website ↗";
  const initials = (university?.name ?? "University").split(/\s+/).filter(Boolean).slice(0, 3).map((word) => word[0]).join("").toUpperCase();

  return <article style={cardStyle}>
    <div style={cardTopStyle}>
      <div style={universityBrandStyle}>
        <div style={logoShellStyle}>{university?.logoUrl ? <img src={university.logoUrl} alt={`${university.name} logo`} style={logoImageStyle} /> : <span style={logoFallbackStyle}>{initials}</span>}</div>
        <div style={{ minWidth: 0 }}><div style={universityStyle}>{university?.name ?? "University not linked"}</div><h2 style={courseTitleStyle}>{course.name}</h2><div style={metaRowStyle}>{course.qualificationLevel && <span>{course.qualificationLevel}</span>}{course.cricosCode && <><span>•</span><span>CRICOS {course.cricosCode}</span></>}</div></div>
      </div>
      <div style={badgeWrapStyle}>{course.campuses.some((campus) => campus.regional) && <span style={regionalBadgeStyle}>Regional option</span>}<span style={liveBadgeStyle}>Live DB</span></div>
    </div>
    <div style={statsGridStyle}><Stat label="Annual tuition" value={money(course.annualFee, course.currency)} /><Stat label="Total tuition" value={money(course.totalFee, course.currency)} /><Stat label="Duration" value={duration} /><Stat label="Delivery" value={course.deliveryMode || "Not loaded"} /></div>
    <div style={detailGridStyle}><div><div style={smallLabelStyle}>Campus</div><strong>{firstCampus ? `${firstCampus.name}${firstCampus.city ? ` · ${firstCampus.city}` : ""}${firstCampus.state ? `, ${firstCampus.state}` : ""}` : "Campus not linked"}</strong></div><div><div style={smallLabelStyle}>University CRICOS</div><strong>{university?.cricosCode || "Not loaded"}</strong></div></div>
    {course.campuses.length > 1 && <div style={{ marginTop: 13 }}><div style={smallLabelStyle}>Other campus options</div><div style={chipsStyle}>{course.campuses.slice(1, 5).map((campus) => <span key={campus.id} style={chipStyle}>{campus.city || campus.name}{campus.state ? `, ${campus.state}` : ""}</span>)}</div></div>}
    <div style={cardActionsStyle}>{officialUrl ? <a href={officialUrl} target="_blank" rel="noreferrer" style={primaryLinkStyle}>{externalLabel}</a> : <span style={disabledLinkStyle}>Official link not loaded</span>}{university?.website && course.officialCourseUrl && <a href={university.website} target="_blank" rel="noreferrer" style={secondaryLinkStyle}>University website ↗</a>}<button type="button" style={secondaryActionStyle}>♡ Save</button><a href={`/local-v2/compare?course=${course.id}`} style={secondaryLinkStyle}>+ Compare</a></div>
  </article>;
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) { return <div style={filterGroupStyle}><div style={filterTitleStyle}>{title}</div>{children}</div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div style={statStyle}><div style={smallLabelStyle}>{label}</div><strong style={{ fontSize: 16 }}>{value}</strong></div>; }

const pageStyle = { minHeight: "100vh", background: "#f5f7fa", color: "#101828" } as const;
const heroStyle = { background: "#0057b8", color: "#fff", padding: "42px 20px 30px" } as const;
const heroInnerStyle = { maxWidth: 1180, margin: "0 auto" } as const;
const eyebrowStyle = { fontSize: 12, letterSpacing: 0.8, fontWeight: 850, opacity: 0.86 } as const;
const heroTitleStyle = { margin: "10px 0", fontSize: 42, lineHeight: 1.08 } as const;
const heroTextStyle = { maxWidth: 820, margin: 0, color: "#e8f0fb", fontSize: 17, lineHeight: 1.55 } as const;
const searchShellStyle = { marginTop: 24, display: "flex", alignItems: "center", gap: 10, background: "#fff", color: "#101828", borderRadius: 14, padding: "5px 7px 5px 16px", maxWidth: 850, boxShadow: "0 12px 30px rgba(0,0,0,0.14)" } as const;
const heroSearchStyle = { flex: 1, border: 0, outline: 0, padding: "13px 4px", fontSize: 16, minWidth: 0 } as const;
const clearSearchButtonStyle = { border: 0, background: "#f2f4f7", borderRadius: 9, padding: "9px 11px", cursor: "pointer", fontWeight: 700 } as const;
const quickLinksStyle = { display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center", marginTop: 14 } as const;
const quickLinkStyle = { border: "1px solid rgba(255,255,255,.5)", background: "rgba(255,255,255,.08)", color: "#fff", borderRadius: 999, padding: "7px 11px", cursor: "pointer", fontWeight: 700 } as const;
const quickMatchLinkStyle = { color: "#fff", fontWeight: 800, marginLeft: 5, textDecoration: "underline" } as const;
const tabsStyle = { maxWidth: 1180, margin: "0 auto", padding: "0 20px", display: "flex", gap: 4, background: "#fff", borderBottom: "1px solid #e4e7ec" } as const;
const tabStyle = { padding: "16px 18px", color: "#475467", textDecoration: "none", fontWeight: 750, borderBottom: "3px solid transparent" } as const;
const activeTabStyle = { color: "#0057b8", borderBottomColor: "#0057b8" } as const;
const contentGridStyle = { maxWidth: 1180, margin: "0 auto", padding: "26px 20px 70px", display: "grid", gridTemplateColumns: "250px minmax(0,1fr)", gap: 24, alignItems: "start" } as const;
const filterPanelStyle = { background: "#fff", border: "1px solid #e4e7ec", borderRadius: 16, padding: 18, position: "sticky", top: 18 } as const;
const filterHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", paddingBottom: 14, borderBottom: "1px solid #eaecf0" } as const;
const resetButtonStyle = { border: 0, background: "transparent", color: "#0057b8", fontWeight: 750, cursor: "pointer", padding: 0 } as const;
const filterGroupStyle = { padding: "16px 0", borderBottom: "1px solid #f0f2f5" } as const;
const filterTitleStyle = { fontWeight: 800, marginBottom: 9, fontSize: 14 } as const;
const controlStyle = { width: "100%", padding: "10px", borderRadius: 9, border: "1px solid #d0d5dd", background: "#fff" } as const;
const checkRowStyle = { display: "flex", gap: 8, alignItems: "center", color: "#344054", fontSize: 14 } as const;
const filterNoteStyle = { marginTop: 16, padding: 12, background: "#f8fafc", borderRadius: 10, color: "#667085", fontSize: 12, lineHeight: 1.45 } as const;
const resultsHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 14, flexWrap: "wrap" } as const;
const resultCountStyle = { fontSize: 21, fontWeight: 850 } as const;
const resultSubtextStyle = { color: "#667085", fontSize: 13, marginTop: 2 } as const;
const sortWrapStyle = { display: "flex", gap: 8, alignItems: "center", color: "#475467", fontSize: 13, fontWeight: 700 } as const;
const sortStyle = { border: "1px solid #d0d5dd", borderRadius: 9, padding: "9px 10px", background: "#fff" } as const;
const cardStyle = { border: "1px solid #e1e6ed", borderRadius: 18, padding: 20, background: "#fff", boxShadow: "0 3px 12px rgba(16,24,40,.04)" } as const;
const cardTopStyle = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" } as const;
const universityBrandStyle = { display: "flex", gap: 14, alignItems: "flex-start", minWidth: 0, flex: "1 1 520px" } as const;
const logoShellStyle = { width: 72, height: 72, border: "1px solid #e4e7ec", borderRadius: 12, background: "#fff", display: "grid", placeItems: "center", overflow: "hidden", flex: "0 0 auto" } as const;
const logoImageStyle = { width: "100%", height: "100%", objectFit: "contain", padding: 7 } as const;
const logoFallbackStyle = { fontWeight: 900, color: "#0057b8", fontSize: 18, letterSpacing: 0.5 } as const;
const universityStyle = { color: "#0057b8", fontWeight: 850, fontSize: 14, marginBottom: 5 } as const;
const courseTitleStyle = { margin: 0, fontSize: 24, lineHeight: 1.25 } as const;
const metaRowStyle = { display: "flex", flexWrap: "wrap", gap: 7, color: "#667085", fontSize: 13, marginTop: 8 } as const;
const badgeWrapStyle = { display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" } as const;
const regionalBadgeStyle = { padding: "6px 9px", borderRadius: 999, background: "#ecfdf3", color: "#027a48", border: "1px solid #abefc6", fontWeight: 800, fontSize: 12 } as const;
const liveBadgeStyle = { padding: "6px 9px", borderRadius: 999, background: "#eaf3ff", color: "#0057b8", border: "1px solid #b9d4f5", fontWeight: 800, fontSize: 12 } as const;
const statsGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10, marginTop: 18 } as const;
const statStyle = { border: "1px solid #eaecf0", borderRadius: 11, background: "#f9fafb", padding: 12 } as const;
const smallLabelStyle = { color: "#667085", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .35, marginBottom: 4 } as const;
const detailGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, marginTop: 16, paddingTop: 15, borderTop: "1px solid #eef1f4" } as const;
const chipsStyle = { display: "flex", gap: 7, flexWrap: "wrap", marginTop: 7 } as const;
const chipStyle = { padding: "5px 8px", borderRadius: 999, background: "#f2f4f7", color: "#344054", fontSize: 12, fontWeight: 700 } as const;
const cardActionsStyle = { display: "flex", gap: 9, flexWrap: "wrap", marginTop: 18, paddingTop: 16, borderTop: "1px solid #eef1f4" } as const;
const primaryLinkStyle = { padding: "10px 13px", background: "#0057b8", color: "#fff", borderRadius: 9, textDecoration: "none", fontWeight: 800 } as const;
const secondaryLinkStyle = { padding: "10px 13px", border: "1px solid #d0d5dd", color: "#344054", borderRadius: 9, textDecoration: "none", fontWeight: 750, background: "#fff" } as const;
const secondaryActionStyle = { padding: "10px 13px", border: "1px solid #d0d5dd", color: "#344054", borderRadius: 9, fontWeight: 750, background: "#fff", cursor: "pointer" } as const;
const disabledLinkStyle = { padding: "10px 13px", borderRadius: 9, background: "#f2f4f7", color: "#98a2b3", fontWeight: 750 } as const;
const emptyStyle = { border: "1px solid #e4e7ec", borderRadius: 16, background: "#fff", padding: 28, textAlign: "center" } as const;
const errorStyle = { marginBottom: 14, border: "1px solid #fecdca", borderRadius: 12, background: "#fff6f5", color: "#b42318", padding: 14 } as const;
const primaryButtonStyle = { border: 0, borderRadius: 9, background: "#0057b8", color: "#fff", padding: "10px 14px", fontWeight: 800, cursor: "pointer" } as const;
const paginationStyle = { display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "center", alignItems: "center", marginTop: 24, padding: 16, border: "1px solid #e4e7ec", borderRadius: 14, background: "#fff" } as const;
const pageButtonStyle = { border: "1px solid #d0d5dd", borderRadius: 9, background: "#fff", padding: "9px 12px", fontWeight: 750, cursor: "pointer" } as const;
const pageInfoStyle = { padding: "9px 12px", color: "#475467", fontSize: 14 } as const;
