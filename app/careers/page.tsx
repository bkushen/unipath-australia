import Link from "next/link";
import { BriefcaseBusiness, ExternalLink, Route, Search, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import styles from "./careers.module.css";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string };
type CareerOutcome = {
  id: string;
  name: string;
  source_url: string | null;
  verified_at: string | null;
  course_occupations: Array<{ alignment_score: number | null; courses: { id: string; name: string; universities: { name: string } | null } | null }>;
};
type SkilledOccupation = {
  id: string;
  name: string;
  assessing_authority: string | null;
  source_url: string | null;
  verified_at: string | null;
  skilled_occupation_codes: Array<{ anzsco_code: string; anzsco_version: string }>;
  skilled_occupation_programs: Array<{ migration_programs: { subclass: string; name: string } | null }>;
};

export default async function CareersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 80);
  const supabase = await createClient();

  let careerQuery = supabase.from("occupations").select(`
    id,name,source_url,verified_at,
    course_occupations(alignment_score,courses(id,name,universities(name)))
  `).order("name", { ascending: true });
  if (q) careerQuery = careerQuery.ilike("name", `%${q}%`);

  const [{ data: careerData }, { data: skilledData }] = await Promise.all([
    careerQuery,
    supabase.from("skilled_occupations").select(`
      id,name,assessing_authority,source_url,verified_at,
      skilled_occupation_codes(anzsco_code,anzsco_version),
      skilled_occupation_programs(migration_programs(subclass,name))
    `).order("name", { ascending: true })
  ]);

  const careers = (careerData ?? []) as unknown as CareerOutcome[];
  const skilled = (skilledData ?? []) as unknown as SkilledOccupation[];

  return (
    <main className={styles.page}>
      <header className={`${styles.header} shell`}>
        <Link href="/" className="brand"><span>U</span> UniPath Australia</Link>
        <nav><Link href="/courses">Courses</Link><Link href="/universities">Universities</Link><Link className={styles.active} href="/careers">Careers</Link><Link href="/compare">Compare</Link></nav>
      </header>

      <section className={`${styles.hero} shell`}>
        <div><p className="sectionLabel">CAREER EXPLORER</p><h1>Keep career outcomes separate from migration occupations.</h1><p>University-published career outcomes and Home Affairs skilled-occupation evidence answer different questions. UniPath shows them in separate sections so a job title is never silently converted into a migration claim.</p></div>
        <div className={styles.trust}><ShieldCheck size={21}/><span><b>Conservative matching</b>Only explicitly sourced course-to-career links and separately verified skilled-occupation records appear here.</span></div>
      </section>

      <section className={`${styles.searchBar} shell`}>
        <form action="/careers"><div><Search size={16}/><input name="q" defaultValue={q} placeholder="Search recorded career outcome"/></div><button>Search</button>{q && <Link href="/careers">Clear</Link>}</form>
      </section>

      <section className={`${styles.section} shell`}>
        <div className={styles.sectionHead}><div><p className="sectionLabel">UNIVERSITY CAREER OUTCOMES</p><h2>{careers.length} recorded titles</h2></div><p>Current coverage is a verified pilot, not all 11,908 courses yet.</p></div>
        <div className={styles.grid}>
          {careers.map((career) => {
            const links = career.course_occupations.filter((item) => item.courses);
            return <article className={styles.card} key={career.id}>
              <BriefcaseBusiness size={20}/><h3>{career.name}</h3><p>{links.length ? `Linked to ${links.length} currently verified course${links.length === 1 ? "" : "s"}.` : "No course link currently verified."}</p>
              <div className={styles.links}>{links.slice(0,3).map((link) => <Link key={link.courses!.id} href={`/courses/${link.courses!.id}`}><b>{link.courses!.name}</b><span>{link.courses!.universities?.name ?? "University"}</span></Link>)}</div>
              <footer>{career.source_url ? <a href={career.source_url} target="_blank" rel="noreferrer">Career source <ExternalLink size={12}/></a> : <span>Source pending</span>}</footer>
            </article>;
          })}
        </div>
      </section>

      <section className={`${styles.migrationSection} shell`}>
        <div className={styles.sectionHead}><div><p className="sectionLabel">SKILLED-MIGRATION OCCUPATIONS</p><h2>{skilled.length} verified occupation records</h2></div><p>These records are not automatically mapped to courses based on similar names.</p></div>
        <div className={styles.skilledGrid}>
          {skilled.map((occupation) => {
            const codes = occupation.skilled_occupation_codes.map((item) => `${item.anzsco_code} · ${item.anzsco_version}`);
            const subclasses = occupation.skilled_occupation_programs.map((item) => item.migration_programs?.subclass).filter((value): value is string => Boolean(value)).filter((value,index,array)=>array.indexOf(value)===index);
            return <article key={occupation.id}><Route size={18}/><div><h3>{occupation.name}</h3><p>{codes.length ? `ANZSCO ${codes.join(", ")}` : "ANZSCO evidence pending"}</p><span>{occupation.assessing_authority ? `Assessing authority: ${occupation.assessing_authority}` : "Assessing authority pending"}</span><span>{subclasses.length ? `Current recorded subclasses: ${subclasses.join(", ")}` : "Program evidence pending"}</span>{occupation.source_url && <a href={occupation.source_url} target="_blank" rel="noreferrer">Official migration source <ExternalLink size={12}/></a>}</div></article>;
          })}
        </div>
        <div className={styles.disclaimer}><ShieldCheck size={17}/><p>A course, occupation title or regional campus does not guarantee skills assessment, visa eligibility or permanent residency. Eligibility depends on the current program rules and the individual applicant.</p></div>
      </section>
    </main>
  );
}
