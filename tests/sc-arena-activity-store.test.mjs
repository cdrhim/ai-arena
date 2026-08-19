import assert from "node:assert/strict";
import test from "node:test";

import {
  activityMembershipForViewer,
  activityRecordForSource,
  isScArenaPlatformActivity,
  loadScArenaAdminActivity,
  loadScArenaMyLog,
  recordScArenaActivity,
  recordScArenaClientActivity,
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

test("Community edits, bookmarks, and channels map to distinct body-free activity types", () => {
  const viewer = { id: ACTOR_ID, role: "member", organization: "테스트 팀" };
  const context = {
    viewerTeam: { id: "team-1", name: "테스트 팀" },
    forumSnapshot: {
      threads: [{ id: "thread-1", title: "업데이트할 글", authorUserId: ACTOR_ID }],
      comments: [{ id: "comment-1", threadId: "thread-1", authorUserId: ACTOR_ID }]
    }
  };
  const threadEdit = activityRecordForSource("forum", {
    id: "forum-edit-1",
    type: "forum_thread_updated",
    threadId: "thread-1",
    changes: { bodyMarkdown: "private draft" }
  }, viewer, context);
  const commentEdit = activityRecordForSource("forum", {
    id: "forum-edit-2",
    type: "forum_comment_updated",
    commentId: "comment-1",
    changes: { bodyMarkdown: "private comment" }
  }, viewer, context);
  const bookmark = activityRecordForSource("forum", {
    id: "forum-bookmark-1",
    type: "forum_thread_bookmarked",
    threadId: "thread-1"
  }, viewer, context);
  const category = activityRecordForSource("forum", {
    id: "forum-category-1",
    type: "forum_category_created",
    category: { id: "category-1", label: "Customer Ops", visibility: "public", description: "private note" }
  }, viewer, context);

  assert.deepEqual(
    [threadEdit, commentEdit, bookmark, category].map((record) => record.eventType),
    ["community.post_updated", "community.comment_updated", "community.thread_bookmarked", "community.category_created"]
  );
  assert.equal(JSON.stringify([threadEdit, commentEdit, bookmark, category]).includes("private draft"), false);
  assert.equal(JSON.stringify([threadEdit, commentEdit, bookmark, category]).includes("private comment"), false);
  assert.equal(JSON.stringify([threadEdit, commentEdit, bookmark, category]).includes("private note"), false);
});

test("client activity binds the authenticated viewer and stores no credentials or content", async () => {
  let body;
  const result = await recordScArenaClientActivity({
    action: "page_viewed",
    page: "community",
    clientEventId: "page_viewed:11111111-1111-4111-8111-111111111111",
    viewer: { id: ACTOR_ID, role: "member", email: "private@example.com", organization: "테스트 팀" },
    context: { viewerTeam: { id: "team-1", name: "테스트 팀" } },
    env: env(),
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse(88);
    }
  });
  assert.equal(result.stored, true);
  assert.equal(body.p_actor_user_id, ACTOR_ID);
  assert.equal(body.p_event_type, "system.page_viewed");
  assert.deepEqual(body.p_metadata, { page: "community" });
  assert.equal(JSON.stringify(body).includes("private@example.com"), false);
  assert.equal(Object.hasOwn(body.p_metadata, "token"), false);
});

