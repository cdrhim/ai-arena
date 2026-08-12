import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import forum from "../netlify/functions/forum.mjs";
import {
  activityMembershipForViewer,
  activityRecordForSource,
  loadScArenaMyLog,
  recordScArenaActivitySafely
} from "../netlify/lib/sc-arena-activity.mjs";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const COMMENTER_ID = "22222222-2222-4222-8222-222222222222";
const STAFF_ID = "33333333-3333-4333-8333-333333333333";
const TEAM_OWNER_ID = "44444444-4444-4444-8444-444444444444";
const SUBMITTER_ID = "55555555-5555-4555-8555-555555555555";

test("server write endpoints record activity only after their authoritative write", async () => {
  const arenaSource = await source("../netlify/functions/arena.mjs");
  const programSource = await source("../netlify/functions/program-hub.mjs");
  const forumSource = await source("../netlify/functions/forum.mjs");

  assertOrdered(
    arenaSource,
    "const competitionEvents = await appendCompetitionEvent(event);",
    'sourceSystem: "competition"',
    "competition activity"
  );
  assertOrdered(
    arenaSource,
    "await saveArenaSubmission(event.submission);",
    'sourceSystem: "arena"',
    "submission activity"
  );
  assertOrdered(
    arenaSource,
    "const events = await appendArenaEvent(event);",
    'sourceSystem: "arena"',
    "Arena activity"
  );
  assertOrdered(
    programSource,
    "const events = await appendProgramActionEvent(event);",
    'sourceSystem: "program_actions"',
    "program activity"
  );
  assertOrdered(
    forumSource,
    "const events = await appendForumEvent(event);",
    'sourceSystem: "forum"',
    "forum activity"
  );

  for (const endpointSource of [arenaSource, programSource, forumSource]) {
    assert.match(endpointSource, /import \{ recordScArenaActivitySafely \}/);
    assert.doesNotMatch(endpointSource, /\brecordScArenaActivity\s*\(/);
  }
});

test("forum activity mapping includes the content owner as a viewer", () => {
  const record = activityRecordForSource(
    "forum",
    {
      id: "forum-event-comment-1",
      type: "forum_comment_created",
      createdAt: "2026-08-12T01:00:00.000Z",
      comment: { id: "comment-1", threadId: "thread-1" }
    },
    {
      id: COMMENTER_ID,
      email: "commenter@example.com",
      role: "member",
      organization: "Commenter AI"
    },
    {
      viewerTeam: { id: "team-commenter", name: "Commenter AI" },
      forumSnapshot: {
        threads: [{ id: "thread-1", title: "Founder question", authorUserId: OWNER_ID }],
        comments: []
      }
    }
  );

  assert.equal(record.eventType, "community.comment_created");
  assert.equal(record.audienceScope, "actor_only");
  assert.deepEqual(record.viewerUserIds, [OWNER_ID]);
  assert.equal(record.actorOrganizationSource, "program_team");
  assert.equal(record.actorOrganizationKey, "team-commenter");
});

test("Claw Member fallback membership uses the immutable auth UUID while program teams stay authoritative", () => {
  const viewer = {
    id: OWNER_ID,
    email: "owner@example.com",
    role: "member",
    organization: "Mutable Company Name"
  };
  const fallback = activityMembershipForViewer(viewer);
  const renamed = activityMembershipForViewer({ ...viewer, organization: "Renamed Company" });
  const official = activityMembershipForViewer(viewer, {
    viewerTeam: { id: "program-team-17", name: "Official Program Team" }
  });

  assert.equal(fallback.organizationSource, "arena_user");
  assert.equal(fallback.organizationKey, OWNER_ID);
  assert.equal(renamed.organizationSource, "arena_user");
  assert.equal(renamed.organizationKey, OWNER_ID);
  assert.equal(official.organizationSource, "program_team");
  assert.equal(official.organizationKey, "program-team-17");
});

test("My Log membership sync labels an unresolved member organization as an arena_user fallback", async () => {
  const calls = [];
  const result = await loadScArenaMyLog({
    req: new Request("https://example.test/api/my-log", {
      headers: { Authorization: "Bearer member-session" }
    }),
    viewer: {
      id: OWNER_ID,
      email: "owner@example.com",
      role: "member",
      organization: "Mutable Company Name"
    },
    env: {
      SUPABASE_URL: "https://arena.example",
      SUPABASE_SECRET_KEY: "service-secret",
      SUPABASE_ANON_KEY: "anon"
    },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), body: JSON.parse(options.body) });
      return Response.json(String(url).endsWith("/sc_arena_my_log") ? [] : {});
    }
  });

  assert.equal(result.available, true);
  assert.equal(calls[0].url, "https://arena.example/rest/v1/rpc/sc_arena_sync_membership");
  assert.equal(calls[0].body.p_organization_source, "arena_user");
  assert.equal(calls[0].body.p_organization_key, OWNER_ID);
});

