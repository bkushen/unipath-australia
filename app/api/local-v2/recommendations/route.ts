import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const COURSE_BATCH_SIZE = 1000;
const ENRICHMENT_SHORTLIST_SIZE = 300;
const RESULT_LIMIT = 12;
const PRIMARY_UNIVERSITY_LIMIT = 2;
const PRIMARY_CAMPUS_LIMIT = 2;

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const words = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function textScore(query: string, ...values: Array<string | null | undefined>) {
  if (!query.trim()) return 70;
  const queryWords = words(query);
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return 50;
  if (haystack.includes(query.toLowerCase())) return 100;
  const overlap = queryWords.filter((word) => haystack.includes(word)).length;
  return clamp(45 + overlap * 18);
}

type CareerDomain = { triggers: string[]; courseTerms: string[] };
type OscaOccupationRow = {
  code: string;
  name: string;
  classification_level: string;
  description: string | null;
  alternative_titles: string[] | null;
  specialisations: string[] | null;
  source_url: string | null;
  source_release: string | null;
  verified_at: string | null;
};

const careerDomains: CareerDomain[] = [
  { triggers: ["software", "programmer", "developer", "web", "mobile", "app developer", "computer programmer"], courseTerms: ["software", "programming", "computer science", "computing", "information technology", "web", "mobile", "application development"] },
  { triggers: ["security", "cyber"], courseTerms: ["cyber", "security", "information security", "network security", "computing", "information technology"] },
  { triggers: ["database", "data scientist", "data analyst", "data engineer", "analytics"], courseTerms: ["database", "data science", "data analytics", "analytics", "statistics", "information technology", "computing"] },
  { triggers: ["network", "cloud", "devops", "systems administrator", "systems architect"], courseTerms: ["network", "cloud", "devops", "systems", "infrastructure", "information technology", "computing"] },
  { triggers: ["business analyst", "systems analyst", "business and systems analyst"], courseTerms: ["business analytics", "business information systems", "information systems", "information technology", "business analysis", "analytics"] },
  { triggers: ["accountant", "auditor", "taxation", "bookkeeper"], courseTerms: ["accounting", "accountancy", "commerce", "business", "finance", "taxation", "audit"] },
  { triggers: ["finance", "financial analyst", "investment", "economist", "banking"], courseTerms: ["finance", "financial", "economics", "commerce", "banking", "investment", "business"] },
  { triggers: ["marketing", "advertising", "market research", "public relations", "communications"], courseTerms: ["marketing", "advertising", "public relations", "communications", "media", "business"] },
  { triggers: ["human resources", "hr manager", "recruitment", "workplace relations"], courseTerms: ["human resource", "human resources", "management", "business", "employment relations", "workplace relations"] },
  { triggers: ["project manager", "contract manager", "manager", "consultant"], courseTerms: ["project management", "management", "business", "commerce", "enterprise", "leadership"] },
  { triggers: ["registered nurse", "nurse", "nursing"], courseTerms: ["nursing", "nurse", "clinical", "health", "midwifery"] },
  { triggers: ["midwife", "midwifery"], courseTerms: ["midwifery", "nursing", "maternal", "health"] },
  { triggers: ["physiotherapist", "physiotherapy", "physical therapist"], courseTerms: ["physiotherapy", "physical therapy", "rehabilitation", "health science", "allied health"] },
  { triggers: ["occupational therapist", "occupational therapy"], courseTerms: ["occupational therapy", "rehabilitation", "allied health", "health science"] },
  { triggers: ["psychologist", "psychology"], courseTerms: ["psychology", "psychological", "behavioural science", "behavioral science"] },
  { triggers: ["social worker", "social work"], courseTerms: ["social work", "human services", "community services", "welfare"] },
  { triggers: ["pharmacist", "pharmacy"], courseTerms: ["pharmacy", "pharmaceutical", "pharmacology", "health"] },
  { triggers: ["dentist", "dental"], courseTerms: ["dentistry", "dental", "oral health"] },
  { triggers: ["doctor", "medical practitioner", "physician", "surgeon", "medicine"], courseTerms: ["medicine", "medical", "clinical", "health science"] },
  { triggers: ["radiographer", "medical imaging", "sonographer"], courseTerms: ["medical imaging", "radiography", "radiation", "sonography", "diagnostic imaging"] },
  { triggers: ["nutritionist", "dietitian", "dietician", "nutrition"], courseTerms: ["nutrition", "dietetics", "dietetic", "food science", "health science"] },
  { triggers: ["civil engineer", "structural engineer"], courseTerms: ["civil engineering", "structural engineering", "construction engineering", "engineering"] },
  { triggers: ["mechanical engineer"], courseTerms: ["mechanical engineering", "mechatronic", "engineering"] },
  { triggers: ["electrical engineer", "electronics engineer"], courseTerms: ["electrical engineering", "electronic engineering", "electronics", "engineering"] },
  { triggers: ["chemical engineer", "process engineer"], courseTerms: ["chemical engineering", "process engineering", "engineering", "chemistry"] },
  { triggers: ["environmental engineer"], courseTerms: ["environmental engineering", "environment", "sustainability", "engineering"] },
  { triggers: ["mining engineer", "petroleum engineer"], courseTerms: ["mining engineering", "petroleum engineering", "resources engineering", "engineering"] },
  { triggers: ["architect", "architecture"], courseTerms: ["architecture", "architectural", "built environment", "design"] },
  { triggers: ["quantity surveyor", "surveyor", "construction manager"], courseTerms: ["quantity surveying", "surveying", "construction management", "construction", "built environment"] },
  { triggers: ["urban planner", "town planner", "planner"], courseTerms: ["urban planning", "town planning", "planning", "built environment"] },
  { triggers: ["teacher", "secondary teacher", "primary teacher", "early childhood teacher", "educator"], courseTerms: ["teaching", "education", "teacher", "early childhood", "primary education", "secondary education"] },
  { triggers: ["lawyer", "solicitor", "barrister", "legal practitioner"], courseTerms: ["law", "legal", "juris doctor"] },
  { triggers: ["criminologist", "criminology", "criminal justice"], courseTerms: ["criminology", "criminal justice", "justice", "law"] },
  { triggers: ["scientist", "chemist", "physicist", "biologist", "microbiologist"], courseTerms: ["science", "chemistry", "physics", "biology", "biological science", "microbiology", "natural science"] },
  { triggers: ["biomedical scientist", "medical laboratory scientist", "laboratory scientist"], courseTerms: ["biomedical science", "medical laboratory", "laboratory medicine", "medical science", "pathology"] },
  { triggers: ["environmental scientist", "environmental consultant", "conservation scientist"], courseTerms: ["environmental science", "environment", "conservation", "sustainability", "ecology"] },
  { triggers: ["agricultural scientist", "agronomist", "agriculture"], courseTerms: ["agriculture", "agricultural science", "agronomy", "plant science", "animal science"] },
  { triggers: ["veterinarian", "veterinary"], courseTerms: ["veterinary", "veterinary science", "animal health"] },
  { triggers: ["chef", "cook", "hospitality manager"], courseTerms: ["cookery", "culinary", "hospitality", "commercial cookery", "food service"] },
  { triggers: ["electrician", "electrical trades"], courseTerms: ["electrotechnology", "electrical", "electrician", "trade"] },
  { triggers: ["plumber", "plumbing"], courseTerms: ["plumbing", "construction", "building services", "trade"] },
  { triggers: ["carpenter", "joiner", "carpentry"], courseTerms: ["carpentry", "building", "construction", "joinery", "trade"] },
  { triggers: ["motor mechanic", "automotive mechanic", "mechanic", "automotive technician"], courseTerms: ["automotive", "mechanical technology", "vehicle", "mechanic", "trade"] },
  { triggers: ["graphic designer", "designer", "illustrator"], courseTerms: ["graphic design", "design", "visual communication", "illustration", "creative arts"] },
  { triggers: ["journalist", "writer", "editor", "media producer"], courseTerms: ["journalism", "media", "writing", "communications", "publishing"] },
  { triggers: ["film", "television", "screen producer", "animator"], courseTerms: ["film", "television", "screen", "animation", "media", "creative arts"] },
];

