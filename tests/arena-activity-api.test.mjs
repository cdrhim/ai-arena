import assert from "node:assert/strict";
import test from "node:test";

import arenaActivity from "../netlify/functions/arena-activity.mjs";

const MEMBER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "member@example.com",
  role: "member",
  organization: "Member Team"
};
const STAFF = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "staff@sparklabs.co.kr",
  role: "sparklabs",
  organization: "SparkLabs",
  canScore: true
};

test("Arena activity API records only allowlisted authenticated client activity", async () => {
  let received;
  const response = await arenaActivity(new Request("https://arena.test/api/arena-activity", {
    method: "POST",
    headers: { authorization: "Bearer member-token", "content-type": "application/json" },
    body: JSON.stringify({
      action: "page_viewed",
      page: "community",
      clientEventId: "page_viewed:11111111-1111-4111-8111-111111111111",
      actorUserId: STAFF.id,
      email: "spoofed@example.com",
      bodyMarkdown: "must not be forwarded"
    })
  }), {
    verifyRequest: async () => ({ ok: true, viewer: MEMBER }),
    recordClientActivity: async (input) => {
      received = input;
      return { stored: true };
    }
  });

  assert.equal(response.status, 200);
  assert.equal(received.viewer, MEMBER);
  assert.equal(received.action, "page_viewed");
  assert.equal(received.page, "community");
  assert.equal(Object.hasOwn(received, "actorUserId"), false);
  assert.equal(Object.hasOwn(received, "email"), false);
  assert.equal(Object.hasOwn(received, "bodyMarkdown"), false);
  assert.deepEqual(await response.json(), { stored: true, reason: "" });
});
test("Arena activity API rejects unauthenticated and unsupported writes", async () => {
  let recorded = false;
  const unauthorized = await arenaActivity(new Request("https://arena.test/api/arena-activity", { method: "POST" }), {
    verifyRequest: async () => ({ ok: false, status: 401, error: "로그인이 필요합니다." }),
    recordClientActivity: async () => { recorded = true; }
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(recorded, false);

  const unsupported = await arenaActivity(new Request("https://arena.test/api/arena-activity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "admin_exported_all_users" })
  }), {
    verifyRequest: async () => ({ ok: true, viewer: MEMBER }),
    recordClientActivity: async () => { recorded = true; }
  });
  assert.equal(unsupported.status, 400);
  assert.equal(recorded, false);
});

test("cross-user activity reads require SparkLabs staff and normalize filters", async () => {
  let loaded = false;
  const forbidden = await arenaActivity(new Request("https://arena.test/api/arena-activity"), {
    verifyRequest: async () => ({ ok: true, viewer: MEMBER }),
    loadAdminActivity: async () => { loaded = true; return {}; }
  });
  assert.equal(forbidden.status, 403);
  assert.equal(loaded, false);

  let received;
  const response = await arenaActivity(new Request(
    `https://arena.test/api/arena-activity?user=${MEMBER.id}&domain=community&action=community.comment_created&from=2026-08-01&to=2026-08-18&limit=999&includeUsers=0`,
    { headers: { authorization: "Bearer staff-token" } }
  ), {
    verifyRequest: async () => ({ ok: true, viewer: STAFF }),
    loadAdminActivity: async (input) => {
      received = input;
      return {
        available: true,
        users: [],
        events: [{ id: 10, eventType: "community.comment_created" }],
        nextCursor: "next-page"
      };
    }
  });

  assert.equal(response.status, 200);
  assert.equal(received.viewer, STAFF);
  assert.equal(received.actorUserId, MEMBER.id);
  assert.equal(received.domain, "community");
  assert.equal(received.eventType, "community.comment_created");
  assert.equal(received.limit, 200);
  assert.equal(received.includeUsers, false);
  assert.equal(received.occurredFrom, "2026-08-01T00:00:00.000Z");
  assert.equal(received.occurredTo, "2026-08-18T00:00:00.000Z");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("Arena activity route exposes a bounded GET/POST CORS contract", async () => {
  const options = await arenaActivity(new Request("https://arena.test/api/arena-activity", { method: "OPTIONS" }));
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");

  const put = await arenaActivity(new Request("https://arena.test/api/arena-activity", { method: "PUT" }));
  assert.equal(put.status, 405);
});
