"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Program = {
  id: string;
  subclass: string | null;
  name: string;
  stream: string | null;
  pathwayType: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
  linkedOccupationCount?: number;
};

type LinkedCourse = {
  id: string;
  name: string;
  qualificationLevel: string | null;
  cricosCode: string | null;
  durationMonths: number | null;
  annualFee: number | null;
  currency: string;
  officialCourseUrl: string | null;
  evidenceBasis: string | null;
  confidence: string | null;
  notes: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
  university: { id: string; name: string; website: string | null; logoUrl: string | null } | null;
};

type Occupation = {
  id: string;
  name: string;
  assessingAuthority: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
  anzscoCodes: string[];
  lists: string[];
  programs: Program[];
  linkedCourses: LinkedCourse[];
};

type MigrationResponse = {
  occupations?: Occupation[];
  programs?: Program[];
  error?: string;
  detail?: string;
};

const money = (value: number | null, currency = "AUD") => value == null ? "Fee not loaded" : new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(new Date(value)) : "Verification date not loaded";

export default function MigrationExplorerPage() {
  const [occupations, setOccupations] = useState<Occupation[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [occupationId, setOccupationId] = useState("");
  const [query, setQuery] = useState("");
  const [regionalOnly, setRegionalOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/local-v2/migration", { signal: controller.signal });
        const data = await response.json() as MigrationResponse;
        if (!response.ok) throw new Error(data.detail || data.error || "Unable to load migration data.");
        const nextOccupations = data.occupations ?? [];
        setOccupations(nextOccupations);
        setPrograms(data.programs ?? []);
        setOccupationId((current) => current || nextOccupations[0]?.id || "");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, []);

  const selectedOccupation = occupations.find((item) => item.id === occupationId) ?? null;
  const visibleOccupations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return occupations;
    return occupations.filter((item) => [item.name, ...item.anzscoCodes, ...item.lists].some((value) => value.toLowerCase().includes(needle)));
  }, [occupations, query]);

  const visiblePrograms = useMemo(() => {
    const base = selectedOccupation?.programs ?? programs;
    if (!regionalOnly) return base;
    return base.filter((program) => /regional/i.test(`${program.name} ${program.stream ?? ""} ${program.pathwayType ?? ""}`));
  }, [selectedOccupation, programs, regionalOnly]);

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={heroInnerStyle}>
          <div style={eyebrowStyle}>UNIPATH AUSTRALIA · VERIFIED MIGRATION DATA</div>
          <h1 style={heroTitleStyle}>Migration Pathway Explorer</h1>
          <p style={heroTextStyle}>Explore stored skilled occupations, occupation lists and migration program connections. UniPath does not determine visa eligibility and does not guarantee permanent residency.</p>
        </div>
      </section>

      <div style={contentStyle}>
        {error && <div style={errorStyle}><strong>Couldn&apos;t load migration data.</strong><div style={{ marginTop: 5 }}>{error}</div></div>}

        <section style={summaryGridStyle}>
          <Stat label="Skilled occupations" value={loading ? "…" : String(occupations.length)} />
          <Stat label="Migration program records" value={loading ? "…" : String(programs.length)} />
          <Stat label="Selected occupation programs" value={selectedOccupation ? String(selectedOccupation.programs.length) : "—"} />
          <Stat label="Course evidence links" value={selectedOccupation ? String(selectedOccupation.linkedCourses.length) : "—"} />
        </section>

        <section style={panelStyle}>
          <h2 style={sectionTitleStyle}>Choose a skilled occupation</h2>
          <div style={controlsStyle}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search occupation, ANZSCO code or list" style={inputStyle} />
            <select value={occupationId} onChange={(event) => setOccupationId(event.target.value)} style={inputStyle}>
              {visibleOccupations.map((occupation) => <option key={occupation.id} value={occupation.id}>{occupation.name}{occupation.anzscoCodes.length ? ` · ${occupation.anzscoCodes.join(", ")}` : ""}</option>)}
            </select>
            <label style={checkStyle}><input type="checkbox" checked={regionalOnly} onChange={(event) => setRegionalOnly(event.target.checked)} /> Regional pathways only</label>
          </div>
        </section>

        {selectedOccupation && <>
          <section style={panelStyle}>
            <div style={headingRowStyle}>
              <div>
                <div style={blueLabelStyle}>SKILLED OCCUPATION</div>
                <h2 style={{ margin: "5px 0" }}>{selectedOccupation.name}</h2>
                <div style={mutedStyle}>Verified {date(selectedOccupation.verifiedAt)}</div>
              </div>
              {selectedOccupation.sourceUrl && <a href={selectedOccupation.sourceUrl} target="_blank" rel="noreferrer" style={primaryLinkStyle}>Official occupation source ↗</a>}
            </div>
            <div style={summaryGridStyle}>
              <Stat label="ANZSCO" value={selectedOccupation.anzscoCodes.join(", ") || "Not loaded"} />
              <Stat label="Occupation lists" value={selectedOccupation.lists.join(", ") || "Not loaded"} />
              <Stat label="Assessing authority" value={selectedOccupation.assessingAuthority || "Not loaded"} />
              <Stat label="Linked programs" value={String(selectedOccupation.programs.length)} />
            </div>
          </section>

          <section style={{ marginTop: 16 }}>
            <div style={headingRowStyle}><h2 style={sectionTitleStyle}>Migration program connections</h2><span style={mutedStyle}>{visiblePrograms.length} program{visiblePrograms.length === 1 ? "" : "s"}</span></div>
            {visiblePrograms.length === 0 ? <div style={emptyStyle}>No stored program connection matches the current filter.</div> : <div style={cardGridStyle}>{visiblePrograms.map((program) => <article key={program.id} style={cardStyle}>
              <div style={blueLabelStyle}>{program.pathwayType || "Migration program"}</div>
              <h3 style={{ margin: "6px 0" }}>{program.subclass ? `Subclass ${program.subclass} · ` : ""}{program.name}</h3>
              {program.stream && <p style={mutedStyle}>{program.stream}</p>}
              <div style={mutedStyle}>Verified {date(program.verifiedAt)}</div>
              {program.sourceUrl && <a href={program.sourceUrl} target="_blank" rel="noreferrer" style={textLinkStyle}>Official Home Affairs source ↗</a>}
            </article>)}</div>}
          </section>

          <section style={{ ...panelStyle, marginTop: 16 }}>
            <div style={headingRowStyle}><h2 style={sectionTitleStyle}>Courses with stored occupation evidence</h2><span style={mutedStyle}>{selectedOccupation.linkedCourses.length} linked course{selectedOccupation.linkedCourses.length === 1 ? "" : "s"}</span></div>
            {selectedOccupation.linkedCourses.length === 0 ? <p style={mutedStyle}>No course-to-skilled-occupation evidence has been loaded for this occupation yet. UniPath does not infer a migration outcome from the occupation list alone.</p> : <div style={{ display: "grid", gap: 12 }}>{selectedOccupation.linkedCourses.map((course) => <article key={course.id} style={miniCardStyle}>
              <div style={headingRowStyle}>
                <div><div style={blueLabelStyle}>{course.university?.name ?? "University not linked"}</div><h3 style={{ margin: "5px 0" }}>{course.name}</h3><div style={mutedStyle}>{course.qualificationLevel || "Qualification not loaded"}{course.cricosCode ? ` · CRICOS ${course.cricosCode}` : ""}</div></div>
                <div style={{ fontWeight: 850 }}>{money(course.annualFee, course.currency)}/year</div>
              </div>
              {course.evidenceBasis && <p style={bodyStyle}><strong>Evidence basis:</strong> {course.evidenceBasis}</p>}
              <p style={mutedStyle}><strong>Confidence:</strong> {course.confidence || "Not stated"}</p>
              <div style={actionsStyle}><Link href={`/local-v2/courses/${course.id}`} style={primaryLinkStyle}>View course</Link>{course.officialCourseUrl && <a href={course.officialCourseUrl} target="_blank" rel="noreferrer" style={secondaryLinkStyle}>Official course page ↗</a>}{course.sourceUrl && <a href={course.sourceUrl} target="_blank" rel="noreferrer" style={secondaryLinkStyle}>Evidence source ↗</a>}</div>
            </article>)}</div>}
          </section>
        </>}

        <section style={warningStyle}>
          <strong>Important migration notice:</strong> Occupation lists and visa programs can change. These records show stored, source-dated connections only. Eligibility depends on current law and program rules, skills assessment, age, English, points, work experience, nomination or sponsorship requirements, and the student&apos;s personal circumstances. A course or occupation appearing here is not a PR guarantee.
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div style={statStyle}><div style={smallLabelStyle}>{label}</div><strong>{value}</strong></div>; }

