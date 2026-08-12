import assert from "node:assert/strict";
import test from "node:test";

import {
  activityMembershipForViewer,
  activityRecordForSource,
  loadScArenaMyLog,
  recordScArenaActivity,
  scArenaActivityConfig
} from "../netlify/lib/sc-arena-activity.mjs";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const AUTHOR_ID = "22222222-2222-4222-8222-222222222222";

function env(overrides = {}) {
  return {
    SUPABASE_URL: "https://example.supabase.co/",
    SUPABASE_SECRET_KEY: "sb_secret_server",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_client",
    ...overrides
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("configuration supports current Supabase keys and bounds the auxiliary timeout", () => {
  const current = scArenaActivityConfig(env({ SC_ARENA_ACTIVITY_TIMEOUT_MS: "999999" }));
  assert.equal(current.supabaseUrl, "https://example.supabase.co");
  assert.equal(current.anonKey, "sb_publishable_client");
  assert.equal(current.requestTimeoutMs, 10_000);
  assert.equal(current.readConfigured, true);

  const lowerBound = scArenaActivityConfig(env({ SC_ARENA_ACTIVITY_TIMEOUT_MS: "1" }));
  assert.equal(lowerBound.requestTimeoutMs, 250);
  assert.equal(scArenaActivityConfig(env({ SC_ARENA_ACTIVITY_TIMEOUT_MS: "invalid" })).requestTimeoutMs, 4_000);
});

test("membership mapping rejects spoofable IDs and produces stable organization keys", () => {
  assert.equal(activityMembershipForViewer({ id: "not-a-uuid", role: "member" }), null);
  const partner = activityMembershipForViewer({ id: ACTOR_ID, role: "b2b_partner", organization: "" });
  assert.deepEqual(partner, {
    userId: ACTOR_ID,
    role: "partner",
    organizationSource: "external_partner",
    organizationKey: ACTOR_ID,
    organizationName: "기업 파트너",
    organizationType: "partner"
  });
});

test("source records map to allowlisted events and include the content owner as a viewer", () => {
  const event = {
    id: "forum-event-1",
    type: "forum_comment_created",
    createdAt: "2026-08-12T01:02:03.000Z",
    comment: { id: "comment-1", threadId: "thread-1" }
  };
  const record = activityRecordForSource("forum", event, { id: ACTOR_ID, role: "member" }, {
    viewerTeam: { id: "team-1", name: "테스트 팀" },
    forumSnapshot: {
      threads: [{ id: "thread-1", title: "검증 질문", authorUserId: AUTHOR_ID }],
      comments: []
    }
  });
  assert.equal(record.eventType, "community.comment_created");
  assert.equal(record.actorUserId, ACTOR_ID);
  assert.deepEqual(record.viewerUserIds, [AUTHOR_ID]);
  assert.deepEqual(record.relatedEntities.map(({ entity_type, relation_type }) => ({ entity_type, relation_type })), [
    { entity_type: "forum_thread", relation_type: "parent" }
  ]);
  assert.equal(activityRecordForSource("unknown", event, { id: ACTOR_ID, role: "member" }), null);
});

test("writes use opaque secret keys correctly and strip nested metadata", async () => {
  const calls = [];
  const result = await recordScArenaActivity({
    sourceSystem: "arena",
    event: {
      id: "arena-event-1",
      type: "connection_requested",
      createdAt: "not-a-timestamp",
      request: { id: "request-1", startupId: "startup-1", status: { private: "drop-me" } }
    },
    viewer: { id: ACTOR_ID, role: "b2b_partner", organization: "Partner Co" },
    context: { snapshot: { startups: [{ id: "startup-1", name: "Startup One" }] } },
    env: env(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(42);
    }
  });

  assert.equal(result.stored, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.apikey, "sb_secret_server");
  assert.equal(Object.hasOwn(calls[0].options.headers, "Authorization"), false);
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.p_metadata, { startupId: "startup-1" });
  assert.equal(Number.isFinite(Date.parse(body.p_occurred_at)), true);
  assert.equal(body.p_related_entities[0].organization_type, "startup");
});

test("legacy service-role JWTs retain their Bearer header", async () => {
  let headers;
  await recordScArenaActivity({
    sourceSystem: "arena",
    event: {
      id: "arena-event-2",
      type: "bounty_requested",
      request: { id: "brief-1", problemTitle: "문제", status: "intake" }
    },
    viewer: { id: ACTOR_ID, role: "member", organization: "Team" },
    env: env({ SUPABASE_SECRET_KEY: "legacy.jwt.value" }),
    fetchImpl: async (_url, options) => {
      headers = options.headers;
      return jsonResponse(7);
    }
  });
  assert.equal(headers.Authorization, "Bearer legacy.jwt.value");
});

test("My Log syncs membership server-side and reads rows with the caller JWT", async () => {
  const calls = [];
  const req = new Request("https://arena.test/api/my-log", {
    headers: { authorization: "Bearer caller-access-token" }
  });
  const result = await loadScArenaMyLog({
    req,
    viewer: { id: ACTOR_ID, role: "member", organization: "Team" },
    viewerTeamId: "team-1",
    viewerTeamName: "Team One",
    domain: "not-a-domain",
    cursor: "invalid",
    limit: 500,
    env: env(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("sc_arena_sync_membership")) return jsonResponse([{ workspace_id: "workspace-1" }]);
      return jsonResponse([{
        id: 9,
        event_uid: "event-uid",
        source_system: "forum",
        source_event_id: "forum-event-1",
        domain: "community",
        event_type: "community.post_created",
        title: "새 글",
        summary: "글을 작성했습니다.",
        route_target: "myLogCommunity",
        actor_label: "Team One",
        actor_role: "claw_member",
        occurred_at: "2026-08-12T01:00:00.000Z",
        recorded_at: "2026-08-12T01:00:01.000Z",
        metadata: { visible: true, count: 2, nested: { secret: true } },
        read_at: null,
        entities: []
      }]);
    }
  });

  assert.equal(result.available, true);
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0].metadata, { visible: true, count: 2 });
  assert.equal(calls[0].options.headers.apikey, "sb_secret_server");
  assert.equal(Object.hasOwn(calls[0].options.headers, "Authorization"), false);
  assert.equal(calls[1].options.headers.apikey, "sb_publishable_client");
  assert.equal(calls[1].options.headers.Authorization, "Bearer caller-access-token");
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.p_limit, 100);
  assert.equal(body.p_domain, null);
  assert.equal(body.p_before_occurred_at, null);
  assert.equal(body.p_before_id, null);
});

test("auxiliary activity requests abort at the configured timeout", async () => {
  const startedAt = Date.now();
  await assert.rejects(
    recordScArenaActivity({
      sourceSystem: "arena",
      event: {
        id: "arena-event-timeout",
        type: "bounty_requested",
        request: { id: "brief-timeout", problemTitle: "문제", status: "intake" }
      },
      viewer: { id: ACTOR_ID, role: "member", organization: "Team" },
      env: env({ SC_ARENA_ACTIVITY_TIMEOUT_MS: "250" }),
      fetchImpl: async () => new Promise(() => {})
    }),
    (error) => error?.code === "SC_ARENA_ACTIVITY_TIMEOUT" && error?.name === "TimeoutError"
  );
  assert.ok(Date.now() - startedAt < 1_500);
});
