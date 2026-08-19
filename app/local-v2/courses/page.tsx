"use client";

import { useMemo, useState } from "react";
import { demoCampuses, demoCourses, demoUniversities } from "@/lib/local-v2/fixtures";

const money = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);
const states = ["ALL", "VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

export default function CoursesPage() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("ALL");
  const [regionalOnly, setRegionalOnly] = useState(false);
  const [qualification, setQualification] = useState("ALL");
  const [scholarshipOnly, setScholarshipOnly] = useState(false);
  const [maxAnnualFee, setMaxAnnualFee] = useState(50000);
  const [sort, setSort] = useState("relevance");

  const qualifications = useMemo(
    () => ["ALL", ...Array.from(new Set(demoCourses.map((course) => course.qualificationLevel)))],
    [],
  );

  const courses = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = demoCourses.filter((course) => {
      const campus = demoCampuses.find((item) => item.id === course.campusId);
      const university = demoUniversities.find((item) => item.id === course.universityId);
      const matchesQuery = !q || [course.name, course.field, course.qualificationLevel, ...course.occupations, ...course.skillTags, university?.name ?? "", campus?.name ?? ""]
        .some((value) => value.toLowerCase().includes(q));
      const matchesState = state === "ALL" || campus?.state === state;
      const matchesRegional = !regionalOnly || campus?.regional === true;
      const matchesQualification = qualification === "ALL" || course.qualificationLevel === qualification;
      const matchesScholarship = !scholarshipOnly || (course.scholarshipPercent ?? 0) > 0;
      const matchesFee = course.annualTuitionCents <= maxAnnualFee * 100;
      return matchesQuery && matchesState && matchesRegional && matchesQualification && matchesScholarship && matchesFee;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "fee-low") return a.annualTuitionCents - b.annualTuitionCents;
      if (sort === "fee-high") return b.annualTuitionCents - a.annualTuitionCents;
      if (sort === "jobs") return b.labourMarketScore - a.labourMarketScore;
      if (sort === "scholarship") return (b.scholarshipPercent ?? 0) - (a.scholarshipPercent ?? 0);
      return b.labourMarketScore - a.labourMarketScore;
    });
  }, [query, state, regionalOnly, qualification, scholarshipOnly, maxAnnualFee, sort]);

  const clearFilters = () => {
    setQuery("");
    setState("ALL");
    setRegionalOnly(false);
    setQualification("ALL");
    setScholarshipOnly(false);
    setMaxAnnualFee(50000);
    setSort("relevance");
  };

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={heroInnerStyle}>
          <div style={eyebrowStyle}>UNIPATH COURSE DISCOVERY</div>
          <h1 style={heroTitleStyle}>Search courses across Australia</h1>
          <p style={heroTextStyle}>Explore courses by study area, career outcome, university, location and budget. This catalogue is using UniPath demo recommendation data while the real catalogue connection is built out.</p>

          <div style={searchShellStyle}>
            <span style={{ fontSize: 20 }}>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search course, career, field or university"
              style={heroSearchStyle}
            />
            {query && <button type="button" onClick={() => setQuery("")} style={clearSearchButtonStyle}>Clear</button>}
          </div>

          <div style={quickLinksStyle}>
            <button type="button" onClick={() => setQuery("software")} style={quickLinkStyle}>Software</button>
            <button type="button" onClick={() => setQuery("cyber")} style={quickLinkStyle}>Cyber Security</button>
            <button type="button" onClick={() => setQuery("data")} style={quickLinkStyle}>Data Science</button>
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
          <div style={filterHeaderStyle}>
            <strong>Filters</strong>
            <button type="button" onClick={clearFilters} style={resetButtonStyle}>Clear all</button>
          </div>

          <FilterGroup title="Qualification level">
            <select value={qualification} onChange={(event) => setQualification(event.target.value)} style={controlStyle}>
              {qualifications.map((item) => <option key={item} value={item}>{item === "ALL" ? "All levels" : item}</option>)}
            </select>
          </FilterGroup>

          <FilterGroup title="State">
            <select value={state} onChange={(event) => setState(event.target.value)} style={controlStyle}>
              {states.map((item) => <option key={item} value={item}>{item === "ALL" ? "All states" : item}</option>)}
            </select>
          </FilterGroup>

          <FilterGroup title="Study location">
            <label style={checkRowStyle}><input type="checkbox" checked={regionalOnly} onChange={(event) => setRegionalOnly(event.target.checked)} /> Regional only</label>
          </FilterGroup>

          <FilterGroup title="Scholarships">
            <label style={checkRowStyle}><input type="checkbox" checked={scholarshipOnly} onChange={(event) => setScholarshipOnly(event.target.checked)} /> Scholarship available</label>
          </FilterGroup>

          <FilterGroup title="Maximum annual tuition">
            <input type="range" min="30000" max="50000" step="500" value={maxAnnualFee} onChange={(event) => setMaxAnnualFee(Number(event.target.value))} style={{ width: "100%" }} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6, color: "#475467", fontSize: 13 }}><span>A$30k</span><strong>{money(maxAnnualFee * 100)}</strong></div>
          </FilterGroup>

          <div style={filterNoteStyle}>More filters will be connected as real university, scholarship, intake and delivery-mode data is added.</div>
        </aside>

        <section>
          <div style={resultsHeaderStyle}>
            <div>
              <div style={resultCountStyle}>{courses.length} course{courses.length === 1 ? "" : "s"}</div>
              <div style={resultSubtextStyle}>Matching your current search and filters</div>
            </div>
            <label style={sortWrapStyle}>
              <span>Sort by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)} style={sortStyle}>
                <option value="relevance">Best match</option>
                <option value="fee-low">Lowest fee</option>
                <option value="fee-high">Highest fee</option>
                <option value="jobs">Job market</option>
                <option value="scholarship">Scholarship</option>
              </select>
            </label>
          </div>

          {courses.length === 0 ? (
            <div style={emptyStyle}>
              <h2 style={{ marginTop: 0 }}>No courses match these filters</h2>
              <p style={{ color: "#667085" }}>Try increasing your tuition limit, changing the state, or clearing a filter.</p>
              <button type="button" onClick={clearFilters} style={primaryButtonStyle}>Clear filters</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {courses.map((course) => {
                const campus = demoCampuses.find((item) => item.id === course.campusId);
                const university = demoUniversities.find((item) => item.id === course.universityId);
                const fullCourseCents = Math.round(course.annualTuitionCents * course.durationYears);
                const semesterCents = Math.round(course.annualTuitionCents / 2);
                const scholarshipPercent = course.scholarshipPercent ?? 0;
                return (
                  <article key={course.id} style={cardStyle}>
                    <div style={cardTopStyle}>
                      <div style={{ minWidth: 0 }}>
                        <div style={universityStyle}>{university?.name}</div>
                        <h2 style={courseTitleStyle}>{course.name}</h2>
                        <div style={metaRowStyle}>
                          <span>{course.qualificationLevel}</span>
                          <span>•</span>
                          <span>{campus?.name}</span>
                          <span>•</span>
                          <span>{campus?.state}</span>
                        </div>
                      </div>
                      <div style={badgeWrapStyle}>
                        {campus?.regional && <span style={regionalBadgeStyle}>Regional</span>}
                        {scholarshipPercent > 0 && <span style={scholarshipBadgeStyle}>{scholarshipPercent}% scholarship demo</span>}
                      </div>
                    </div>

                    <div style={statsGridStyle}>
                      <Stat label="1 semester" value={money(semesterCents)} />
                      <Stat label="Annual tuition" value={money(course.annualTuitionCents)} />
                      <Stat label="Full course" value={money(fullCourseCents)} />
                      <Stat label="Duration" value={`${course.durationYears} years`} />
                    </div>

                    <div style={detailGridStyle}>
                      <div><div style={smallLabelStyle}>Study field</div><strong>{course.field}</strong></div>
                      <div><div style={smallLabelStyle}>Job market score</div><strong>{course.labourMarketScore}/100 <span style={demoTextStyle}>demo</span></strong></div>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div style={smallLabelStyle}>Career outcomes</div>
                      <div style={chipsStyle}>{course.occupations.map((occupation) => <span key={occupation} style={chipStyle}>{occupation}</span>)}</div>
                    </div>

                    <div style={cardActionsStyle}>
                      <a href={`/local-v2/courses/${course.id}`} style={primaryLinkStyle}>View course details</a>
                      <button type="button" style={secondaryActionStyle}>♡ Save</button>
                      <a href={`/local-v2/compare?course=${course.id}`} style={secondaryLinkStyle}>+ Compare</a>
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

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={filterGroupStyle}><div style={filterTitleStyle}>{title}</div>{children}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div style={statStyle}><div style={smallLabelStyle}>{label}</div><strong style={{ fontSize: 16 }}>{value}</strong></div>;
}

const pageStyle = { minHeight: "100vh", background: "#f5f7fa", color: "#101828" } as const;
const heroStyle = { background: "#0057b8", color: "#fff", padding: "42px 20px 30px" } as const;
const heroInnerStyle = { maxWidth: 1180, margin: "0 auto" } as const;
const eyebrowStyle = { fontSize: 12, letterSpacing: 0.8, fontWeight: 850, opacity: 0.86 } as const;
const heroTitleStyle = { margin: "10px 0 10px", fontSize: 42, lineHeight: 1.08 } as const;
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
const controlStyle = { width: "100%", padding: "10px 10px", borderRadius: 9, border: "1px solid #d0d5dd", background: "#fff" } as const;
const checkRowStyle = { display: "flex", gap: 8, alignItems: "center", color: "#344054", fontSize: 14 } as const;
const filterNoteStyle = { marginTop: 16, padding: 12, background: "#f8fafc", borderRadius: 10, color: "#667085", fontSize: 12, lineHeight: 1.5 } as const;
const resultsHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "end", marginBottom: 16, flexWrap: "wrap" } as const;
const resultCountStyle = { fontSize: 23, fontWeight: 850 } as const;
const resultSubtextStyle = { color: "#667085", fontSize: 13, marginTop: 2 } as const;
const sortWrapStyle = { display: "flex", gap: 9, alignItems: "center", color: "#475467", fontSize: 13, fontWeight: 700 } as const;
const sortStyle = { padding: "9px 10px", border: "1px solid #d0d5dd", borderRadius: 9, background: "#fff" } as const;
const cardStyle = { background: "#fff", border: "1px solid #e4e7ec", borderRadius: 18, padding: 22, boxShadow: "0 4px 16px rgba(16,24,40,.04)" } as const;
const cardTopStyle = { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" } as const;
const universityStyle = { color: "#0057b8", fontSize: 13, fontWeight: 800 } as const;
const courseTitleStyle = { margin: "6px 0 7px", fontSize: 23, lineHeight: 1.2 } as const;
const metaRowStyle = { display: "flex", flexWrap: "wrap", gap: 7, color: "#667085", fontSize: 13 } as const;
const badgeWrapStyle = { display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "flex-end" } as const;
const regionalBadgeStyle = { background: "#ecfdf3", color: "#027a48", border: "1px solid #abefc6", borderRadius: 999, padding: "5px 9px", fontWeight: 800, fontSize: 12 } as const;
const scholarshipBadgeStyle = { background: "#fff6ed", color: "#b54708", border: "1px solid #fedf89", borderRadius: 999, padding: "5px 9px", fontWeight: 800, fontSize: 12 } as const;
const statsGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10, marginTop: 18 } as const;
const statStyle = { padding: 12, borderRadius: 12, background: "#f8fafc", border: "1px solid #eef2f6" } as const;
const smallLabelStyle = { color: "#667085", fontSize: 12, marginBottom: 4, fontWeight: 650 } as const;
const detailGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginTop: 16 } as const;
const demoTextStyle = { color: "#98a2b3", fontSize: 11, fontWeight: 650 } as const;
const chipsStyle = { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 7 } as const;
const chipStyle = { background: "#f2f4f7", borderRadius: 999, padding: "6px 9px", fontSize: 12, color: "#344054", fontWeight: 650 } as const;
const cardActionsStyle = { display: "flex", flexWrap: "wrap", gap: 9, marginTop: 20, paddingTop: 16, borderTop: "1px solid #eaecf0" } as const;
const primaryLinkStyle = { background: "#0057b8", color: "#fff", textDecoration: "none", padding: "10px 14px", borderRadius: 9, fontWeight: 800 } as const;
const secondaryActionStyle = { border: "1px solid #d0d5dd", background: "#fff", color: "#344054", borderRadius: 9, padding: "10px 14px", fontWeight: 750, cursor: "pointer" } as const;
const secondaryLinkStyle = { border: "1px solid #d0d5dd", background: "#fff", color: "#344054", borderRadius: 9, padding: "10px 14px", fontWeight: 750, textDecoration: "none" } as const;
const emptyStyle = { background: "#fff", border: "1px solid #e4e7ec", borderRadius: 16, padding: 28, textAlign: "center" } as const;
const primaryButtonStyle = { border: 0, borderRadius: 9, background: "#0057b8", color: "#fff", padding: "10px 14px", fontWeight: 800, cursor: "pointer" } as const;