test("verified login and explicit logout become staff-only Supabase activity rows", async () => {
  const bodies = [];
  for (const action of ["auth_login", "auth_logout"]) {
    const result = await recordScArenaClientActivity({
      action,
      clientEventId: `${action}:11111111-1111-4111-8111-111111111111`,
      viewer: { id: ACTOR_ID, role: "member", email: "private@example.com", organization: "테스트 팀" },
      context: { viewerTeam: { id: "team-1", name: "테스트 팀" } },
      env: env(),
      fetchImpl: async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        return jsonResponse(89);
      }
    });
    assert.equal(result.stored, true);
  }

  assert.deepEqual(bodies.map((body) => body.p_event_type), ["system.auth_login", "system.auth_logout"]);
  assert.deepEqual(bodies.map((body) => body.p_audience_scope), ["staff", "staff"]);
  assert.deepEqual(bodies.map((body) => body.p_route_target), ["operations", "operations"]);
  assert.equal(JSON.stringify(bodies).includes("private@example.com"), false);
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
        id: 10,
        event_uid: "external-event-uid",
        source_system: "program_hub",
        source_event_id: "event-registration-1",
        domain: "events",
        event_type: "events.registration_created",
        title: "외부 프로그램 행사 신청",
        summary: "AI Arena 밖에서 발생한 활동",
        route_target: "workspace",
        occurred_at: "2026-08-12T01:01:00.000Z",
        recorded_at: "2026-08-12T01:01:01.000Z",
        entities: []
      }, {
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
  assert.equal(result.events[0].eventType, "community.post_created");
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

test("My Log accepts only SparkClaw AI Arena Discover, Community, and Bounty events", () => {
  assert.equal(isScArenaPlatformActivity({ domain: "discover", event_type: "discover.connection_requested" }), true);
  assert.equal(isScArenaPlatformActivity({ domain: "community", event_type: "community.comment_created" }), true);
  assert.equal(isScArenaPlatformActivity({ domain: "bounty", event_type: "bounty.submission_created" }), true);
  assert.equal(isScArenaPlatformActivity({ domain: "events", event_type: "events.registration_created" }), false);
  assert.equal(isScArenaPlatformActivity({ domain: "system", event_type: "system.auth_login" }), false);
  assert.equal(isScArenaPlatformActivity({ domain: "system", event_type: "system.auth_logout" }), false);
  assert.equal(isScArenaPlatformActivity({ domain: "system", event_type: "system.session_started" }), false);
  assert.equal(isScArenaPlatformActivity({ domain: "community", event_type: "discover.connection_requested" }), false);
});

test("admin activity relies on the verified staff membership and reads cross-user rows with the staff JWT", async () => {
  const calls = [];
  const req = new Request("https://arena.test/api/arena-activity", {
    headers: { authorization: "Bearer staff-access-token" }
  });
  const result = await loadScArenaAdminActivity({
    req,
    viewer: { id: ACTOR_ID, role: "sparklabs", canScore: true, organization: "SparkLabs" },
    actorUserId: AUTHOR_ID,
    domain: "community",
    eventType: "community.comment_created",
    occurredFrom: "2026-08-01T00:00:00.000Z",
    occurredTo: "2026-08-18T00:00:00.000Z",
    limit: 999,
    env: env(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      if (url.endsWith("sc_arena_admin_activity_users")) return jsonResponse([{
        user_id: AUTHOR_ID,
        email: "member@example.com",
        actor_label: "Member Team",
        role: "claw_member",
        organization_name: "Member Team",
        event_count: 5,
        first_activity_at: "2026-08-12T00:00:00.000Z",
        last_activity_at: "2026-08-12T01:00:00.000Z"
      }]);
      if (url.includes("/auth/v1/admin/users")) return jsonResponse({ users: [] });
      return jsonResponse([{
        id: 15,
        event_uid: "33333333-3333-4333-8333-333333333333",
        actor_user_id: AUTHOR_ID,
        actor_email: "member@example.com",
        actor_label: "Member Team",
        actor_role: "claw_member",
        organization_name: "Member Team",
        domain: "community",
        event_type: "community.comment_created",
        event_label: "Community 댓글 작성",
        title: "검증 질문 댓글 작성",
        summary: "Community 글에 댓글을 남겼습니다.",
        route_target: "myLogCommunity",
        source_system: "forum",
        occurred_at: "2026-08-12T01:00:00.000Z",
        recorded_at: "2026-08-12T01:00:01.000Z",
        total_count: 321,
        metadata: { threadId: "thread-1" }
      }]);
    }
  });

  assert.equal(result.available, true);
  assert.equal(result.users[0].email, "member@example.com");
  assert.equal(result.events[0].actorUserId, AUTHOR_ID);
  assert.equal(result.totalCount, 321);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.headers.Authorization, "Bearer staff-access-token");
  assert.equal(calls[2].options.headers.Authorization, "Bearer staff-access-token");
  assert.equal(calls[2].body.p_actor_user_id, AUTHOR_ID);
  assert.equal(calls[2].body.p_domain, "community");
  assert.equal(calls[2].body.p_event_type, "community.comment_created");
  assert.equal(calls[2].body.p_limit, 200);
  assert.deepEqual(calls[2].body.p_excluded_actor_user_ids, []);
});

