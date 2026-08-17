import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import benefitNeedsSurvey from "../netlify/functions/benefit-needs-survey.mjs";
import { loadBenefitNeedsSurveySummary } from "../netlify/lib/benefit-needs-survey.mjs";

const html = await readFile(new URL("../public/arena/index.html", import.meta.url), "utf8");
const client = await readFile(new URL("../public/arena/arena.js", import.meta.url), "utf8");
const marketClient = await readFile(new URL("../public/arena/market.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/arena/arena.css", import.meta.url), "utf8");
const marketCss = await readFile(new URL("../public/arena/market.css", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260817190000_sc_arena_benefit_need_admin_summary.sql", import.meta.url), "utf8");
const queueMigration = await readFile(new URL("../supabase/migrations/20260817210000_sc_arena_benefit_need_staff_queue.sql", import.meta.url), "utf8");

const STAFF = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "staff@sparklabs.co.kr",
  role: "sparklabs",
  canScore: true
};

test("admin benefit notice replaces Featured Perks with a privacy-safe request count", () => {
  assert.match(html, /class="metric-grid"[\s\S]*?id="curatedCompaniesCard"[\s\S]*?id="adminBenefitRequestNotice" class="metric-card admin-benefit-request-notice"[^>]*data-show-for-admin[^>]*hidden/);
  assert.match(html, /Claw Member가 비공개로 새로 제출한 혜택 수요만 집계합니다/);
  assert.match(client, /fetch\("\/api\/benefit-needs-survey"[\s\S]*?cache: "no-store"/);
  assert.match(client, /staffSummary\.newRequestCount/);
  assert.match(client, /staffSummary\.latestSubmittedAt/);
  assert.match(client, /clawMemberViewer \|\| \(element\.hasAttribute\("data-hide-from-admin"\) && adminViewer\)/);
  assert.doesNotMatch(client, /staffSummary\.(?:details|email|contact)/);
  assert.match(css, /\.admin-benefit-request-notice\s*{[\s\S]*?grid-template-columns/);
  assert.match(css, /body\.is-admin-viewer #overviewPage > \.metric-grid\s*{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?body\.is-admin-viewer #overviewPage > \.metric-grid\s*{[\s\S]*?grid-template-columns: 1fr/);
});

test("benefit request summary RPC exposes counts and time only to the service role", () => {
  assert.match(migration, /create or replace function public\.sc_arena_benefit_need_survey_summary/i);
  assert.match(migration, /count\(\*\) filter \(where s\.status = 'submitted'\)/i);
  assert.match(migration, /max\(s\.submitted_at\)/i);
  assert.doesNotMatch(migration, /s\.details|respondent_user_id/);
  assert.match(migration, /revoke all[\s\S]*?from public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*?to service_role/i);
});

test("staff My Log replaces duplicate review and bounty intake cards with benefit requests", () => {
  assert.match(html, /<h2>혜택·파트너십 Queue<\/h2>/);
  assert.match(marketClient, /<h3>혜택 신청<\/h3>/);
  assert.match(marketClient, /payload\.staffSummary\.requests/);
  assert.match(marketClient, /solutionName/);
  assert.match(marketClient, /solutionDetails/);
  assert.match(marketClient, /solutionReason/);
  assert.doesNotMatch(marketClient, /<h3>Tech Passport review<\/h3>/);
  assert.doesNotMatch(marketClient, /<h3>Bounty intake<\/h3>/);
  assert.match(marketCss, /\.staff-queue-columns\s*{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("staff benefit queue RPC returns bounded request details without respondent identity", () => {
  assert.match(queueMigration, /create or replace function public\.sc_arena_benefit_need_survey_summary/i);
  assert.match(queueMigration, /limit 12/i);
  assert.match(queueMigration, /organization_name/i);
  assert.match(queueMigration, /'details', r\.details/i);
  assert.doesNotMatch(queueMigration, /s\.solution_name|s\.solution_reason/i);
  assert.doesNotMatch(queueMigration, /s\.respondent_user_id|auth\.users|['"]email['"]/i);
  assert.match(queueMigration, /revoke all[\s\S]*?from public, anon, authenticated/i);
  assert.match(queueMigration, /grant execute[\s\S]*?to service_role/i);
});

test("staff API returns the aggregate while member request details stay out of the response", async () => {
  const response = await benefitNeedsSurvey(new Request("https://example.com/api/benefit-needs-survey"), {
    verifyRequest: async () => ({ ok: true, status: 200, viewer: STAFF }),
    loadSurveySummary: async () => ({
      available: true,
      summary: { newRequestCount: 3, currentRequestCount: 5, latestSubmittedAt: "2026-08-17T09:00:00Z" }
    })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    available: true,
    staffSummary: { newRequestCount: 3, currentRequestCount: 5, latestSubmittedAt: "2026-08-17T09:00:00Z" },
    reason: ""
  });
});

test("summary loader calls only the bounded staff aggregate RPC", async () => {
  let request;
  const result = await loadBenefitNeedsSurveySummary({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_example"
    },
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return Response.json({
        new_request_count: 2,
        current_request_count: 7,
        latest_submitted_at: "2026-08-17T10:00:00Z"
      });
    }
  });
  assert.match(request.url, /\/rest\/v1\/rpc\/sc_arena_benefit_need_survey_summary$/);
  assert.deepEqual(request.body, { p_workspace_slug: "sparkclaw-ai-arena" });
  assert.deepEqual(result.summary, {
    newRequestCount: 2,
    currentRequestCount: 7,
    latestSubmittedAt: "2026-08-17T10:00:00Z",
    requests: []
  });
});

test("summary loader projects staff queue details without respondent identifiers", async () => {
  const result = await loadBenefitNeedsSurveySummary({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_example"
    },
    fetchImpl: async () => Response.json({
      new_request_count: 1,
      current_request_count: 1,
      latest_submitted_at: "2026-08-17T11:00:00Z",
      requests: [{
        id: "request-1",
        organization_name: "Claw Team",
        solution_name: "GPU 크레딧",
        solution_details: "대규모 모델 실험을 위한 GPU 크레딧이 필요합니다.",
        solution_reason: "반복 실험 시간을 줄이고 제품 검증 속도를 높이기 위해 필요합니다.",
        status: "submitted",
        submitted_at: "2026-08-17T11:00:00Z",
        respondent_user_id: "must-not-leak",
        email: "must-not-leak@example.com"
      }]
    })
  });
  assert.deepEqual(result.summary.requests, [{
    id: "request-1",
    organizationName: "Claw Team",
    solutionName: "GPU 크레딧",
    solutionDetails: "대규모 모델 실험을 위한 GPU 크레딧이 필요합니다.",
    solutionReason: "반복 실험 시간을 줄이고 제품 검증 속도를 높이기 위해 필요합니다.",
    status: "submitted",
    submittedAt: "2026-08-17T11:00:00Z"
  }]);
  assert.equal("respondentUserId" in result.summary.requests[0], false);
  assert.equal("email" in result.summary.requests[0], false);
});