test("operational activity scopes include staff without broadening Community visibility", () => {
  const staff = {
    id: STAFF_ID,
    email: "staff@sparklabs.co.kr",
    role: "sparklabs",
    organization: "SparkLabs",
    canScore: true
  };
  const member = {
    id: OWNER_ID,
    email: "owner@example.com",
    role: "member",
    organization: "Owner AI"
  };
  const records = [
    activityRecordForSource("arena", {
      id: "connection-1",
      type: "connection_requested",
      request: { id: "connection-1", startupId: "team-2", status: "interest" }
    }, member, { snapshot: { startups: [{ id: "team-2", name: "Target AI" }] } }),
    activityRecordForSource("arena", {
      id: "bounty-1",
      type: "bounty_requested",
      request: { id: "bounty-1", problemTitle: "Operational brief", status: "intake" }
    }, member),
    activityRecordForSource("program_actions", {
      id: "review-1",
      type: "collaboration_review_created",
      review: {
        id: "review-1",
        requesterTeamId: "team-1",
        requesterTeamName: "Owner AI",
        targetTeamId: "team-2",
        targetTeamName: "Target AI",
        status: "pending"
      }
    }, member, { viewerTeam: { id: "team-1", name: "Owner AI" } })
  ];
  const challenge = activityRecordForSource("competition", {
    id: "challenge-event-1",
    type: "competition_challenge_saved",
    challenge: { id: "challenge-1", title: "Safety benchmark", status: "draft" }
  }, staff);

  assert.ok(records.every((record) => record.audienceScope === "participants_and_staff"));
  assert.equal(challenge.audienceScope, "staff");
});

test("Tech Passport review activity includes the submission owner UUID", () => {
  const record = activityRecordForSource("arena", {
    id: "submission-review-event-1",
    type: "submission_approved",
    submission: {
      id: "passport-1",
      name: "Evidence Agent",
      status: "approved",
      ownerId: OWNER_ID,
      updatedAt: "2026-08-12T02:00:00.000Z"
    }
  }, {
    id: STAFF_ID,
    email: "staff@sparklabs.co.kr",
    role: "sparklabs",
    organization: "SparkLabs",
    canScore: true
  });

  assert.equal(record.eventType, "discover.tech_passport_updated");
  assert.equal(record.audienceScope, "participants_and_staff");
  assert.deepEqual(record.viewerUserIds, [OWNER_ID]);
});

test("competition submission review includes submitter and team-owner UUIDs plus the team organization", () => {
  const record = activityRecordForSource("competition", {
    id: "competition-review-event-1",
    type: "competition_submission_reviewed",
    submission: {
      id: "competition-submission-1",
      challengeId: "challenge-1",
      teamId: "competition-team-1",
      submitterUserId: SUBMITTER_ID,
      status: "scored",
      submittedAt: "2026-08-12T02:00:00.000Z"
    },
    review: { id: "review-1", status: "approved", reviewerUserId: STAFF_ID }
  }, {
    id: STAFF_ID,
    email: "staff@sparklabs.co.kr",
    role: "sparklabs",
    organization: "SparkLabs",
    canScore: true
  }, {
    competitionSnapshot: {
      teams: [{ id: "competition-team-1", name: "Team Evidence", ownerUserId: TEAM_OWNER_ID }]
    }
  });

  assert.equal(record.eventType, "bounty.application_status_changed");
  assert.equal(record.audienceScope, "participants_and_staff");
  assert.deepEqual(record.viewerUserIds, [SUBMITTER_ID, TEAM_OWNER_ID]);
  assert.equal(record.relatedEntities[0].organization_source, "competition_team");
  assert.equal(record.relatedEntities[0].organization_key, "competition-team-1");
  assert.equal(record.relatedEntities[0].organization_name, "Team Evidence");
});

