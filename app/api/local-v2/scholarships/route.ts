import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const LINK_PAGE_SIZE = 1000;
const COURSE_SAMPLE_SIZE = 8;
const COURSE_ID_CHUNK_SIZE = 100;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

const ensureUrl = (value: string | null | undefined) => !value ? null : /^https?:\/\//i.test(value) ? value : `https://${value}`;

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const universityId = request.nextUrl.searchParams.get("universityId") ?? "";
  const supabase = getSupabase();

  try {
    let scholarshipQuery = supabase
      .from("scholarships")
      .select("id,university_id,name,amount,percentage,eligibility,source_url,verified_at")
      .order("name");

    if (q) scholarshipQuery = scholarshipQuery.ilike("name", `%${q.replace(/[%_]/g, " ")}%`);
    if (universityId) scholarshipQuery = scholarshipQuery.eq("university_id", universityId);

    const { data: scholarships, error: scholarshipError } = await scholarshipQuery;
    if (scholarshipError) throw scholarshipError;

    const scholarshipRows = scholarships ?? [];
    const scholarshipIds = scholarshipRows.map((item) => item.id);
    const scholarshipIdSet = new Set(scholarshipIds);
    const universityIds = Array.from(new Set(scholarshipRows.map((item) => item.university_id).filter(Boolean)));

    const { data: universities, error: universityError } = universityIds.length
      ? await supabase.from("universities").select("id,name,slug,website,logo_url").in("id", universityIds)
      : { data: [], error: null };
    if (universityError) throw universityError;

    const links: Array<{ scholarship_id: string; course_id: string }> = [];
    if (scholarshipIds.length) {
      let from = 0;
      while (true) {
        const to = from + LINK_PAGE_SIZE - 1;
        const { data: linkPage, error: linkError } = await supabase
          .from("course_scholarships")
          .select("scholarship_id,course_id")
          .in("scholarship_id", scholarshipIds)
          .range(from, to);
        if (linkError) throw linkError;

        const rows = linkPage ?? [];
        for (const row of rows) {
          if (scholarshipIdSet.has(row.scholarship_id)) links.push(row);
        }
        if (rows.length < LINK_PAGE_SIZE) break;
        from += LINK_PAGE_SIZE;
      }
    }

    const courseIdsByScholarship = new Map<string, string[]>();
    for (const link of links) {
      const current = courseIdsByScholarship.get(link.scholarship_id) ?? [];
      current.push(link.course_id);
      courseIdsByScholarship.set(link.scholarship_id, current);
    }

    const sampledCourseIds = Array.from(new Set(
      scholarshipRows.flatMap((item) => (courseIdsByScholarship.get(item.id) ?? []).slice(0, COURSE_SAMPLE_SIZE)),
    ));

    const courses: Array<{
      id: string;
      name: string;
      qualification_level: string | null;
      annual_fee: number | string | null;
      total_fee: number | string | null;
      currency: string | null;
      duration_months: number | null;
      official_course_url: string | null;
      cricos_expired: boolean | null;
    }> = [];

    for (const ids of chunks(sampledCourseIds, COURSE_ID_CHUNK_SIZE)) {
      const { data: courseRows, error: courseError } = await supabase
        .from("courses")
        .select("id,name,qualification_level,annual_fee,total_fee,currency,duration_months,official_course_url,cricos_expired")
        .in("id", ids);
      if (courseError) throw courseError;
      courses.push(...(courseRows ?? []));
    }

    const universityMap = new Map((universities ?? []).map((item) => [item.id, item]));
    const courseMap = new Map(courses.filter((item) => item.cricos_expired !== true).map((item) => [item.id, item]));

    const results = scholarshipRows.map((item) => {
      const university = universityMap.get(item.university_id);
      const allLinkedCourseIds = courseIdsByScholarship.get(item.id) ?? [];
      const linkedCourseSamples = allLinkedCourseIds.slice(0, COURSE_SAMPLE_SIZE).map((id) => courseMap.get(id)).filter(Boolean);

      return {
        id: item.id,
        name: item.name,
        amount: item.amount == null ? null : Number(item.amount),
        percentage: item.percentage == null ? null : Number(item.percentage),
        eligibility: item.eligibility,
        sourceUrl: ensureUrl(item.source_url),
        verifiedAt: item.verified_at,
        linkedCourseCount: allLinkedCourseIds.length,
        university: university ? {
          id: university.id,
          name: university.name,
          slug: university.slug,
          website: ensureUrl(university.website),
          logoUrl: ensureUrl(university.logo_url),
        } : null,
        linkedCourses: linkedCourseSamples.map((course) => ({
          id: course!.id,
          name: course!.name,
          qualificationLevel: course!.qualification_level,
          annualFee: course!.annual_fee == null ? null : Number(course!.annual_fee),
          totalFee: course!.total_fee == null ? null : Number(course!.total_fee),
          currency: course!.currency || "AUD",
          durationMonths: course!.duration_months,
          officialCourseUrl: ensureUrl(course!.official_course_url),
        })),
      };
    });

    return NextResponse.json({ scholarships: results, total: results.length, source: "SUPABASE" });
  } catch (error) {
    const detail = typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message) : String(error);
    console.error("Scholarship catalogue failed", detail);
    return NextResponse.json({ scholarships: [], total: 0, error: "Unable to load scholarships right now.", detail }, { status: 500 });
  }
}
