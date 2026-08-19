import assert from "node:assert/strict";
import test from "node:test";

import { arenaInteractions } from "../netlify/functions/arena-interactions.mjs";
import { loadCombinedInteractionSummary } from "../netlify/lib/interaction-summary.mjs";

const PROGRAM_COUNTS = {
  mentoring_sessions: 0,
  hypotheses: 0,
  customer_interviews: 0,
  pmf_survey_responses: 0,
  event_registrations: 358,
  benefit_applications: 182,
  report_reminders: 0,
  weekly_reports: 6
};

test("combined interaction summary counts Management and non-mirrored Arena activity", async () => {
  const requests = [];
  const summary = await loadCombinedInteractionSummary({
    SPARKCLAW_PROGRAM_SUPABASE_URL: "https://program.supabase.co",
    SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY: "sb_secret_program",
    SUPABASE_URL: "https://arena.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_arena"
  }, async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const table = new URL(url).pathname.split("/").pop();
    if (table === "sc_arena_interaction_event_count") {
      return new Response("13", { status: 200, headers: { "content-type": "application/json" } });
    }
    const count = PROGRAM_COUNTS[table];
    return new Response("[]", {
      status: 200,
      headers: { "content-range": `0-0/${count}` }
    });
  }, { arenaAccessToken: "viewer-token" });

  assert.equal(summary.managementInteractions, 546);
  assert.equal(summary.arenaInteractions, 13);
  assert.equal(summary.totalInteractions, 559);
  assert.equal(requests.length, 9);
  const arenaRequest = requests.find((request) => request.url.includes("sc_arena_interaction_event_count"));
  assert.equal(arenaRequest.options.method, "POST");
  assert.equal(arenaRequest.options.body, "{}");
  assert.equal(arenaRequest.options.headers.Authorization, "Bearer viewer-token");
  for (const request of requests) {
    assert.equal(request.options.headers.Prefer, "count=exact");
    if (request !== arenaRequest) assert.equal(request.options.headers.Authorization, undefined);
    assert.match(request.options.headers["user-agent"], /sparkclaw-interaction-summary/);
  }
});

test("interaction API requires authentication and returns private aggregate data", async () => {
  let loaded = false;
  const unauthorized = await arenaInteractions(new Request("https://arena.test/api/arena-interactions"), {
    verifyArenaRequest: async () => ({ ok: false, status: 401, error: "로그인이 필요합니다." }),
    loadCombinedInteractionSummary: async () => { loaded = true; }
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(loaded, false);

  const authorized = await arenaInteractions(new Request("https://arena.test/api/arena-interactions", {
    headers: { authorization: "Bearer member-token" }
  }), {
    verifyArenaRequest: async () => ({ ok: true, viewer: { id: "viewer-id" } }),
    loadCombinedInteractionSummary: async (_env, _fetch, options) => {
      assert.equal(options.arenaAccessToken, "member-token");
      return ({
      totalInteractions: 559,
      managementInteractions: 546,
      arenaInteractions: 13,
      generatedAt: "2026-08-18T00:00:00.000Z"
    }); }
  });
  assert.equal(authorized.status, 200);
  assert.equal(authorized.headers.get("cache-control"), "no-store");
  assert.deepEqual(await authorized.json(), {
    totalInteractions: 559,
    managementInteractions: 546,
    arenaInteractions: 13,
    generatedAt: "2026-08-18T00:00:00.000Z"
  });
});