test("safe activity recording absorbs a ledger transport failure", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const result = await recordScArenaActivitySafely({
      sourceSystem: "forum",
      event: {
        id: "forum-event-thread-1",
        type: "forum_thread_created",
        createdAt: "2026-08-12T01:00:00.000Z",
        thread: { id: "thread-1", title: "Founder question", categorySlug: "general", visibility: "public" }
      },
      viewer: {
        id: OWNER_ID,
        email: "owner@example.com",
        role: "member",
        organization: "Owner AI"
      },
      env: {
        SUPABASE_URL: "https://arena.example",
        SUPABASE_SECRET_KEY: "service-secret"
      },
      fetchImpl: async () => {
        throw new Error("ledger offline");
      }
    });

    assert.deepEqual(result, { stored: false, reason: "write_failed" });
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test("forum dual write supplies the content owner and cannot turn a saved comment into an API failure", async () => {
  const previous = captureEnv([
    "SPARKCLAW_ENABLE_FORUM",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "NETLIFY",
    "NETLIFY_DEV"
  ]);
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const activityCalls = [];
  process.env.SPARKCLAW_ENABLE_FORUM = "true";
  process.env.SUPABASE_URL = "https://arena.example";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SECRET_KEY = "service-secret";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
  delete process.env.NETLIFY;
  delete process.env.NETLIFY_DEV;
  console.warn = () => {};

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value === "https://arena.example/auth/v1/user") {
      const authorization = headerValue(options.headers, "Authorization");
      if (authorization === "Bearer owner-session") {
        return Response.json({
          id: OWNER_ID,
          email: "owner@example.com",
          app_metadata: { role: "member" },
          user_metadata: { organization: "Owner AI" }
        });
      }
      return Response.json({
        id: COMMENTER_ID,
        email: "commenter@example.com",
        app_metadata: { role: "member" },
        user_metadata: { organization: "Commenter AI" }
      });
    }
    if (value === "https://arena.example/rest/v1/rpc/sc_arena_append_activity") {
      const payload = JSON.parse(options.body);
      activityCalls.push(payload);
      if (payload.p_event_type === "community.comment_created") {
        return Response.json({ message: "ledger unavailable" }, { status: 503 });
      }
      return Response.json(101);
    }
    throw new Error(`Unexpected fetch: ${value}`);
  };

  try {
    const threadResponse = await forum(postRequest("owner-session", {
      action: "createForumThread",
      payload: {
        title: `Dual-write owner context ${Date.now()}`,
        categorySlug: "general",
        bodyMarkdown: "A durable forum thread for the activity integration test.",
        visibility: "public"
      }
    }));
    const threadPayload = await threadResponse.json();
    assert.equal(threadResponse.status, 200, JSON.stringify(threadPayload));

    const commentResponse = await forum(postRequest("commenter-session", {
      action: "createForumComment",
      payload: {
        threadId: threadPayload.event.thread.id,
        bodyMarkdown: "A comment whose activity write is intentionally unavailable."
      }
    }));
    const commentPayload = await commentResponse.json();

    assert.equal(commentResponse.status, 200, JSON.stringify(commentPayload));
    assert.equal(commentPayload.event.type, "forum_comment_created");
    assert.ok(commentPayload.snapshot.comments.some((comment) => comment.id === commentPayload.event.comment.id));
    const commentActivity = activityCalls.find((call) => call.p_event_type === "community.comment_created");
    assert.ok(commentActivity, "the comment should reach the activity adapter");
    assert.equal(commentActivity.p_audience_scope, "actor_only");
    assert.deepEqual(commentActivity.p_viewer_user_ids, [OWNER_ID]);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
    restoreEnv(previous);
  }
});

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

function assertOrdered(sourceText, writeMarker, activityMarker, label) {
  const writeIndex = sourceText.indexOf(writeMarker);
  const activityIndex = sourceText.indexOf(activityMarker, writeIndex + writeMarker.length);
  assert.notEqual(writeIndex, -1, `${label}: authoritative write marker is missing`);
  assert.notEqual(activityIndex, -1, `${label}: activity marker is missing after the write`);
  assert.ok(activityIndex > writeIndex, `${label}: activity must run after the authoritative write`);
}

function postRequest(token, body) {
  return new Request("https://example.test/api/forum", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function headerValue(headers, name) {
  if (headers instanceof Headers) return headers.get(name);
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1] || "";
}

function captureEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
