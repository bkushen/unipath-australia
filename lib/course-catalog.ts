import { createClient } from "@/lib/supabase/client";
import type { CourseCandidate } from "@/lib/recommendation";

type RawCourse = {
  id: string;
  name: string;
  qualification_level: string;
  duration_months: number | null;
  annual_fee: number | string | null;
  cricos_code: string | null;
  university_course_code: string | null;
  source_url: string | null;
  verification_status: string;
  universities: { name: string } | null;
  study_fields: { name: string } | null;
  course_fees: Array<{
    fee_year: number;
    student_type: string;
    annual_fee: number | string | null;
    verification_status: string;
  }>;
  course_campuses: Array<{
    campuses: {
      name: string;
      city: string;
      state: string;
      regional: boolean;
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
};

const asNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function loadVerifiedCourseCandidates(): Promise<CourseCandidate[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("courses")
    .select(`
      id,
      name,
      qualification_level,
      duration_months,
      annual_fee,
      cricos_code,
      university_course_code,
      source_url,
      verification_status,
      universities(name),
      study_fields(name),
      course_fees(fee_year, student_type, annual_fee, verification_status),
      course_campuses(
        campuses(
          name,
          city,
          state,
          regional,
          living_costs(category, monthly_estimate, verification_status)
        )
      ),
      course_occupations(occupations(name)),
      course_accreditations(body_name, status)
    `)
    .eq("verification_status", "VERIFIED");

  if (error) throw error;

  return ((data ?? []) as unknown as RawCourse[]).map((row) => {
    const latestInternationalFee = row.course_fees
      .filter((fee) => fee.student_type === "international" && fee.verification_status === "VERIFIED")
      .sort((a, b) => b.fee_year - a.fee_year)[0];

    const annualFee = asNumber(latestInternationalFee?.annual_fee) ?? asNumber(row.annual_fee);
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

    const field = row.study_fields?.name ?? "";
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
      annualFee,
      durationMonths: row.duration_months ?? 0,
      estimatedMonthlyLiving,
      careerTags,
      backgroundTags: [field, row.name, ...careerTags].filter(Boolean),
      migrationAlignment: "Unknown",
      verificationStatus: row.verification_status === "VERIFIED" ? "VERIFIED" : "ESTIMATED",
      courseCode: row.university_course_code,
      cricosCode: row.cricos_code,
      feeYear: latestInternationalFee?.fee_year ?? null,
      sourceUrl: row.source_url,
      accreditation,
      campusName: campus?.name ?? null,
    };
  });
}
