import { createClient } from "@/lib/supabase/client";
import { scoreCourse, type CourseCandidate, type StudentAssessment } from "@/lib/recommendation";

type CampusCore = {
  name: string;
  city: string;
  state: string;
  regional: boolean;
  regional_verified: boolean;
  living_costs?: Array<{
    category: string;
    monthly_estimate: number | string | null;
    verification_status: string;
  }>;
};

type RawCourseLight = {
  id: string;
  name: string;
  qualification_level: string;
  duration_months: number | null;
  annual_fee: number | string | null;
  cricos_code: string | null;
  cricos_field_1_broad: string | null;
  cricos_tuition_fee_total: number | string | null;
  cricos_duration_weeks: number | string | null;
  cricos_fee_source_url: string | null;
  cricos_fee_verified_at: string | null;
  university_course_code: string | null;
  source_url: string | null;
  verification_status: string;
  universities: { name: string } | null;
  study_fields: { name: string } | null;
  course_campuses: Array<{ campuses: CampusCore | null }>;
};

type RawCourse = RawCourseLight & {
  course_fees: Array<{
    fee_year: number;
    student_type: string;
    annual_fee: number | string | null;
    total_fee: number | string | null;
    source_url: string | null;
    verified_at: string | null;
    verification_status: string;
  }>;
  course_occupations: Array<{
    occupations: { name: string } | null;
  }>;
  course_accreditations: Array<{
    body_name: string;
    status: string | null;
  }>;
  course_skilled_occupation_links: Array<{
    confidence: string;
    skilled_occupations: {
      name: string;
      skilled_occupation_programs: Array<{
        migration_programs: { subclass: string } | null;
      }>;
    } | null;
  }>;
};

export type CourseCatalogResult = {
  courses: CourseCandidate[];
  scannedCount: number;
  broadField: string | null;
};

const LIGHT_PAGE_SIZE = 750;
const MAX_UNCLASSIFIED = 100;
const DETAILED_CANDIDATE_LIMIT = 400;
const DETAIL_BATCH_SIZE = 80;
const NO_FIELD_SCAN_LIMIT = 1200;

const LIGHT_SELECT = `
  id,
  name,
  qualification_level,
  duration_months,
  annual_fee,
  cricos_code,
  cricos_field_1_broad,
  cricos_tuition_fee_total,
  cricos_duration_weeks,
  cricos_fee_source_url,
  cricos_fee_verified_at,
  university_course_code,
  source_url,
  verification_status,
  universities(name),
  study_fields(name),
  course_campuses(campuses(name, city, state, regional, regional_verified))
`;

const DETAIL_SELECT = `
  id,
  name,
  qualification_level,
  duration_months,
  annual_fee,
  cricos_code,
  cricos_field_1_broad,
  cricos_tuition_fee_total,
  cricos_duration_weeks,
  cricos_fee_source_url,
  cricos_fee_verified_at,
  university_course_code,
  source_url,
  verification_status,
  universities(name),
  study_fields(name),
  course_fees(fee_year, student_type, annual_fee, total_fee, source_url, verified_at, verification_status),
  course_campuses(
    campuses(
      name,
      city,
      state,
      regional,
      regional_verified,
      living_costs(category, monthly_estimate, verification_status)
    )
  ),
  course_occupations(occupations(name)),
  course_accreditations(body_name, status),
  course_skilled_occupation_links(
    confidence,
    skilled_occupations(
      name,
      skilled_occupation_programs(migration_programs(subclass))
    )
  )
`;

const asNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalise = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

