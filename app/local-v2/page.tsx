import Link from "next/link";

const groups = [
  {
    title: "Start & Recommendations",
    description: "Core decision journeys for testing how a student moves from profile input to recommendations.",
    items: [
      { href: "/local-v2/quick-match", title: "Quick Match", text: "Basic profile input, quick recommendations and optional migration-aware comparison." },
      { href: "/local-v2/detailed", title: "Detailed Assessment", text: "Expanded student, career, study, finance and location inputs." },
      { href: "/local-v2/cv-review", title: "CV / Profile Review", text: "Review a demo extracted profile and generate recommendations." },
      { href: "/local-v2/state-career", title: "State + Career Recommendation", text: "Compare best-fit career direction and state using demo scoring." },
      { href: "/local-v2/journey", title: "Connected Journey", text: "Profile → recommendation → course → finance → commute → save." },
    ],
  },
  {
    title: "Browse & Research",
    description: "Explore the demo catalogue by course, university, career, migration pathway, scholarship and suburb.",
    items: [
      { href: "/local-v2/courses", title: "Courses", text: "Search and filter the local demo course catalogue." },
      { href: "/local-v2/universities", title: "Universities", text: "Browse universities, campuses and available demo courses." },
      { href: "/local-v2/careers", title: "Careers", text: "Browse career outcomes and their connected study options." },
      { href: "/local-v2/migration", title: "Migration Pathways", text: "Demo pathway explorer with clear non-advice disclaimers." },
      { href: "/local-v2/scholarships", title: "Scholarships", text: "Filter courses by scholarship percentage and location." },
      { href: "/local-v2/suburbs", title: "Suburbs & Living Costs", text: "Browse demo living costs and campus connections." },
    ],
  },
  {
    title: "Money, Travel & Decisions",
    description: "Use the supporting decision tools after a course or location has been shortlisted.",
    items: [
      { href: "/local-v2/finance", title: "Finance", text: "Before-visa spend, show-money planning and actual cost to reach Australia." },
      { href: "/local-v2/course-finance", title: "Course → Finance", text: "See how changing the selected course changes the financial result." },
      { href: "/local-v2/commute", title: "Commute", text: "Compare demo driving and public-transport routes." },
      { href: "/local-v2/compare", title: "Compare Courses", text: "Compare three courses across tuition, state, career and migration metrics." },
      { href: "/local-v2/dashboard", title: "Saved Recommendations", text: "Save demo recommendations locally in the browser." },
    ],
  },
];

export default function LocalV2HubPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f6f8fb", padding: "36px 18px 72px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <header style={{ marginBottom: 28 }}>
          <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 800 }}>
            LOCAL V2 · DEMO DATA ONLY
          </span>
          <h1 style={{ marginBottom: 10, fontSize: 38 }}>UniPath Australia — Local Development Hub</h1>
          <p style={{ maxWidth: 850, color: "#586174", fontSize: 17, lineHeight: 1.6 }}>
            One place to open every basic UniPath V2 function currently available in local development. These pages prove the product flow and engineering structure before real provider, job-market, migration, routing, currency and living-cost data are connected.
          </p>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 28 }}>
          {[
            ["Basic modules", "16"],
            ["Demo courses", "6"],
            ["Demo universities", "5"],
            ["Current stage", "Local validation"],
          ].map(([label, value]) => (
            <article key={label} style={{ background: "#fff", border: "1px solid #dfe3ea", borderRadius: 16, padding: 18 }}>
              <div style={{ color: "#667085", fontSize: 13, fontWeight: 800 }}>{label}</div>
              <div style={{ marginTop: 5, fontSize: 24, fontWeight: 850 }}>{value}</div>
            </article>
          ))}
        </section>

        <section style={{ marginBottom: 28, padding: 20, background: "#eef6ff", border: "1px solid #bfdbfe", borderRadius: 18 }}>
          <h2 style={{ marginTop: 0 }}>Recommended test flow</h2>
          <p style={{ marginBottom: 14, color: "#475467" }}>
            For the clearest end-to-end test, start with Quick Match or the Connected Journey. Use the browse tools when you want to inspect individual entities.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Link href="/local-v2/quick-match" style={{ padding: "11px 15px", borderRadius: 10, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 800 }}>
              Start Quick Match
            </Link>
            <Link href="/local-v2/journey" style={{ padding: "11px 15px", borderRadius: 10, background: "#fff", border: "1px solid #cbd5e1", textDecoration: "none", fontWeight: 800 }}>
              Open Connected Journey
            </Link>
          </div>
        </section>

        {groups.map((group) => (
          <section key={group.title} style={{ marginBottom: 30 }}>
            <h2 style={{ marginBottom: 6 }}>{group.title}</h2>
            <p style={{ marginTop: 0, color: "#667085" }}>{group.description}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 14 }}>
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} style={{ display: "block", padding: 18, background: "#fff", border: "1px solid #dfe3ea", borderRadius: 16, textDecoration: "none", color: "inherit" }}>
                  <div style={{ fontSize: 19, fontWeight: 850, marginBottom: 7 }}>{item.title}</div>
                  <div style={{ color: "#667085", lineHeight: 1.5 }}>{item.text}</div>
                  <div style={{ marginTop: 12, fontWeight: 800 }}>Open →</div>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section style={{ padding: 20, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 18 }}>
          <strong>Local-development notice:</strong> Course fees, scholarship values, labour-market scores, migration-alignment scores, living costs and route data are illustrative demo values. Production UniPath must replace them with verified, source-dated data and must never present migration outcomes as guaranteed.
        </section>
      </div>
    </main>
  );
}
