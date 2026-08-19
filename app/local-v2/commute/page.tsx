"use client";

import { useMemo, useState } from "react";
import { demoCampuses, demoRouteFixtures, demoSuburbs } from "@/lib/local-v2/fixtures";
import { chooseRecommendedRoute } from "@/lib/local-v2/routing-provider";
import type { RouteOption } from "@/lib/local-v2/types";

const panelStyle = {
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

const labelStyle = {
  display: "grid",
  gap: 7,
  fontWeight: 650,
} as const;

export default function CommutePage() {
  const [suburbId, setSuburbId] = useState("s-ballarat");
  const [campusId, setCampusId] = useState("c-ballarat");
  const [preference, setPreference] = useState<"car" | "public_transport" | "either">("either");

  const routes = useMemo<RouteOption[]>(() => {
    return demoRouteFixtures[`${suburbId}:${campusId}`] ?? [];
  }, [suburbId, campusId]);

  const recommended = useMemo(
    () => chooseRecommendedRoute(routes, preference),
    [routes, preference],
  );

  const suburb = demoSuburbs.find((item) => item.id === suburbId);
  const campus = demoCampuses.find((item) => item.id === campusId);

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>
          LOCAL DEMO ROUTES
        </span>
        <h1 style={{ marginBottom: 8 }}>UniPath Commute Calculator</h1>
        <p style={{ color: "#586174", maxWidth: 760 }}>
          Select a suburb and campus to compare driving and public-transport options. These routes are local demo fixtures only.
        </p>
      </div>

      <section style={panelStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <label style={labelStyle}>
            Living suburb
            <select value={suburbId} onChange={(e) => setSuburbId(e.target.value)} style={inputStyle}>
              {demoSuburbs.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            University campus
            <select value={campusId} onChange={(e) => setCampusId(e.target.value)} style={inputStyle}>
              {demoCampuses.map((item) => (
                <option key={item.id} value={item.id}>{item.name} · {item.state}</option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Transport preference
            <select value={preference} onChange={(e) => setPreference(e.target.value as typeof preference)} style={inputStyle}>
              <option value="either">Either</option>
              <option value="car">Car</option>
              <option value="public_transport">Public transport</option>
            </select>
          </label>
        </div>
      </section>

      <section style={{ ...panelStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Route result</h2>
        <p><strong>From:</strong> {suburb?.name ?? "Unknown suburb"}</p>
        <p><strong>To:</strong> {campus?.name ?? "Unknown campus"}</p>

        {routes.length === 0 ? (
          <div style={{ padding: 16, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa" }}>
            No local demo route exists for this suburb/campus combination yet. Try Ballarat → Ballarat Campus, Clayton → Clayton Campus, or Adelaide → Adelaide Campus.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginTop: 14 }}>
              {routes.map((route) => (
                <article key={route.id} style={{ border: "1px solid #e2e6ed", borderRadius: 14, padding: 16, background: "#fbfcfe" }}>
                  <div style={{ fontSize: 13, fontWeight: 750, color: "#586174", textTransform: "uppercase" }}>
                    {route.mode === "driving" ? "Driving" : "Public transport"}
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{route.durationMinutes} min</div>
                  <p style={{ margin: "6px 0" }}>{route.distanceKm} km</p>
                  <p style={{ margin: "6px 0" }}><strong>Transfers:</strong> {route.transfers}</p>
                  <p style={{ margin: "6px 0" }}><strong>Walking:</strong> {route.walkingMinutes} min</p>
                  <p style={{ color: "#4b5563", marginBottom: 0 }}>{route.summary}</p>
                </article>
              ))}
            </div>

            {recommended && (
              <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
                <strong>Recommended route:</strong> {recommended.summary} — {recommended.durationMinutes} min
              </div>
            )}
          </>
        )}
      </section>

      <section style={{ ...panelStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>What this basic version proves</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>Suburb selection</li>
          <li>Campus selection</li>
          <li>Driving and public-transport comparison</li>
          <li>Distance, duration, transfers and walking time</li>
          <li>Preference-aware route recommendation</li>
        </ul>
      </section>
    </main>
  );
}