const pageStyle = { minHeight: "100vh", background: "#f5f7fa", color: "#101828" } as const;
const heroStyle = { background: "#0057b8", color: "#fff", padding: "42px 20px 32px" } as const;
const heroInnerStyle = { maxWidth: 1120, margin: "0 auto" } as const;
const eyebrowStyle = { fontSize: 12, fontWeight: 850, letterSpacing: .8 } as const;
const heroTitleStyle = { fontSize: 42, margin: "10px 0" } as const;
const heroTextStyle = { maxWidth: 830, color: "#e8f0fb", lineHeight: 1.55, fontSize: 17 } as const;
const contentStyle = { maxWidth: 1120, margin: "0 auto", padding: "24px 20px 70px" } as const;
const panelStyle = { background: "#fff", border: "1px solid #e4e7ec", borderRadius: 16, padding: 20, marginTop: 16 } as const;
const summaryGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginTop: 16 } as const;
const statStyle = { background: "#fff", border: "1px solid #e4e7ec", borderRadius: 13, padding: 15 } as const;
const smallLabelStyle = { fontSize: 11, color: "#667085", fontWeight: 850, textTransform: "uppercase", letterSpacing: .35, marginBottom: 5 } as const;
const sectionTitleStyle = { margin: 0 } as const;
const controlsStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginTop: 14 } as const;
const inputStyle = { width: "100%", border: "1px solid #d0d5dd", borderRadius: 10, padding: "11px 12px", background: "#fff" } as const;
const checkStyle = { display: "flex", alignItems: "center", gap: 8, fontWeight: 700 } as const;
const headingRowStyle = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" } as const;
const blueLabelStyle = { color: "#0057b8", fontSize: 12, fontWeight: 850, letterSpacing: .35 } as const;
const mutedStyle = { color: "#667085", lineHeight: 1.5 } as const;
const cardGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 } as const;
const cardStyle = { background: "#fff", border: "1px solid #e4e7ec", borderRadius: 15, padding: 18 } as const;
const miniCardStyle = { background: "#fbfcfe", border: "1px solid #e4e7ec", borderRadius: 13, padding: 16 } as const;
const bodyStyle = { color: "#344054", lineHeight: 1.55 } as const;
const actionsStyle = { display: "flex", gap: 9, flexWrap: "wrap", marginTop: 12 } as const;
const primaryLinkStyle = { padding: "9px 12px", borderRadius: 9, background: "#0057b8", color: "#fff", textDecoration: "none", fontWeight: 800 } as const;
const secondaryLinkStyle = { padding: "9px 12px", borderRadius: 9, border: "1px solid #d0d5dd", color: "#344054", textDecoration: "none", fontWeight: 750, background: "#fff" } as const;
const textLinkStyle = { display: "inline-block", marginTop: 10, color: "#0057b8", fontWeight: 750 } as const;
const emptyStyle = { background: "#fff", border: "1px solid #e4e7ec", borderRadius: 14, padding: 20, color: "#667085" } as const;
const warningStyle = { marginTop: 18, padding: 18, borderRadius: 14, background: "#fff7ed", border: "1px solid #fed7aa", color: "#7c2d12", lineHeight: 1.55 } as const;
const errorStyle = { padding: 14, borderRadius: 12, background: "#fff6f5", border: "1px solid #fecdca", color: "#b42318" } as const;
