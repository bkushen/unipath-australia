import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SearchType = "qualification" | "study_field" | "occupation" | "course" | "location";

type SearchOption = {
  id: string;
  label: string;
  secondary?: string;
  value: string;
  state?: string;
};

const validTypes = new Set<SearchType>([
  "qualification",
  "study_field",
  "occupation",
  "course",
  "location",
]);

function cleanQuery(value: string) {
  return value.trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") as SearchType | null;
  const q = cleanQuery(request.nextUrl.searchParams.get("q") || "");

  if (!type || !validTypes.has(type)) {
    return NextResponse.json({ error: "Invalid search type." }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    let options: SearchOption[] = [];

    if (type === "qualification") {
      let query = supabase
        .from("courses")
        .select("qualification_level")
        .not("qualification_level", "is", null)
        .limit(500);
      if (q) query = query.ilike("qualification_level", `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      const values = Array.from(new Set((data ?? []).map((row) => row.qualification_level).filter(Boolean))).sort();
      options = values.slice(0, 20).map((value) => ({ id: `qualification:${value}`, label: value, value }));
    }

    if (type === "study_field") {
      let query = supabase.from("study_fields").select("id,name,parent_id").order("name").limit(20);
      if (q) query = query.ilike("name", `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      options = (data ?? []).map((row) => ({ id: row.id, label: row.name, value: row.name }));
    }

    if (type === "occupation") {
      let query = supabase.from("occupations").select("id,name,code,assessing_authority").order("name").limit(20);
      if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      options = (data ?? []).map((row) => ({
        id: row.id,
        label: row.name,
        value: row.name,
        secondary: [row.code, row.assessing_authority].filter(Boolean).join(" · ") || undefined,
      }));
    }

    if (type === "course") {
      let query = supabase
        .from("courses")
        .select("id,name,qualification_level,university_id")
        .eq("cricos_expired", false)
        .order("name")
        .limit(20);
      if (q) query = query.or(`name.ilike.%${q}%,qualification_level.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      options = (data ?? []).map((row) => ({
        id: row.id,
        label: row.name,
        value: row.name,
        secondary: row.qualification_level || undefined,
      }));
    }

    if (type === "location") {
      let query = supabase
        .from("campuses")
        .select("id,name,city,state,postcode")
        .order("city")
        .limit(30);
      if (q) query = query.or(`city.ilike.%${q}%,name.ilike.%${q}%,state.ilike.%${q}%,postcode.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;

      const seen = new Set<string>();
      options = [];
      for (const row of data ?? []) {
        const value = `${row.city}, ${row.state}`;
        if (seen.has(value)) continue;
        seen.add(value);
        options.push({
          id: `location:${row.city}:${row.state}`,
          label: value,
          value,
          state: row.state,
          secondary: row.postcode ? `Campus locations around ${row.postcode}` : "Campus location",
        });
        if (options.length >= 20) break;
      }
    }

    return NextResponse.json({ options, source: "SUPABASE", type, query: q });
  } catch (error) {
    console.error("Quick Match option search failed", error);
    return NextResponse.json(
      { error: "Unable to search the UniPath database right now.", options: [] },
      { status: 500 },
    );
  }
}
