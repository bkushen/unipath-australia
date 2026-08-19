import Link from "next/link";
import { demoCourses } from "@/lib/local-v2/fixtures";

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const careers = Array.from(
  new Map(
    demoCourses.flatMap((course) =>
      course.occupations.map((occupation) => [occupation, {
        name: occupation,
        slug: slugify(occupation),
        courses: demoCourses.filter((item) => item.occupations.includes(occupation)),
      }] as const),
    ),
  ).values(),
).sort((a, b) => a.name.localeCompare(b.name));

export default function CareersPage() {
  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>LOCAL DEMO CAREERS</span>
        <h1 style={{ marginBottom: 8 }}>Career Explorer</h1>
        <p style={{ color: "#586174", maxWidth: 760 }}>
          Explore career directions connected to the current UniPath demo courses. Job-market and migration values remain illustrative only.
        </p>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {careers.map((career) => {
          const avgJob = Math.round(career.courses.reduce((sum, course) => sum + course.labourMarketScore, 0) / career.courses.length);
          const avgMigration = Math.round(career.courses.reduce((sum, course) => sum + course.migrationAlignmentScore, 0) / career.courses.length);
          return (
            <article key={career.name} style={{ border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
              <h2 style={{ marginTop: 0, fontSize: 21 }}>{career.name}</h2>
              <p><strong>Linked courses:</strong> {career.courses.length}</p>
              <p><strong>Average job-market demo score:</strong> {avgJob}/100</p>
              <p><strong>Average migration-alignment demo score:</strong> {avgMigration}/100</p>
              <Link href={`/local-v2/careers/${career.slug}`} style={{ display: "inline-block", marginTop: 8, padding: "10px 14px", borderRadius: 10, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 750 }}>
                View career details
              </Link>
            </article>
          );
        })}
      </section>
    </main>
  );
}
