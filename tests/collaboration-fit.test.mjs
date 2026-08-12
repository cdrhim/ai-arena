import assert from "node:assert/strict";
import test from "node:test";

import {
  collaborationFitMetrics,
  collaborationFitNotApplicable,
  differentiatedFitReason
} from "../netlify/lib/collaboration-fit.mjs";

test("partner collaboration fit is deterministic and counts every matching company beyond the search result limit", () => {
  const candidateTeams = Array.from({ length: 16 }, (_, index) => factoryTeam(`factory-${index + 1}`));
  const partnerProfile = {
    id: "manufacturing-partner",
    organizationName: "Manufacturing Partner",
    entityType: "corporate",
    focusCategories: ["Manufacturing", "Factory DX"],
    preferredRegions: ["Global"],
    thesis: "Global manufacturing factory automation with MES ERP and computer vision quality inspection"
  };

  const first = collaborationFitMetrics({ candidateTeams, partnerProfile });
  const second = collaborationFitMetrics({ candidateTeams, partnerProfile });

  assert.deepEqual(first, second);
  assert.equal(first.collaborationFitStatus, "ready");
  assert.equal(first.collaborationFitCount, 16);
  assert.equal(first.collaborationFitPopulation, 16);
  assert.equal(first.collaborationFitBasis, "stored_profile_keywords_v1");
  assert.equal(first.collaborationFitCompanies.length, 16);
  assert.ok(first.collaborationFitCompanies.every((company) => company.name && Number.isFinite(company.score)));
  assert.ok(first.collaborationFitCompanies.every((company) => company.reason && company.fitReason && company.evidence.length));
  assert.ok(first.collaborationFitCount > 12, "the overview metric must evaluate the full corpus, not the search result limit");
});

test("collaboration fit reasons distinguish capability combinations and application context", () => {
  assert.equal(differentiatedFitReason([
    { field: "capabilities", value: "API 연동, AI 에이전트" },
    { field: "category", value: "SaaS" }
  ]), "API 연동 + AI 에이전트 기반 · SaaS 적용");
  assert.equal(differentiatedFitReason([
    { field: "capabilities", value: "컴퓨터 비전" },
    { field: "category", value: "Manufacturing" },
    { field: "traction", value: "회사 프로필에 기재됨" }
  ]), "컴퓨터 비전 기반 · Manufacturing 적용");
  assert.equal(differentiatedFitReason([
    { field: "query_terms", value: "healthcare, workflow" },
    { field: "stage", value: "Growth" }
  ]), "healthcare + workflow 기반 · Growth 단계");
});

test("member collaboration fit excludes the viewer team and deduplicates candidate companies", () => {
  const viewerTeam = factoryTeam("viewer");
  const candidateTeams = [
    viewerTeam,
    factoryTeam("peer-one"),
    factoryTeam("peer-two"),
    { ...factoryTeam("peer-two"), name: "Duplicate peer row" }
  ];

  const result = collaborationFitMetrics({ candidateTeams, viewerTeam });

  assert.equal(result.collaborationFitStatus, "ready");
  assert.equal(result.collaborationFitPopulation, 2);
  assert.equal(result.collaborationFitCount, 2);
  assert.equal(result.collaborationFitCompanies.length, 2);
});

test("missing or incomplete account profiles return profile_required with a null count", () => {
  const candidateTeams = [factoryTeam("one"), factoryTeam("two")];

  const missing = collaborationFitMetrics({ candidateTeams });
  const incomplete = collaborationFitMetrics({
    candidateTeams,
    viewerTeam: { id: "viewer", name: "Incomplete Company" }
  });

  for (const result of [missing, incomplete]) {
    assert.equal(result.collaborationFitStatus, "profile_required");
    assert.equal(result.collaborationFitCount, null);
    assert.equal(result.collaborationFitPopulation, 2);
    assert.equal(result.collaborationFitBasis, "stored_profile_keywords_v1");
    assert.deepEqual(result.collaborationFitCompanies, []);
  }
});

test("accounts without an applicable company profile keep null distinct from zero matches", () => {
  assert.deepEqual(collaborationFitNotApplicable(76), {
    collaborationFitCount: null,
    collaborationFitStatus: "not_applicable",
    collaborationFitPopulation: 76,
    collaborationFitBasis: "stored_profile_keywords_v1",
    collaborationFitCompanies: []
  });
});

function factoryTeam(id) {
  return {
    id,
    name: `Factory AI ${id}`,
    sector: "Manufacturing",
    domain: "Factory DX",
    oneLiner: "MES ERP factory automation and computer vision quality inspection",
    serviceSummary: "Manufacturing automation for production optimization and visual defect inspection.",
    matchingKeywords: ["Manufacturing", "Factory DX", "Computer Vision", "Quality Inspection"],
    group: "Scaler",
    websiteUrl: `https://${id}.example.com`
  };
}
