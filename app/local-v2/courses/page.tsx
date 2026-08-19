"use client";

import { useMemo, useState } from "react";
import { demoCampuses, demoCourses, demoUniversities } from "@/lib/local-v2/fixtures";

const money = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);

export default function CoursesPage() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("ALL");
  const [regionalOnly, setRegionalOnly] = useState(false);

  const courses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return demoCourses.filter((course) => {
      const campus = demoCampuses.find((item) => item.id === course.campusId);
      const university = demoUniversities.find((item) => item.id === course.universityId);
      const matchesQuery = !q || [course.name, course.field, ...course.occupations, university?.name ?? ""].some((value) => value.toLowerCase().includes(q));
      const matchesState = state === "ALL" || campus?.state === state;
      const matchesRegional = !regionalOnly || campus?.regional === true;
      return matchesQuery && matchesState && matchesRegional;
    });
  }, [query, state, regionalOnly]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>LOCAL DEMO DATA</span>
        <h1>Courses</h1>
        <p style={{ color: "#586174" }}>Browse the current UniPath local demo catalogue. Real university data comes later.</p>
      </div>

      <section style={{ border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff", marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6, fontWeight: 650 }}>
            Search
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Course, career or university" style={{ padding: 10, borderRadius: 10, border: "1px solid #cfd5df" }} />
          </label>
          <label style={{ display: "grid", gap: 6, fontWeight: 650 }}>
            State
            <select value={state} onChange={(e) => setState(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #cfd5df" }}>
              <option value="ALL">All states</option>
              <option value="VIC">VIC</option>
              <option value="NSW">NSW</option>
              <option value="QLD">QLD</option>
              <option value="SA">SA</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "end", gap: 8, fontWeight: 650, paddingBottom: 10 }}>
            <input type="checkbox" checked={regionalOnly} onChange={(e) => setRegionalOnly(e.target.checked)} /> Regional only
          </label>
        </div>
      </section>

      <div style={{ marginBottom: 12, color: "#586174" }}>{courses.length} course{courses.length === 1 ? "" : "s"} found</div>

      <section style={{ display: "grid", gap: 14 }}>
        {courses.map((course) => {
          const campus = demoCampuses.find((item) => item.id === course.campusId);
          const university = demoUniversities.find((item) => item.id === course.universityId);
          return (
            <article key={course.id} style={{ border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: "0 0 6px" }}>{course.name}</h2>
                  <div style={{ color: "#586174" }}>{university?.name} · {campus?.name} · {campus?.state}</div>
                </div>
                {campus?.regional && <span style={{ height: "fit-content", padding: "5px 9px", borderRadius: 999, background: "#ecfdf5", border: "1px solid #a7f3d0", fontWeight: 700 }}>Regional</span>}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 16 }}>
                <div><strong>Annual tuition</strong><br />{money(course.annualTuitionCents)}</div>
                <div><strong>Duration</strong><br />{course.durationYears} years</div>
                <div><strong>Scholarship</strong><br />{course.scholarshipPercent ?? 0}% demo</div>
                <div><strong>Job market</strong><br />{course.labourMarketScore}/100 demo</div>
                <div><strong>Migration alignment</strong><br />{course.migrationAlignmentScore}/100 demo</div>
              </div>

              <p style={{ marginBottom: 8 }}><strong>Career outcomes:</strong> {course.occupations.join(", ")}</p>
              <p style={{ color: "#586174", marginTop: 0 }}><strong>Skills:</strong> {course.skillTags.join(", ")}</p>

              <a href={`/local-v2/courses/${course.id}`} style={{ display: "inline-block", marginTop: 4, padding: "9px 12px", borderRadius: 10, background: "#111827", color: "white", textDecoration: "none", fontWeight: 700 }}>View course details</a>
            </article>
          );
        })}
      </section>
    </main>
  );
}
