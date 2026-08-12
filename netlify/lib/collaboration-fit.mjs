import { fallbackMatches, partnerDirectoryCandidates } from "./b2b-match-ai.mjs";

const BASIS = "stored_profile_keywords_v1";

export function collaborationFitMetrics({ candidateTeams = [], viewerTeam = null, partnerProfile = null } = {}) {
  const subject = partnerProfile
    ? partnerSubject(partnerProfile)
    : viewerTeam
      ? teamSubject(viewerTeam)
      : null;
  const subjectTeamId = viewerTeam ? value(viewerTeam.id) : "";
  const candidates = uniqueTeams(candidateTeams)
    .filter((team) => !subjectTeamId || value(team.id) !== subjectTeamId);
  const population = candidates.length;

  if (!subject || !subject.ready) {
    return {
      collaborationFitCount: null,
      collaborationFitStatus: "profile_required",
      collaborationFitPopulation: population,
      collaborationFitBasis: BASIS,
      collaborationFitCompanies: []
    };
  }

  const matches = fallbackMatches(partnerDirectoryCandidates(candidates), [subject.profile]);
  const matchedCompanies = uniqueMatchedCompanies(matches);

  return {
    collaborationFitCount: matchedCompanies.length,
    collaborationFitStatus: "ready",
    collaborationFitPopulation: population,
    collaborationFitBasis: BASIS,
    collaborationFitCompanies: matchedCompanies
  };
}

export function collaborationFitNotApplicable(population = 0) {
  return {
    collaborationFitCount: null,
    collaborationFitStatus: "not_applicable",
    collaborationFitPopulation: Math.max(0, Number(population || 0)),
    collaborationFitBasis: BASIS,
    collaborationFitCompanies: []
  };
}

function teamSubject(team) {
  const name = value(team.name || team.companyName || team.company_name);
  const categories = uniqueList([
    ...splitList(team.sector),
    ...splitList(team.domain),
    ...splitList(team.matchingKeywords || team.matching_keywords)
  ]);
  const descriptions = uniqueList([
    team.oneLiner || team.one_liner,
    team.serviceSummary || team.service_summary,
    team.aiIdeaSummary || team.ai_idea_summary,
    team.expertise,
    team.item,
    splitList(team.matchingKeywords || team.matching_keywords).join(" ")
  ]);
  return {
    ready: Boolean(name && categories.length && descriptions.length),
    profile: {
      id: `viewer-team-${value(team.id) || slug(name)}`,
      name,
      entityType: "startup",
      focusCategories: categories,
      targetStages: [],
      preferredRegions: [],
      thesis: descriptions.join(" ")
    }
  };
}

function uniqueMatchedCompanies(matches) {
  const byProduct = new Map();
  for (const match of Array.isArray(matches) ? matches : []) {
    if (!match?.matchable || (match.hardConstraintFailures || []).length) continue;
    const productId = value(match.productId);
    if (!productId || byProduct.has(productId)) continue;
    const evidence = uniqueList(match.matchReasons).slice(0, 3);
    byProduct.set(productId, {
      id: productId.replace(/^program-team-/, ""),
      name: value(match.productName) || "이름 미입력 기업",
      score: Math.max(0, Math.min(100, Math.round(Number(match.score || 0)))),
      reason: value(match.reason),
      fitReason: differentiatedFitReason(match.evidence),
      evidence
    });
  }
  return [...byProduct.values()].sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "ko"));
}

