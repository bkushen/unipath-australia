import Link from "next/link";
import { notFound } from "next/navigation";
import { demoCampuses, demoCourses, demoSuburbs, demoUniversities } from "@/lib/local-v2/fixtures";

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function SuburbDetailPage({ params }: { params: Promise<{ suburbId: string }> }) {
  const { suburbId } = await params;
  const suburb = demoSuburbs.find((item) => item.id === suburbId);
  if (!suburb) notFound();

  const campus = demoCampuses.find((item) => item.suburbId === suburb.id);
  const university = campus ? demoUniversities.find((item) => item.id === campus.universityId) : undefined;
  const courses = campus ? demoCourses.filter((item) => item.campusId === campus.id) : [];
  const weeklyTotal = suburb.weeklyRentCents + suburb.weeklyGroceriesCents + suburb.weeklyUtilitiesCents + suburb.weeklyPersonalCents;
  const monthlyApprox = Math.round((weeklyTotal * 52) / 12);
  const annualTotal = weeklyTotal * 52;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <Link href="/local-v2/suburbs">← Back to suburbs</Link>
      <div style={{ marginTop: 16, marginBottom: 20 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>LOCAL DEMO SUBURB</span>
        <h1 style={{ marginBottom: 8 }}>{suburb.name}</h1>
        <p style={{ color: "#586174" }}>Basic local living-cost view connected to campus, university, courses and commute tools.</p>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
        {[
          ["State", suburb.state],
          ["Weekly total", money(weeklyTotal)],
          ["Monthly approx.", money(monthlyApprox)],
          ["Annual living cost", money(annualTotal)],
          ["Linked campus", campus?.name ?? "None"],
          ["University", university?.name ?? "None"],
        ].map(([label, value]) => (
          <article key={label} style={{ border: "1px solid #dfe3ea", borderRadius: 14, padding: 16, background: "#fff" }}>
            <div style={{ fontSize: 13, color: "#667085", fontWeight: 750 }}>{label}</div>
            <div style={{ marginTop: 5, fontSize: 19, fontWeight: 800 }}>{value}</div>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 16, border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
        <h2 style={{ marginTop: 0 }}>Weekly cost breakdown</h2>
        <p><strong>Rent:</strong> {money(suburb.weeklyRentCents)}</p>
        <p><strong>Groceries:</strong> {money(suburb.weeklyGroceriesCents)}</p>
        <p><strong>Utilities:</strong> {money(suburb.weeklyUtilitiesCents)}</p>
        <p><strong>Personal spending:</strong> {money(suburb.weeklyPersonalCents)}</p>
      </section>

      <section style={{ marginTop: 16, border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
        <h2 style={{ marginTop: 0 }}>Study options near this suburb</h2>
        {courses.length === 0 ? <p>No demo courses are linked to this suburb yet.</p> : (
          <div style={{ display: "grid", gap: 10 }}>
            {courses.map((course) => (
              <Link key={course.id} href={`/local-v2/courses/${course.id}`} style={{ padding: 12, borderRadius: 10, border: "1px solid #dfe3ea", textDecoration: "none" }}>
                <strong>{course.name}</strong><br />{money(course.annualTuitionCents)} per year
              </Link>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/local-v2/commute" style={{ padding: "10px 14px", borderRadius: 10, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 750 }}>Open commute calculator</Link>
        <Link href="/local-v2/finance" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #cfd5df", textDecoration: "none", fontWeight: 750 }}>Open finance calculator</Link>
      </section>

      <section style={{ marginTop: 16, border: "1px solid #fed7aa", borderRadius: 16, padding: 18, background: "#fff7ed" }}>
        <strong>Demo notice:</strong> These living costs are illustrative only. Production values will use source-dated external data and user-selectable accommodation assumptions.
      </section>
    </main>
  );
}
