export type CampusLocationInput = {
  name?: string | null;
  city?: string | null;
  state?: string | null;
  regional?: boolean | null;
  regionalVerified?: boolean | null;
  regionalClassification?: string | null;
};

export type LivingCostEvidenceInput = {
  weeklyLow?: number | null;
  weeklyHigh?: number | null;
  monthlyEstimate?: number | null;
  sourceUrl?: string | null;
  verifiedAt?: string | null;
  verificationStatus?: string | null;
} | null;

export type LocationAssessmentInput = {
  preferredLocation?: string | null;
  preferredStates?: string[] | null;
  regionalAccepted: boolean;
  campus: CampusLocationInput;
  livingCost?: LivingCostEvidenceInput;
};

export type LocationAssessment = {
  score: number;
  stateMatch: boolean;
  locationMatch: boolean;
  regionalPreference: "verified_match" | "unverified_regional" | "not_regional" | "regional_not_accepted";
  livingEvidence: "source_backed" | "estimate_loaded" | "not_loaded";
  livingEvidenceLabel: string;
  note: string;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function normalise(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function locationMatches(query: string, campus: CampusLocationInput) {
  const needle = normalise(query);
  if (!needle) return true;
  const haystack = normalise([campus.name, campus.city, campus.state].filter(Boolean).join(" "));
  if (!haystack) return false;
  if (haystack.includes(needle)) return true;
  const tokens = needle.split(" ").filter((token) => token.length >= 3);
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

export function assessLocation(input: LocationAssessmentInput): LocationAssessment {
  const states = (input.preferredStates ?? []).filter(Boolean);
  const stateMatch = states.length === 0 || Boolean(input.campus.state && states.includes(input.campus.state));
  const locationMatch = locationMatches(input.preferredLocation ?? "", input.campus);

  let score = stateMatch ? 82 : 45;
  if (locationMatch) score += input.preferredLocation?.trim() ? 10 : 4;
  else if (input.preferredLocation?.trim()) score -= 8;

  let regionalPreference: LocationAssessment["regionalPreference"] = "not_regional";
  if (input.campus.regional) {
    if (!input.regionalAccepted) {
      regionalPreference = "regional_not_accepted";
      score -= 28;
    } else if (input.campus.regionalVerified === true) {
      regionalPreference = "verified_match";
      score += 8;
    } else {
      regionalPreference = "unverified_regional";
    }
  }

  const living = input.livingCost;
  const livingHasAmount = Boolean(living && (living.weeklyLow != null || living.weeklyHigh != null || living.monthlyEstimate != null));
  const livingSourceBacked = Boolean(livingHasAmount && living?.sourceUrl && living?.verifiedAt);
  const livingEvidence: LocationAssessment["livingEvidence"] = livingSourceBacked
    ? "source_backed"
    : livingHasAmount
      ? "estimate_loaded"
      : "not_loaded";

  const livingEvidenceLabel = livingEvidence === "source_backed"
    ? "Source-backed living-cost estimate"
    : livingEvidence === "estimate_loaded"
      ? "Living-cost estimate loaded"
      : "Living-cost evidence not loaded";

  const noteParts: string[] = [];
  if (!stateMatch) noteParts.push("The campus is outside the selected state preference.");
  if (!locationMatch && input.preferredLocation?.trim()) noteParts.push("The campus does not clearly match the selected city/location.");
  if (regionalPreference === "regional_not_accepted") noteParts.push("You selected that you are not open to regional Australia, so this campus receives a substantial location penalty.");
  if (regionalPreference === "unverified_regional") noteParts.push("The campus is marked regional, but UniPath does not have verified regional-classification evidence for this record, so no regional bonus is applied.");
  if (regionalPreference === "verified_match") noteParts.push("The campus has a verified regional flag and you selected that regional Australia is acceptable.");
  if (livingEvidence === "source_backed") noteParts.push("A source-backed living-cost planning estimate is loaded for this campus.");
  else if (livingEvidence === "estimate_loaded") noteParts.push("A living-cost estimate is loaded, but source/verification metadata is incomplete. Treat it as planning guidance only.");
  else noteParts.push("No campus-specific living-cost evidence is loaded, so UniPath does not invent a living-cost estimate.");

  return {
    score: clamp(score),
    stateMatch,
    locationMatch,
    regionalPreference,
    livingEvidence,
    livingEvidenceLabel,
    note: noteParts.join(" "),
  };
}
