import assert from "node:assert/strict";
import test from "node:test";

import benefitNeedsSurvey from "../netlify/functions/benefit-needs-survey.mjs";
import {
  loadBenefitNeedsSurvey,
  submitBenefitNeedsSurvey,
  validateBenefitNeedsSurvey
} from "../netlify/lib/benefit-needs-survey.mjs";

const MEMBER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "member@example.com",
  role: "member",
  organization: "Member Team"
};
const ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_example"
};

test("benefit request validation requires a name, details, and a reason", () => {
  assert.throws(() => validateBenefitNeedsSurvey({ solutionDetails: "충분히 구체적인 요청입니다." }), /솔루션 명/);
  assert.throws(() => validateBenefitNeedsSurvey({ solutionName: "AI", solutionDetails: "짧음", solutionReason: "효과를 확인하기 위해 필요합니다." }), /10자/);
  assert.throws(() => validateBenefitNeedsSurvey({ solutionName: "AI", solutionDetails: "고객 문의를 자동 분류하는 기능이 필요합니다.", solutionReason: "짧음" }), /필요한 이유/);
  assert.deepEqual(validateBenefitNeedsSurvey({
    solutionName: " 고객지원 AI 도구 Pro ",
    solutionDetails: " 반복 문의를 자동 분류하고 답변 초안을 만들어야 합니다. ",
    solutionReason: " 상담 응답 시간을 줄이고 담당자의 반복 업무를 줄이기 위해 필요합니다. "
  }), {
    solutionName: "고객지원 AI 도구 Pro",
    solutionDetails: "반복 문의를 자동 분류하고 답변 초안을 만들어야 합니다.",
    solutionReason: "상담 응답 시간을 줄이고 담당자의 반복 업무를 줄이기 위해 필요합니다."
  });
});

test("benefit request writes all three fields through the dedicated service RPC", async () => {
  let request;
  const result = await submitBenefitNeedsSurvey({
    viewer: MEMBER,
    viewerTeamId: "team-17",
    viewerTeamName: "Member Team",
    survey: {
      solutionName: "고객지원 AI 도구 Pro",
      solutionDetails: "반복 문의를 자동 분류하고 답변 초안을 생성해야 합니다.",
      solutionReason: "상담 응답 시간을 줄이고 고객 만족도를 높이기 위해 필요합니다."
    },
    env: ENV,
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return Response.json({
        id: "22222222-2222-4222-8222-222222222222",
        response_version: 1,
        solution_name: "고객지원 AI 도구 Pro",
        solution_details: "반복 문의를 자동 분류하고 답변 초안을 생성해야 합니다.",
        solution_reason: "상담 응답 시간을 줄이고 고객 만족도를 높이기 위해 필요합니다.",
        status: "submitted",
        submitted_at: "2026-08-17T10:00:00Z"
      });
    }
  });

  assert.equal(result.stored, true);
  assert.match(request.url, /\/rest\/v1\/rpc\/sc_arena_submit_benefit_solution_request$/);
  assert.equal(request.options.headers.apikey, "sb_secret_example");
  assert.equal(request.body.p_organization_source, "program_team");
  assert.equal(request.body.p_organization_key, "team-17");
  assert.equal(request.body.p_solution_name, "고객지원 AI 도구 Pro");
  assert.equal(request.body.p_solution_details, "반복 문의를 자동 분류하고 답변 초안을 생성해야 합니다.");
  assert.equal(request.body.p_solution_reason, "상담 응답 시간을 줄이고 고객 만족도를 높이기 위해 필요합니다.");
  assert.equal(result.survey.solutionName, "고객지원 AI 도구 Pro");
  assert.equal(result.survey.solutionReason, "상담 응답 시간을 줄이고 고객 만족도를 높이기 위해 필요합니다.");
  assert.doesNotMatch(request.url, /forum|community/);
});

test("deployed legacy schema stores both new fields without losing the solution name", async () => {
  const requests = [];
  const result = await submitBenefitNeedsSurvey({
    viewer: MEMBER,
    survey: {
      solutionName: "계약서 검토 자동화",
      solutionDetails: "반복되는 계약 조항 검토와 위험 표시를 자동화해야 합니다.",
      solutionReason: "법무 검토 시간을 줄이고 누락되는 위험 조항을 방지하기 위해 필요합니다."
    },
    env: ENV,
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      if (url.endsWith("sc_arena_submit_benefit_solution_request")) {
        return Response.json({ code: "PGRST202", message: "missing function" }, { status: 404 });
      }
      return Response.json({
        id: "33333333-3333-4333-8333-333333333333",
        response_version: 1,
        details: JSON.parse(options.body).p_details,
        status: "submitted"
      });
    }
  });

  assert.equal(result.stored, true);
  assert.equal(result.reason, "legacy_schema");
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /sc_arena_submit_benefit_need_survey$/);
  assert.deepEqual(requests[1].body.p_categories, ["other"]);
  assert.match(requests[1].body.p_details, /^솔루션 명: 계약서 검토 자동화\n\n솔루션 세부 내용:/);
  assert.match(requests[1].body.p_details, /\n\n필요한 이유: 법무 검토 시간을 줄이고/);
  assert.equal(result.survey.solutionName, "계약서 검토 자동화");
  assert.equal(result.survey.solutionReason, "법무 검토 시간을 줄이고 누락되는 위험 조항을 방지하기 위해 필요합니다.");
});

test("latest response loader uses the solution RPC", async () => {
  let request;
  const result = await loadBenefitNeedsSurvey({
    viewer: MEMBER,
    env: ENV,
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return new Response("null", { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  assert.equal(result.available, true);
  assert.equal(result.survey, null);
  assert.match(request.url, /\/rest\/v1\/rpc\/sc_arena_latest_benefit_solution_request$/);
  assert.equal(request.body.p_user_id, MEMBER.id);
});

test("survey API permits Claw Members and rejects other roles", async () => {
  const memberResponse = await benefitNeedsSurvey(new Request("https://example.com/api/benefit-needs-survey", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      solutionName: "GPU 실험 환경",
      solutionDetails: "모델 실험을 위한 관리형 GPU 개발 환경이 필요합니다.",
      solutionReason: "인프라 준비 시간을 줄이고 반복 실험 속도를 높이기 위해 필요합니다."
    })
  }), {
    verifyRequest: async () => ({ ok: true, status: 200, viewer: MEMBER }),
    consumeRateLimit: async () => ({ allowed: true }),
    submitSurvey: async (input) => ({ stored: true, survey: { ...input.survey, id: "response-1" } })
  });
  assert.equal(memberResponse.status, 200);
  assert.equal((await memberResponse.json()).survey.id, "response-1");

  const partnerResponse = await benefitNeedsSurvey(new Request("https://example.com/api/benefit-needs-survey"), {
    verifyRequest: async () => ({ ok: true, status: 200, viewer: { ...MEMBER, role: "b2b_partner" } })
  });
  assert.equal(partnerResponse.status, 403);
});

test("survey API exposes no response when the private schema is unavailable", async () => {
  const response = await benefitNeedsSurvey(new Request("https://example.com/api/benefit-needs-survey"), {
    verifyRequest: async () => ({ ok: true, status: 200, viewer: MEMBER }),
    loadSurvey: async () => ({ available: false, reason: "schema_missing", survey: null })
  });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.survey, null);
  assert.equal(payload.reason, "schema_missing");
});
