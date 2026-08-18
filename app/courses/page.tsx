import Link from "next/link";
import { ArrowRight, BookOpen, Clock3, Filter, GraduationCap, MapPin, Search, ShieldCheck, SlidersHorizontal, WalletCards } from "lucide-react";
import SaveCourseButton from "@/components/SaveCourseButton";
import { createClient } from "@/lib/supabase/server";
import CompareCourseToggle from "./CompareCourseToggle";
import styles from "./courses.module.css";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

const FIELD_OPTIONS = [
  ["01 - Natural and Physical Sciences", "Natural & Physical Sciences"],
  ["02 - Information Technology", "Information Technology"],
  ["03 - Engineering and Related Technologies", "Engineering & Related Technologies"],
  ["04 - Architecture and Building", "Architecture & Building"],
  ["05 - Agriculture, Environmental and Related Studies", "Agriculture & Environmental Studies"],
  ["06 - Health", "Health"],
  ["07 - Education", "Education"],
  ["08 - Management and Commerce", "Management & Commerce"],
  ["09 - Society and Culture", "Society & Culture"],
  ["10 - Creative Arts", "Creative Arts"],
  ["11 - Food, Hospitality and Personal Services", "Food, Hospitality & Personal Services"],
  ["12 - Mixed Field Programmes", "Mixed Field Programmes"],
] as const;

const QUALIFICATION_OPTIONS = [
  "Bachelor Degree",
  "Bachelor Honours Degree",
  "Masters Degree (Coursework)",
  "Masters Degree (Research)",
  "Masters Degree (Extended)",
  "Doctoral Degree",
  "Graduate Certificate",
  "Graduate Diploma",
  "Associate Degree",
  "Diploma",
  "Advanced Diploma",
  "Certificate IV",
  "Certificate III",
  "Non AQF Award",
] as const;

const STATE_OPTIONS = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;

const REGIONAL_OPTIONS = [
  ["CATEGORY_1_MAJOR_CITY_NOT_DESIGNATED_REGIONAL", "Category 1 · Major city"],
  ["CATEGORY_2_CITIES_AND_MAJOR_REGIONAL_CENTRES", "Category 2 · Cities & major regional centres"],
  ["CATEGORY_3_REGIONAL_CENTRES_AND_OTHER_REGIONAL_AREAS", "Category 3 · Regional centres & other regional areas"],
] as const;

type SearchParams = {
  q?: string;
  university?: string;
  field?: string;
  qualification?: string;
  state?: string;
  regional?: string;
  fee?: string;
  duration?: string;
  sort?: string;
  page?: string;
};

type Campus = {
  name: string;
  city: string;
  state: string;
  regional: boolean;
  regional_verified: boolean;
  regional_classification: string | null;
};

type CourseRow = {
  id: string;
  name: string;
  qualification_level: string;
  cricos_code: string | null;
  cricos_field_1_broad: string | null;
  cricos_duration_weeks: number | null;
  duration_months: number | null;
  annual_fee: number | null;
  cricos_tuition_fee_total: number | null;
  cricos_fee_verified_at: string | null;
  universities: { name: string } | null;
  course_campuses: Array<{ campuses: Campus | null }>;
};

type UniversityOption = { id: string; name: string };

