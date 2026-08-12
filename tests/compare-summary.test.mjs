import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import compareSummaryApi, { selectComparisonTeams } from "../netlify/functions/compare-summary.mjs";
import { buildComparisonSummary, fallbackComparisonSummary } from "../netlify/lib/compare-summary.mjs";

const teams = [
  {
    id: "robot",
    name: "로브스터",
    sector: "Robotics",
    oneLiner: "제조 현장 로봇 자동화",
    serviceSummary: "비전 기반 로봇 작업 자동화",
    aiIdeaSummary: "컴퓨터 비전으로 작업 상태를 판별",
    matchingKeywords: ["로보틱스", "컴퓨터 비전"],
    email: "private@example.com"
  },
  {
    id: "milk",
    name: "우유랩스",
    sector: "Data Analytics",
    oneLiner: "수요 예측과 운영 분석",
    serviceSummary: "판매 데이터를 활용한 수요 예측",
    aiIdeaSummary: "예측 모델로 재고 의사결정 지원",
    matchingKeywords: ["수요 예측", "데이터 분석"]
  }
];

test("Gemini comparison receives only public profile fields and stays anchored to selected teams", async () => {
  let requestBody = "";
  const result = await buildComparisonSummary(teams, {
    env: { GEMINI_API_KEY: "server-only-key", GEMINI_COMPARE_MODEL: "gemini-2.5-flash" },
    fetchImpl: async (_url, init) => {
      requestBody = String(init.body || "");
      assert.equal(init.headers["x-goog-api-key"], "server-only-key");
      return Response.json({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                overview: "로브스터는 로봇 자동화, 우유랩스는 수요 예측에 초점이 있습니다.",
                teamHighlights: [
                  { teamId: "robot", differentiator: "제조 로봇과 비전 자동화에 집중합니다." },
                  { teamId: "milk", differentiator: "판매 데이터 기반 수요 예측에 집중합니다." },
                  { teamId: "unselected", differentiator: "선택되지 않은 기업" }
                ],
                keyDifferences: ["적용 현장이 제조와 운영 분석으로 다릅니다.", "AI 활용 방식이 비전과 예측으로 구분됩니다."]
              })
            }]
          }
        }]
      });
    }
  });

  assert.equal(result.source, "spark_ai");
  assert.equal(result.model, null);
  assert.deepEqual(result.teamHighlights.map((item) => item.teamId), ["robot", "milk"]);
  assert.deepEqual(result.teamHighlights.map((item) => item.teamName), ["로브스터", "우유랩스"]);
  assert.doesNotMatch(requestBody, /private@example\.com/);
  assert.doesNotMatch(JSON.stringify(result), /unselected/);
});

test("comparison falls back to deterministic public-profile differences when Gemini is unavailable", async () => {
  const result = await buildComparisonSummary(teams, {
    env: { GEMINI_API_KEY: "server-only-key" },
    fetchImpl: async () => Response.json({ error: { message: "quota" } }, { status: 429 })
  });

  assert.equal(result.source, "profile_fallback");
  assert.equal(result.teamHighlights.length, 2);
  assert.match(result.warning, /공개 프로필/);
  assert.deepEqual(fallbackComparisonSummary(teams).teamHighlights.map((item) => item.teamId), ["robot", "milk"]);
});

test("comparison summary API rejects anonymous requests before loading company data", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousAnon = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  try {
    const response = await compareSummaryApi(new Request("https://example.test/api/compare-summary", {
      method: "POST",
      body: JSON.stringify({ teamIds: ["robot", "milk"] })
    }));
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /로그인이 필요합니다/);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousAnon === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previousAnon;
  }
});

test("Program DB participant logins receive Claw Member comparison analysis", async () => {
  let resolved = false;
  const response = await compareSummaryApi(new Request("https://example.test/api/compare-summary", {
    method: "POST",
    body: JSON.stringify({ teamIds: ["robot", "milk"] })
  }), {
    verifyRequest: async () => ({
      ok: true,
      viewer: { id: "auth-member", email: "member@example.com", role: "public", canScore: false }
    }),
    resolveProgramViewer: async (viewer) => {
      resolved = true;
      return { viewer: { ...viewer, role: "member", roleLabel: "Claw Member" }, isParticipant: true };
    },
    consumeRateLimit: async () => ({ allowed: true }),
    loadPartnerDirectory: async () => teams,
    buildComparisonSummary: async (selectedTeams) => ({
      source: "profile_fallback",
      overview: "승인된 Claw Member 비교",
      teamHighlights: selectedTeams.map((team) => ({ teamId: team.id, teamName: team.name, differentiator: team.oneLiner })),
      keyDifferences: []
    })
  });

  assert.equal(response.status, 200);
  assert.equal(resolved, true);
  assert.equal((await response.json()).summary.overview, "승인된 Claw Member 비교");
});

test("staff comparison resolves both Program DB and Arena profile IDs", () => {
  const selected = selectComparisonTeams(
    ["program-team", "arena-team"],
    [{ id: "program-team", name: "Program company" }],
    [{ id: "arena-team", name: "Arena company", ownerEmail: "private@example.com" }],
    [],
    { canScore: true }
  );

  assert.deepEqual(selected.map((team) => team.id), ["program-team", "arena-team"]);
});

test("non-staff comparison can resolve only published public Arena profiles", () => {
  const startups = [
    { id: "public-team", name: "Public company" },
    { id: "private-team", name: "Private company" }
  ];
  const selected = selectComparisonTeams(
    ["public-team", "private-team"],
    [],
    startups,
    [{ id: "public-team", status: "published", visibility: "public" }, { id: "private-team", status: "draft", visibility: "private" }],
    { role: "member", canScore: false }
  );

  assert.deepEqual(selected.map((team) => team.id), ["public-team"]);
});

test("comparison UI requests the server summary and keeps the API key out of public assets", () => {
  const client = readFileSync("public/arena/market.js", "utf8");
  const css = readFileSync("public/arena/market.css", "utf8");
  const html = readFileSync("public/arena/index.html", "utf8");
  const config = readFileSync("netlify.toml", "utf8");

  assert.match(client, /fetch\("\/api\/compare-summary"/);
  assert.match(client, /COMPARE_SUMMARY_PROGRESS_STEPS/);
  assert.match(client, /AGENTIC COMPARISON/);
  assert.match(css, /\.compare-summary-card/);
  assert.match(config, /from = "\/api\/compare-summary"/);
  assert.doesNotMatch(`${client}\n${css}\n${html}`, /GEMINI_API_KEY|GOOGLE_API_KEY|x-goog-api-key/);
});
