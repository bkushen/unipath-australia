"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Scholarship = {
  id: string;
  name: string;
  amount: number | null;
  percentage: number | null;
  eligibility: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
  university: { id: string; name: string; website: string | null; logoUrl: string | null } | null;
  linkedCourses: Array<{ id: string; name: string; qualificationLevel: string | null; annualFee: number | null; currency: string }>;
};

const money = (value: number | null, currency = "AUD") => value == null ? "Value not loaded" : new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

export default function ScholarshipsPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [minimumPercent, setMinimumPercent] = useState(0);
  const [linkedOnly, setLinkedOnly] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (debouncedQuery) params.set("q", debouncedQuery);
        const response = await fetch(`/api/local-v2/scholarships?${params.toString()}`, { signal: controller.signal });
        const data = await response.json() as { scholarships?: Scholarship[]; error?: string; detail?: string };
        if (!response.ok) throw new Error(data.detail || data.error || "Unable to load scholarships.");
        setScholarships(data.scholarships ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [debouncedQuery]);

  const results = useMemo(() => scholarships
    .filter((item) => minimumPercent === 0 || (item.percentage ?? 0) >= minimumPercent)
    .filter((item) => !linkedOnly || item.linkedCourses.length > 0)
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0) || (b.amount ?? 0) - (a.amount ?? 0)), [scholarships, minimumPercent, linkedOnly]);

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fa", color: "#101828" }}>
      <section style={{ background: "#0057b8", color: "#fff", padding: "42px 20px 32px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 850, letterSpacing: .8 }}>UNIPATH AUSTRALIA · LIVE SCHOLARSHIP DATABASE</div>
          <h1 style={{ fontSize: 42, margin: "10px 0" }}>Scholarship Explorer</h1>
          <p style={{ maxWidth: 800, color: "#e8f0fb", lineHeight: 1.55 }}>Browse verified scholarship records, eligibility, provider sources and linked courses.</p>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search scholarship name" style={{ width: "min(760px,100%)", padding: "13px 14px", borderRadius: 12, border: 0, marginTop: 12, fontSize: 16 }} />
        </div>
      </section>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 20px 70px" }}>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, padding: 18, background: "#fff", border: "1px solid #e4e7ec", borderRadius: 16 }}>
          <label style={{ display: "grid", gap: 7, fontWeight: 750 }}>Minimum percentage
            <select value={minimumPercent} onChange={(e) => setMinimumPercent(Number(e.target.value))} style={{ padding: 10, border: "1px solid #d0d5dd", borderRadius: 9 }}>
              <option value={0}>Any value</option><option value={10}>10%+</option><option value={20}>20%+</option><option value={25}>25%+</option><option value={50}>50%+</option>
            </select>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}><input type="checkbox" checked={linkedOnly} onChange={(e) => setLinkedOnly(e.target.checked)} /> Only scholarships linked to courses</label>
        </section>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "22px 0 14px" }}>
          <div><strong style={{ fontSize: 22 }}>{loading ? "Loading scholarships…" : `${results.length} scholarship${results.length === 1 ? "" : "s"}`}</strong><div style={{ color: "#667085" }}>Live Supabase records only</div></div>
          <Link href="/local-v2/courses">Browse all courses →</Link>
        </div>

        {error && <div style={{ padding: 14, borderRadius: 12, background: "#fff6f5", color: "#b42318" }}>{error}</div>}

        {!loading && !error && results.length === 0 ? (
          <section style={{ background: "#fff", border: "1px solid #e4e7ec", borderRadius: 16, padding: 28 }}>
            <h2 style={{ marginTop: 0 }}>No verified scholarship records are loaded yet</h2>
            <p style={{ color: "#667085", lineHeight: 1.55 }}>The scholarship tables are connected, but the live database currently contains no scholarship rows. UniPath will show scholarships here only after their names, values, eligibility and official sources have been verified and stored.</p>
            <p style={{ color: "#667085" }}>Demo scholarship percentages are no longer shown as if they were real.</p>
          </section>
        ) : (
          <section style={{ display: "grid", gap: 16 }}>
            {results.map((item) => (
              <article key={item.id} style={{ background: "#fff", border: "1px solid #e4e7ec", borderRadius: 17, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div><div style={{ color: "#0057b8", fontWeight: 850 }}>{item.university?.name ?? "University not linked"}</div><h2 style={{ margin: "5px 0" }}>{item.name}</h2>{item.eligibility && <p style={{ color: "#667085" }}>{item.eligibility}</p>}</div>
                  <div style={{ minWidth: 150, padding: 14, borderRadius: 13, background: "#ecfdf3", color: "#027a48" }}>{item.percentage != null ? <strong style={{ fontSize: 28 }}>{item.percentage}%</strong> : <strong>{money(item.amount)}</strong>}</div>
                </div>
                <p><strong>Linked courses:</strong> {item.linkedCourses.length}</p>
                {item.linkedCourses.slice(0, 8).map((course) => <div key={course.id} style={{ padding: 10, borderTop: "1px solid #eef1f4" }}><strong>{course.name}</strong> · {money(course.annualFee, course.currency)}/year · <Link href={`/local-v2/courses/${course.id}`}>View course</Link></div>)}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Official scholarship source ↗</a>}{item.university && <Link href={`/local-v2/universities/${item.university.id}`}>University profile</Link>}</div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
