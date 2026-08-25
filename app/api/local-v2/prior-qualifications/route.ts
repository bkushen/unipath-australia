import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function cleanQuery(value: string) {
  return value.trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

export async function GET(request: NextRequest) {
  const q = cleanQuery(request.nextUrl.searchParams.get("q") || "");

  try {
    const supabase = getSupabase();
    let query = supabase
      .from("prior_qualification_levels")
      .select("id,code,label,rank_order,category,description,scoring_kind,progression_rank,progression_note")
      .eq("active", true)
      .order("rank_order", { ascending: true });

    if (q) query = query.ilike("label", `%${q}%`);

    const { data, error } = await query;
    if (error) throw error;

    const options = (data ?? []).map((row) => ({
      id: `prior-qualification:${row.code}`,
      label: row.label,
      value: row.label,
      secondary: row.description || `Prior qualification · ${row.category}`,
      metadata: {
        code: row.code,
        category: row.category,
        scoringKind: row.scoring_kind,
        progressionRank: row.progression_rank,
        progressionNote: row.progression_note,
      },
    }));

    return NextResponse.json({
      options,
      count: options.length,
      source: "SUPABASE_PRIOR_QUALIFICATION_LEVELS",
      scoringMetadata: "SUPABASE_PRIOR_QUALIFICATION_PROGRESSION",
      query: q,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Prior qualification search failed", detail);
    return NextResponse.json(
      { error: "Unable to load prior qualifications from the UniPath database.", detail, options: [] },
      { status: 500 },
    );
  }
}
