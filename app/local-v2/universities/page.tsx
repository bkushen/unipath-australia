import Link from "next/link";
import { demoCampuses, demoCourses, demoUniversities } from "@/lib/local-v2/fixtures";

export default function UniversitiesPage() {
  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>LOCAL DEMO UNIVERSITIES</span>
        <h1 style={{ marginBottom: 8 }}>Universities</h1>
        <p style={{ color: "#586174", maxWidth: 760 }}>Browse the current UniPath local demo university catalogue. Reputation scores and all linked course data are illustrative only.</p>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {demoUniversities.map((university) => {
          const campuses = demoCampuses.filter((campus) => campus.universityId === university.id);
          const courses = demoCourses.filter((course) => course.universityId === university.id);
          const regionalCampuses = campuses.filter((campus) => campus.regional).length;
          return (
            <article key={university.id} style={{ border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#667085" }}>{university.state}</div>
              <h2 style={{ marginBottom: 10 }}>{university.name}</h2>
              <p><strong>Demo reputation score:</strong> {university.reputationScore}/100</p>
              <p><strong>Campuses:</strong> {campuses.length}</p>
              <p><strong>Regional campuses:</strong> {regionalCampuses}</p>
              <p><strong>Demo courses:</strong> {courses.length}</p>
              <Link href={`/local-v2/universities/${university.id}`} style={{ display: "inline-block", marginTop: 10, padding: "10px 14px", borderRadius: 10, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 750 }}>View university details</Link>
            </article>
          );
        })}
      </section>
    </main>
  );
}
