import Link from "next/link";
import { ExternalLink, Route, Search, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import styles from "./pathways.module.css";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string };
type SkilledOccupation = {
  id: string;
  name: string;
  assessing_authority: string | null;
  skilled_occupation_codes: Array<{ anzsco_code: string; anzsco_version: string }>;
};
type Program = {
  id: string;
  subclass: string;
  name: string;
  stream: string | null;
  pathway_type: string | null;
  source_url: string | null;
  verified_at: string | null;
  skilled_occupation_programs: Array<{ skilled_occupations: SkilledOccupation[] }>;
};

export default async function PathwaysPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const q = (raw.q ?? "").trim().slice(0, 80);
  const supabase = await createClient();

  let query = supabase
    .from("migration_programs")
    .select(`id,subclass,name,stream,pathway_type,source_url,verified_at,skilled_occupation_programs(skilled_occupations(id,name,assessing_authority,skilled_occupation_codes(anzsco_code,anzsco_version)))`)
    .order("subclass");

  if (q) query = query.or(`subclass.ilike.%${q}%,name.ilike.%${q}%,stream.ilike.%${q}%`);
  const { data, error } = await query;
  const programs = (data ?? []) as unknown as Program[];

  return <main className={styles.page}>
    <header className={`${styles.header} shell`}><Link href="/" className="brand"><span>U</span> UniPath Australia</Link><nav><Link href="/courses">Courses</Link><Link href="/universities">Universities</Link><Link href="/careers">Careers</Link><Link className={styles.active} href="/pathways">Pathways</Link><Link href="/dashboard">Dashboard</Link></nav></header>
    <section className={`${styles.hero} shell`}><div><p className="sectionLabel">MIGRATION PATHWAY EVIDENCE</p><h1>Understand current occupation-to-program evidence without a fake PR score.</h1><p>UniPath separates course choice from migration eligibility. These cards show verified program and occupation relationships only; they do not determine your personal visa eligibility.</p></div><div className={styles.trust}><ShieldCheck size={22}/><span><b>Evidence, not predictions</b>Every program shown here is tied to a current source record and verification date in UniPath.</span></div></section>
    <section className={`${styles.search} shell`}><form action="/pathways"><div><Search size={16}/><input name="q" defaultValue={q} placeholder="Search subclass or program"/></div><button>Search</button>{q && <Link href="/pathways">Clear</Link>}</form></section>
    <section className={`${styles.section} shell`}>
      <div className={styles.sectionHead}><div><p className="sectionLabel">CURRENT PROGRAM EVIDENCE</p><h2>{programs.length} pathway records</h2></div><p>Occupation lists and visa rules can change. Always check the linked Home Affairs source before making a migration decision.</p></div>
      {error ? <div className={styles.empty}>Pathway evidence is temporarily unavailable.</div> : <div className={styles.grid}>{programs.map((p) => {
        const occupations = p.skilled_occupation_programs.flatMap((x) => x.skilled_occupations ?? []);
        return <article className={styles.card} key={p.id}><div className={styles.badge}>Subclass {p.subclass}</div><h3>{p.name}</h3><p className={styles.type}>{p.stream || p.pathway_type || "Current migration program"}</p><div className={styles.occupationList}>{occupations.slice(0, 8).map((o) => <div key={o.id}><Route size={14}/><span><b>{o.name}</b><small>{o.skilled_occupation_codes.map((c) => `${c.anzsco_code} (${c.anzsco_version})`).join(" · ") || "Occupation code evidence available"}{o.assessing_authority ? ` · ${o.assessing_authority}` : ""}</small></span></div>)}{occupations.length > 8 && <span className={styles.more}>+{occupations.length - 8} more verified occupation links</span>}</div><footer><span>{p.verified_at ? `Verified ${new Date(p.verified_at).toLocaleDateString("en-AU")}` : "Verification date pending"}</span>{p.source_url && <a href={p.source_url} target="_blank" rel="noreferrer">Home Affairs source <ExternalLink size={12}/></a>}</footer></article>;
      })}</div>}
      <div className={styles.disclaimer}><ShieldCheck size={17}/><p><b>Important:</b> A course, occupation or regional location does not guarantee a visa or permanent residency. Eligibility depends on the visa subclass, occupation list/version, skills assessment, points or sponsorship requirements, age, English, work history and other rules applying at the time.</p></div>
    </section>
  </main>;
}