export const broadFieldFromProfile = (field: string) => {
  const text = normalise(field);
  if (!text) return null;

  const groups: Array<[string, string[]]> = [
    ["02 - Information Technology", ["information technology", "software", "computer", "cyber", "data science", "artificial intelligence", "machine learning", "cloud", "network", "ict", "developer"]],
    ["03 - Engineering and Related Technologies", ["engineering", "mechanical", "civil", "electrical", "electronic", "mechatronic", "automotive", "aerospace"]],
    ["04 - Architecture and Building", ["architecture", "building", "construction", "quantity surveying"]],
    ["05 - Agriculture, Environmental and Related Studies", ["agriculture", "environment", "environmental", "forestry", "fisheries"]],
    ["06 - Health", ["health", "nursing", "medicine", "medical", "pharmacy", "dentistry", "physiotherapy", "occupational therapy", "public health"]],
    ["07 - Education", ["education", "teaching", "teacher", "early childhood"]],
    ["08 - Management and Commerce", ["business", "management", "commerce", "accounting", "finance", "marketing", "human resources", "economics", "mba"]],
    ["09 - Society and Culture", ["law", "psychology", "social", "sociology", "politics", "international relations", "criminology", "humanities", "language"]],
    ["10 - Creative Arts", ["design", "creative", "arts", "music", "film", "media", "visual art"]],
    ["01 - Natural and Physical Sciences", ["science", "biology", "chemistry", "physics", "mathematics", "biotechnology"]],
    ["11 - Food, Hospitality and Personal Services", ["hospitality", "cookery", "culinary", "food service"]],
    ["12 - Mixed Field Programmes", ["mixed field", "general studies", "enabling"]],
  ];

  return groups.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0] ?? null;
};

function chooseBestCampus(courseCampuses: Array<{ campuses: CampusCore | null }>, profile: StudentAssessment) {
  const campuses = courseCampuses.map((item) => item.campuses).filter((campus): campus is CampusCore => Boolean(campus));
  if (!campuses.length) return null;

  return [...campuses].sort((a, b) => campusPreferenceScore(b, profile) - campusPreferenceScore(a, profile) || a.name.localeCompare(b.name))[0];
}

function campusPreferenceScore(campus: CampusCore, profile: StudentAssessment) {
  let score = 0;
  if (profile.city && normalise(profile.city) === normalise(campus.city)) score += 120;
  if (profile.state && profile.state === campus.state) score += 70;
  if (campus.regional_verified) {
    if (profile.regional === "yes" && campus.regional) score += 20;
    if (profile.regional === "no" && !campus.regional) score += 20;
  }
  if ((campus.living_costs ?? []).some((item) => item.verification_status !== "UNVERIFIED" && asNumber(item.monthly_estimate) !== null)) score += 4;
  return score;
}

function feeValues(row: RawCourseLight, latestInternationalFee?: RawCourse["course_fees"][number]) {
  const verifiedAnnualFee = asNumber(latestInternationalFee?.annual_fee) ?? asNumber(row.annual_fee);
  const verifiedTotalTuition = asNumber(latestInternationalFee?.total_fee);
  const cricosTotalTuition = asNumber(row.cricos_tuition_fee_total);
  const totalTuition = verifiedTotalTuition ?? cricosTotalTuition;
  const cricosDurationWeeks = asNumber(row.cricos_duration_weeks);
  const cricosAnnualisedFee = cricosTotalTuition !== null && cricosDurationWeeks !== null && cricosDurationWeeks > 0
    ? Math.round(cricosTotalTuition / (cricosDurationWeeks / 52))
    : null;
  const annualFee = verifiedAnnualFee ?? cricosAnnualisedFee;
  const hasUniversityFeeRecord = verifiedAnnualFee !== null || verifiedTotalTuition !== null;

  return {
    annualFee,
    totalTuition,
    feeSourceUrl: hasUniversityFeeRecord
      ? latestInternationalFee?.source_url ?? row.source_url
      : row.cricos_fee_source_url ?? row.source_url,
    feeVerifiedAt: hasUniversityFeeRecord
      ? latestInternationalFee?.verified_at ?? null
      : row.cricos_fee_verified_at,
    feeYear: verifiedAnnualFee !== null ? latestInternationalFee?.fee_year ?? null : null,
  };
}

