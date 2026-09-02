"use client";

import { useEffect, useMemo, useState } from "react";
import { demoCampuses, demoCourses, demoUniversities } from "@/lib/local-v2/fixtures";

type SavedPlan = {
  id: string;
  courseId: string;
  note: string;
  savedAt: string;
};

const STORAGE_KEY = "unipath-local-v2-saved-plans";

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

function formatAud(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function LocalDashboardPage() {
  const [courseId, setCourseId] = useState(demoCourses[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSavedPlans(JSON.parse(raw));
    } catch {
      setSavedPlans([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPlans));
  }, [savedPlans, loaded]);

  const selectedCourse = useMemo(
    () => demoCourses.find((course) => course.id === courseId),
    [courseId],
  );

  function savePlan() {
    if (!selectedCourse) return;
    const entry: SavedPlan = {
      id: `${selectedCourse.id}-${Date.now()}`,
      courseId: selectedCourse.id,
      note: note.trim(),
      savedAt: new Date().toISOString(),
    };
    setSavedPlans((current) => [entry, ...current]);
    setNote("");
  }

  function removePlan(id: string) {
    setSavedPlans((current) => current.filter((item) => item.id !== id));
  }

  return (
    <main style={{ maxWidth: 1050, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#e0f2fe", fontWeight: 750 }}>
          LOCAL DASHBOARD DEMO
        </span>
        <h1 style={{ marginBottom: 8 }}>Saved Recommendations Dashboard</h1>
        <p style={{ color: "#586174", maxWidth: 780 }}>
          Save a demo course plan locally in this browser and review it later. This basic version uses localStorage only; account-based Supabase persistence comes later.
        </p>
      </div>

      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Save a course plan</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          <label style={{ display: "grid", gap: 7, fontWeight: 650 }}>
            Course
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)} style={inputStyle}>
              {demoCourses.map((course) => {
                const campus = demoCampuses.find((item) => item.id === course.campusId);
                const university = demoUniversities.find((item) => item.id === campus?.universityId);
                return (
                  <option key={course.id} value={course.id}>
                    {course.name} · {university?.name ?? "University"}
                  </option>
                );
              })}
            </select>
          </label>

          <label style={{ display: "grid", gap: 7, fontWeight: 650 }}>
            Personal note
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Example: Best budget option"
              style={inputStyle}
            />
          </label>
        </div>

        {selectedCourse && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <strong>{selectedCourse.name}</strong>
            <div style={{ marginTop: 6, color: "#4b5563" }}>
              Annual tuition: {formatAud(selectedCourse.annualTuitionCents)} · Duration: {selectedCourse.durationYears} years
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={savePlan}
          style={{ marginTop: 14, border: 0, borderRadius: 10, padding: "11px 16px", fontWeight: 750, cursor: "pointer", background: "#111827", color: "#fff" }}
        >
          Save recommendation
        </button>
      </section>

      <section style={{ ...panelStyle, marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>My saved plans</h2>
          <strong>{savedPlans.length} saved</strong>
        </div>

        {!loaded ? (
          <p>Loading saved plans…</p>
        ) : savedPlans.length === 0 ? (
          <div style={{ marginTop: 14, padding: 16, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            No saved plans yet. Select a course above and save your first recommendation.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {savedPlans.map((saved) => {
              const course = demoCourses.find((item) => item.id === saved.courseId);
              if (!course) return null;
              const campus = demoCampuses.find((item) => item.id === course.campusId);
              const university = demoUniversities.find((item) => item.id === campus?.universityId);

              return (
                <article key={saved.id} style={{ border: "1px solid #e2e6ed", borderRadius: 14, padding: 16, background: "#fbfcfe" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <h3 style={{ margin: "0 0 6px" }}>{course.name}</h3>
                      <div style={{ color: "#4b5563" }}>
                        {university?.name ?? "University"} · {campus?.name ?? "Campus"} · {campus?.state ?? ""}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <strong>{formatAud(course.annualTuitionCents)}</strong> annual tuition · {course.durationYears} years
                      </div>
                      {saved.note && <p style={{ marginBottom: 0 }}><strong>Note:</strong> {saved.note}</p>}
                      <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
                        Saved {new Date(saved.savedAt).toLocaleString("en-AU")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePlan(saved.id)}
                      style={{ border: "1px solid #cfd5df", borderRadius: 9, padding: "8px 12px", background: "#fff", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ ...panelStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Basic dashboard status</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>Save a recommended course plan</li>
          <li>Persist it after browser refresh using localStorage</li>
          <li>Add a personal note</li>
          <li>Review university, campus, state, tuition and duration</li>
          <li>Remove saved plans</li>
        </ul>
      </section>
    </main>
  );
}
