import { createHash } from "node:crypto";
import { collaborationFitMetrics } from "./collaboration-fit.mjs";

export const SIMILAR_TEAM_ALGORITHM_VERSION = "profile_similarity_v1";

export function buildSimilarTeamRecommendations({ candidateTeams = [], viewerTeam = null, limit = 6 } = {}) {
  const boundedLimit = Math.min(Math.max(Number(limit) || 6, 1), 12);
  const fit = collaborationFitMetrics({ candidateTeams, viewerTeam });
  if (fit.collaborationFitStatus !== "ready") {
    return {
      status: "profile_required",
      algorithmVersion: SIMILAR_TEAM_ALGORITHM_VERSION,
      population: fit.collaborationFitPopulation,
      recommendations: []
    };
  }

  const recommendations = fit.collaborationFitCompanies.slice(0, boundedLimit).map((company, index) => {
    const sharedSignals = evidenceSignals(company.evidence).slice(0, 4);
    return {
      teamId: String(company.id || ""),
      teamName: String(company.name || "이름 미입력 팀"),
      rank: index + 1,
      score: Math.max(0, Math.min(100, Math.round(Number(company.score || 0)))),
      reason: similarityReason(sharedSignals, company.fitReason),
      sharedSignals,
      evidence: cleanList(company.evidence).slice(0, 4)
    };
  }).filter((item) => item.teamId);

  return {
    status: "ready",
    algorithmVersion: SIMILAR_TEAM_ALGORITHM_VERSION,
    population: fit.collaborationFitPopulation,
    recommendations
  };
}

export function similarTeamSourceFingerprint({ viewerTeam = null, candidateTeams = [] } = {}) {
  const source = {
    algorithmVersion: SIMILAR_TEAM_ALGORITHM_VERSION,
    viewer: profileFingerprintRow(viewerTeam),
    candidates: [...candidateTeams]
      .map(profileFingerprintRow)
      .filter((item) => item.id)
      .sort((left, right) => left.id.localeCompare(right.id))
  };
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

function profileFingerprintRow(team = {}) {
  return {
    id: clean(team.id, 160),
    name: clean(team.name || team.companyName || team.company_name, 240),
    sector: clean(team.sector, 300),
    domain: clean(team.domain, 300),
    oneLiner: clean(team.oneLiner || team.one_liner, 1200),
    serviceSummary: clean(team.serviceSummary || team.service_summary, 3000),
    aiIdeaSummary: clean(team.aiIdeaSummary || team.ai_idea_summary, 3000),
    keywords: cleanList(team.matchingKeywords || team.matching_keywords).slice(0, 40)
  };
}

function evidenceSignals(evidence = []) {
  return cleanList(evidence).flatMap((item) => {
    const separator = item.indexOf(":");
    const value = separator >= 0 ? item.slice(separator + 1) : item;
    return value.split(/[,/|]+/u).map((part) => clean(part, 80)).filter(Boolean);
  }).filter(uniqueValue);
}

function similarityReason(sharedSignals, fallback) {
  if (sharedSignals.length >= 2) return `${sharedSignals[0]}와 ${sharedSignals[1]} 역량을 공통으로 다루는 팀입니다.`;
  if (sharedSignals.length === 1) return `${sharedSignals[0]} 역량과 적용 맥락이 유사한 팀입니다.`;
  const safeFallback = clean(fallback, 100).replace(/\s*기반\s*·\s*/u, " 분야와 ");
  return safeFallback ? `${safeFallback} 프로필이 유사합니다.` : "공개 프로필의 산업·역량 구성이 유사한 팀입니다.";
}

function cleanList(values) {
  const input = Array.isArray(values) ? values : String(values || "").split(/[,/|]+/u);
  return input.map((value) => clean(value, 160)).filter(Boolean).filter(uniqueValue);
}

function uniqueValue(value, index, values) {
  return values.findIndex((candidate) => candidate.toLocaleLowerCase("ko-KR") === value.toLocaleLowerCase("ko-KR")) === index;
}

function clean(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
