"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { demoCourses, demoCampuses } from "@/lib/local-v2/fixtures";

const panel = {
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

const demoPathways = [
  {
    id: "skilled-independent-demo",
    name: "Skilled Independent pathway (Demo)",
    type: "Points-tested skilled migration",
    states: ["VIC", "NSW", "QLD", "SA"],
    regionalPreferred: false,
    summary: "Illustrative pathway card showing how UniPath can connect an occupation, skills assessment and points-based migration planning.",
  },
  {
    id: "state-nominated-demo",
    name: "State Nominated pathway (Demo)",
    type: "State or territory nomination",
    states: ["VIC", "NSW", "QLD", "SA"],
    regionalPreferred: false,
    summary: "Illustrative pathway card for state nomination. Production data must be verified against current state criteria and occupation requirements.",
  },
  {
    id: "regional-demo",
    name: "Regional skilled pathway (Demo)",
    type: "Regional nomination / sponsorship",
    states: ["VIC", "SA"],
    regionalPreferred: true,
    summary: "Illustrative pathway card showing how regional study and location preferences could affect recommendation ranking.",
  },
  {
    id: "employer-demo",
    name: "Employer Sponsored pathway (Demo)",
    type: "Employer sponsorship",
    states: ["VIC", "NSW", "QLD", "SA"],
    regionalPreferred: false,
    summary: "Illustrative employer-sponsored option. Real eligibility depends on occupation, employer, experience and current visa rules.",
  },
];

export default function MigrationExplorerPage() {
  const occupations = useMemo(
    () => [...new Set(demoCourses.flatMap((course) => course.occupations))].sort(),
    [],
  );

  const [occupation, setOccupation] = useState(occupations[0] ?? "Software Engineer");
  const [state, setState] = useState("ANY");
  const [regional, setRegional] = useState(false);

  const linkedCourses = useMemo(
    () => demoCourses.filter((course) => course.occupations.includes(occupation)),
    [occupation],
  );

  const pathways = useMemo(
    () => demoPathways.filter((pathway) => {
      if (state !== "ANY" && !pathway.states.includes(state)) return false;
      if (regional && !pathway.regionalPreferred) return false;
      return true;
    }),
    [state, regional],
  );

  const avgAlignment = linkedCourses.length
    ? Math.round(linkedCourses.reduce((sum, course) => sum + course.migrationAlignmentScore, 0) / linkedCourses.length)
    : 0;

  return (
    <main style={{ maxWidth: 1050, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>
          LOCAL DEMO MIGRATION DATA
        </span>
        <h1 style={{ marginBottom: 8 }}>Migration Pathway Explorer</h1>
        <p style={{ color: "#586174", maxWidth: 820 }}>
          Explore how a selected occupation, state and regional preference could connect to migration-aware planning. This page uses demo logic only and does not determine visa eligibility or guarantee permanent residency.
        </p>
      </div>

      <section style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <label style={{ display: "grid", gap: 7, fontWeight: 650 }}>
            Occupation
            <select value={occupation} onChange={(e) => setOccupation(e.target.value)} style={inputStyle}>
              {occupations.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>

          <label style={{ display: "grid", gap: 7, fontWeight: 650 }}>
            Preferred state
            <select value={state} onChange={(e) => setState(e.target.value)} style={inputStyle}>
              <option value="ANY">Anywhere</option>
              <option value="VIC">Victoria</option>
              <option value="NSW">New South Wales</option>
              <option value="QLD">Queensland</option>
              <option value="SA">South Australia</option>
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 650, marginTop: 28 }}>
            <input type="checkbox" checked={regional} onChange={(e) => setRegional(e.target.checked)} />
            Regional pathways only
          </label>
        </div>
      </section>

      <section style={{ ...panel, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Occupation summary</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <div><strong>Occupation</strong><div>{occupation}</div></div>
          <div><strong>Linked demo courses</strong><div>{linkedCourses.length}</div></div>
          <div><strong>Average migration-alignment demo score</strong><div>{avgAlignment}/100</div></div>
        </div>
      </section>

      <section style={{ marginTop: 16, display: "grid", gap: 14 }}>
        {pathways.length === 0 ? (
          <div style={{ ...panel, background: "#fff7ed", borderColor: "#fed7aa" }}>
            No demo pathway card matches these filters. Change the state or regional preference.
          </div>
        ) : pathways.map((pathway) => (
          <article key={pathway.id} style={panel}>
            <div style={{ fontSize: 13, textTransform: "uppercase", color: "#667085", fontWeight: 750 }}>{pathway.type}</div>
            <h2 style={{ margin: "6px 0 8px" }}>{pathway.name}</h2>
            <p style={{ color: "#4b5563" }}>{pathway.summary}</p>
            <p><strong>Demo states:</strong> {pathway.states.join(", ")}</p>
            <p><strong>Regional focus:</strong> {pathway.regionalPreferred ? "Yes" : "No"}</p>
          </article>
        ))}
      </section>

      <section style={{ ...panel, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Courses connected to {occupation}</h2>
        {linkedCourses.length === 0 ? <p>No demo courses currently link to this occupation.</p> : (
          <div style={{ display: "grid", gap: 10 }}>
            {linkedCourses.map((course) => {
              const campus = demoCampuses.find((item) => item.id === course.campusId);
              return (
                <div key={course.id} style={{ border: "1px solid #e2e6ed", borderRadius: 12, padding: 14, background: "#fbfcfe" }}>
                  <strong>{course.name}</strong>
                  <div style={{ color: "#586174", marginTop: 4 }}>
                    {campus?.state ?? "Unknown state"} · Migration alignment {course.migrationAlignmentScore}/100
                  </div>
                  <Link href={`/local-v2/courses/${course.id}`} style={{ display: "inline-block", marginTop: 8 }}>View course</Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ ...panel, marginTop: 16, background: "#fff7ed", borderColor: "#fed7aa" }}>
        <strong>Important:</strong> This is a product-flow prototype only. Real migration information must later come from current, verified official sources and should be source-dated. UniPath must never present a pathway score as guaranteed visa or PR eligibility.
      </section>
    </main>
  );
}
