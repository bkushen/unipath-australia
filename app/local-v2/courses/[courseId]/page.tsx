import Link from "next/link";
import { notFound } from "next/navigation";
import { demoCampuses, demoCourses, demoSuburbs, demoUniversities } from "@/lib/local-v2/fixtures";

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const course = demoCourses.find((item) => item.id === courseId);
  if (!course) notFound();

  const university = demoUniversities.find((item) => item.id === course.universityId);
  const campus = demoCampuses.find((item) => item.id === course.campusId);
  const suburb = campus ? demoSuburbs.find((item) => item.id === campus.suburbId) : undefined;

  const totalTuition = Math.round(course.annualTuitionCents * course.durationYears);
  const scholarshipSavings = Math.round(totalTuition * ((course.scholarshipPercent ?? 0) / 100));
  const estimatedTuitionAfterScholarship = totalTuition - scholarshipSavings;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/local-v2/courses">← Back to courses</Link>
        <div style={{ marginTop: 16 }}>
          <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>LOCAL DEMO COURSE</span>
          <h1 style={{ marginBottom: 8 }}>{course.name}</h1>
          <p style={{ color: "#586174", maxWidth: 780 }}>
            Full local-detail view for the selected course. All fee, labour-market and migration values on this page are demo data only.
          </p>
        </div>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {[
          ["University", university?.name ?? "Unknown"],
          ["Campus", campus?.name ?? "Unknown"],
          ["State", campus?.state ?? university?.state ?? "Unknown"],
          ["Regional", campus?.regional ? "Yes" : "No"],
          ["Qualification", course.qualificationLevel],
          ["Duration", `${course.durationYears} years`],
          ["Annual tuition", money(course.annualTuitionCents)],
          ["Scholarship", `${course.scholarshipPercent ?? 0}%`],
        ].map(([label, value]) => (
          <article key={label} style={{ border: "1px solid #dfe3ea", borderRadius: 14, padding: 16, background: "#fff" }}>
            <div style={{ fontSize: 13, color: "#667085", fontWeight: 750 }}>{label}</div>
            <div style={{ marginTop: 5, fontSize: 20, fontWeight: 800 }}>{value}</div>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 16, border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
        <h2 style={{ marginTop: 0 }}>Course overview</h2>
        <p><strong>Study field:</strong> {course.field}</p>
        <p><strong>Campus suburb:</strong> {suburb?.name ?? "Not available"}</p>
        <p><strong>Labour-market demo score:</strong> {course.labourMarketScore}/100</p>
        <p><strong>Migration-alignment demo score:</strong> {course.migrationAlignmentScore}/100</p>
      </section>

      <section style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        <article style={{ border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
          <h2 style={{ marginTop: 0 }}>Career outcomes</h2>
          <ul>{course.occupations.map((occupation) => <li key={occupation}>{occupation}</li>)}</ul>
        </article>
        <article style={{ border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
          <h2 style={{ marginTop: 0 }}>Skill focus</h2>
          <ul>{course.skillTags.map((skill) => <li key={skill}>{skill}</li>)}</ul>
        </article>
      </section>

      <section style={{ marginTop: 16, border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
        <h2 style={{ marginTop: 0 }}>Tuition summary</h2>
        <p><strong>Estimated total tuition:</strong> {money(totalTuition)}</p>
        <p><strong>Estimated scholarship saving:</strong> {money(scholarshipSavings)}</p>
        <p><strong>Estimated tuition after scholarship:</strong> {money(estimatedTuitionAfterScholarship)}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          <Link href={`/local-v2/course-finance?course=${encodeURIComponent(course.id)}`} style={{ padding: "10px 14px", borderRadius: 10, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 750 }}>Open finance view</Link>
          <Link href="/local-v2/compare" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #cfd5df", textDecoration: "none", fontWeight: 750 }}>Compare courses</Link>
        </div>
      </section>

      <section style={{ marginTop: 16, border: "1px solid #fed7aa", borderRadius: 16, padding: 18, background: "#fff7ed" }}>
        <strong>Demo notice:</strong> This page proves the course-detail structure only. Real provider fees, admissions, accreditation, career data and migration information will later come from verified, source-dated production data.
      </section>
    </main>
  );
}
