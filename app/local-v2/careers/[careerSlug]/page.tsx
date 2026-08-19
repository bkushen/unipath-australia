import Link from "next/link";
import { notFound } from "next/navigation";
import { demoCampuses, demoCourses, demoUniversities } from "@/lib/local-v2/fixtures";

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function CareerDetailPage({ params }: { params: Promise<{ careerSlug: string }> }) {
  const { careerSlug } = await params;
  const matchingCourses = demoCourses.filter((course) => course.occupations.some((occupation) => slugify(occupation) === careerSlug));
  if (matchingCourses.length === 0) notFound();

  const careerName = matchingCourses.flatMap((course) => course.occupations).find((occupation) => slugify(occupation) === careerSlug) ?? careerSlug;
  const avgJob = Math.round(matchingCourses.reduce((sum, course) => sum + course.labourMarketScore, 0) / matchingCourses.length);
  const avgMigration = Math.round(matchingCourses.reduce((sum, course) => sum + course.migrationAlignmentScore, 0) / matchingCourses.length);
  const avgTuition = Math.round(matchingCourses.reduce((sum, course) => sum + course.annualTuitionCents, 0) / matchingCourses.length);
  const skills = Array.from(new Set(matchingCourses.flatMap((course) => course.skillTags))).sort();
  const states = Array.from(new Set(matchingCourses.map((course) => demoCampuses.find((campus) => campus.id === course.campusId)?.state).filter(Boolean)));

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <Link href="/local-v2/careers">← Back to careers</Link>
      <div style={{ marginTop: 16, marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>LOCAL DEMO CAREER</span>
        <h1 style={{ marginBottom: 8 }}>{careerName}</h1>
        <p style={{ color: "#586174", maxWidth: 760 }}>
          Basic career-detail structure connecting profession, study options, states, job-market indicators and migration-alignment indicators.
        </p>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
        {[
          ["Linked courses", matchingCourses.length],
          ["Average annual tuition", money(avgTuition)],
          ["Job-market demo score", `${avgJob}/100`],
          ["Migration-alignment demo score", `${avgMigration}/100`],
        ].map(([label, value]) => (
          <article key={label} style={{ border: "1px solid #dfe3ea", borderRadius: 14, padding: 16, background: "#fff" }}>
            <div style={{ fontSize: 13, color: "#667085", fontWeight: 750 }}>{label}</div>
            <div style={{ marginTop: 5, fontSize: 20, fontWeight: 800 }}>{value}</div>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        <article style={{ border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
          <h2 style={{ marginTop: 0 }}>Skill themes</h2>
          <ul>{skills.map((skill) => <li key={skill}>{skill}</li>)}</ul>
        </article>
        <article style={{ border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
          <h2 style={{ marginTop: 0 }}>Available demo states</h2>
          <ul>{states.map((state) => <li key={state}>{state}</li>)}</ul>
        </article>
      </section>

      <section style={{ marginTop: 16, border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
        <h2 style={{ marginTop: 0 }}>Courses connected to this career</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {matchingCourses.map((course) => {
            const university = demoUniversities.find((item) => item.id === course.universityId);
            const campus = demoCampuses.find((item) => item.id === course.campusId);
            return (
              <article key={course.id} style={{ border: "1px solid #e2e6ed", borderRadius: 12, padding: 14, background: "#fbfcfe" }}>
                <strong>{course.name}</strong>
                <div style={{ color: "#586174", marginTop: 4 }}>{university?.name ?? "Unknown university"} · {campus?.state ?? "Unknown state"}</div>
                <div style={{ marginTop: 6 }}>{money(course.annualTuitionCents)}/year · Job {course.labourMarketScore}/100 · Migration {course.migrationAlignmentScore}/100</div>
                <Link href={`/local-v2/courses/${course.id}`} style={{ display: "inline-block", marginTop: 9 }}>View course →</Link>
              </article>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: 16, border: "1px solid #fed7aa", borderRadius: 16, padding: 18, background: "#fff7ed" }}>
        <strong>Demo notice:</strong> These occupation, labour-market and migration-alignment values are illustrative local-development data. Production career pages will use verified, source-dated occupation and labour-market information and will not imply guaranteed migration outcomes.
      </section>
    </main>
  );
}
