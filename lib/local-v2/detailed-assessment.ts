export type DetailedAssessmentInput = {
  baseScore: number;
  careerScore: number;
  totalFunds: number;
  totalFee: number | null | undefined;
  annualFee: number | null | undefined;
  dependants: number;
  yearsExperience: number;
  skills: string[];
  courseName: string;
  studyField: string | null | undefined;
  occupationName: string;
};

export type DetailedAssessment = {
  adjustedScore: number;
  adjustment: number;
  funding: {
    score: number;
    label: string;
    note: string;
  };
  experience: {
    score: number;
    label: string;
    note: string;
  };
  skills: {
    score: number;
    label: string;
    matched: string[];
    note: string;
  };
  dependants: {
    score: number;
    label: string;
    note: string;
  };
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function normaliseTokens(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function careerGate(score: number, careerScore: number) {
  if (careerScore <= 35) return Math.min(score, 60);
  if (careerScore < 50) return Math.min(score, 68);
  return score;
}

function fundingAssessment(totalFunds: number, totalFee: number | null | undefined, annualFee: number | null | undefined) {
  if (!(totalFunds > 0)) {
    return { score: 50, adjustment: 0, label: "Not assessed", note: "No total-funds amount was entered, so funds do not change the detailed score." };
  }

  const reference = totalFee && totalFee > 0 ? totalFee : annualFee && annualFee > 0 ? annualFee : null;
  if (!reference) {
    return { score: 50, adjustment: 0, label: "Limited evidence", note: "Funds were entered, but UniPath does not have a usable tuition reference for this course. No affordability assumption is made." };
  }

  const ratio = totalFunds / reference;
  const isFullCourse = Boolean(totalFee && totalFee > 0);
  const basis = isFullCourse ? "loaded total tuition" : "loaded annual tuition only";

  if (ratio >= 1) return { score: 95, adjustment: 4, label: "Strong tuition coverage", note: `Entered funds cover at least 100% of the ${basis}. This is a study-planning comparison, not a visa financial-capacity assessment.` };
  if (ratio >= 0.75) return { score: 85, adjustment: 3, label: "Good tuition coverage", note: `Entered funds cover about ${Math.round(ratio * 100)}% of the ${basis}. Other study and living costs are not included here.` };
  if (ratio >= 0.5) return { score: 72, adjustment: 1, label: "Partial tuition coverage", note: `Entered funds cover about ${Math.round(ratio * 100)}% of the ${basis}. Additional funding would likely be needed for the remaining tuition and other costs.` };
  if (ratio >= 0.25) return { score: 58, adjustment: -1, label: "Limited tuition coverage", note: `Entered funds cover about ${Math.round(ratio * 100)}% of the ${basis}. UniPath applies a small planning penalty rather than assuming the course is unaffordable.` };
  return { score: 42, adjustment: -3, label: "Low tuition coverage", note: `Entered funds cover about ${Math.round(ratio * 100)}% of the ${basis}. This lowers financial fit, but does not determine admission or visa eligibility.` };
}

function experienceAssessment(yearsExperience: number, careerScore: number) {
  const years = Math.max(0, Number.isFinite(yearsExperience) ? yearsExperience : 0);
  if (years <= 0) return { score: 50, adjustment: 0, label: "No experience entered", note: "Relevant experience was not used to change the score." };
  if (careerScore < 60) return { score: 55, adjustment: 0, label: "Experience not used as a rescue factor", note: "Experience cannot compensate for weak course-to-career relevance, so it does not raise this result." };
  if (years >= 5) return { score: 90, adjustment: 3, label: "Strong relevant experience", note: `${years} years of relevant experience provides a modest positive career-context adjustment. It is not treated as admission evidence unless a university requirement explicitly says so.` };
  if (years >= 2) return { score: 80, adjustment: 2, label: "Useful relevant experience", note: `${years} years of relevant experience provides a small positive career-context adjustment.` };
  return { score: 68, adjustment: 1, label: "Some relevant experience", note: `${years} years of relevant experience provides a small positive context signal.` };
}

function skillsAssessment(skills: string[], courseName: string, studyField: string | null | undefined, occupationName: string, careerScore: number) {
  const cleaned = [...new Set(skills.map((skill) => skill.trim()).filter(Boolean))];
  if (!cleaned.length) return { score: 50, adjustment: 0, label: "No skills entered", matched: [] as string[], note: "Skills were not used to change the detailed score." };

  const targetTokens = new Set(normaliseTokens(`${courseName} ${studyField ?? ""} ${occupationName}`));
  const matched = cleaned.filter((skill) => {
    const skillTokens = normaliseTokens(skill);
    return skillTokens.some((token) => targetTokens.has(token) || [...targetTokens].some((target) => target.includes(token) || token.includes(target)));
  });

  if (!matched.length) return { score: 52, adjustment: 0, label: "No clear skill overlap", matched, note: "The entered skills do not clearly overlap with the course/career text, so UniPath does not guess relevance." };
  if (careerScore < 60) return { score: 58, adjustment: 0, label: "Skill overlap, weak career fit", matched, note: "Some skills overlap, but they cannot rescue a course with weak career relevance." };
  const adjustment = matched.length >= 3 ? 3 : matched.length === 2 ? 2 : 1;
  return { score: clamp(65 + matched.length * 8), adjustment, label: "Relevant skill overlap", matched: matched.slice(0, 5), note: `Matched skill${matched.length === 1 ? "" : "s"}: ${matched.slice(0, 5).join(", ")}. This is a text-based fit signal, not proof of prerequisite competence.` };
}

function dependantAssessment(dependants: number, totalFunds: number) {
  const count = Math.max(0, Math.floor(Number.isFinite(dependants) ? dependants : 0));
  if (count === 0) return { score: 80, adjustment: 0, label: "No dependant adjustment", note: "No dependants were entered, so household size does not change the detailed score." };
  if (!(totalFunds > 0)) return { score: 55, adjustment: -1, label: "Household costs need review", note: `${count} dependant${count === 1 ? "" : "s"} entered. Because no total-funds amount is available, UniPath applies only a small planning caution and does not estimate visa financial requirements.` };
  const adjustment = -Math.min(3, count);
  return { score: clamp(72 - count * 8), adjustment, label: "Higher household cost pressure", note: `${count} dependant${count === 1 ? "" : "s"} may increase real living and travel costs. This is only a planning adjustment; UniPath is not calculating government financial-capacity requirements here.` };
}

export function assessDetailedProfile(input: DetailedAssessmentInput): DetailedAssessment {
  const funding = fundingAssessment(input.totalFunds, input.totalFee, input.annualFee);
  const experience = experienceAssessment(input.yearsExperience, input.careerScore);
  const skills = skillsAssessment(input.skills, input.courseName, input.studyField, input.occupationName, input.careerScore);
  const dependants = dependantAssessment(input.dependants, input.totalFunds);

  const adjustment = funding.adjustment + experience.adjustment + skills.adjustment + dependants.adjustment;
  const adjustedScore = careerGate(clamp(input.baseScore + adjustment), input.careerScore);

  return {
    adjustedScore,
    adjustment,
    funding: { score: funding.score, label: funding.label, note: funding.note },
    experience: { score: experience.score, label: experience.label, note: experience.note },
    skills: { score: skills.score, label: skills.label, matched: skills.matched, note: skills.note },
    dependants: { score: dependants.score, label: dependants.label, note: dependants.note },
  };
}
