"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SaveCourseButton({ courseId, compact = false }: { courseId: string; compact?: boolean }) {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function loadSavedState() {
      const { data: claimsData } = await supabase.auth.getClaims();
      const userId = claimsData?.claims?.sub;
      if (!userId) {
        if (active) setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("saved_courses")
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", courseId)
        .maybeSingle();

      if (active) {
        setSaved(Boolean(data));
        setLoading(false);
      }
    }

    loadSavedState();
    return () => { active = false; };
  }, [courseId]);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    const supabase = createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;

    if (!userId) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
      return;
    }

    if (saved) {
      const { error } = await supabase
        .from("saved_courses")
        .delete()
        .eq("user_id", userId)
        .eq("course_id", courseId);

      if (!error) setSaved(false);
    } else {
      const { error } = await supabase
        .from("saved_courses")
        .insert({ user_id: userId, course_id: courseId });

      if (!error) setSaved(true);
    }

    setLoading(false);
  }

  return (
    <button className={`saveCourseButton ${compact ? "compact" : ""} ${saved ? "saved" : ""}`} type="button" onClick={toggle} disabled={loading} aria-pressed={saved}>
      {saved ? <BookmarkCheck size={16}/> : <Bookmark size={16}/>}
      {loading ? "Checking…" : saved ? "Saved" : "Save course"}
    </button>
  );
}
