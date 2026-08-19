import type { StudentDecisionProfile } from "./types";

export const LOCAL_V2_PROFILE_STORAGE_KEY = "unipath-local-v2-profile";

export function loadLocalV2Profile(): StudentDecisionProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(LOCAL_V2_PROFILE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StudentDecisionProfile>;
    if (!parsed || typeof parsed !== "object") return null;

    return parsed as StudentDecisionProfile;
  } catch {
    return null;
  }
}

export function saveLocalV2Profile(profile: StudentDecisionProfile): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LOCAL_V2_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Local demo persistence is best-effort only. The production version will use Supabase.
  }
}

export function clearLocalV2Profile(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(LOCAL_V2_PROFILE_STORAGE_KEY);
  } catch {
    // Ignore localStorage failures in the local prototype.
  }
}
