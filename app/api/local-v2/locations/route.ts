import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const regional = request.nextUrl.searchParams.get("regional") === "true";
  const supabase = getSupabase();

  try {
    let query = supabase.from("campuses").select("id,university_id,name,city,state,postcode,regional,regional_verified,regional_classification,latitude,longitude,address_line_1,address_line_2,source_url,verified_at,regional_source_url,regional_verified_at").order("state").order("city").order("name");
    if (q) query = query.or(`name.ilike.%${q.replace(/[%_,()]/g, " ")}%,city.ilike.%${q.replace(/[%_,()]/g, " ")}%,postcode.ilike.%${q.replace(/[%_,()]/g, " ")}%`);
    if (state) query = query.eq("state", state);
    if (regional) query = query.eq("regional", true);

    const { data: campuses, error } = await query;
    if (error) throw error;
    const universityIds = Array.from(new Set((campuses ?? []).map((c) => c.university_id).filter(Boolean)));
    const campusIds = (campuses ?? []).map((c) => c.id);
    const [{ data: universities }, { data: costs }] = await Promise.all([
      universityIds.length ? supabase.from("universities").select("id,name,website,logo_url").in("id", universityIds) : Promise.resolve({ data: [] }),
      campusIds.length ? supabase.from("living_costs").select("id,campus_id,category,weekly_low,weekly_high,monthly_estimate,source_url,verified_at,verification_status").in("campus_id", campusIds) : Promise.resolve({ data: [] }),
    ]);
    const universityMap = new Map((universities ?? []).map((u) => [u.id, u]));
    const costsByCampus = new Map<string, typeof costs>();
    for (const cost of costs ?? []) {
      const current = costsByCampus.get(cost.campus_id) ?? [];
      current.push(cost);
      costsByCampus.set(cost.campus_id, current);
    }

    return NextResponse.json({ locations: (campuses ?? []).map((campus) => ({ ...campus, university: universityMap.get(campus.university_id) ?? null, livingCosts: costsByCampus.get(campus.id) ?? [] })), total: campuses?.length ?? 0, source: "SUPABASE" });
  } catch (error) {
    const detail = typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message) : String(error);
    console.error("Location catalogue failed", detail);
    return NextResponse.json({ locations: [], total: 0, error: "Unable to load locations right now.", detail }, { status: 500 });
  }
}
