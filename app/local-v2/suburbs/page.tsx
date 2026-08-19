import Link from "next/link";
import { demoCampuses, demoSuburbs } from "@/lib/local-v2/fixtures";

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default function SuburbsPage() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 18px 70px", background: "#f6f8fb", minHeight: "100vh" }}>
      <div style={{ marginBottom: 20 }}>
        <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#fff2cc", fontWeight: 750 }}>LOCAL DEMO LIVING COSTS</span>
        <h1 style={{ marginBottom: 8 }}>Suburb Explorer</h1>
        <p style={{ color: "#586174", maxWidth: 780 }}>Compare weekly living-cost estimates and see which demo campus is linked to each suburb. All values are illustrative local-development data.</p>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {demoSuburbs.map((suburb) => {
          const campus = demoCampuses.find((item) => item.suburbId === suburb.id);
          const weeklyTotal = suburb.weeklyRentCents + suburb.weeklyGroceriesCents + suburb.weeklyUtilitiesCents + suburb.weeklyPersonalCents;
          const annualTotal = weeklyTotal * 52;
          return (
            <article key={suburb.id} style={{ border: "1px solid #dfe3ea", borderRadius: 16, padding: 18, background: "#fff" }}>
              <h2 style={{ marginTop: 0, marginBottom: 8 }}>{suburb.name}</h2>
              <p><strong>State:</strong> {suburb.state}</p>
              <p><strong>Linked campus:</strong> {campus?.name ?? "None in demo"}</p>
              <p><strong>Weekly rent:</strong> {money(suburb.weeklyRentCents)}</p>
              <p><strong>Weekly groceries:</strong> {money(suburb.weeklyGroceriesCents)}</p>
              <p><strong>Weekly utilities:</strong> {money(suburb.weeklyUtilitiesCents)}</p>
              <p><strong>Weekly personal:</strong> {money(suburb.weeklyPersonalCents)}</p>
              <p><strong>Estimated weekly total:</strong> {money(weeklyTotal)}</p>
              <p><strong>Estimated annual living cost:</strong> {money(annualTotal)}</p>
              <Link href={`/local-v2/suburbs/${suburb.id}`} style={{ display: "inline-block", marginTop: 8, padding: "10px 14px", borderRadius: 10, background: "#111827", color: "#fff", textDecoration: "none", fontWeight: 750 }}>View suburb details</Link>
            </article>
          );
        })}
      </section>
    </main>
  );
}
