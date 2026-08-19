export type AustralianState = "VIC" | "NSW" | "QLD" | "SA" | "WA" | "TAS" | "ACT" | "NT";

export type MigrationImportance = "none" | "consider" | "high";
export type ScholarshipImportance = "none" | "prefer" | "high";
export type AssessmentMode = "quick" | "detailed";
export type VerificationStatus = "DEMO" | "VERIFIED" | "ESTIMATED" | "UNVERIFIED";

export interface EvidenceRef {
  sourceName: string;
  sourceUrl?: string;
  publisher?: string;
  retrievedAt: string;
  effectiveFrom?: string;
  lastVerifiedAt?: string;
  status: VerificationStatus;
  note?: string;
}

export interface StudentDecisionProfile {
  mode: AssessmentMode;
  highestQualification: string;
  qualificationField: string;
  desiredOccupation: string;
  annualTuitionBudgetCents: number;
  semesterTuitionBudgetCents?: number;
  fullCourseBudgetCents?: number;
  scholarshipImportance?: ScholarshipImportance;
  totalFundsCents: number;
  preferredStates: AustralianState[];
  regionalAccepted: boolean;
  migrationImportance: MigrationImportance;
  skills?: string[];
  yearsExperience?: number;
  preferredSuburbId?: string;
  transportPreference?: "car" | "public_transport" | "either";
  dependants?: number;
}

export interface DemoUniversity {
  id: string;
  name: string;
  state: AustralianState;
  reputationScore: number;
}

export interface DemoCampus {
  id: string;
  universityId: string;
  name: string;
  suburbId: string;
  state: AustralianState;
  regional: boolean;
}

export interface DemoCourse {
  id: string;
  universityId: string;
  campusId: string;
  name: string;
  qualificationLevel: string;
  field: string;
  annualTuitionCents: number;
  durationYears: number;
  occupations: string[];
  skillTags: string[];
  scholarshipPercent?: number;
  labourMarketScore: number;
  migrationAlignmentScore: number;
  evidence: EvidenceRef[];
}

export interface DemoSuburb {
  id: string;
  name: string;
  state: AustralianState;
  weeklyRentCents: number;
  weeklyGroceriesCents: number;
  weeklyUtilitiesCents: number;
  weeklyPersonalCents: number;
  evidence: EvidenceRef[];
}

export interface ScoreBreakdown {
  academic: number;
  career: number;
  affordability: number;
  location: number;
  labourMarket: number;
  migration: number;
  overall: number;
}

export interface RankedCourseRecommendation {
  course: DemoCourse;
  university: DemoUniversity;
  campus: DemoCampus;
  scores: ScoreBreakdown;
  reasons: string[];
  cautions: string[];
}

export interface CostAssumptions {
  annualFeeIncreaseBps: number;
  oshcCents: number;
  visaAndSetupCents: number;
  studyMaterialsAnnualCents: number;
  transportWeeklyCents: number;
  emergencyBufferCents: number;
}

export interface CostResult {
  grossTuitionCents: number;
  scholarshipSavingsCents: number;
  netTuitionCents: number;
  livingCostCents: number;
  otherCostCents: number;
  totalEstimatedCostCents: number;
  remainingFundsCents: number;
  budgetConsumedPercent: number;
  hasShortfall: boolean;
  assumptions: CostAssumptions;
}

export interface RouteOption {
  id: string;
  mode: "driving" | "public_transport";
  durationMinutes: number;
  distanceKm: number;
  transfers: number;
  walkingMinutes: number;
  summary: string;
}

export interface RoutingProvider {
  getRoutes(originSuburbId: string, campusId: string): Promise<RouteOption[]>;
}
