import Link from "next/link";
import { notFound } from "next/navigation";
import { demoCampuses, demoCourses, demoSuburbs, demoUniversities } from "@/lib/local-v2/fixtures";

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function UniversityDetailPage({ params }: { params: Promise<{ universityId: string }> }) {
  const { universityId } = await params;
  const university = demoUniversities.find((item) => item.id === universityId);
  if (!university) notFound();

  const campuses = demoCampuses.filter((campus) => campus.universityId === university.id);
  const courses = demoCourses.filter((course) => course.universityId === university.id);
  const avgTuition = courses.length ? Math.round(courses.reduce((sum, course) => sum + course.annualTuitionCents, 0) / courses.length) : 0;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <Link href="/local-v2/universities">← Back to universities</Link>
      <div style={{ marginTop: 16, marginBottom: 20 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>LOCAL DEMO UNIVERSITY</span>
        <h1 style={{ marginBottom: 8 }}>{university.name}</h1>
        <p style={{ color: "#586174" }}>Basic university-detail structure using local demo fixtures only.</p>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {[
          ["State", university.state],
          ["Demo reputation score", `${university.reputationScore}/100`],
          ["Campuses", String(campuses.length)],
          ["Courses", String(courses.length)],
          ["Average annual tuition", courses.length ? money(avgTuition) : "No demo courses"],
        ].map(([label, value]) => (
          <article key={label} style={{ border: "1px solid #dfe3ea", borderRadius: 14, padding: 16, background: "#fff" }}>
            <div style={{ fontSize: 13, color: "#667085", fontWeight: 750 }}>{label}</div>
            <div style={{ marginTop: 5, fontSize: 20, fontWeight: 800 }}>{value}</div>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 16, border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
        <h2 style={{ marginTop: 0 }}>Campuses</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {campuses.map((campus) => {
            const suburb = demoSuburbs.find((item) => item.id === campus.suburbId);
            return (
              <article key={campus.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
                <strong>{campus.name}</strong>
                <div style={{ marginTop: 6 }}>{suburb?.name ?? "Unknown suburb"} · {campus.state} · {campus.regional ? "Regional" : "Metro/non-regional demo"}</div>
              </article>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: 16, border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
        <h2 style={{ marginTop: 0 }}>Courses at this university</h2>
        {courses.length === 0 ? <p>No demo courses yet.</p> : (
          <div style={{ display: "grid", gap: 12 }}>
            {courses.map((course) => (
              <article key={course.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
                <strong>{course.name}</strong>
                <div style={{ marginTop: 6 }}>{money(course.annualTuitionCents)} per year · {course.durationYears} years</div>
                <div style={{ marginTop: 8 }}><Link href={`/local-v2/courses/${course.id}`}>View course details →</Link></div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 16, border: "1px solid #fed7aa", borderRadius: 16, padding: 18, background: "#fff7ed" }}>
        <strong>Demo notice:</strong> Real rankings, campus data, fees, accreditation, intakes and provider information will later come from verified source-dated production data.
      </section>
    </main>
  );
}
