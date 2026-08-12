import assert from "node:assert/strict";
import test from "node:test";

import myLog from "../netlify/functions/my-log.mjs";

const MEMBER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "founder@example.com",
  role: "member",
  organization: "Example AI"
};

test("My Log API requires an authenticated Arena account", async () => {
  let loaded = false;
  const response = await myLog(new Request("https://example.test/api/my-log"), {
    verifyRequest: async () => ({ ok: false, status: 401, error: "Login required." }),
    loadMyLog: async () => { loaded = true; return {}; }
  });
  assert.equal(response.status, 401);
  assert.equal(loaded, false);
});

test("My Log API resolves the participant organization and bounds query options", async () => {
  let received;
  const response = await myLog(new Request("https://example.test/api/my-log?domain=community&limit=999&cursor=next", {
    headers: { Authorization: "Bearer member-session" }
  }), {
    verifyRequest: async () => ({ ok: true, viewer: MEMBER }),
    resolveDirectoryContext: async () => ({
      viewer: MEMBER,
      viewerTeamId: "team-9",
      directory: [{ id: "team-9", name: "Example AI" }]
    }),
    loadMyLog: async (input) => {
      received = input;
      return {
        available: true,
        events: [{ id: 9, category: "community", occurredAt: "2026-08-12T00:00:00.000Z" }],
        nextCursor: "cursor-2"
      };
    }
  });
  assert.equal(response.status, 200);
  assert.equal(received.viewerTeamId, "team-9");
  assert.equal(received.viewerTeamName, "Example AI");
  assert.equal(received.domain, "community");
  assert.equal(received.limit, 100);
  assert.equal(received.cursor, "next");
  assert.deepEqual(await response.json(), {
    available: true,
    events: [{ id: 9, category: "community", occurredAt: "2026-08-12T00:00:00.000Z" }],
    nextCursor: "cursor-2",
    reason: ""
  });
});

test("My Log API keeps the legacy client fallback available until the migration exists", async () => {
  const response = await myLog(new Request("https://example.test/api/my-log", {
    headers: { Authorization: "Bearer member-session" }
  }), {
    verifyRequest: async () => ({ ok: true, viewer: MEMBER }),
    resolveDirectoryContext: async () => ({ viewer: MEMBER, viewerTeamId: "team-9", directory: [] }),
    loadMyLog: async () => ({ available: false, events: [], nextCursor: null, reason: "schema_missing" })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    available: false,
    events: [],
    nextCursor: null,
    reason: "schema_missing"
  });
});

test("My Log API rejects unlinked public accounts", async () => {
  const response = await myLog(new Request("https://example.test/api/my-log", {
    headers: { Authorization: "Bearer public-session" }
  }), {
    verifyRequest: async () => ({ ok: true, viewer: { ...MEMBER, role: "public" } }),
    resolveDirectoryContext: async (viewer) => ({ viewer, viewerTeamId: null, directory: [] })
  });
  assert.equal(response.status, 403);
});

test("My Log API accepts only GET and advertises the read-only CORS contract", async () => {
  let verified = false;
  const options = {
    verifyRequest: async () => {
      verified = true;
      return { ok: true, viewer: MEMBER };
    }
  };
  const postResponse = await myLog(new Request("https://example.test/api/my-log", { method: "POST" }), options);
  assert.equal(postResponse.status, 405);
  assert.equal(verified, false);

  const optionsResponse = await myLog(new Request("https://example.test/api/my-log", { method: "OPTIONS" }), options);
  assert.equal(optionsResponse.status, 204);
  assert.equal(optionsResponse.headers.get("access-control-allow-methods"), "GET, OPTIONS");
});

test("My Log API skips program lookup for partners and normalizes unsupported query values", async () => {
  const partner = {
    id: "22222222-2222-4222-8222-222222222222",
    email: "partner@example.com",
    role: "b2b_partner",
    organization: "Partner Corp"
  };
  let resolved = false;
  let received;
  const response = await myLog(new Request(
    `https://example.test/api/my-log?domain=private&limit=0&cursor=${"x".repeat(800)}`,
    { headers: { Authorization: "Bearer partner-session" } }
  ), {
    verifyRequest: async () => ({ ok: true, viewer: partner }),
    resolveDirectoryContext: async () => {
      resolved = true;
      throw new Error("partner lookup should not run");
    },
    loadMyLog: async (input) => {
      received = input;
      return { available: true, events: [], nextCursor: null };
    }
  });

  assert.equal(response.status, 200);
  assert.equal(resolved, false);
  assert.equal(received.viewer, partner);
  assert.equal(received.viewerTeamId, null);
  assert.equal(received.domain, null);
  assert.equal(received.limit, 1);
  assert.equal(received.cursor.length, 640);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("My Log route is configured as a first-party Netlify endpoint", async () => {
  const { readFile } = await import("node:fs/promises");
  const config = await readFile("netlify.toml", "utf8");
  assert.match(config, /from = "\/api\/my-log"[\s\S]*?to = "\/\.netlify\/functions\/my-log"/);
});
