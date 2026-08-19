import { calculateCourseCost, formatAud } from "@/lib/local-v2/cost-engine";
import { demoSuburbs } from "@/lib/local-v2/fixtures";
import { rankCourses } from "@/lib/local-v2/recommendation-engine";
import { chooseRecommendedRoute, DemoRoutingProvider } from "@/lib/local-v2/routing-provider";
import type { StudentDecisionProfile } from "@/lib/local-v2/types";

const baseProfile: StudentDecisionProfile = {
  mode: "quick",
  highestQualification: "Bachelor",
  qualificationField: "Information Technology",
  desiredOccupation: "Software Engineer",
  annualTuitionBudgetCents: 4000000,
  totalFundsCents: 13000000,
  preferredStates: ["VIC", "SA"],
  regionalAccepted: true,
  migrationImportance: "none",
  skills: ["web", "software", "databases"],
  yearsExperience: 2,
  preferredSuburbId: "s-ballarat",
  transportPreference: "either",
};

const migrationProfile: StudentDecisionProfile = {
  ...baseProfile,
  migrationImportance: "high",
};

const sectionStyle = {
  border: "1px solid #d9dee7",
  borderRadius: 16,
  padding: 20,
  background: "#fff",
} as const;

export default async function LocalV2PreviewPage() {
  const initial = rankCourses(baseProfile);
  const migrationAware = rankCourses(migrationProfile);
  const initialBest = initial[0];
  const migrationBest = migrationAware[0];

  if (!initialBest || !migrationBest) {
    return <main style={{ padding: 32 }}>No demo recommendations are available.</main>;
  }

  const suburb = demoSuburbs.find((item) => item.id === initialBest.campus.suburbId);
  if (!suburb) throw new Error("Missing demo suburb fixture.");

  const cost = calculateCourseCost(initialBest.course, suburb, baseProfile.totalFundsCents);
  const routes = await new DemoRoutingProvider().getRoutes(suburb.id, initialBest.campus.id);
  const recommendedRoute = chooseRecommendedRoute(routes, baseProfile.transportPreference);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px 64px", background: "#f6f8fb" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 700 }}>
          LOCAL DEMO DATA ONLY
        </div>
        <h1 style={{ marginBottom: 8 }}>UniPath V2 Decision Engine Preview</h1>
        <p style={{ maxWidth: 780, color: "#4b5563" }}>
          This page proves the local-first architecture: profile input → explainable ranking → optional migration-aware re-ranking → affordability → commute. No values on this page are real Australian course, migration or labour-market facts.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
        <section style={sectionStyle}>
          <h2>Quick profile</h2>
          <p><strong>Qualification:</strong> {baseProfile.highestQualification} — {baseProfile.qualificationField}</p>
          <p><strong>Career goal:</strong> {baseProfile.desiredOccupation}</p>
          <p><strong>Tuition budget:</strong> {formatAud(baseProfile.annualTuitionBudgetCents)}/year</p>
          <p><strong>Total funds:</strong> {formatAud(baseProfile.totalFundsCents)}</p>
          <p><strong>Preferred states:</strong> {baseProfile.preferredStates.join(", ")}</p>
        </section>

        <section style={sectionStyle}>
          <h2>Initial best match</h2>
          <p><strong>{initialBest.course.name}</strong></p>
          <p>{initialBest.university.name}</p>
          <p>{initialBest.campus.name}</p>
          <p><strong>Overall score:</strong> {initialBest.scores.overall}%</p>
          <p><strong>Career:</strong> {initialBest.scores.career}% · <strong>Budget:</strong> {initialBest.scores.affordability}%</p>
          <p><strong>Labour market:</strong> {initialBest.scores.labourMarket}% · <strong>Migration:</strong> {initialBest.scores.migration}%</p>
        </section>

        <section style={sectionStyle}>
          <h2>Migration-aware best match</h2>
          <p><strong>{migrationBest.course.name}</strong></p>
          <p>{migrationBest.university.name}</p>
          <p>{migrationBest.campus.name}</p>
          <p><strong>Overall score:</strong> {migrationBest.scores.overall}%</p>
          <p><strong>Career:</strong> {migrationBest.scores.career}% · <strong>Budget:</strong> {migrationBest.scores.affordability}%</p>
          <p><strong>Labour market:</strong> {migrationBest.scores.labourMarket}% · <strong>Migration:</strong> {migrationBest.scores.migration}%</p>
          <p style={{ color: "#92400e" }}>Migration values are sample weighting data only and are not migration advice.</p>
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <section style={sectionStyle}>
          <h2>Money calculation</h2>
          <p><strong>Gross tuition:</strong> {formatAud(cost.grossTuitionCents)}</p>
          <p><strong>Scholarship estimate:</strong> −{formatAud(cost.scholarshipSavingsCents)}</p>
          <p><strong>Net tuition:</strong> {formatAud(cost.netTuitionCents)}</p>
          <p><strong>Living cost:</strong> {formatAud(cost.livingCostCents)}</p>
          <p><strong>Other/setup:</strong> {formatAud(cost.otherCostCents)}</p>
          <hr />
          <p><strong>Total estimated cost:</strong> {formatAud(cost.totalEstimatedCostCents)}</p>
          <p><strong>Money remaining:</strong> {formatAud(cost.remainingFundsCents)}</p>
          <p><strong>Budget consumed:</strong> {cost.budgetConsumedPercent}%</p>
          <small>Assumption: annual tuition increases {cost.assumptions.annualFeeIncreaseBps / 100}% in this demo calculation.</small>
        </section>

        <section style={sectionStyle}>
          <h2>Commute preview</h2>
          <p><strong>Living area:</strong> {suburb.name}</p>
          <p><strong>Campus:</strong> {initialBest.campus.name}</p>
          {routes.length === 0 ? (
            <p>No mock route fixture exists for this combination yet.</p>
          ) : (
            <>
              {routes.map((route) => (
                <div key={route.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #eef0f3" }}>
                  <strong>{route.mode === "driving" ? "Driving" : "Public transport"}</strong>
                  <div>{route.durationMinutes} min · {route.distanceKm} km · {route.transfers} transfer(s)</div>
                  <small>{route.summary}</small>
                </div>
              ))}
              {recommendedRoute && <p><strong>Recommended route:</strong> {recommendedRoute.summary} ({recommendedRoute.durationMinutes} min)</p>}
            </>
          )}
        </section>
      </div>

      <section style={{ ...sectionStyle, marginTop: 16 }}>
        <h2>Why the first result ranked highly</h2>
        <ul>
          {initialBest.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
        <h3>Cautions</h3>
        <ul>
          {initialBest.cautions.map((caution) => <li key={caution}>{caution}</li>)}
        </ul>
      </section>
    </main>
  );
}