export function differentiatedFitReason(evidence = []) {
  const records = Array.isArray(evidence) ? evidence.filter((item) => item && typeof item === "object") : [];
  const capabilities = splitEvidenceValue(records.find((item) => item.field === "capabilities")?.value);
  const terms = splitEvidenceValue(records.find((item) => item.field === "query_terms")?.value);
  const category = value(records.find((item) => item.field === "category")?.value);
  const stage = value(records.find((item) => item.field === "stage")?.value);
  const hasTraction = records.some((item) => item.field === "traction");
  const anchors = capabilities.length ? capabilities.slice(0, 2) : terms.slice(0, 2);
  const anchor = anchors.join(" + ") || category;
  const normalizedAnchor = normalize(anchor);
  const qualifiers = [];

  if (category && !normalizedAnchor.includes(normalize(category))) qualifiers.push(`${category} 적용`);
  if (stage) qualifiers.push(`${stage} 단계`);
  if (hasTraction) qualifiers.push("성과 프로필 보유");
  const distinctTerm = terms.find((term) => !normalizedAnchor.includes(normalize(term)));
  if (!qualifiers.length && distinctTerm) qualifiers.push(`${distinctTerm} 프로필 근거`);
  if (!qualifiers.length) qualifiers.push("공개 프로필 근거");

  if (!anchor) return "공개 프로필에서 협업 근거 확인";
  return `${anchor} 기반 · ${qualifiers[0]}`.slice(0, 120);
}

function partnerSubject(profile) {
  const name = value(profile.organizationName || profile.name || "기업 파트너");
  const categories = uniqueList([
    ...(Array.isArray(profile.focusCategories) ? profile.focusCategories : []),
    ...(Array.isArray(profile.desiredCapabilities) ? profile.desiredCapabilities : [])
  ]);
  const thesisParts = uniqueList([
    profile.thesis,
    profile.defaultDiscoveryPrompt,
    ...(Array.isArray(profile.priorityProblems) ? profile.priorityProblems : []),
    ...priorityText(profile.priorities),
    ...needText(profile.needs)
  ]);
  return {
    ready: Boolean(name && (categories.length || thesisParts.length)),
    profile: {
      id: value(profile.id) || `viewer-partner-${slug(name)}`,
      name,
      entityType: value(profile.entityType || profile.partnerType || "corporate"),
      focusCategories: categories,
      targetStages: uniqueList(profile.targetStages),
      preferredRegions: uniqueList(profile.preferredRegions),
      thesis: thesisParts.join(" ")
    }
  };
}

function uniqueTeams(teams) {
  const byId = new Map();
  for (const team of Array.isArray(teams) ? teams : []) {
    const id = value(team?.id);
    const name = value(team?.name || team?.companyName || team?.company_name);
    if (!id || !name || byId.has(id)) continue;
    byId.set(id, team);
  }
  return [...byId.values()];
}

function priorityText(priorities) {
  if (!Array.isArray(priorities)) return [];
  return priorities.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!item || typeof item !== "object") return [];
    return [
      item.title,
      item.summary,
      item.matchingQuery,
      item.problem,
      item.hypothesis,
      item.opportunity,
      item.desiredCapability,
      item.successMetric,
      ...(Array.isArray(item.startupCapabilities) ? item.startupCapabilities : [])
    ];
  });
}

function needText(needs) {
  if (!needs || typeof needs !== "object") return [];
  return Object.values(needs).flatMap((item) => {
    if (Array.isArray(item)) return item;
    if (item && typeof item === "object") return Object.values(item);
    return item;
  });
}

function splitList(input) {
  const values = Array.isArray(input) ? input : String(input || "").split(/[,/|]+/u);
  return values.map(value).filter(Boolean);
}

function splitEvidenceValue(input) {
  return uniqueList(String(input || "").split(/[,/|]+/u));
}

function normalize(input) {
  return String(input || "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

function uniqueList(input) {
  const seen = new Set();
  const values = [];
  for (const item of Array.isArray(input) ? input : []) {
    const text = value(item);
    const key = text.toLocaleLowerCase("ko-KR");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    values.push(text);
  }
  return values.slice(0, 80);
}

function value(input) {
  if (input === undefined || input === null) return "";
  if (typeof input === "object") return "";
  return String(input).trim();
}

function slug(input) {
  return value(input)
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9가-힣]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "profile";
}