function mapLightCourse(row: RawCourseLight, profile: StudentAssessment): CourseCandidate {
  const campus = chooseBestCampus(row.course_campuses, profile);
  const fees = feeValues(row);
  const field = row.study_fields?.name ?? row.cricos_field_1_broad ?? "";

  return {
    id: row.id,
    university: row.universities?.name ?? "University not verified",
    course: row.name,
    qualificationLevel: row.qualification_level,
    field,
    state: campus?.state ?? "",
    city: campus?.city ?? "",
    regional: campus?.regional ?? false,
    regionalVerified: campus?.regional_verified ?? false,
    annualFee: fees.annualFee,
    totalTuition: fees.totalTuition,
    feeSourceUrl: fees.feeSourceUrl,
    feeVerifiedAt: fees.feeVerifiedAt,
    durationMonths: row.duration_months ?? 0,
    estimatedMonthlyLiving: null,
    careerTags: [],
    backgroundTags: [field, row.name].filter(Boolean),
    migrationAlignment: "Unknown",
    migrationEvidenceCount: 0,
    migrationEvidenceLabels: [],
    verificationStatus: row.verification_status === "VERIFIED" ? "VERIFIED" : "ESTIMATED",
    courseCode: row.university_course_code,
    cricosCode: row.cricos_code,
    feeYear: fees.feeYear,
    sourceUrl: row.source_url,
    accreditation: null,
    campusName: campus?.name ?? null,
  };
}

function mapDetailedCourse(row: RawCourse, profile: StudentAssessment): CourseCandidate {
  const latestInternationalFee = row.course_fees
    .filter((fee) => fee.student_type === "international" && fee.verification_status === "VERIFIED")
    .sort((a, b) => b.fee_year - a.fee_year)[0];
  const fees = feeValues(row, latestInternationalFee);
  const campus = chooseBestCampus(row.course_campuses, profile);
  const livingValues = (campus?.living_costs ?? [])
    .filter((item) => item.verification_status !== "UNVERIFIED")
    .map((item) => asNumber(item.monthly_estimate))
    .filter((value): value is number => value !== null);
  const estimatedMonthlyLiving = livingValues.length
    ? livingValues.reduce((sum, value) => sum + value, 0)
    : null;

  const careerTags = row.course_occupations
    .map((item) => item.occupations?.name)
    .filter((value): value is string => Boolean(value));

  const migrationEvidenceLabels = row.course_skilled_occupation_links
    .filter((item) => item.confidence === "HIGH" && item.skilled_occupations)
    .map((item) => {
      const occupation = item.skilled_occupations!;
      const subclasses = occupation.skilled_occupation_programs
        .map((entry) => entry.migration_programs?.subclass)
        .filter((value): value is string => Boolean(value))
        .filter((value, index, values) => values.indexOf(value) === index);
      return `${occupation.name}${subclasses.length ? ` (${subclasses.join(", ")})` : ""}`;
    });

  const field = row.study_fields?.name ?? row.cricos_field_1_broad ?? "";
  const accreditation = row.course_accreditations
    .map((item) => item.status ? `${item.body_name} — ${item.status}` : item.body_name)
    .join("; ") || null;

  return {
    id: row.id,
    university: row.universities?.name ?? "University not verified",
    course: row.name,
    qualificationLevel: row.qualification_level,
    field,
    state: campus?.state ?? "",
    city: campus?.city ?? "",
    regional: campus?.regional ?? false,
    regionalVerified: campus?.regional_verified ?? false,
    annualFee: fees.annualFee,
    totalTuition: fees.totalTuition,
    feeSourceUrl: fees.feeSourceUrl,
    feeVerifiedAt: fees.feeVerifiedAt,
    durationMonths: row.duration_months ?? 0,
    estimatedMonthlyLiving,
    careerTags,
    backgroundTags: [field, row.name, ...careerTags].filter(Boolean),
    migrationAlignment: "Unknown",
    migrationEvidenceCount: migrationEvidenceLabels.length,
    migrationEvidenceLabels,
    verificationStatus: row.verification_status === "VERIFIED" ? "VERIFIED" : "ESTIMATED",
    courseCode: row.university_course_code,
    cricosCode: row.cricos_code,
    feeYear: fees.feeYear,
    sourceUrl: row.source_url,
    accreditation,
    campusName: campus?.name ?? null,
  };
}