test("admin activity includes existing Supabase Auth users before they create ledger events", async () => {
  const req = new Request("https://arena.test/api/arena-activity", {
    headers: { authorization: "Bearer staff-access-token" }
  });
  const accountWithoutActivityId = "44444444-4444-4444-8444-444444444444";
  const result = await loadScArenaAdminActivity({
    req,
    viewer: { id: ACTOR_ID, role: "sparklabs", canScore: true, organization: "SparkLabs" },
    env: env(),
    fetchImpl: async (url) => {
      if (url.endsWith("sc_arena_admin_activity_users")) return jsonResponse([{
        user_id: AUTHOR_ID,
        email: "member@example.com",
        actor_label: "Ledger Team",
        role: "claw_member",
        organization_name: "Ledger Team",
        event_count: 5,
        first_activity_at: "2026-08-12T00:00:00.000Z",
        last_activity_at: "2026-08-12T01:00:00.000Z"
      }]);
      if (url.includes("/auth/v1/admin/users")) return jsonResponse({ users: [{
        id: AUTHOR_ID,
        email: "member@example.com",
        app_metadata: { arenaRole: "member", provider: "email" },
        user_metadata: { companyName: "Auth Team", privateNote: "never expose" }
      }, {
        id: accountWithoutActivityId,
        email: "new@example.com",
        app_metadata: {},
        user_metadata: { companyName: "New Team" }
      }, {
        id: "55555555-5555-4555-8555-555555555555",
        email: "archived@example.com",
        app_metadata: {
          arena_access_source: "archived",
          arena_archived_at: "2026-08-19T01:00:00.000Z"
        },
        user_metadata: { companyName: "Archived Team" }
      }] });
      return jsonResponse([]);
    }
  });

  assert.equal(result.available, true);
  assert.equal(result.users.length, 2);
  assert.equal(result.users.some((user) => user.email === "archived@example.com"), false);
  assert.equal(result.users[0].userId, AUTHOR_ID);
  assert.equal(result.users[0].label, "Ledger Team");
  assert.equal(result.users[0].eventCount, 5);
  assert.equal(result.users[1].userId, accountWithoutActivityId);
  assert.equal(result.users[1].role, "claw_member");
  assert.equal(result.users[1].eventCount, 0);
  assert.equal(JSON.stringify(result.users).includes("privateNote"), false);
  assert.equal(JSON.stringify(result.users).includes("provider"), false);
});

test("isolated test accounts produce no activity and are excluded from the admin explorer", async () => {
  const isolatedId = "55555555-5555-4555-8555-555555555555";
  const isolatedViewer = {
    id: isolatedId,
    email: "haeryong.rhim@gmail.com",
    role: "member",
    isIsolatedTest: true
  };
  let writes = 0;
  const writeResult = await recordScArenaActivity({
    sourceSystem: "forum",
    event: { id: "isolated-post", type: "forum_thread_created", thread: { id: "t1", title: "hidden" } },
    viewer: isolatedViewer,
    env: env(),
    fetchImpl: async () => {
      writes += 1;
      return jsonResponse({});
    }
  });
  assert.deepEqual(writeResult, { stored: false, reason: "isolated_test" });
  assert.equal(writes, 0);

  const privateLog = await loadScArenaMyLog({
    req: new Request("https://arena.test/api/my-log", {
      headers: { authorization: "Bearer isolated-token" }
    }),
    viewer: isolatedViewer,
    env: env(),
    fetchImpl: async () => {
      throw new Error("isolated My Log must not touch the ledger");
    }
  });
  assert.deepEqual(privateLog, { available: true, events: [], nextCursor: null, reason: "" });

  const result = await loadScArenaAdminActivity({
    req: new Request("https://arena.test/api/arena-activity", {
      headers: { authorization: "Bearer staff-access-token" }
    }),
    viewer: { id: ACTOR_ID, role: "sparklabs", canScore: true, organization: "SparkLabs" },
    env: env(),
    fetchImpl: async (url) => {
      if (url.endsWith("sc_arena_admin_activity_users")) return jsonResponse([{
        user_id: isolatedId,
        email: isolatedViewer.email,
        actor_label: "Hidden Test",
        role: "claw_member",
        organization_name: "Hidden Test",
        event_count: 1,
        first_activity_at: "2026-08-18T01:00:00.000Z",
        last_activity_at: "2026-08-18T01:00:00.000Z"
      }]);
      if (url.includes("/auth/v1/admin/users")) return jsonResponse({ users: [{
        id: isolatedId,
        email: isolatedViewer.email,
        app_metadata: { arena_access_source: "isolated_test", isolated_test: true },
        user_metadata: {}
      }] });
      return jsonResponse([{
        id: 99,
        event_uid: "99999999-9999-4999-8999-999999999999",
        actor_user_id: isolatedId,
        actor_email: isolatedViewer.email,
        actor_label: "Hidden Test",
        actor_role: "claw_member",
        organization_name: "Hidden Test",
        domain: "system",
        event_type: "system.auth_login",
        event_label: "로그인",
        title: "AI Arena 계정 로그인",
        summary: "hidden",
        route_target: "operations",
        source_system: "arena_client",
        occurred_at: "2026-08-18T01:00:00.000Z",
        recorded_at: "2026-08-18T01:00:01.000Z",
        metadata: {}
      }]);
    }
  });
  assert.deepEqual(result.users, []);
  assert.deepEqual(result.events, []);
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
