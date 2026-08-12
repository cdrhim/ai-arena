export const BENEFIT_QUALIFICATIONS = ["discoverer", "validator", "scaler"];

const QUALIFICATION_LABELS = {
  all: "전체 팀",
  discoverer: "Discoverer",
  validator: "Validator",
  scaler: "Scaler"
};

const ACTIVE_APPLICATION_STATUSES = new Set(["interest", "link_sent", "approved"]);

export function normalizeBenefitQualification(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z가-힣]+/g, "");
  if (/discover|디스커버/u.test(normalized)) return "discoverer";
  if (/validat|검증/u.test(normalized)) return "validator";
  if (/scal|스케일/u.test(normalized)) return "scaler";
  if (/all|전체|공통|programbenefit/u.test(normalized)) return "all";
  return "";
}

export function benefitQualificationLabel(value) {
  return QUALIFICATION_LABELS[value] || "자격 확인 필요";
}

export function benefitTargetQualifications(benefit = {}) {
  const source = [benefit.tier, ...(Array.isArray(benefit.eligibility) ? benefit.eligibility : [])]
    .filter(Boolean)
    .join(" ");
  const targets = BENEFIT_QUALIFICATIONS.filter((qualification) => {
    if (qualification === "discoverer") return /discover|디스커버/iu.test(source);
    if (qualification === "validator") return /validat|검증/iu.test(source);
    return /scal|스케일/iu.test(source);
  });
  return targets.length ? targets : ["all"];
}

export function viewerBenefitQualification(viewerTeam = {}) {
  const team = viewerTeam && typeof viewerTeam === "object" ? viewerTeam : {};
  return normalizeBenefitQualification(team.group || team.status || team.teamGroup);
}

export function classifyBenefitForViewer(benefit = {}, viewerQualification = "") {
  const applicationStatus = String(benefit.viewerApplication?.status || "").toLowerCase();
  if (ACTIVE_APPLICATION_STATUSES.has(applicationStatus)) {
    return { key: "progress", label: "신청 진행 중", tone: "progress" };
  }
  if (applicationStatus === "fulfilled") {
    return { key: "progress", label: "활성화 완료", tone: "complete" };
  }

  const targets = benefitTargetQualifications(benefit);
  if (!targets.includes("all")) {
    if (!viewerQualification) return { key: "review", label: "팀 자격 확인 필요", tone: "review" };
    if (!targets.includes(viewerQualification)) return { key: "ineligible", label: "현재 자격 대상 외", tone: "muted" };
  }
  if (benefit.availableToViewer === false) {
    return { key: "ineligible", label: "현재 자격 대상 외", tone: "muted" };
  }

  const verificationStatus = String(benefit.verificationStatus || "confirmed").toLowerCase();
  if (benefit.isActive === false || !["confirmed", "verified"].includes(verificationStatus)) {
    return { key: "review", label: "제공 조건 확인 중", tone: "review" };
  }

  const assessment = benefit.eligibilityAssessment || {};
  if (assessment.status === "ineligible_or_needs_information") {
    const reasons = (assessment.reasons || []).join(" ");
    const definitelyIneligible = /지났|이상|초과|대상\s*아님|충족하지/u.test(reasons);
    return definitelyIneligible
      ? { key: "ineligible", label: "현재 조건 대상 외", tone: "muted" }
      : { key: "review", label: "조건 정보 보완 필요", tone: "review" };
  }
  if (benefit.canApply === false) {
    return { key: "review", label: "신청 조건 확인 필요", tone: "review" };
  }
  return { key: "eligible", label: "지금 신청 가능", tone: "eligible" };
}

export function benefitMatchesQualification(benefit = {}, qualification = "") {
  if (!qualification) return true;
  const targets = benefitTargetQualifications(benefit);
  return targets.includes("all") || targets.includes(qualification);
}
