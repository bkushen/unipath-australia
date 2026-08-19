"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Location = {
  id: string; name: string; city: string | null; state: string | null; postcode: string | null; regional: boolean; regional_verified: boolean | null; regional_classification: string | null;
  university: { id: string; name: string; website: string | null; logo_url: string | null } | null;
  livingCosts: Array<{ id: string; category: string; weekly_low: number | null; weekly_high: number | null; monthly_estimate: number | null; source_url: string | null; verified_at: string | null; verification_status: string | null }>;
};

const states = ["ALL","VIC","NSW","QLD","SA","WA","TAS","ACT","NT"];
const money = (value: number | null | undefined) => value == null ? "Not loaded" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(value));

export default function SuburbsPage() {
  const [query, setQuery] = useState(""); const [state, setState] = useState("ALL"); const [regionalOnly, setRegionalOnly] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(async () => { setLoading(true); setError(""); try { const p = new URLSearchParams(); if (query.trim()) p.set("q", query.trim()); if (state !== "ALL") p.set("state", state); if (regionalOnly) p.set("regional", "true"); const r = await fetch(`/api/local-v2/locations?${p}`, { signal: controller.signal }); const d = await r.json(); if (!r.ok) throw new Error(d.detail || d.error || "Unable to load locations."); setLocations(d.locations ?? []); } catch (e) { if ((e as Error).name !== "AbortError") setError((e as Error).message); } finally { setLoading(false); } }, 220); return () => { controller.abort(); window.clearTimeout(timer); }; }, [query,state,regionalOnly]);
  const withCosts = useMemo(() => locations.filter((l) => l.livingCosts.length > 0).length, [locations]);
  return <main style={{ minHeight:"100vh", background:"#f5f7fa", color:"#101828" }}>
    <section style={{ background:"#0057b8", color:"#fff", padding:"42px 20px 32px" }}><div style={{ maxWidth:1120, margin:"0 auto" }}><div style={{ fontSize:12,fontWeight:850,letterSpacing:.8 }}>UNIPATH AUSTRALIA · LIVE LOCATION DATABASE</div><h1 style={{fontSize:42,margin:"10px 0"}}>Living in Australia</h1><p style={{maxWidth:820,color:"#e8f0fb",lineHeight:1.55}}>Explore university campuses, cities, regional classification and verified living-cost records where available.</p></div></section>
    <div style={{maxWidth:1120,margin:"0 auto",padding:"24px 20px 70px"}}>
      <section style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,background:"#fff",border:"1px solid #e4e7ec",borderRadius:16,padding:16}}><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search campus, city or postcode" style={control}/><select value={state} onChange={(e)=>setState(e.target.value)} style={control}>{states.map(s=><option key={s}>{s}</option>)}</select><label style={{display:"flex",alignItems:"center",gap:8,fontWeight:700}}><input type="checkbox" checked={regionalOnly} onChange={(e)=>setRegionalOnly(e.target.checked)}/>Regional only</label></section>
      <div style={{margin:"20px 0 12px"}}><strong style={{fontSize:22}}>{loading?"Loading locations…":`${locations.length} campus locations`}</strong><div style={{color:"#667085"}}>{withCosts} currently have verified/estimated living-cost records loaded.</div></div>
      {error && <div style={{padding:14,borderRadius:12,background:"#fff6f5",color:"#b42318"}}>{error}</div>}
      <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:14}}>{locations.map((loc)=>{const cost=loc.livingCosts[0]; return <article key={loc.id} style={card}><div style={{color:"#0057b8",fontWeight:850}}>{loc.university?.name ?? "University not linked"}</div><h2 style={{margin:"6px 0"}}>{loc.name}</h2><div style={{color:"#667085"}}>{[loc.city,loc.state,loc.postcode].filter(Boolean).join(" · ")}</div><p><strong>Regional:</strong> {loc.regional ? "Yes" : "No"}{loc.regional_verified ? " · verified" : ""}</p>{loc.regional_classification && <p><strong>Classification:</strong> {loc.regional_classification}</p>}{cost ? <div style={{padding:12,borderRadius:11,background:"#f8fafc"}}><strong>{cost.category}</strong><div style={{marginTop:5}}>Weekly: {money(cost.weekly_low)}–{money(cost.weekly_high)}</div><div>Monthly estimate: {money(cost.monthly_estimate)}</div></div> : <p style={{color:"#667085"}}>Living-cost data not loaded for this campus yet.</p>}<Link href={`/local-v2/suburbs/${loc.id}`} style={{display:"inline-block",marginTop:12,padding:"10px 13px",borderRadius:9,background:"#0057b8",color:"#fff",textDecoration:"none",fontWeight:800}}>View location details</Link></article>})}</section>
    </div>
  </main>;
}

const control={width:"100%",padding:"11px 12px",border:"1px solid #d0d5dd",borderRadius:9,background:"#fff"} as const;
const card={background:"#fff",border:"1px solid #e4e7ec",borderRadius:16,padding:18} as const;
