import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import eventRecommendationsApi, {
  loadPublicRecommendationCatalog,
  recommendationProfileForViewer
} from "../netlify/functions/event-recommendations.mjs";
import {
  buildEventRecommendations,
  fallbackEventRecommendations,
  publicRecommendationProfile,
  recommendationCatalog,
  staffEventRecommendations,
  staffEventTriage
} from "../netlify/lib/event-recommendations.mjs";

const futureEvent = {
  id: "factory-session",
  title: "제조 AI PoC 세션",
  date: "2026-08-20",
  time: "14:00",
  location: "온라인",
  category: "public partner event",
  description: "제조 공장 자동화와 에너지 최적화 사례를 검토합니다.",
  targetGroup: "public"
};
const verifiedPerk = {
  id: "cloud-credit",
  title: "Cloud PoC 크레딧",
  provider: "Cloud Partner",
  category: "Infrastructure",
  description: "AI PoC 인프라 크레딧",
  value: "미화 1,000달러",
  tier: "partner",
  isActive: true,
  verificationStatus: "confirmed",
  visibility: "all_members"
};

test("Gemini event planner receives only allowlisted profile and public catalog fields", async () => {
  let requestBody = "";
  const result = await buildEventRecommendations({
    profile: {
      organizationName: "영원무역",
      focusCategories: ["제조 DX/AX", "에너지·탄소 관리"],
      priorities: [{ title: "글로벌 공장 제조 DX/AX", hypothesis: "MES 연동" }],
      ownerEmail: "private@example.com",
      contacts: [{ phone: "010-9999-9999" }],
      internalNotes: "never-send-this",
      evidence: [{ url: "https://private.example.com/evidence" }]
    },
    events: [futureEvent],
    benefits: [verifiedPerk],
    now: "2026-08-11T00:00:00Z"
  }, {
    env: { GEMINI_API_KEY: "server-only-key", GEMINI_EVENT_MODEL: "gemini-2.5-flash" },
    fetchImpl: async (_url, init) => {
      requestBody = String(init.body || "");
      assert.equal(init.headers["x-goog-api-key"], "server-only-key");
      return Response.json({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                overview: "영원무역의 제조 AX 과제와 가까운 일정입니다.",
                recommendations: [
                  {
                    itemKey: "event:factory-session",
                    reason: "제조 DX 과제와 직접 연결됩니다.",
                    suggestedUse: "PoC 질문을 준비해 세션에서 확인하세요.",
                    timing: "2026-08-20 전 질문 정리"
                  },
                  {
                    itemKey: "event:invented",
                    reason: "존재하지 않는 일정",
                    suggestedUse: "사용하면 안 됨",
                    timing: "즉시"
                  }
                ],
                nextBestAction: "제조 데이터 연동 질문을 정리하세요."
              })
            }]
          }
        }]
      });
    }
  });

  assert.equal(result.source, "spark_ai");
  assert.equal(result.model, null);
  assert.deepEqual(result.recommendations.map((item) => item.itemId), ["factory-session"]);
  assert.equal(result.recommendations[0].title, "제조 AI PoC 세션");
  assert.doesNotMatch(requestBody, /private@example\.com|010-9999-9999|never-send-this|private\.example\.com/);
  assert.doesNotMatch(JSON.stringify(result), /invented/);
});

test("event planner falls back deterministically when Gemini is unavailable", async () => {
  const catalog = recommendationCatalog([futureEvent], [verifiedPerk], "2026-08-11T00:00:00Z");
  const profile = publicRecommendationProfile({ organizationName: "영원무역", focusCategories: ["제조 AI", "에너지"] });
  const expected = fallbackEventRecommendations({ profile, events: catalog.events, benefits: catalog.benefits, now: "2026-08-11T00:00:00Z" });
  const result = await buildEventRecommendations({ profile, events: [futureEvent], benefits: [verifiedPerk], now: "2026-08-11T00:00:00Z" }, {
    env: { GEMINI_API_KEY: "server-only-key" },
    fetchImpl: async () => Response.json({ error: { message: "quota" } }, { status: 429 })
  });

  assert.equal(result.source, "profile_fallback");
  assert.deepEqual(result.recommendations.map((item) => item.itemId), expected.recommendations.map((item) => item.itemId));
  assert.match(result.warning, /현재 공개 일정/);
});

