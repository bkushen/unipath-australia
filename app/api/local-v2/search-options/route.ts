import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

type SearchType = "qualification" | "study_field" | "occupation" | "course" | "location";

type SearchOption = {
  id: string;
  label: string;
  secondary?: string;
  value: string;
  state?: string;
};

type SupabaseErrorShape = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

const validTypes = new Set<SearchType>(["qualification", "study_field", "occupation", "course", "location"]);

const broadStudyAreas = [
  "Natural and Physical Sciences",
  "Information Technology",
  "Engineering and Related Technologies",
  "Architecture and Building",
  "Agriculture, Environmental and Related Studies",
  "Health",
  "Education",
  "Management and Commerce",
  "Society and Culture",
  "Creative Arts",
  "Food, Hospitality and Personal Services",
  "Mixed Field Programmes",
];

const broadOccupationGroups = [
  "Managers",
  "Professionals",
  "Technicians and Trades Workers",
  "Community and Personal Service Workers",
  "Clerical and Administrative Workers",
  "Sales Workers",
  "Machinery Operators and Drivers",
  "Labourers",
];

function cleanQuery(value: string) {
  return value.trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

function matches(value: string, q: string) {
  return !q || value.toLowerCase().includes(q.toLowerCase());
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function getErrorDetail(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as SupabaseErrorShape;
    return [value.message, value.details, value.hint, value.code].filter(Boolean).join(" | ") || JSON.stringify(error);
  }
  return String(error || "Unknown database search error");
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") as SearchType | null;
  const q = cleanQuery(request.nextUrl.searchParams.get("q") || "");
  if (!type || !validTypes.has(type)) return NextResponse.json({ error: "Invalid search type." }, { status: 400 });

  try {
    const supabase = getSupabase();
    let options: SearchOption[] = [];
    let source = "SUPABASE";

    if (type === "qualification") {
      const values = new Set<string>();
      for (let from = 0; ; from += 1000) {
        let query = supabase
          .from("courses")
          .select("qualification_level")
          .not("qualification_level", "is", null)
          .range(from, from + 999);
        if (q) query = query.ilike("qualification_level", `%${q}%`);
        const { data, error } = await query;
        if (error) throw error;
        for (const row of data ?? []) if (row.qualification_level) values.add(row.qualification_level);
        if (!data || data.length < 1000) break;
      }
      options = [...values].sort().map((value) => ({
        id: `qualification:${value}`,
        label: value,
        value,
        secondary: "Qualification level in the UniPath course catalogue",
      }));
    }

    if (type === "study_field") {
      let query = supabase.from("study_fields").select("id,name,parent_id").order("name").limit(500);
      if (q) query = query.ilike("name", `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      options = (data ?? []).map((row) => ({
        id: row.id,
        label: row.name,
        value: row.name,
        secondary: row.parent_id ? "Detailed study field" : "Study field",
      }));
    }

    if (type === "occupation") {
      const { data: allOscaRows, error: oscaError } = await supabase
        .from("osca_occupations")
        .select("id,code,name,classification_level,skill_level,alternative_titles,specialisations,source_url")
        .eq("classification_level", "occupation")
        .order("name")
        .limit(2000);
      if (oscaError) throw oscaError;

      const queryText = q.toLowerCase();
      const oscaRows = (allOscaRows ?? [])
        .filter((row) => {
          if (!q) return true;
          if (row.name?.toLowerCase().includes(queryText) || row.code?.toLowerCase().includes(queryText)) return true;
          if ((row.alternative_titles ?? []).some((title: string) => title.toLowerCase().includes(queryText))) return true;
          return (row.specialisations ?? []).some((title: string) => title.toLowerCase().includes(queryText));
        })
        .slice(0, q ? 120 : 100);

      if (oscaRows.length > 0) {
        source = "ABS_OSCA_2024";
        const seen = new Set<string>();
        for (const row of oscaRows) {
          const key = row.name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const matchedAlias = q
            ? [...(row.alternative_titles ?? []), ...(row.specialisations ?? [])].find((title: string) => title.toLowerCase().includes(queryText))
            : null;
          options.push({
            id: `osca:${row.code}`,
            label: row.name,
            value: row.name,
            secondary: [
              `OSCA ${row.code}`,
              matchedAlias ? `Matched: ${matchedAlias}` : null,
              row.skill_level ? `Skill level ${row.skill_level}` : null,
              "Australian Bureau of Statistics",
            ].filter(Boolean).join(" · "),
          });
        }
      } else {
        let occupationQuery = supabase
          .from("occupations")
          .select("id,name,code,assessing_authority")
          .order("name")
          .limit(500);
        let skilledQuery = supabase
          .from("skilled_occupations")
          .select("id,name,assessing_authority")
          .order("name")
          .limit(500);
        if (q) {
          occupationQuery = occupationQuery.ilike("name", `%${q}%`);
          skilledQuery = skilledQuery.ilike("name", `%${q}%`);
        }
        const [{ data: occupations, error: occupationError }, { data: skilled, error: skilledError }] = await Promise.all([
          occupationQuery,
          skilledQuery,
        ]);
        if (occupationError) throw occupationError;
        if (skilledError) throw skilledError;

        const seen = new Set<string>();
        for (const group of broadOccupationGroups.filter((item) => matches(item, q))) {
          seen.add(group.toLowerCase());
          options.push({ id: `occupation-group:${group}`, label: group, value: group, secondary: "Broad occupation group" });
        }
        for (const row of occupations ?? []) {
          const key = row.name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          options.push({
            id: `occupation:${row.id}`,
            label: row.name,
            value: row.name,
            secondary: [row.code, row.assessing_authority].filter(Boolean).join(" · ") || "Occupation",
          });
        }
        for (const row of skilled ?? []) {
          const key = row.name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          options.push({
            id: `skilled-occupation:${row.id}`,
            label: row.name,
            value: row.name,
            secondary: ["Migration-linked occupation", row.assessing_authority].filter(Boolean).join(" · "),
          });
        }
      }
    }

    if (type === "course") {
      for (const area of broadStudyAreas.filter((item) => matches(item, q))) {
        options.push({ id: `study-area:${area}`, label: area, value: area, secondary: "Broad Australian study area" });
      }

      let fieldQuery = supabase.from("study_fields").select("id,name,parent_id").order("name").limit(q ? 80 : 40);
      if (q) fieldQuery = fieldQuery.ilike("name", `%${q}%`);
      const { data: fields, error: fieldError } = await fieldQuery;
      if (fieldError) throw fieldError;
      for (const row of fields ?? []) {
        options.push({
          id: `preferred-study-field:${row.id}`,
          label: row.name,
          value: row.name,
          secondary: "Study field / specialisation",
        });
      }

      let courseQuery = supabase
        .from("courses")
        .select("id,name,qualification_level,cricos_expired")
        .or("cricos_expired.is.null,cricos_expired.eq.false")
        .order("name")
        .limit(q ? 80 : 40);
      if (q) courseQuery = courseQuery.ilike("name", `%${q}%`);
      const { data: courses, error: courseError } = await courseQuery;
      if (courseError) throw courseError;
      for (const row of courses ?? []) {
        options.push({
          id: `course:${row.id}`,
          label: row.name,
          value: row.name,
          secondary: row.qualification_level ? `Course · ${row.qualification_level}` : "Course",
        });
      }
    }

    if (type === "location") {
      let query = supabase.from("campuses").select("id,name,city,state,postcode").order("city").limit(250);
      if (q) query = query.ilike("city", `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      const seen = new Set<string>();
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
      }
    }

    return NextResponse.json({ options, count: options.length, source, type, query: q });
  } catch (error) {
    const detail = getErrorDetail(error);
    console.error("Quick Match option search failed", detail);
    return NextResponse.json({ error: "Unable to search the UniPath database right now.", detail, options: [] }, { status: 500 });
  }
}
