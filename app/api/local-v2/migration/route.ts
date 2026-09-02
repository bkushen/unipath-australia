import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

const ensureUrl = (value: string | null | undefined) => !value ? null : /^https?:\/\//i.test(value) ? value : `https://${value}`;

export async function GET() {
  const supabase = getSupabase();

  try {
    const [programRes, occupationRes, codeRes, listRes, programLinkRes, courseLinkRes] = await Promise.all([
      supabase.from("migration_programs").select("id,subclass,name,stream,pathway_type,source_url,verified_at").order("subclass").order("name"),
      supabase.from("skilled_occupations").select("id,name,assessing_authority,source_url,verified_at").order("name"),
      supabase.from("skilled_occupation_codes").select("skilled_occupation_id,anzsco_code,anzsco_version,program_scope"),
      supabase.from("skilled_occupation_lists").select("skilled_occupation_id,list_code"),
      supabase.from("skilled_occupation_programs").select("skilled_occupation_id,migration_program_id,notes,source_url,verified_at"),
      supabase.from("course_skilled_occupation_links").select("course_id,skilled_occupation_id,evidence_basis,confidence,notes,source_url,verified_at"),
    ]);

    for (const response of [programRes, occupationRes, codeRes, listRes, programLinkRes, courseLinkRes]) {
      if (response.error) throw response.error;
    }

    const courseIds = Array.from(new Set((courseLinkRes.data ?? []).map((row) => row.course_id)));
    const { data: courses, error: courseError } = courseIds.length
      ? await supabase.from("courses").select("id,name,university_id,qualification_level,cricos_code,duration_months,annual_fee,currency,official_course_url,cricos_expired").in("id", courseIds).or("cricos_expired.is.null,cricos_expired.eq.false")
      : { data: [], error: null };
    if (courseError) throw courseError;

    const universityIds = Array.from(new Set((courses ?? []).map((course) => course.university_id).filter(Boolean)));
    const { data: universities, error: universityError } = universityIds.length
      ? await supabase.from("universities").select("id,name,website,logo_url").in("id", universityIds)
      : { data: [], error: null };
    if (universityError) throw universityError;

    const universityMap = new Map((universities ?? []).map((item) => [item.id, item]));
    const programMap = new Map((programRes.data ?? []).map((item) => [item.id, item]));
    const programIdsByOccupation = new Map<string, string[]>();
    for (const link of programLinkRes.data ?? []) {
      const current = programIdsByOccupation.get(link.skilled_occupation_id) ?? [];
      current.push(link.migration_program_id);
      programIdsByOccupation.set(link.skilled_occupation_id, current);
    }

    const codesByOccupation = new Map<string, string[]>();
    for (const row of codeRes.data ?? []) {
      const current = codesByOccupation.get(row.skilled_occupation_id) ?? [];
      if (row.anzsco_code && !current.includes(row.anzsco_code)) current.push(row.anzsco_code);
      codesByOccupation.set(row.skilled_occupation_id, current);
    }

    const listsByOccupation = new Map<string, string[]>();
    for (const row of listRes.data ?? []) {
      const current = listsByOccupation.get(row.skilled_occupation_id) ?? [];
      if (row.list_code && !current.includes(row.list_code)) current.push(row.list_code);
      listsByOccupation.set(row.skilled_occupation_id, current);
    }

    const coursesByOccupation = new Map<string, Array<Record<string, unknown>>>();
    for (const link of courseLinkRes.data ?? []) {
      const course = (courses ?? []).find((item) => item.id === link.course_id);
      if (!course) continue;
      const university = universityMap.get(course.university_id);
      const current = coursesByOccupation.get(link.skilled_occupation_id) ?? [];
      current.push({
        id: course.id,
        name: course.name,
        qualificationLevel: course.qualification_level,
        cricosCode: course.cricos_code,
        durationMonths: course.duration_months,
        annualFee: course.annual_fee == null ? null : Number(course.annual_fee),
        currency: course.currency || "AUD",
        officialCourseUrl: ensureUrl(course.official_course_url),
        evidenceBasis: link.evidence_basis,
        confidence: link.confidence,
        notes: link.notes,
        sourceUrl: ensureUrl(link.source_url),
        verifiedAt: link.verified_at,
        university: university ? { id: university.id, name: university.name, website: ensureUrl(university.website), logoUrl: ensureUrl(university.logo_url) } : null,
      });
      coursesByOccupation.set(link.skilled_occupation_id, current);
    }

    const occupations = (occupationRes.data ?? []).map((occupation) => ({
      id: occupation.id,
      name: occupation.name,
      assessingAuthority: occupation.assessing_authority,
      sourceUrl: ensureUrl(occupation.source_url),
      verifiedAt: occupation.verified_at,
      anzscoCodes: codesByOccupation.get(occupation.id) ?? [],
      lists: listsByOccupation.get(occupation.id) ?? [],
      programs: (programIdsByOccupation.get(occupation.id) ?? []).map((id) => programMap.get(id)).filter(Boolean).map((program) => ({
        id: program!.id,
        subclass: program!.subclass,
        name: program!.name,
        stream: program!.stream,
        pathwayType: program!.pathway_type,
        sourceUrl: ensureUrl(program!.source_url),
        verifiedAt: program!.verified_at,
      })),
      linkedCourses: coursesByOccupation.get(occupation.id) ?? [],
    }));

    const programs = (programRes.data ?? []).map((program) => ({
      id: program.id,
      subclass: program.subclass,
      name: program.name,
      stream: program.stream,
      pathwayType: program.pathway_type,
      sourceUrl: ensureUrl(program.source_url),
      verifiedAt: program.verified_at,
      linkedOccupationCount: (programLinkRes.data ?? []).filter((link) => link.migration_program_id === program.id).length,
    }));

    return NextResponse.json({ occupations, programs, source: "SUPABASE" });
  } catch (error) {
    const detail = typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message) : String(error);
    console.error("Migration explorer failed", detail);
    return NextResponse.json({ occupations: [], programs: [], error: "Unable to load migration data right now.", detail }, { status: 500 });
  }
}
