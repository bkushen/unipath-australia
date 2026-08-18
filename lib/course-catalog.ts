import { createClient } from "@/lib/supabase/client";
import type { CourseCandidate } from "@/lib/recommendation";

type RawCourse = {
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
  course_fees: Array<{
    fee_year: number;
    student_type: string;
    annual_fee: number | string | null;
    total_fee: number | string | null;
    source_url: string | null;
    verified_at: string | null;
    verification_status: string;
  }>;
  course_campuses: Array<{
    campuses: {
      name: string;
      city: string;
      state: string;
      regional: boolean;
      regional_verified: boolean;
      living_costs: Array<{
        category: string;
        monthly_estimate: number | string | null;
        verification_status: string;
      }>;
    } | null;
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

const asNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const broadFieldFromProfile = (field: string) => {
  const text = field.trim().toLowerCase();
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
  ];

  return groups.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0] ?? null;
};

export async function loadVerifiedCourseCandidates(profileField = ""): Promise<CourseCandidate[]> {
  const supabase = createClient();
  const broadField = broadFieldFromProfile(profileField);

  let query = supabase
    .from("courses")
    .select(`
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
    `)
    .eq("verification_status", "VERIFIED")
    .or("cricos_expired.is.null,cricos_expired.eq.false")
    .limit(broadField ? 500 : 300);

  if (broadField) {
    query = query.or(`cricos_field_1_broad.eq."${broadField}",cricos_field_1_broad.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as RawCourse[]).map((row) => {
    const latestInternationalFee = row.course_fees
      .filter((fee) => fee.student_type === "international" && fee.verification_status === "VERIFIED")
      .sort((a, b) => b.fee_year - a.fee_year)[0];

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
    const feeSourceUrl = hasUniversityFeeRecord
      ? latestInternationalFee?.source_url ?? row.source_url
      : row.cricos_fee_source_url ?? row.source_url;
    const feeVerifiedAt = hasUniversityFeeRecord
      ? latestInternationalFee?.verified_at ?? null
      : row.cricos_fee_verified_at;

    const campus = row.course_campuses.find((item) => item.campuses)?.campuses ?? null;
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
      annualFee,
      totalTuition,
      feeSourceUrl,
      feeVerifiedAt,
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
      feeYear: verifiedAnnualFee !== null ? latestInternationalFee?.fee_year ?? null : null,
      sourceUrl: row.source_url,
      accreditation,
      campusName: campus?.name ?? null,
    };
  });
}
