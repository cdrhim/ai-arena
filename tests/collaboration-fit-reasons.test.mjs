import assert from "node:assert/strict";
import test from "node:test";

import collaborationFitReasonsApi, {
  trustedFitContext
} from "../netlify/functions/collaboration-fit-reasons.mjs";
import {
  buildCollaborationFitReasons,
  fallbackReason
} from "../netlify/lib/collaboration-fit-reasons.mjs";

const companies = [
  {
    id: "team-a",
    name: "엔사이버",
    score: 93,
    fitReason: "API 연동 + 제조 데이터 기반 · SaaS 적용",
    evidence: ["프로필에 명시된 역량: API 연동", "카테고리: SaaS"],
    ownerEmail: "private@example.com",
    internalNote: "never-send-this"
  },
  {
    id: "team-b",
    name: "페더레이션",
    score: 91,
    fitReason: "AI 에이전트 기반 · 업무 자동화 적용",
    evidence: ["프로필에 명시된 역량: AI 에이전트"]
  }
];

test("Spark AI receives only allowlisted fit evidence and keeps exact company anchors", async () => {
  let requestBody = "";
  const result = await buildCollaborationFitReasons({ subjectLabel: "테스트 기업", companies }, {
    env: { GEMINI_API_KEY: "server-only-key" },
    fetchImpl: async (_url, init) => {
      requestBody = String(init.body || "");
      assert.equal(init.headers["x-goog-api-key"], "server-only-key");
      return Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          items: [
            { id: "team-a", reason: "작은 범위에서 연결 비용과 운영 부담을 먼저 확인하기 좋습니다." },
            { id: "invented-team", reason: "존재하지 않는 기업입니다." }
          ]
        }) }] } }]
      });
    }
  });

  assert.equal(result.source, "spark_ai");
  assert.equal(result.model, null);
  assert.deepEqual(result.items.map((item) => item.id), ["team-a", "team-b"]);
  assert.match(result.items[0].reason, /연결 비용/);
  assert.doesNotMatch(result.items[0].reason, /API 연동|SaaS/);
  assert.match(result.items[1].reason, /반복 작업/);
  assert.doesNotMatch(result.items[1].reason, /AI 에이전트|자동화/);
  assert.match(requestBody, /테스트 기업/);
  assert.match(requestBody, /fitReason의 기술명·산업명·단계명이나 같은 명사구를 문장에 다시 쓰지 마세요/);
  assert.doesNotMatch(requestBody, /private@example\.com|never-send-this|server-only-key/);
  assert.doesNotMatch(JSON.stringify(result), /invented-team/);
});

test("fit reasons remain one useful sentence when the provider is unavailable", async () => {
  const result = await buildCollaborationFitReasons({ subjectLabel: "테스트 기업", companies: [companies[0]] }, {
    env: { GEMINI_API_KEY: "server-only-key" },
    fetchImpl: async () => { throw new Error("offline"); }
  });

  assert.equal(result.source, "deterministic_fallback");
  assert.equal(result.items[0].reason, fallbackReason(companies[0]));
  assert.match(result.items[0].reason, /현장 한 공정/);
  assert.doesNotMatch(result.items[0].reason, /API 연동|제조 데이터|SaaS/);
  assert.match(result.items[0].reason, /\.$/);
});

test("provider copy that repeats the displayed match basis is replaced with a distinct action suggestion", async () => {
  const result = await buildCollaborationFitReasons({ subjectLabel: "테스트 기업", companies: [companies[0]] }, {
    env: { GEMINI_API_KEY: "server-only-key" },
    fetchImpl: async () => Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        items: [{ id: "team-a", reason: "API 연동과 SaaS 적용 근거가 좋아 우선 검토 대상으로 선정했습니다." }]
      }) }] } }]
    })
  });

  assert.equal(result.items[0].reason, fallbackReason(companies[0]));
  assert.doesNotMatch(result.items[0].reason, /API 연동|SaaS 적용/);
});

test("fit reason API rejects anonymous requests before loading company data", async () => {
  let loaded = false;
  const response = await collaborationFitReasonsApi(new Request("https://example.test/api/collaboration-fit-reasons", {
    method: "POST",
    body: "{}"
  }), {
    verifyRequest: async () => ({ ok: false, status: 401 }),
    loadProgramHub: async () => { loaded = true; return {}; }
  });

  assert.equal(response.status, 401);
  assert.equal(loaded, false);
});

test("fit reason API uses the authenticated member's trusted match list", async () => {
  let received = null;
  const response = await collaborationFitReasonsApi(new Request("https://example.test/api/collaboration-fit-reasons", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: ["team-b", "not-trusted"] })
  }), {
    verifyRequest: async () => ({ ok: true, viewer: { id: "member-1", role: "public", email: "member@example.com" } }),
    consumeRateLimit: async () => ({ allowed: true }),
    loadProgramHub: async () => ({
      viewer: { id: "member-1", role: "member" },
      viewerTeam: { id: "viewer-team", name: "회원 기업" },
      metrics: { collaborationFitCompanies: companies }
    }),
    buildCollaborationFitReasons: async (input) => {
      received = input;
      return { items: input.companies.map((company) => ({ id: company.id, reason: "선정 이유입니다." })), source: "spark_ai", model: null };
    }
  });

  assert.equal(response.status, 200);
  assert.equal(received.subjectLabel, "회원 기업");
  assert.deepEqual(received.companies.map((company) => company.id), ["team-b"]);
  assert.deepEqual((await response.json()).reasons.items.map((item) => item.id), ["team-b"]);
});

test("trusted context recalculates partner matches from the authenticated partner profile", async () => {
  const context = await trustedFitContext({ id: "partner-1", role: "b2b_partner" }, [], {
    loadProgramHub: async () => ({
      viewer: { id: "partner-1", role: "b2b_partner", b2bProfileId: "profile-1" },
      partnerDirectory: [{
        id: "candidate-1",
        name: "제조 자동화 기업",
        sector: "Manufacturing",
        oneLiner: "공장 데이터를 연결하는 AI 자동화 솔루션",
        matchingKeywords: ["제조", "자동화", "AI 에이전트"]
      }],
      metrics: { collaborationFitCompanies: [] }
    }),
    loadExternalPartnerProfiles: async () => [{
      id: "profile-1",
      ownerUserId: "partner-1",
      organizationName: "파트너 기업",
      focusCategories: ["제조"],
      desiredCapabilities: ["자동화"],
      thesis: "공장 AI 전환"
    }]
  });

  assert.equal(context.role, "b2b_partner");
  assert.equal(context.subjectLabel, "파트너 기업");
  assert.deepEqual(context.companies.map((company) => company.id), ["candidate-1"]);
});
