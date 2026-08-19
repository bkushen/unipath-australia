"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { demoCampuses, demoCourses, demoUniversities } from "@/lib/local-v2/fixtures";

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const panelStyle = {
  border: "1px solid #dfe3ea",
  borderRadius: 16,
  padding: 18,
  background: "#fff",
} as const;

const inputStyle = {
  width: "100%",
  border: "1px solid #cfd5df",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
} as const;

export default function ScholarshipsPage() {
  const [state, setState] = useState("ALL");
  const [minimumPercent, setMinimumPercent] = useState(1);
  const [regionalOnly, setRegionalOnly] = useState(false);

  const results = useMemo(() => {
    return demoCourses
      .map((course) => {
        const university = demoUniversities.find((item) => item.id === course.universityId);
        const campus = demoCampuses.find((item) => item.id === course.campusId);
        const percent = course.scholarshipPercent ?? 0;
        const annualSavingCents = Math.round(course.annualTuitionCents * (percent / 100));
        const totalSavingCents = Math.round(annualSavingCents * course.durationYears);
        const annualAfterScholarshipCents = course.annualTuitionCents - annualSavingCents;

        return {
          course,
          university,
          campus,
          percent,
          annualSavingCents,
          totalSavingCents,
          annualAfterScholarshipCents,
        };
      })
      .filter((item) => item.percent >= minimumPercent)
      .filter((item) => state === "ALL" || item.campus?.state === state)
      .filter((item) => !regionalOnly || item.campus?.regional)
      .sort((a, b) => b.percent - a.percent || b.totalSavingCents - a.totalSavingCents);
  }, [state, minimumPercent, regionalOnly]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>
          LOCAL DEMO SCHOLARSHIPS
        </span>
        <h1 style={{ marginBottom: 8 }}>Scholarship Explorer</h1>
        <p style={{ color: "#586174", maxWidth: 800 }}>
          Filter course-level scholarship examples and compare estimated tuition savings. These scholarship values are local demo data only.
        </p>
      </div>

      <section style={panelStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <label style={{ display: "grid", gap: 7, fontWeight: 650 }}>
            State
            <select value={state} onChange={(e) => setState(e.target.value)} style={inputStyle}>
              <option value="ALL">All states</option>
              <option value="VIC">Victoria</option>
              <option value="NSW">New South Wales</option>
              <option value="QLD">Queensland</option>
              <option value="SA">South Australia</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 7, fontWeight: 650 }}>
            Minimum scholarship
            <select value={minimumPercent} onChange={(e) => setMinimumPercent(Number(e.target.value))} style={inputStyle}>
              <option value={1}>Any scholarship</option>
              <option value={5}>5% or more</option>
              <option value={8}>8% or more</option>
              <option value={10}>10% or more</option>
              <option value={12}>12% or more</option>
            </select>
          </label>

          <label style={{ display: "flex", gap: 9, alignItems: "center", alignSelf: "end", paddingBottom: 10, fontWeight: 650 }}>
            <input type="checkbox" checked={regionalOnly} onChange={(e) => setRegionalOnly(e.target.checked)} />
            Regional campuses only
          </label>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ marginBottom: 8 }}>Scholarship matches</h2>
          <strong>{results.length} result{results.length === 1 ? "" : "s"}</strong>
        </div>

        {results.length === 0 ? (
          <div style={{ ...panelStyle, marginTop: 8, background: "#fff7ed", borderColor: "#fed7aa" }}>
            No demo scholarship matches these filters. Try lowering the minimum percentage or turning off regional-only.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14, marginTop: 8 }}>
            {results.map((item) => (
              <article key={item.course.id} style={panelStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 750, color: "#667085", textTransform: "uppercase" }}>
                      {item.university?.name ?? "Unknown university"}
                    </div>
                    <h3 style={{ margin: "6px 0 5px" }}>{item.course.name}</h3>
                    <div style={{ color: "#586174" }}>
                      {item.campus?.name ?? "Unknown campus"} · {item.campus?.state ?? "Unknown state"} · {item.campus?.regional ? "Regional" : "Metro"}
                    </div>
                  </div>

                  <div style={{ minWidth: 170, padding: 14, borderRadius: 14, background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
                    <div style={{ fontSize: 13, fontWeight: 750, color: "#166534" }}>DEMO SCHOLARSHIP</div>
                    <div style={{ fontSize: 30, fontWeight: 850, marginTop: 4 }}>{item.percent}%</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 16 }}>
                  {[
                    ["Annual tuition", money(item.course.annualTuitionCents)],
                    ["Annual saving", money(item.annualSavingCents)],
                    ["Annual after scholarship", money(item.annualAfterScholarshipCents)],
                    ["Estimated total saving", money(item.totalSavingCents)],
                  ].map(([label, value]) => (
                    <div key={label} style={{ border: "1px solid #e2e6ed", borderRadius: 12, padding: 13, background: "#fbfcfe" }}>
                      <div style={{ fontSize: 12, fontWeight: 750, color: "#667085" }}>{label}</div>
                      <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800 }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                  <Link href={`/local-v2/courses/${item.course.id}`} style={{ padding: "10px 14px", borderRadius: 10, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 750 }}>
                    View course details
                  </Link>
                  <Link href={`/local-v2/course-finance?course=${encodeURIComponent(item.course.id)}`} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #cfd5df", textDecoration: "none", fontWeight: 750 }}>
                    Check finance impact
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={{ ...panelStyle, marginTop: 16, background: "#fff7ed", borderColor: "#fed7aa" }}>
        <strong>Demo notice:</strong> Scholarship percentages and savings on this page are examples only. Production UniPath will store verified scholarship names, eligibility rules, deadlines, provider sources, effective dates and last-verified timestamps.
      </section>
    </main>
  );
}
