import Link from "next/link";
import { ArrowRight, Building2, MapPin, Search, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import styles from "./universities.module.css";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; regional?: string };

type UniversitySummary = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  cricos_code: string | null;
  course_count: number;
  campus_count: number;
  regional_campus_count: number;
  state_count: number;
  min_verified_total_tuition: number | null;
  max_verified_total_tuition: number | null;
};

export default async function UniversitiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const q = (raw.q ?? "").trim().slice(0, 80);
  const regionalOnly = raw.regional === "yes";
  const supabase = await createClient();

  let query = supabase
    .from("university_catalogue_summary")
    .select("*")
    .order("name", { ascending: true });

  if (q) query = query.ilike("name", `%${q}%`);
  if (regionalOnly) query = query.gt("regional_campus_count", 0);

  const { data, error } = await query;
  const universities = (data ?? []) as UniversitySummary[];

  return (
    <main className={styles.page}>
      <header className={`${styles.header} shell`}>
        <Link href="/" className="brand"><span>U</span> UniPath Australia</Link>
        <nav><Link href="/discover">Assessment</Link><Link href="/courses">Courses</Link><Link className={styles.active} href="/universities">Universities</Link><Link href="/compare">Compare</Link></nav>
      </header>

      <section className={`${styles.hero} shell`}>
        <div>
          <p className="sectionLabel">UNIVERSITY EXPLORER</p>
          <h1>Compare Australian universities before choosing a course.</h1>
          <p>Browse the universities in UniPath’s current CRICOS-backed catalogue, then drill into campuses, regional categories and available courses.</p>
        </div>
        <div className={styles.trust}><ShieldCheck size={21}/><span><b>42 university catalogue</b>University counts come from the live UniPath CRICOS dataset.</span></div>
      </section>

      <section className={`${styles.controls} shell`}>
        <form action="/universities" method="get">
          <div className={styles.search}><Search size={17}/><input name="q" defaultValue={q} placeholder="Search university name"/></div>
          <label><input type="checkbox" name="regional" value="yes" defaultChecked={regionalOnly}/> Has a verified regional campus</label>
          <button type="submit">Search</button>
          {(q || regionalOnly) && <Link href="/universities">Clear</Link>}
        </form>
      </section>

      <section className={`${styles.gridWrap} shell`}>
        <div className={styles.summary}><b>{universities.length} universities</b><span>{regionalOnly ? "with at least one verified designated-regional campus" : "in the current filtered view"}</span></div>
        {error ? <div className={styles.empty}>University data is temporarily unavailable.</div> : (
          <div className={styles.grid}>
            {universities.map((uni) => (
              <article className={styles.card} key={uni.id}>
                <div className={styles.icon}><Building2 size={22}/></div>
                <div className={styles.cardBody}>
                  <span className={styles.cricos}>{uni.cricos_code ? `CRICOS ${uni.cricos_code}` : "CRICOS provider mapping available"}</span>
                  <h2><Link href={`/universities/${uni.slug}`}>{uni.name}</Link></h2>
                  <div className={styles.stats}>
                    <div><b>{Number(uni.course_count).toLocaleString("en-AU")}</b><span>courses</span></div>
                    <div><b>{Number(uni.campus_count)}</b><span>campuses</span></div>
                    <div><b>{Number(uni.regional_campus_count)}</b><span>regional</span></div>
                  </div>
                  <div className={styles.meta}><MapPin size={14}/><span>{uni.state_count} state/territory {Number(uni.state_count) === 1 ? "footprint" : "footprints"}</span></div>
                </div>
                <div className={styles.cardFoot}>
                  <Link href={`/courses?university=${uni.id}`}>Browse courses</Link>
                  <Link className={styles.detail} href={`/universities/${uni.slug}`}>University profile <ArrowRight size={14}/></Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