export default async function CoursesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const params = normaliseParams(raw);
  const page = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const supabase = await createClient();

  const campusFilterActive = Boolean(params.state || params.regional);
  const campusSelect = campusFilterActive
    ? "course_campuses!inner(campuses!inner(name, city, state, regional, regional_verified, regional_classification))"
    : "course_campuses(campuses(name, city, state, regional, regional_verified, regional_classification))";

  const [{ data: universityData }, catalogueResult] = await Promise.all([
    supabase.from("universities").select("id, name").order("name", { ascending: true }),
    buildCatalogueQuery(supabase, params, campusSelect, from, to),
  ]);

  const universities = (universityData ?? []) as UniversityOption[];
  const courses = (catalogueResult.data ?? []) as unknown as CourseRow[];
  const total = catalogueResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  return (
    <main className={styles.page}>
      <header className={`${styles.header} shell`}>
        <Link href="/" className="brand"><span>U</span> UniPath Australia</Link>
        <nav className={styles.headerNav}>
          <Link href="/discover">Assessment</Link>
          <Link href="/courses" className={styles.active}>Courses</Link>
          <Link href="/compare">Compare</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <section className={`${styles.hero} shell`}>
        <div>
          <p className="sectionLabel">AUSTRALIAN COURSE EXPLORER</p>
          <h1>Search the verified CRICOS university catalogue.</h1>
          <p>Explore registered international-student courses across Australian universities. Tuition and regional evidence are shown only when a source-backed value is available.</p>
        </div>
        <div className={styles.heroTrust}>
          <ShieldCheck size={21}/>
          <div><b>Evidence-first catalogue</b><span>CRICOS registration, campus and duration data are kept separate from fee, regional and migration evidence.</span></div>
        </div>
      </section>

      <section className={`${styles.layout} shell`}>
        <aside className={styles.filters}>
          <div className={styles.filterTitle}><Filter size={17}/><b>Filter courses</b></div>
          <form action="/courses" method="get">
            <label>
              <span>Course search</span>
              <div className={styles.searchInput}><Search size={16}/><input name="q" defaultValue={params.q} placeholder="e.g. Cyber Security"/></div>
            </label>
            <label>
              <span>University</span>
              <select name="university" defaultValue={params.university}>
                <option value="">All universities</option>
                {universities.map((university) => <option key={university.id} value={university.id}>{university.name}</option>)}
              </select>
            </label>
            <label>
              <span>Study field</span>
              <select name="field" defaultValue={params.field}>
                <option value="">All study fields</option>
                {FIELD_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>Qualification</span>
              <select name="qualification" defaultValue={params.qualification}>
                <option value="">All qualification levels</option>
                {QUALIFICATION_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <div className={styles.filterPair}>
              <label><span>State</span><select name="state" defaultValue={params.state}><option value="">All</option>{STATE_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label><span>Duration</span><select name="duration" defaultValue={params.duration}><option value="">Any</option><option value="12">≤ 1 year</option><option value="24">≤ 2 years</option><option value="36">≤ 3 years</option><option value="37+">3+ years</option></select></label>
            </div>
            <label>
              <span>Home Affairs location category</span>
              <select name="regional" defaultValue={params.regional}>
                <option value="">All categories</option>
                {REGIONAL_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>Verified whole-course tuition</span>
              <select name="fee" defaultValue={params.fee}>
                <option value="">Any / pending included</option>
                <option value="under-50">Under AUD 50k</option>
                <option value="50-100">AUD 50k–100k</option>
                <option value="100-150">AUD 100k–150k</option>
                <option value="150-plus">AUD 150k+</option>
              </select>
            </label>
            <input type="hidden" name="sort" value={params.sort || "name"}/>
            <button className={styles.applyButton} type="submit"><SlidersHorizontal size={15}/> Apply filters</button>
            {hasFilters(params) && <Link className={styles.clear} href="/courses">Clear all filters</Link>}
          </form>
        </aside>

        <div className={styles.results}>
          <div className={styles.resultsToolbar}>
            <div><b>{total.toLocaleString("en-AU")} courses</b><span>{resultsSubtitle(params)}</span></div>
            <form action="/courses" method="get" className={styles.sortForm}>
              {Object.entries(params).filter(([key, value]) => key !== "sort" && key !== "page" && value).map(([key, value]) => <input key={key} type="hidden" name={key} value={value}/>) }
              <label><span>Sort</span><select name="sort" defaultValue={params.sort || "name"} onChange={undefined}><option value="name">Course name</option><option value="tuition-low">Tuition · low to high</option><option value="tuition-high">Tuition · high to low</option><option value="duration">Duration · shortest first</option></select></label>
              <button type="submit">Apply</button>
            </form>
          </div>

          {catalogueResult.error ? (
            <div className={styles.empty}><BookOpen size={30}/><h2>Catalogue unavailable</h2><p>We could not load this course search right now. No course or fee values have been guessed.</p></div>
          ) : courses.length === 0 ? (
            <div className={styles.empty}><Search size={30}/><h2>No courses match these filters</h2><p>Try widening the field, location or tuition filters.</p><Link href="/courses">Reset filters</Link></div>
          ) : (
            <div className={styles.cards}>
              {courses.map((course) => <CourseCard key={course.id} course={course}/>) }
            </div>
          )}

          {totalPages > 1 && !catalogueResult.error && (
            <nav className={styles.pagination} aria-label="Course result pages">
              {safePage > 1 ? <Link href={pageHref(params, safePage - 1)}>← Previous</Link> : <span>← Previous</span>}
              <b>Page {safePage} of {totalPages.toLocaleString("en-AU")}</b>
              {safePage < totalPages ? <Link href={pageHref(params, safePage + 1)}>Next →</Link> : <span>Next →</span>}
            </nav>
          )}
        </div>
      </section>
    </main>
  );
}

function buildCatalogueQuery(supabase: Awaited<ReturnType<typeof createClient>>, params: SearchParams, campusSelect: string, from: number, to: number) {
  let query = supabase
    .from("courses")
    .select(`
      id,
      name,
      qualification_level,
      cricos_code,
      cricos_field_1_broad,
      cricos_duration_weeks,
      duration_months,
      annual_fee,
      cricos_tuition_fee_total,
      cricos_fee_verified_at,
      universities(name),
      ${campusSelect}
    `, { count: "exact" })
    .eq("verification_status", "VERIFIED")
    .not("cricos_code", "is", null);

  if (params.q) {
    const q = params.q.slice(0, 80);
    if (/^[A-Za-z0-9-]{4,14}$/.test(q)) query = query.or(`name.ilike.%${q}%,cricos_code.ilike.%${q}%`);
    else query = query.ilike("name", `%${q}%`);
  }
  if (params.university) query = query.eq("university_id", params.university);
  if (params.field) query = query.eq("cricos_field_1_broad", params.field);
  if (params.qualification) query = query.eq("qualification_level", params.qualification);
  if (params.state) query = query.eq("course_campuses.campuses.state", params.state);
  if (params.regional) query = query.eq("course_campuses.campuses.regional_classification", params.regional);

  if (params.fee === "under-50") query = query.gt("cricos_tuition_fee_total", 100).lt("cricos_tuition_fee_total", 50000);
  if (params.fee === "50-100") query = query.gte("cricos_tuition_fee_total", 50000).lt("cricos_tuition_fee_total", 100000);
  if (params.fee === "100-150") query = query.gte("cricos_tuition_fee_total", 100000).lt("cricos_tuition_fee_total", 150000);
  if (params.fee === "150-plus") query = query.gte("cricos_tuition_fee_total", 150000);

  if (params.duration === "12") query = query.lte("duration_months", 12);
  if (params.duration === "24") query = query.gt("duration_months", 12).lte("duration_months", 24);
  if (params.duration === "36") query = query.gt("duration_months", 24).lte("duration_months", 36);
  if (params.duration === "37+") query = query.gt("duration_months", 36);

  if (params.sort === "tuition-low") query = query.order("cricos_tuition_fee_total", { ascending: true, nullsFirst: false });
  else if (params.sort === "tuition-high") query = query.order("cricos_tuition_fee_total", { ascending: false, nullsFirst: false });
  else if (params.sort === "duration") query = query.order("duration_months", { ascending: true, nullsFirst: false });
  else query = query.order("name", { ascending: true });

  return query.range(from, to);
}

function CourseCard({ course }: { course: CourseRow }) {
  const campuses = course.course_campuses.map((item) => item.campuses).filter((campus): campus is Campus => Boolean(campus));
  const firstCampus = campuses[0] ?? null;
  const fee = feeDetails(course);

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <span className={styles.university}>{course.universities?.name ?? "Australian university"}</span>
          <h2><Link href={`/courses/${course.id}`}>{course.name}</Link></h2>
          <div className={styles.meta}>
            <span><GraduationCap size={14}/>{course.qualification_level}</span>
            {course.cricos_code && <span>CRICOS {course.cricos_code}</span>}
          </div>
        </div>
        <SaveCourseButton courseId={course.id} compact/>
      </div>

      <div className={styles.evidenceGrid}>
        <div><WalletCards size={16}/><span><small>Tuition evidence</small><b>{fee.primary}</b><em>{fee.secondary}</em></span></div>
        <div><Clock3 size={16}/><span><small>Duration</small><b>{durationLabel(course)}</b><em>{course.cricos_duration_weeks ? `${course.cricos_duration_weeks} CRICOS weeks` : "Source pending"}</em></span></div>
        <div><MapPin size={16}/><span><small>Campus</small><b>{firstCampus ? `${firstCampus.city}, ${firstCampus.state}` : "Location pending"}</b><em>{campuses.length > 1 ? `${campuses.length} registered locations` : firstCampus?.name ?? "No CRICOS mapping"}</em></span></div>
      </div>

      <div className={styles.cardFoot}>
        <div className={styles.tags}>
          {course.cricos_field_1_broad && <span>{fieldLabel(course.cricos_field_1_broad)}</span>}
          {firstCampus?.regional_verified && firstCampus.regional_classification && <span className={firstCampus.regional ? styles.regionalTag : styles.cityTag}>{categoryShort(firstCampus.regional_classification)}</span>}
          {!firstCampus?.regional_verified && firstCampus && <span>Regional status pending</span>}
        </div>
        <div className={styles.actions}>
          <CompareCourseToggle courseId={course.id}/>
          <Link className={styles.detailsLink} href={`/courses/${course.id}`}>Course details <ArrowRight size={14}/></Link>
        </div>
      </div>
    </article>
  );
}

function feeDetails(course: CourseRow) {
  if (course.annual_fee && course.annual_fee > 0) return { primary: money(course.annual_fee) + "/year", secondary: "University annual fee" };
  if (course.cricos_tuition_fee_total && course.cricos_tuition_fee_total > 100) {
    const years = course.cricos_duration_weeks && course.cricos_duration_weeks > 0 ? course.cricos_duration_weeks / 52 : null;
    const annualised = years ? Math.round(course.cricos_tuition_fee_total / years) : null;
    return {
      primary: money(course.cricos_tuition_fee_total) + " total",
      secondary: annualised ? `~${money(annualised)}/year annualised from CRICOS` : "Official CRICOS whole-course tuition",
    };
  }
  return { primary: "Pending verification", secondary: "No usable source-backed fee yet" };
}

function durationLabel(course: CourseRow) {
  if (!course.duration_months) return "Pending verification";
  if (course.duration_months < 12) return `${course.duration_months} months`;
  const years = course.duration_months / 12;
  return Number.isInteger(years) ? `${years} ${years === 1 ? "year" : "years"}` : `${years.toFixed(1)} years`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}

function fieldLabel(value: string) {
  return value.replace(/^\d{2}\s*-\s*/, "");
}

function categoryShort(value: string) {
  if (value.startsWith("CATEGORY_1")) return "Home Affairs Category 1";
  if (value.startsWith("CATEGORY_2")) return "Home Affairs Category 2 · Regional";
  if (value.startsWith("CATEGORY_3")) return "Home Affairs Category 3 · Regional";
  return "Regional classification verified";
}

function normaliseParams(raw: SearchParams): SearchParams {
  const clean = (value?: string) => (value ?? "").trim().slice(0, 120);
  return {
    q: clean(raw.q), university: clean(raw.university), field: clean(raw.field), qualification: clean(raw.qualification),
    state: clean(raw.state), regional: clean(raw.regional), fee: clean(raw.fee), duration: clean(raw.duration), sort: clean(raw.sort), page: clean(raw.page),
  };
}

function hasFilters(params: SearchParams) {
  return Boolean(params.q || params.university || params.field || params.qualification || params.state || params.regional || params.fee || params.duration);
}

function resultsSubtitle(params: SearchParams) {
  const parts = [
    params.q ? `matching “${params.q}”` : "",
    params.field ? fieldLabel(params.field) : "",
    params.state || "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Across the active Australian university CRICOS catalogue";
}

function pageHref(params: SearchParams, page: number) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (key !== "page" && value) search.set(key, value);
  });
  search.set("page", String(page));
  return `/courses?${search.toString()}`;
}
