import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Building2, ExternalLink, GraduationCap, MapPin, Route, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import styles from "../universities.module.css";

export const dynamic = "force-dynamic";

type Campus = {
  id: string;
  name: string;
  city: string;
  state: string;
  postcode: string | null;
  regional: boolean;
  regional_verified: boolean;
  regional_classification: string | null;
};

type Course = {
  id: string;
  name: string;
  qualification_level: string;
  cricos_code: string | null;
  cricos_tuition_fee_total: number | null;
  duration_months: number | null;
};

type University = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  cricos_code: string | null;
  description: string | null;
  campuses: Campus[];
  courses: Course[];
};

export default async function UniversityProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("universities")
    .select(`
      id, name, slug, website, cricos_code, description,
      campuses(id, name, city, state, postcode, regional, regional_verified, regional_classification),
      courses(id, name, qualification_level, cricos_code, cricos_tuition_fee_total, duration_months)
    `)
    .eq("slug", slug)
    .limit(12, { referencedTable: "courses" })
    .order("name", { referencedTable: "courses", ascending: true })
    .single();

  if (error || !data) notFound();
  const university = data as unknown as University;
  const verifiedRegional = university.campuses.filter((campus) => campus.regional_verified && campus.regional);
  const states = [...new Set(university.campuses.map((campus) => campus.state))];

  const { count: courseCount } = await supabase
    .from("courses")
    .select("id", { count: "exact", head: true })
    .eq("university_id", university.id)
    .not("cricos_code", "is", null);

  return (
    <main className={styles.page}>
      <header className={`${styles.header} shell`}>
        <Link href="/" className="brand"><span>U</span> UniPath Australia</Link>
        <nav><Link href="/courses">Courses</Link><Link className={styles.active} href="/universities">Universities</Link><Link href="/compare">Compare</Link><Link href="/dashboard">Dashboard</Link></nav>
      </header>

      <section className={`${styles.hero} shell`}>
        <div>
          <p className="sectionLabel">UNIVERSITY PROFILE</p>
          <h1>{university.name}</h1>
          <p>{university.description || "This profile combines UniPath’s current CRICOS course and campus records with separately verified fee and regional evidence where available."}</p>
          <div className={styles.profileLinks}>
            <Link href={`/courses?university=${university.id}`}>Browse all {Number(courseCount ?? 0).toLocaleString("en-AU")} courses <ArrowRight size={14}/></Link>
            {university.website && <a href={university.website} target="_blank" rel="noreferrer">University website <ExternalLink size={13}/></a>}
          </div>
        </div>
        <div className={styles.profileSummary}>
          <div><Building2 size={19}/><span><b>{university.campuses.length}</b>campus records</span></div>
          <div><GraduationCap size={19}/><span><b>{Number(courseCount ?? 0).toLocaleString("en-AU")}</b>CRICOS courses</span></div>
          <div><Route size={19}/><span><b>{verifiedRegional.length}</b>designated-regional campuses</span></div>
          <div><MapPin size={19}/><span><b>{states.length}</b>state/territory footprints</span></div>
        </div>
      </section>

      <section className={`${styles.profileGrid} shell`}>
        <div className={styles.profilePanel}>
          <div className={styles.panelTitle}><MapPin size={17}/><div><b>Campuses</b><span>Regional labels appear only where postcode classification has been verified.</span></div></div>
          <div className={styles.campusList}>
            {university.campuses.length ? university.campuses.map((campus) => (
              <div className={styles.campusRow} key={campus.id}>
                <div><b>{campus.name}</b><span>{campus.city}, {campus.state}{campus.postcode ? ` ${campus.postcode}` : ""}</span></div>
                <span className={campus.regional ? styles.regionalPill : styles.cityPill}>{categoryLabel(campus)}</span>
              </div>
            )) : <p className={styles.muted}>No campus mapping is currently available from the source dataset.</p>}
          </div>
        </div>

        <div className={styles.profilePanel}>
          <div className={styles.panelTitle}><ShieldCheck size={17}/><div><b>Data confidence</b><span>Course registration and campus evidence remain separate from fee and migration advice.</span></div></div>
          <div className={styles.confidenceList}>
            <div><b>CRICOS provider</b><span>{university.cricos_code || "Provider mapping available in the UniPath dataset"}</span></div>
            <div><b>Regional status</b><span>{university.campuses.filter((campus) => campus.regional_verified).length} campus records verified by postcode classification</span></div>
            <div><b>Migration interpretation</b><span>A regional campus classification is not a guarantee of visa eligibility or permanent residency.</span></div>
          </div>
        </div>
      </section>

      <section className={`${styles.featuredCourses} shell`}>
        <div className={styles.featuredHead}><div><p className="sectionLabel">COURSES</p><h2>Sample registered courses</h2></div><Link href={`/courses?university=${university.id}`}>View full catalogue <ArrowRight size={14}/></Link></div>
        <div className={styles.courseList}>
          {university.courses.map((course) => (
            <article key={course.id}>
              <div><span>{course.qualification_level}</span><h3><Link href={`/courses/${course.id}`}>{course.name}</Link></h3></div>
              <div className={styles.courseFacts}>
                <span>{course.cricos_code ? `CRICOS ${course.cricos_code}` : "CRICOS pending"}</span>
                <span>{course.duration_months ? `${course.duration_months} months` : "Duration pending"}</span>
                <span>{course.cricos_tuition_fee_total && course.cricos_tuition_fee_total > 100 ? `${money(course.cricos_tuition_fee_total)} total tuition` : "Fee pending"}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function categoryLabel(campus: Campus) {
  if (!campus.regional_verified || !campus.regional_classification) return "Regional status pending";
  if (campus.regional_classification.startsWith("CATEGORY_1")) return "Category 1 · not designated regional";
  if (campus.regional_classification.startsWith("CATEGORY_2")) return "Category 2 · designated regional";
  if (campus.regional_classification.startsWith("CATEGORY_3")) return "Category 3 · designated regional";
  return campus.regional ? "Verified regional" : "Verified non-regional";
}

function money(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}
