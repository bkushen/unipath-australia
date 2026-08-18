"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const STATUSES = new Set(["considering","preparing","submitted","offer_received","accepted","declined","withdrawn"]);

async function userContext() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login?next=/applications");
  return { supabase, userId };
}

export async function addApplication(formData: FormData) {
  const { supabase, userId } = await userContext();
  const courseId = String(formData.get("course_id") ?? "").trim();
  if (!courseId) return;
  await supabase.from("student_applications").upsert({ user_id: userId, course_id: courseId, status: "considering", updated_at: new Date().toISOString() }, { onConflict: "user_id,course_id" });
  revalidatePath("/applications");
  revalidatePath("/dashboard");
}

export async function updateApplication(formData: FormData) {
  const { supabase, userId } = await userContext();
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "considering");
  if (!id || !STATUSES.has(status)) return;
  const applicationReference = clean(formData.get("application_reference"), 120);
  const targetIntake = clean(formData.get("target_intake"), 120);
  const notes = clean(formData.get("notes"), 1000);
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(deadlineRaw) ? deadlineRaw : null;

  await supabase.from("student_applications").update({
    status,
    application_reference: applicationReference || null,
    target_intake: targetIntake || null,
    deadline,
    notes: notes || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", userId);
  revalidatePath("/applications");
  revalidatePath("/dashboard");
}

export async function deleteApplication(formData: FormData) {
  const { supabase, userId } = await userContext();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await supabase.from("student_applications").delete().eq("id", id).eq("user_id", userId);
  revalidatePath("/applications");
  revalidatePath("/dashboard");
}

function clean(value: FormDataEntryValue | null, max: number) {
  return String(value ?? "").trim().slice(0, max);
}