test("recommendation catalog drops past events", () => {
  const catalog = recommendationCatalog([
    { ...futureEvent, id: "past", date: "2026-08-10" },
    futureEvent
  ], [verifiedPerk], "2026-08-11T00:00:00Z");
  assert.deepEqual(catalog.events.map((event) => event.id), ["factory-session"]);
});

test("public recommendation catalog applies the same public event and confirmed perk projection", async () => {
  const catalog = await loadPublicRecommendationCatalog({
    env: {},
    loadProgramHub: async () => ({
      events: [
        futureEvent,
        { ...futureEvent, id: "private-event", category: "internal", targetGroup: "selected team" }
      ],
      benefits: [
        verifiedPerk,
        { ...verifiedPerk, id: "pending", verificationStatus: "pending" },
        { ...verifiedPerk, id: "selected", visibility: "selected_teams" }
      ],
      benefitApplications: [],
      eventRegistrations: [],
      weeklyReports: [],
      viewerTeam: null,
      permissions: {}
    }),
    loadProgramActionEvents: async () => [
      {
        type: "benefit_config_upserted",
        config: { benefitId: "pending", verificationStatus: "pending", visibility: "all_members" },
        createdAt: "2026-08-01T00:00:00Z"
      },
      {
        type: "benefit_config_upserted",
        config: { benefitId: "selected", verificationStatus: "confirmed", visibility: "selected_teams" },
        createdAt: "2026-08-02T00:00:00Z"
      }
    ]
  });

  assert.deepEqual(catalog.events.map((event) => event.id), ["factory-session"]);
  assert.deepEqual(catalog.benefits.map((benefit) => benefit.id), ["cloud-credit"]);
});

test("partner profile resolution is anchored to the authenticated viewer", async () => {
  const profile = await recommendationProfileForViewer({
    id: "viewer-1",
    email: "owner@example.com",
    role: "b2b_partner",
    b2bProfileId: "own-profile"
  }, {
    loadExternalPartnerProfiles: async () => [
      { id: "own-profile", organizationName: "본인 기업", ownerUserId: "viewer-1", ownerEmail: "owner@example.com", focusCategories: ["제조"] },
      { id: "other-profile", organizationName: "다른 기업", ownerUserId: "viewer-2", focusCategories: ["금융"] }
    ]
  });

  assert.equal(profile.organizationName, "본인 기업");
  assert.deepEqual(profile.focusCategories, ["제조"]);
  assert.equal(profile.audienceMode, "partner_utilization");
});

test("SparkLabs staff profile selects the operations triage mode", async () => {
  const profile = await recommendationProfileForViewer({
    id: "staff-1",
    email: "operator@sparklabs.co.kr",
    role: "sparklabs",
    roleLabel: "SparkLabs 운영진",
    canScore: true
  });

  assert.equal(profile.audienceMode, "staff_operations");
  assert.match(profile.priorityProblems.join(" "), /일정과 혜택/);
});

test("staff event triage orders same-day events by urgency and actual start time", () => {
  const result = staffEventRecommendations({
    profile: publicRecommendationProfile({ audienceMode: "staff_operations", organizationName: "SparkLabs" }),
    events: [
      { ...futureEvent, id: "late", title: "Jun Ko", date: "2026-08-11", time: "17:15", description: "파트너 세션의 참석자와 운영 준비 정보를 확인하는 공개 일정입니다." },
      { ...futureEvent, id: "early", title: "Jw Kim", date: "2026-08-11", time: "10:30", description: "파트너 세션의 참석자와 운영 준비 정보를 확인하는 공개 일정입니다." },
      { ...futureEvent, id: "middle", title: "박유경", date: "2026-08-11", time: "15:35", description: "파트너 세션의 참석자와 운영 준비 정보를 확인하는 공개 일정입니다." }
    ],
    now: "2026-08-11T00:00:00Z"
  });

  assert.equal(result.mode, "staff_operations");
  assert.deepEqual(result.recommendations.map((item) => item.itemId), ["early", "middle", "late"]);
  assert.deepEqual(result.recommendations.map((item) => item.priorityLabel), ["긴급", "긴급", "긴급"]);
  assert.match(result.overview, /같은 우선도에서는 일정이 빠른 순/);
});

