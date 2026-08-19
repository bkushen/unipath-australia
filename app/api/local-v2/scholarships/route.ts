import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const IN_CHUNK_SIZE = 150;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

const ensureUrl = (value: string | null | undefined) => !value ? null : /^https?:\/\//i.test(value) ? value : `https://${value}`;

function chunks<T>(items: T[], size = IN_CHUNK_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const universityId = request.nextUrl.searchParams.get("universityId") ?? "";
  const supabase = getSupabase();

  try {
    let query = supabase
      .from("scholarships")
      .select("id,university_id,name,amount,percentage,eligibility,source_url,verified_at")
      .order("name");

    if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, " ")}%`);
    if (universityId) query = query.eq("university_id", universityId);

    const { data: scholarships, error } = await query;
    if (error) throw error;

    const universityIds = Array.from(new Set((scholarships ?? []).map((item) => item.university_id).filter(Boolean)));
    const scholarshipIds = (scholarships ?? []).map((item) => item.id);

    const [{ data: universities, error: universityError }, linkResponses] = await Promise.all([
      universityIds.length
        ? supabase.from("universities").select("id,name,slug,website,logo_url").in("id", universityIds)
        : Promise.resolve({ data: [], error: null }),
      scholarshipIds.length
        ? Promise.all(chunks(scholarshipIds).map((ids) => supabase.from("course_scholarships").select("scholarship_id,course_id").in("scholarship_id", ids)))
        : Promise.resolve([]),
    ]);
    if (universityError) throw universityError;

    const links = linkResponses.flatMap((response) => {
      if (response.error) throw response.error;
      return response.data ?? [];
    });

    const courseIds = Array.from(new Set(links.map((item) => item.course_id).filter(Boolean)));
    const courseResponses = courseIds.length
      ? await Promise.all(chunks(courseIds).map((ids) =>
          supabase
            .from("courses")
            .select("id,name,qualification_level,annual_fee,total_fee,currency,duration_months,official_course_url,cricos_expired")
            .in("id", ids)
            .or("cricos_expired.is.null,cricos_expired.eq.false"),
        ))
      : [];

    const courses = courseResponses.flatMap((response) => {
      if (response.error) throw response.error;
      return response.data ?? [];
    });

    const universityMap = new Map((universities ?? []).map((item) => [item.id, item]));
    const courseMap = new Map(courses.map((item) => [item.id, item]));
    const courseIdsByScholarship = new Map<string, string[]>();
    for (const link of links) {
      const current = courseIdsByScholarship.get(link.scholarship_id) ?? [];
      current.push(link.course_id);
      courseIdsByScholarship.set(link.scholarship_id, current);
    }

    const results = (scholarships ?? []).map((item) => {
      const university = universityMap.get(item.university_id);
      const linkedCourses = (courseIdsByScholarship.get(item.id) ?? []).map((id) => courseMap.get(id)).filter(Boolean);
      return {
        id: item.id,
        name: item.name,
        amount: item.amount == null ? null : Number(item.amount),
        percentage: item.percentage == null ? null : Number(item.percentage),
        eligibility: item.eligibility,
        sourceUrl: ensureUrl(item.source_url),
        verifiedAt: item.verified_at,
        university: university ? {
          id: university.id,
          name: university.name,
          slug: university.slug,
          website: ensureUrl(university.website),
          logoUrl: ensureUrl(university.logo_url),
        } : null,
        linkedCourses: linkedCourses.map((course) => ({
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
