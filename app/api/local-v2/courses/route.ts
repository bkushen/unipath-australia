import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const clean = (value: string | null) => (value ?? "").trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ").slice(0, 100);
const ensureUrl = (value: string | null | undefined) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
};

export async function GET(request: NextRequest) {
  const q = clean(request.nextUrl.searchParams.get("q"));
  const page = Math.max(Number(request.nextUrl.searchParams.get("page")) || 1, 1);
  const pageSize = Math.min(Math.max(Number(request.nextUrl.searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const supabase = getSupabase();

  try {
    let courseQuery = supabase
      .from("courses")
      .select("id,university_id,study_field_id,name,slug,qualification_level,cricos_code,duration_months,annual_fee,total_fee,currency,description,official_course_url,official_course_url_verified_at,source_url,verified_at,verification_status,delivery_mode,cricos_expired", { count: "exact" })
      .or("cricos_expired.is.null,cricos_expired.eq.false")
      .order("name")
      .range(from, to);

    if (q) {
      courseQuery = courseQuery.or(
        `name.ilike.%${q}%,qualification_level.ilike.%${q}%,cricos_field_1_broad.ilike.%${q}%,cricos_field_1_narrow.ilike.%${q}%,cricos_field_1_detailed.ilike.%${q}%`,
      );
    }

    const { data: courses, error: courseError, count } = await courseQuery;
    if (courseError) throw courseError;

    const universityIds = Array.from(new Set((courses ?? []).map((course) => course.university_id).filter(Boolean)));
    const courseIds = (courses ?? []).map((course) => course.id);

    const [{ data: universities, error: universityError }, { data: courseCampuses, error: courseCampusError }] = await Promise.all([
      universityIds.length
        ? supabase.from("universities").select("id,name,slug,website,logo_url,cricos_code").in("id", universityIds)
        : Promise.resolve({ data: [], error: null }),
      courseIds.length
        ? supabase.from("course_campuses").select("course_id,campus_id").in("course_id", courseIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (universityError) throw universityError;
    if (courseCampusError) throw courseCampusError;

    const campusIds = Array.from(new Set((courseCampuses ?? []).map((row) => row.campus_id).filter(Boolean)));
    const { data: campuses, error: campusError } = campusIds.length
      ? await supabase.from("campuses").select("id,name,city,state,postcode,regional").in("id", campusIds)
      : { data: [], error: null };
    if (campusError) throw campusError;

    const universityMap = new Map((universities ?? []).map((university) => [university.id, university]));
    const campusMap = new Map((campuses ?? []).map((campus) => [campus.id, campus]));
    const campusIdsByCourse = new Map<string, string[]>();
    for (const row of courseCampuses ?? []) {
      const current = campusIdsByCourse.get(row.course_id) ?? [];
      current.push(row.campus_id);
      campusIdsByCourse.set(row.course_id, current);
    }

    const results = (courses ?? []).map((course) => {
      const university = universityMap.get(course.university_id);
      const courseCampusIds = campusIdsByCourse.get(course.id) ?? [];
      const resolvedCampuses = courseCampusIds.map((id) => campusMap.get(id)).filter(Boolean);
      return {
        id: course.id,
        name: course.name,
        slug: course.slug,
        qualificationLevel: course.qualification_level,
        cricosCode: course.cricos_code,
        durationMonths: course.duration_months,
        annualFee: course.annual_fee == null ? null : Number(course.annual_fee),
        totalFee: course.total_fee == null ? null : Number(course.total_fee),
        currency: course.currency || "AUD",
        description: course.description,
        deliveryMode: course.delivery_mode,
        verifiedAt: course.verified_at,
        verificationStatus: course.verification_status,
        officialCourseUrl: ensureUrl(course.official_course_url),
        officialCourseUrlVerifiedAt: course.official_course_url_verified_at,
        sourceUrl: ensureUrl(course.source_url),
        university: university ? {
          id: university.id,
          name: university.name,
          slug: university.slug,
          website: ensureUrl(university.website),
          logoUrl: ensureUrl(university.logo_url),
          cricosCode: university.cricos_code,
        } : null,
        campuses: resolvedCampuses.map((campus) => ({
          id: campus!.id,
          name: campus!.name,
          city: campus!.city,
          state: campus!.state,
          postcode: campus!.postcode,
          regional: Boolean(campus!.regional),
        })),
      };
    });

    const total = count ?? 0;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    return NextResponse.json({
      courses: results,
      count: results.length,
      total,
      page,
      pageSize,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
      source: "SUPABASE",
    });
  } catch (error) {
    const detail = typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message) : String(error);
    console.error("Course catalogue search failed", detail);
    return NextResponse.json({ error: "Unable to load the course catalogue right now.", detail, courses: [] }, { status: 500 });
  }
}