test("staff event triage elevates operational data risk and identifies important events", () => {
  const risky = staffEventTriage({
    id: "risk",
    title: "파트너 세션",
    date: "2026-08-12",
    time: "20:00",
    description: "짧음"
  }, "2026-08-11T00:00:00Z");
  const important = staffEventTriage({
    id: "final",
    title: "SparkClaw Bootcamp Final Ceremony",
    date: "2026-08-20",
    time: "14:00",
    location: "SparkLabs",
    description: "프로그램 최종 성과를 공유하고 참가팀과 파트너의 후속 연결을 준비하는 공식 행사입니다."
  }, "2026-08-11T00:00:00Z");

  assert.equal(risky.priorityLabel, "운영 리스크");
  assert.match(risky.priorityReason, /장소·행사 설명 정보가 부족/);
  assert.equal(important.priorityLabel, "중요");
  assert.match(important.priorityReason, /프로그램 성과/);
});

test("generated analysis cannot reorder or relabel the deterministic staff queue", async () => {
  const events = [
    { ...futureEvent, id: "first", title: "오전 운영 세션", date: "2026-08-11", time: "10:00", description: "오전 운영 세션의 참석자와 준비 정보를 검토하는 공개 일정입니다." },
    { ...futureEvent, id: "second", title: "오후 운영 세션", date: "2026-08-11", time: "16:00", description: "오후 운영 세션의 참석자와 준비 정보를 검토하는 공개 일정입니다." }
  ];
  const result = await buildEventRecommendations({
    profile: { audienceMode: "staff_operations", organizationName: "SparkLabs" },
    events,
    benefits: [],
    now: "2026-08-11T00:00:00Z"
  }, {
    env: { GEMINI_API_KEY: "server-only-key" },
    fetchImpl: async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      overview: "순서를 바꾸려는 응답",
      recommendations: [
        { itemKey: "event:second", reason: "임의 이유", suggestedUse: "두 번째 권장 조치", timing: "임의" },
        { itemKey: "event:first", reason: "임의 이유", suggestedUse: "첫 번째 권장 조치", timing: "임의" }
      ],
      nextBestAction: "임의 행동"
    }) }] } }] })
  });

  assert.deepEqual(result.recommendations.map((item) => item.itemId), ["first", "second"]);
  assert.deepEqual(result.recommendations.map((item) => item.priorityLabel), ["긴급", "긴급"]);
  assert.match(result.recommendations[0].priorityReason, /시간 이내 시작 예정/);
  assert.equal(result.recommendations[0].suggestedUse, "첫 번째 권장 조치");
  assert.match(result.nextBestAction, /오전 운영 세션/);
});

test("event recommendation API rejects anonymous requests before loading catalog data", async () => {
  let loaded = false;
  const response = await eventRecommendationsApi(new Request("https://example.test/api/event-recommendations", { method: "POST" }), {
    verifyRequest: async () => ({ ok: false, status: 401 }),
    loadProgramHub: async () => {
      loaded = true;
      return {};
    }
  });
  assert.equal(response.status, 401);
  assert.equal(loaded, false);
});

test("event recommendation API returns retry-after when rate limited", async () => {
  const response = await eventRecommendationsApi(new Request("https://example.test/api/event-recommendations", { method: "POST" }), {
    verifyRequest: async () => ({ ok: true, viewer: { id: "partner", role: "b2b_partner" } }),
    consumeRateLimit: async () => ({ allowed: false, retryAfterSeconds: 45 })
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "45");
});

test("event planner UI uses staged progress and keeps Gemini keys out of public assets", () => {
  const client = readFileSync("public/arena/arena.js", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");
  const html = readFileSync("public/arena/index.html", "utf8");
  const config = readFileSync("netlify.toml", "utf8");

  assert.match(client, /fetch\("\/api\/event-recommendations"/);
  assert.match(client, /EVENT_RECOMMENDATION_PROGRESS_STEPS/);
  assert.match(client, /requestId !== eventRecommendationRequestId/);
  assert.match(client, /SparkLabs 운영 우선 이벤트를 계산합니다/);
  assert.match(client, /우선 확인 이유/);
  assert.match(html, /AGENTIC EVENT PLANNER/);
  assert.match(html, /aria-live="polite"/);
  assert.match(css, /\.event-agent-planner\.is-loading/);
  assert.match(css, /\.event-agent-priority\.is-risk/);
  assert.match(config, /from = "\/api\/event-recommendations"/);
  assert.doesNotMatch(`${client}\n${css}\n${html}`, /GEMINI_API_KEY|GOOGLE_API_KEY|x-goog-api-key/);
});
