import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import forumDraftAnalysisApi from "../netlify/functions/forum-draft-analysis.mjs";
import {
  analyzeForumDraft,
  fallbackForumDraftAnalysis,
  safeGeminiBody
} from "../netlify/lib/forum-draft-analysis.mjs";

const categories = [
  { slug: "general", label: "General", description: "General community discussion", type: "general" },
  { slug: "connect", label: "Connect", description: "Request an introduction", type: "connect" },
  { slug: "technical", label: "Technical", description: "Technical AI discussion", type: "general" }
];
const visibilities = ["public", "members_only"];

test("Gemini analyzes only the bounded draft and exact allowed posting settings", async () => {
  let requestBody = "";
  const result = await analyzeForumDraft({
    bodyMarkdown: "제조 대기업 PoC 경험이 있는 동료를 연결해 주세요. 담당자는 founder@example.com이고 키는 sk-secretkey1234567890 입니다.",
    categories,
    visibilities
  }, {
    env: { GEMINI_API_KEY: "server-only-key", GEMINI_FORUM_MODEL: "gemini-2.5-flash" },
    fetchImpl: async (_url, init) => {
      requestBody = String(init.body || "");
      assert.equal(init.headers["x-goog-api-key"], "server-only-key");
      return Response.json({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                title: "제조 대기업 PoC 경험자 연결 요청",
                categorySlug: "connect",
                visibility: "public",
                reason: "동료 연결 요청이므로 Connect 채널이 적합합니다."
              })
            }]
          }
        }]
      });
    }
  });

  assert.equal(result.source, "spark_ai");
  assert.equal(result.model, null);
  assert.equal(result.categorySlug, "connect");
  assert.equal(result.visibility, "public");
  assert.doesNotMatch(requestBody, /founder@example\.com|sk-secretkey1234567890/);
  assert.match(requestBody, /\[email removed\]|\[API key removed\]/);
});

test("forum analysis falls back deterministically and defaults to partner-visible public", async () => {
  const input = {
    bodyMarkdown: "B2B 제조 고객과 PoC를 시작한 경험을 공유하고 조언을 받고 싶습니다.",
    categories: [...categories, { slug: "b2b", label: "B2B", description: "Enterprise pilots", type: "partner" }],
    visibilities
  };
  const expected = fallbackForumDraftAnalysis(input);
  const result = await analyzeForumDraft(input, { env: {} });
  assert.equal(result.source, "deterministic_fallback");
  assert.equal(result.visibility, "public");
  assert.equal(result.categorySlug, expected.categorySlug);
  assert.ok(result.title.length > 10);
});

test("desired perk drafts fall back to the Ask channel", () => {
  const result = fallbackForumDraftAnalysis({
    bodyMarkdown: "원하는 혜택: 고객지원 AI 도구 Pro 계정과 초기 도입 컨설팅",
    categories: [...categories, { slug: "ask", label: "Ask", description: "Requests for help", type: "ask" }],
    visibilities
  });
  assert.equal(result.categorySlug, "ask");
});

test("draft text sent to Gemini redacts common contact and credential patterns", () => {
  const safe = safeGeminiBody("email me at owner@example.com or 010-1234-5678 with sb_secret_abcdefghijklmnop");
  assert.doesNotMatch(safe, /owner@example\.com|010-1234-5678|sb_secret_/);
});

test("forum draft analysis API rejects anonymous requests before AI work", async () => {
  let analyzed = false;
  const response = await forumDraftAnalysisApi(new Request("https://example.test/api/forum-draft-analysis", {
    method: "POST",
    body: JSON.stringify({ bodyMarkdown: "This is a sufficiently detailed community post body." })
  }), {
    verifyRequest: async () => ({ ok: false, status: 401 }),
    analyzeForumDraft: async () => {
      analyzed = true;
      return {};
    }
  });
  assert.equal(response.status, 401);
  assert.equal(analyzed, false);
});

test("B2B partner analysis receives public channels and partner-safe visibility choices", async () => {
  let analyzerInput = null;
  const response = await forumDraftAnalysisApi(new Request("https://example.test/api/forum-draft-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bodyMarkdown: "파트너 관점에서 제조 AI PoC 경험과 협업 요청을 공개적으로 공유합니다." })
  }), {
    verifyRequest: async () => ({ ok: true, viewer: { id: "partner-1", email: "partner@example.com", role: "b2b_partner" } }),
    consumeRateLimit: async () => ({ allowed: true }),
    analyzeForumDraft: async (input) => {
      analyzerInput = input;
      return { title: "제조 AI PoC 협업 요청", categorySlug: "b2b", visibility: "public", reason: "B2B 협업 요청" };
    }
  });
  assert.equal(response.status, 200);
  assert.ok(analyzerInput.categories.some((category) => category.slug === "ask"));
  assert.ok(analyzerInput.categories.some((category) => category.slug === "technical"));
  assert.deepEqual(analyzerInput.visibilities, ["public"]);
});

test("Program DB participants receive Claw Member draft analysis settings", async () => {
  let analyzerInput = null;
  const response = await forumDraftAnalysisApi(new Request("https://example.test/api/forum-draft-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bodyMarkdown: "다른 참가기업에게 고객 검증 경험을 공유하고 피드백을 요청합니다." })
  }), {
    verifyRequest: async () => ({ ok: true, viewer: { id: "program-user", email: "team@example.com", role: "public" } }),
    resolveProgramViewer: async (viewer) => ({ viewer: { ...viewer, role: "member", roleLabel: "Approved member" }, isParticipant: true }),
    consumeRateLimit: async () => ({ allowed: true }),
    analyzeForumDraft: async (input) => {
      analyzerInput = input;
      return { title: "고객 검증 경험과 피드백 요청", categorySlug: "ask", visibility: "members_only", reason: "참가기업 간 공유" };
    }
  });
  assert.equal(response.status, 200);
  assert.ok(analyzerInput.categories.some((category) => category.slug === "ask"));
  assert.deepEqual(analyzerInput.visibilities, ["public", "members_only"]);
});

test("Community composer is body-first and keeps Gemini credentials server-side", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const client = readFileSync("public/arena/community.js", "utf8");
  const config = readFileSync("netlify.toml", "utf8");
  const bodyIndex = html.indexOf('id="communityThreadBody"');
  const titleIndex = html.indexOf('id="communityThreadTitle"');

  assert.ok(bodyIndex > 0 && titleIndex > bodyIndex);
  assert.match(html, /id="communityAnalyzeDraft"/);
  assert.match(html, /Public · SparkClaw 산업 파트너 포함/);
  assert.match(html, /Private · 부트캠프 멤버 \+ SparkLabs/);
  assert.match(html, /API 키, 고객 원문 데이터, 비공개 계약 내용은 입력하지 마세요/);
  assert.match(client, /fetch\("\/api\/forum-draft-analysis"/);
  assert.match(client, /COMMUNITY_DRAFT_PROGRESS_STEPS/);
  assert.match(config, /from = "\/api\/forum-draft-analysis"/);
  assert.doesNotMatch(`${html}\n${client}`, /GEMINI_API_KEY|GOOGLE_API_KEY|x-goog-api-key/);
});
