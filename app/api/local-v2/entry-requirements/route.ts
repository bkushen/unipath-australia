import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const MAX_COURSE_IDS = 100;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const ids = (request.nextUrl.searchParams.get("courseIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, MAX_COURSE_IDS);

  try {
    const [{ data: requirements, error: requirementError }, { count: totalCourses, error: totalCourseError }, { count: totalRequirementRows, error: totalRequirementError }] = await Promise.all([
      ids.length
        ? supabase
            .from("entry_requirements")
            .select("course_id,academic_text,minimum_gpa,relevant_field_required,ielts_overall,pte_overall,source_url,verified_at")
            .in("course_id", ids)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("courses")
        .select("id", { count: "exact", head: true })
        .or("cricos_expired.is.null,cricos_expired.eq.false"),
      supabase
        .from("entry_requirements")
        .select("id", { count: "exact", head: true }),
    ]);

    if (requirementError) throw requirementError;
    if (totalCourseError) throw totalCourseError;
    if (totalRequirementError) throw totalRequirementError;

    const byCourse = Object.fromEntries(
      (requirements ?? []).map((row) => [
        row.course_id,
        {
          academicText: row.academic_text,
          minimumGpa: row.minimum_gpa == null ? null : Number(row.minimum_gpa),
          relevantFieldRequired: Boolean(row.relevant_field_required),
          ieltsOverall: row.ielts_overall == null ? null : Number(row.ielts_overall),
          pteOverall: row.pte_overall == null ? null : Number(row.pte_overall),
          sourceUrl: row.source_url,
          verifiedAt: row.verified_at,
          evidenceLevel: "course_specific_verified",
        },
      ]),
    );

    return NextResponse.json({
      requirementsByCourse: byCourse,
      requestedCourses: ids.length,
      matchedCourses: Object.keys(byCourse).length,
      coverage: {
        activeCourses: totalCourses ?? 0,
        requirementRows: totalRequirementRows ?? 0,
        note: "Only course-specific source-backed requirements are returned. Missing requirements are not inferred from university-wide defaults.",
      },
      source: "SUPABASE_VERIFIED_ENTRY_REQUIREMENTS",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Entry requirements lookup failed", detail);
    return NextResponse.json({ error: "Unable to load entry requirements.", detail }, { status: 500 });
  }
}