function desiredTitleBoost(profile: StudentAssessment, course: CourseCandidate) {
  const desired = normalise(profile.desiredOccupation);
  if (!desired) return 0;
  const words = desired.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  const title = normalise(course.course);
  if (title.includes(desired)) return 24;
  const matches = words.filter((word) => title.includes(word)).length;
  return Math.min(18, matches * 6);
}

function preliminaryScore(profile: StudentAssessment, course: CourseCandidate) {
  const base = scoreCourse(profile, course).totalScore;
  const tuitionEvidenceBoost = course.annualFee !== null ? 2 : 0;
  return base + desiredTitleBoost(profile, course) + tuitionEvidenceBoost;
}

async function loadLightCoursePool(profile: StudentAssessment) {
  const supabase = createClient();
  const broadField = broadFieldFromProfile(profile.field);
  const rows: RawCourseLight[] = [];
  let offset = 0;

  while (true) {
    const pageLimit = broadField ? LIGHT_PAGE_SIZE : Math.min(LIGHT_PAGE_SIZE, NO_FIELD_SCAN_LIMIT - offset);
    if (pageLimit <= 0) break;

    let query = supabase
      .from("courses")
      .select(LIGHT_SELECT)
      .eq("verification_status", "VERIFIED")
      .or("cricos_expired.is.null,cricos_expired.eq.false")
      .order("name", { ascending: true })
      .range(offset, offset + pageLimit - 1);

    if (broadField) query = query.eq("cricos_field_1_broad", broadField);

    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as unknown as RawCourseLight[];
    rows.push(...page);

    if (page.length < pageLimit) break;
    offset += pageLimit;
    if (!broadField && offset >= NO_FIELD_SCAN_LIMIT) break;
  }

  if (broadField) {
    const { data, error } = await supabase
      .from("courses")
      .select(LIGHT_SELECT)
      .eq("verification_status", "VERIFIED")
      .or("cricos_expired.is.null,cricos_expired.eq.false")
      .is("cricos_field_1_broad", null)
      .order("name", { ascending: true })
      .limit(MAX_UNCLASSIFIED);
    if (error) throw error;

    const matchingUnclassified = ((data ?? []) as unknown as RawCourseLight[]).filter((row) => {
      const inferred = broadFieldFromProfile(`${row.study_fields?.name ?? ""} ${row.name}`);
      return inferred === broadField;
    });
    rows.push(...matchingUnclassified);
  }

  const uniqueRows = [...new Map(rows.map((row) => [row.id, row])).values()];
  return { rows: uniqueRows, broadField };
}

async function loadDetailedCourses(ids: string[], profile: StudentAssessment) {
  if (!ids.length) return [];
  const supabase = createClient();
  const detailed: RawCourse[] = [];

  for (let index = 0; index < ids.length; index += DETAIL_BATCH_SIZE) {
    const batch = ids.slice(index, index + DETAIL_BATCH_SIZE);
    const { data, error } = await supabase
      .from("courses")
      .select(DETAIL_SELECT)
      .in("id", batch)
      .eq("verification_status", "VERIFIED");
    if (error) throw error;
    detailed.push(...((data ?? []) as unknown as RawCourse[]));
  }

  return detailed.map((row) => mapDetailedCourse(row, profile));
}

export async function loadVerifiedCourseCandidates(profile: StudentAssessment): Promise<CourseCatalogResult> {
  const { rows, broadField } = await loadLightCoursePool(profile);
  const lightCandidates = rows.map((row) => mapLightCourse(row, profile));
  const strongestIds = lightCandidates
    .sort((a, b) => preliminaryScore(profile, b) - preliminaryScore(profile, a) || a.course.localeCompare(b.course))
    .slice(0, DETAILED_CANDIDATE_LIMIT)
    .map((course) => course.id);

  const courses = await loadDetailedCourses(strongestIds, profile);
  return {
    courses,
    scannedCount: lightCandidates.length,
    broadField,
  };
}