function inferredCareerScore(occupation: string, oscaOccupation: OscaOccupationRow | null, ...courseValues: Array<string | null | undefined>) {
  if (!occupation.trim()) return 70;
  const direct = textScore(occupation, ...courseValues);
  const occupationText = [
    occupation,
    oscaOccupation?.name,
    ...(oscaOccupation?.alternative_titles ?? []),
    ...(oscaOccupation?.specialisations ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
  const haystack = courseValues.filter(Boolean).join(" ").toLowerCase();
  let domainScore = 45;
  for (const domain of careerDomains) {
    if (!domain.triggers.some((trigger) => occupationText.includes(trigger))) continue;
    const matches = domain.courseTerms.filter((term) => haystack.includes(term)).length;
    if (matches > 0) domainScore = Math.max(domainScore, clamp(68 + matches * 7));
  }
  return Math.max(direct, domainScore);
}

function affordabilityScore(totalFee: number | null, annualFee: number | null, fullBudget: number, semesterBudget: number) {
  if (!annualFee && !totalFee) return 60;
  const effectiveAnnual = annualFee ?? (totalFee ? totalFee / 2 : null);
  const semester = effectiveAnnual ? effectiveAnnual / 2 : null;
  const ratio = (cost: number | null, budget: number) => {
    if (!cost || budget <= 0) return 60;
    const r = cost / budget;
    if (r <= 0.8) return 100;
    if (r <= 1) return clamp(100 - (r - 0.8) * 100);
    return clamp(80 - (r - 1) * 120);
  };
  return clamp(ratio(semester, semesterBudget) * 0.45 + ratio(totalFee, fullBudget) * 0.55);
}

type CourseRow = {
  id: string;
  university_id: string;
  study_field_id: string | null;
  name: string;
  qualification_level: string | null;
  cricos_code: string | null;
  duration_months: number | null;
  annual_fee: number | string | null;
  total_fee: number | string | null;
  currency: string | null;
  delivery_mode: string | null;
  official_course_url: string | null;
  cricos_tuition_fee_total: number | string | null;
  cricos_estimated_total_cost: number | string | null;
  cricos_fee_source_url: string | null;
  cricos_fee_verified_at: string | null;
  cricos_expired: boolean | null;
};

type FeeRow = {
  course_id: string;
  fee_year: number | null;
  student_type: string | null;
  annual_fee: number | string | null;
  total_fee: number | string | null;
  currency: string | null;
  source_url: string | null;
  verified_at: string | null;
  verification_status: string | null;
};

function resolveCourseFees(course: CourseRow, override?: FeeRow) {
  const durationYears = course.duration_months ? Math.max(Number(course.duration_months) / 12, 1) : null;
  const overrideStatus = override?.verification_status?.toUpperCase() ?? null;

  if (override && (overrideStatus === "VERIFIED" || overrideStatus === "ESTIMATED") && (override.annual_fee != null || override.total_fee != null)) {
    const totalFee = override.total_fee == null ? null : Number(override.total_fee);
    const annualFee = override.annual_fee != null ? Number(override.annual_fee) : totalFee && durationYears ? totalFee / durationYears : null;
    return {
      annualFee,
      totalFee,
      currency: override.currency || course.currency || "AUD",
      source: overrideStatus === "VERIFIED" ? "verified_course_fee" as const : "estimated_course_fee" as const,
      feeYear: override.fee_year,
      sourceUrl: override.source_url,
      verifiedAt: override.verified_at,
      verificationStatus: overrideStatus,
      derivedAnnual: override.annual_fee == null && annualFee != null,
    };
  }

  if (course.annual_fee != null || course.total_fee != null) {
    const totalFee = course.total_fee == null ? null : Number(course.total_fee);
    const annualFee = course.annual_fee != null ? Number(course.annual_fee) : totalFee && durationYears ? totalFee / durationYears : null;
    return {
      annualFee,
      totalFee,
      currency: course.currency || "AUD",
      source: "course_record" as const,
      feeYear: null,
      sourceUrl: null,
      verifiedAt: null,
      verificationStatus: null,
      derivedAnnual: course.annual_fee == null && annualFee != null,
    };
  }

  if (course.cricos_tuition_fee_total != null) {
    const totalFee = Number(course.cricos_tuition_fee_total);
    const annualFee = durationYears ? totalFee / durationYears : null;
    return {
      annualFee,
      totalFee,
      currency: course.currency || "AUD",
      source: "cricos_tuition_total" as const,
      feeYear: null,
      sourceUrl: course.cricos_fee_source_url,
      verifiedAt: course.cricos_fee_verified_at,
      verificationStatus: course.cricos_fee_verified_at ? "source_dated" : null,
      derivedAnnual: annualFee != null,
    };
  }

  return {
    annualFee: null,
    totalFee: null,
    currency: course.currency || "AUD",
    source: "unavailable" as const,
    feeYear: null,
    sourceUrl: null,
    verifiedAt: null,
    verificationStatus: null,
    derivedAnnual: false,
  };
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const params = request.nextUrl.searchParams;
  const study = (params.get("study") ?? "").trim().slice(0, 100);
  const field = (params.get("field") ?? "").trim().slice(0, 100);
  const occupation = (params.get("occupation") ?? "").trim().slice(0, 100);
  const location = (params.get("location") ?? "").trim().slice(0, 100);
  const states = (params.get("states") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const regionalAccepted = params.get("regionalAccepted") !== "false";
  const migrationImportance = params.get("migrationImportance") ?? "none";
  const scholarshipImportance = params.get("scholarshipImportance") ?? "prefer";
  const semesterBudget = Number(params.get("semesterBudget") ?? 20000);
  const fullBudget = Number(params.get("fullBudget") ?? 80000);

  try {
    const oscaLookup = occupation
      ? supabase
          .from("osca_occupations")
          .select("code,name,classification_level,description,alternative_titles,specialisations,source_url,source_release,verified_at")
          .eq("classification_level", "occupation")
          .ilike("name", occupation)
          .limit(1)
      : Promise.resolve({ data: [], error: null });

    const [{ data: studyFields, error: studyFieldError }, { data: feeRows, error: feeRowsError }, { data: oscaRows, error: oscaError }] = await Promise.all([
      supabase.from("study_fields").select("id,name"),
      supabase.from("course_fees").select("course_id,fee_year,student_type,annual_fee,total_fee,currency,source_url,verified_at,verification_status").order("fee_year", { ascending: false, nullsFirst: false }),
      oscaLookup,
    ]);
    if (studyFieldError) throw studyFieldError;
    if (feeRowsError) throw feeRowsError;
    if (oscaError) throw oscaError;

    const oscaOccupation = ((oscaRows ?? [])[0] as OscaOccupationRow | undefined) ?? null;
    const fieldMap = new Map((studyFields ?? []).map((item) => [item.id, item.name]));
    const latestInternationalFeeByCourse = new Map<string, FeeRow>();
    for (const row of (feeRows ?? []) as FeeRow[]) {
      if (!row.student_type?.toLowerCase().includes("international")) continue;
      if (!latestInternationalFeeByCourse.has(row.course_id)) latestInternationalFeeByCourse.set(row.course_id, row);
    }

    const allCourses: CourseRow[] = [];
    for (let from = 0; ; from += COURSE_BATCH_SIZE) {
      const { data: batch, error: batchError } = await supabase
        .from("courses")
        .select("id,university_id,study_field_id,name,qualification_level,cricos_code,duration_months,annual_fee,total_fee,currency,delivery_mode,official_course_url,cricos_tuition_fee_total,cricos_estimated_total_cost,cricos_fee_source_url,cricos_fee_verified_at,cricos_expired")
        .or("cricos_expired.is.null,cricos_expired.eq.false")
        .order("id")
        .range(from, from + COURSE_BATCH_SIZE - 1);
      if (batchError) throw batchError;
      if (!batch?.length) break;
      allCourses.push(...(batch as CourseRow[]));
      if (batch.length < COURSE_BATCH_SIZE) break;
    }

    if (!allCourses.length) {
      return NextResponse.json({ recommendations: [], totalCandidates: 0, enrichedCandidates: 0, source: "SUPABASE" });
    }

    const feeCoverage = { verifiedCourseFee: 0, estimatedCourseFee: 0, courseRecord: 0, cricosTuitionTotal: 0, unavailable: 0 };
    const preliminary = allCourses
      .map((course) => {
        const studyField = course.study_field_id ? fieldMap.get(course.study_field_id) ?? null : null;
        const academic = textScore(study || field, studyField, course.name, course.qualification_level);
        const career = inferredCareerScore(occupation, oscaOccupation, course.name, studyField, course.qualification_level);
        const fee = resolveCourseFees(course, latestInternationalFeeByCourse.get(course.id));
        if (fee.source === "verified_course_fee") feeCoverage.verifiedCourseFee += 1;
        else if (fee.source === "estimated_course_fee") feeCoverage.estimatedCourseFee += 1;
        else if (fee.source === "course_record") feeCoverage.courseRecord += 1;
        else if (fee.source === "cricos_tuition_total") feeCoverage.cricosTuitionTotal += 1;
        else feeCoverage.unavailable += 1;
        const affordability = affordabilityScore(fee.totalFee, fee.annualFee, fullBudget, semesterBudget);
        const studyPreference = textScore(study, course.name, studyField);
        const feeConfidenceAdjustment = fee.source === "unavailable" ? -3 : fee.source === "cricos_tuition_total" ? -1 : fee.source === "estimated_course_fee" ? 0 : 2;
        const preliminaryScore = clamp(academic * 0.32 + career * 0.38 + affordability * 0.20 + studyPreference * 0.10 + feeConfidenceAdjustment);
        return { course, studyField, academic, career, affordability, preliminaryScore, fee };
      })
      .sort((a, b) => b.preliminaryScore - a.preliminaryScore)
      .slice(0, ENRICHMENT_SHORTLIST_SIZE);

    const courses = preliminary.map((item) => item.course);
    const universityIds = [...new Set(courses.map((item) => item.university_id).filter(Boolean))];
    const courseIds = courses.map((item) => item.id);

    const [{ data: universities, error: universityError }, { data: campusLinks, error: campusLinkError }, { data: occupationLinks, error: occupationLinkError }, { data: scholarshipLinks, error: scholarshipLinkError }, { data: skilledLinks, error: skilledLinkError }] = await Promise.all([
      supabase.from("universities").select("id,name,website,logo_url,cricos_code").in("id", universityIds),
      supabase.from("course_campuses").select("course_id,campus_id").in("course_id", courseIds),
      supabase.from("course_occupations").select("course_id,occupation_id,alignment_score").in("course_id", courseIds),
      supabase.from("course_scholarships").select("course_id,scholarship_id").in("course_id", courseIds),
      supabase.from("course_skilled_occupation_links").select("course_id,skilled_occupation_id,confidence").in("course_id", courseIds),
    ]);
    if (universityError) throw universityError;
    if (campusLinkError) throw campusLinkError;
    if (occupationLinkError) throw occupationLinkError;
    if (scholarshipLinkError) throw scholarshipLinkError;
    if (skilledLinkError) throw skilledLinkError;

    const campusIds = [...new Set((campusLinks ?? []).map((item) => item.campus_id))];
    const occupationIds = [...new Set((occupationLinks ?? []).map((item) => item.occupation_id))];
    const scholarshipIds = [...new Set((scholarshipLinks ?? []).map((item) => item.scholarship_id))];

    const [{ data: campuses, error: campusError }, { data: occupations, error: occupationError }, { data: scholarships, error: scholarshipError }, { data: livingCosts, error: livingCostError }] = await Promise.all([
      campusIds.length ? supabase.from("campuses").select("id,name,city,state,postcode,regional,regional_verified,regional_classification").in("id", campusIds) : Promise.resolve({ data: [], error: null }),
      occupationIds.length ? supabase.from("occupations").select("id,name").in("id", occupationIds) : Promise.resolve({ data: [], error: null }),
      scholarshipIds.length ? supabase.from("scholarships").select("id,name,amount,percentage").in("id", scholarshipIds) : Promise.resolve({ data: [], error: null }),
      campusIds.length ? supabase.from("living_costs").select("campus_id,weekly_low,weekly_high,monthly_estimate,verification_status").in("campus_id", campusIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (campusError) throw campusError;
    if (occupationError) throw occupationError;
    if (scholarshipError) throw scholarshipError;
    if (livingCostError) throw livingCostError;

    const preliminaryMap = new Map(preliminary.map((item) => [item.course.id, item]));
    const universityMap = new Map((universities ?? []).map((item) => [item.id, item]));
    const campusMap = new Map((campuses ?? []).map((item) => [item.id, item]));
    const occupationMap = new Map((occupations ?? []).map((item) => [item.id, item.name]));
    const scholarshipMap = new Map((scholarships ?? []).map((item) => [item.id, item]));
    const livingMap = new Map((livingCosts ?? []).map((item) => [item.campus_id, item]));

    const campusesByCourse = new Map<string, string[]>();
    for (const link of campusLinks ?? []) campusesByCourse.set(link.course_id, [...(campusesByCourse.get(link.course_id) ?? []), link.campus_id]);
    const occupationsByCourse = new Map<string, Array<{ id: string; score: number | null }>>();
    for (const link of occupationLinks ?? []) occupationsByCourse.set(link.course_id, [...(occupationsByCourse.get(link.course_id) ?? []), { id: link.occupation_id, score: link.alignment_score }]);
    const scholarshipsByCourse = new Map<string, string[]>();
    for (const link of scholarshipLinks ?? []) scholarshipsByCourse.set(link.course_id, [...(scholarshipsByCourse.get(link.course_id) ?? []), link.scholarship_id]);
    const migrationByCourse = new Map<string, number>();
    for (const link of skilledLinks ?? []) migrationByCourse.set(link.course_id, Math.max(migrationByCourse.get(link.course_id) ?? 0, link.confidence === "high" ? 90 : link.confidence === "medium" ? 75 : 60));

    const rankedRecommendations = courses.flatMap((course) => {
      const university = universityMap.get(course.university_id);
      const linkedCampusIds = campusesByCourse.get(course.id) ?? [];
      const linkedCampuses = linkedCampusIds.map((id) => campusMap.get(id)).filter(Boolean);
      const base = preliminaryMap.get(course.id);
      if (!university || linkedCampuses.length === 0 || !base) return [];

      const bestCampus = linkedCampuses
        .map((campus) => {
          const stateMatch = states.length === 0 || states.includes(campus!.state ?? "");
          const locationMatch = !location || textScore(location, campus!.name, campus!.city, campus!.state) >= 80;
          const regionalBonus = campus!.regional && regionalAccepted ? 8 : 0;
          const score = clamp((stateMatch ? 88 : 45) + (locationMatch ? 7 : 0) + regionalBonus);
          return { campus: campus!, score };
        })
        .sort((a, b) => b.score - a.score)[0];

      const linkedOccupationRows = occupationsByCourse.get(course.id) ?? [];
      const occupationNames = linkedOccupationRows.map((item) => occupationMap.get(item.id)).filter(Boolean) as string[];
      const explicitCareerScores = occupationNames.map((name) => textScore(occupation, name));
      const bestExplicitCareerScore = explicitCareerScores.length ? Math.max(...explicitCareerScores) : null;
      const career = bestExplicitCareerScore == null ? base.career : Math.max(base.career, bestExplicitCareerScore);
      const careerMatchSource = bestExplicitCareerScore != null && bestExplicitCareerScore >= base.career
        ? "explicit_mapping"
        : oscaOccupation
          ? "osca_metadata_inference"
          : "inferred_text";

      const scholarshipIdsForCourse = scholarshipsByCourse.get(course.id) ?? [];
      const linkedScholarships = scholarshipIdsForCourse.map((id) => scholarshipMap.get(id)).filter(Boolean);
      const bestScholarship = linkedScholarships.sort((a, b) => (Number(b!.percentage ?? 0) - Number(a!.percentage ?? 0)) || (Number(b!.amount ?? 0) - Number(a!.amount ?? 0)))[0] ?? null;
      const scholarshipBoost = scholarshipImportance === "high" ? (bestScholarship ? 8 : -10) : scholarshipImportance === "prefer" ? (bestScholarship ? 5 : 0) : 0;
      const migration = migrationByCourse.get(course.id) ?? 45;
      const migrationWeight = migrationImportance === "high" ? 0.2 : migrationImportance === "consider" ? 0.1 : 0;
      const affordabilityWeight = base.fee.source === "unavailable" ? 0.10 : base.fee.source === "cricos_tuition_total" ? 0.14 : base.fee.source === "estimated_course_fee" ? 0.16 : 0.20;
      const redistributedAcademicWeight = base.fee.source === "unavailable" ? 0.31 : base.fee.source === "cricos_tuition_total" ? 0.29 : base.fee.source === "estimated_course_fee" ? 0.28 : 0.26;
      const redistributedCareerWeight = base.fee.source === "unavailable" ? 0.39 : base.fee.source === "cricos_tuition_total" ? 0.37 : base.fee.source === "estimated_course_fee" ? 0.36 : 0.34;
      const baseOverall = base.academic * redistributedAcademicWeight + career * redistributedCareerWeight + base.affordability * affordabilityWeight + bestCampus.score * 0.20;
      const overall = clamp(baseOverall * (1 - migrationWeight) + migration * migrationWeight + scholarshipBoost);
      const living = livingMap.get(bestCampus.campus.id) ?? null;

      return [{
        course: {
          id: course.id,
          name: course.name,
          qualificationLevel: course.qualification_level,
          cricosCode: course.cricos_code,
          durationMonths: course.duration_months,
          annualFee: base.fee.annualFee,
          totalFee: base.fee.totalFee,
          currency: base.fee.currency,
          deliveryMode: course.delivery_mode,
          officialCourseUrl: course.official_course_url,
          studyField: base.studyField,
        },
        feeEvidence: {
          source: base.fee.source,
          feeYear: base.fee.feeYear,
          derivedAnnual: base.fee.derivedAnnual,
          sourceUrl: base.fee.sourceUrl,
          verifiedAt: base.fee.verifiedAt,
          verificationStatus: base.fee.verificationStatus,
          note: base.fee.source === "verified_course_fee"
            ? (base.fee.derivedAnnual
              ? "Verified fee evidence is loaded; the annual amount shown is derived from the loaded total and course duration."
              : "Verified direct/source-supported tuition evidence is loaded for this course.")
            : base.fee.source === "estimated_course_fee"
              ? "Estimated tuition evidence is loaded for this course. Treat it as a planning estimate and confirm the current fee with the university before applying."
              : base.fee.source === "cricos_tuition_total"
                ? "Annual tuition is derived from the CRICOS total tuition amount and course duration; it is not presented as a verified direct annual fee."
                : base.fee.source === "unavailable"
                  ? "No tuition amount is currently loaded, so affordability has reduced influence on this recommendation."
                  : base.fee.derivedAnnual
                    ? "Annual tuition is derived from a loaded total tuition amount and course duration."
                    : "A tuition amount is available in the course record; confirm the current international fee with the university.",
        },
        university: { id: university.id, name: university.name, website: university.website, logoUrl: university.logo_url, cricosCode: university.cricos_code },
        campus: bestCampus.campus,
        scholarship: bestScholarship ? { id: bestScholarship.id, name: bestScholarship.name, percentage: bestScholarship.percentage == null ? null : Number(bestScholarship.percentage), amount: bestScholarship.amount == null ? null : Number(bestScholarship.amount) } : null,
        livingCost: living ? { weeklyLow: Number(living.weekly_low), weeklyHigh: Number(living.weekly_high), monthlyEstimate: Number(living.monthly_estimate), status: living.verification_status } : null,
        careerMatch: {
          source: careerMatchSource,
          linkedOccupations: occupationNames,
          oscaOccupation: oscaOccupation ? { code: oscaOccupation.code, name: oscaOccupation.name, sourceRelease: oscaOccupation.source_release } : null,
        },
        scores: { academic: base.academic, career, affordability: base.affordability, location: bestCampus.score, migration, overall },
        reasons: [
          base.academic >= 80 ? "Strong study-field match." : null,
          career >= 80 && careerMatchSource === "explicit_mapping" ? "Strong career match from an explicit course-to-career mapping." : null,
          career >= 80 && careerMatchSource === "osca_metadata_inference" ? "Strong career relevance inferred from the selected ABS OSCA occupation name and its official alternative titles/specialisations, compared with the course name and study field." : null,
          career >= 80 && careerMatchSource === "inferred_text" ? "Strong career relevance inferred from the course name and study field." : null,
          base.affordability >= 80 && base.fee.source !== "unavailable" ? "Tuition is within or close to the stated budget using available fee evidence." : null,
          base.fee.source === "unavailable" ? "Tuition is not loaded, so affordability is not treated as strong evidence for or against this course." : null,
          bestCampus.score >= 85 ? "Campus matches the selected location preferences." : null,
          bestScholarship ? "A verified scholarship record is linked to this course." : null,
          living ? "A source-dated living-cost estimate is available for this campus." : null,
        ].filter(Boolean),
      }];
    }).sort((a, b) => b.scores.overall - a.scores.overall);

    const recommendations: typeof rankedRecommendations = [];
    const selectedCourseIds = new Set<string>();
    const universityCounts = new Map<string, number>();
    const campusCounts = new Map<string, number>();

    for (const candidate of rankedRecommendations) {
      if (recommendations.length >= RESULT_LIMIT) break;
      const universityCount = universityCounts.get(candidate.university.id) ?? 0;
      const campusCount = campusCounts.get(candidate.campus.id) ?? 0;
      if (universityCount >= PRIMARY_UNIVERSITY_LIMIT || campusCount >= PRIMARY_CAMPUS_LIMIT) continue;
      recommendations.push(candidate);
      selectedCourseIds.add(candidate.course.id);
      universityCounts.set(candidate.university.id, universityCount + 1);
      campusCounts.set(candidate.campus.id, campusCount + 1);
    }

    if (recommendations.length < RESULT_LIMIT) {
      for (const candidate of rankedRecommendations) {
        if (recommendations.length >= RESULT_LIMIT) break;
        if (selectedCourseIds.has(candidate.course.id)) continue;
        recommendations.push(candidate);
        selectedCourseIds.add(candidate.course.id);
      }
    }

    return NextResponse.json({
      recommendations,
      totalCandidates: allCourses.length,
      enrichedCandidates: courses.length,
      source: "SUPABASE_FULL_CATALOGUE",
      careerGoalEvidence: oscaOccupation ? {
        source: "ABS_OSCA_2024",
        code: oscaOccupation.code,
        name: oscaOccupation.name,
        sourceRelease: oscaOccupation.source_release,
        sourceUrl: oscaOccupation.source_url,
        verifiedAt: oscaOccupation.verified_at,
        note: "OSCA identifies the occupation. Course relevance is still a UniPath inference unless an explicit course-to-career mapping is loaded.",
      } : null,
      careerMatching: oscaOccupation ? "osca_metadata_inference_plus_explicit_mappings" : "expanded_multidomain_inference_plus_explicit_mappings",
      feeCoverage,
      feeMethod: "verified_course_fee_then_estimated_course_fee_then_course_record_then_cricos_tuition_total",
      diversity: {
        primaryUniversityLimit: PRIMARY_UNIVERSITY_LIMIT,
        primaryCampusLimit: PRIMARY_CAMPUS_LIMIT,
        representedUniversities: new Set(recommendations.map((item) => item.university.id)).size,
        representedCampuses: new Set(recommendations.map((item) => item.campus.id)).size,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Live recommendations failed", detail);
    return NextResponse.json({ recommendations: [], error: "Unable to calculate live recommendations.", detail }, { status: 500 });
  }
}
