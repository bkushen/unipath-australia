"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const COURSE_ALERT_TYPES = new Set(["course_fee", "course_details", "scholarship"]);

async function userContext() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login?next=/alerts");
  return { supabase, userId };
}

export async function addCourseAlert(formData: FormData) {
  const { supabase, userId } = await userContext();
  const courseId = String(formData.get("course_id") ?? "").trim();
  const alertType = String(formData.get("alert_type") ?? "course_fee").trim();
  if (!courseId || !COURSE_ALERT_TYPES.has(alertType)) return;

  const { data: existing } = await supabase
    .from("alert_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("alert_type", alertType)
    .maybeSingle();

  if (!existing) {
    await supabase.from("alert_subscriptions").insert({ user_id: userId, course_id: courseId, alert_type: alertType });
  }
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

export async function addMigrationAlert() {
  const { supabase, userId } = await userContext();
  const { data: existing } = await supabase
    .from("alert_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("alert_type", "migration")
    .is("course_id", null)
    .is("university_id", null)
    .maybeSingle();

  if (!existing) await supabase.from("alert_subscriptions").insert({ user_id: userId, alert_type: "migration" });
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

export async function removeAlert(formData: FormData) {
  const { supabase, userId } = await userContext();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await supabase.from("alert_subscriptions").delete().eq("id", id).eq("user_id", userId);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

export async function markNotificationRead(formData: FormData) {
  const { supabase, userId } = await userContext();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await supabase.from("alert_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  revalidatePath("/alerts");
}

export async function markAllNotificationsRead() {
  const { supabase, userId } = await userContext();
  await supabase.from("alert_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
  revalidatePath("/alerts");
}
