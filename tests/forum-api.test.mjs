import assert from "node:assert/strict";
import test from "node:test";

import forum from "../netlify/functions/forum.mjs";

test("forum API is available by default", async () => {
  const previous = captureEnv(["SPARKCLAW_ENABLE_FORUM", "SUPABASE_URL", "SUPABASE_ANON_KEY"]);
  const originalFetch = global.fetch;
  delete process.env.SPARKCLAW_ENABLE_FORUM;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) {
      return Response.json({
        id: "founder-forum-reader",
        email: "founder@example.com",
        app_metadata: { role: "member" }
      });
    }
    return originalFetch(url);
  };

  try {
    const response = await forum(new Request("https://example.test/api/forum", { headers: { Authorization: "Bearer member-session" } }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.ok(payload.categories.some((category) => category.slug === "general"));
    assert.equal(payload.categories.some((category) => category.slug === "ask"), true);
    assert.equal(payload.founderCommonsAccess, true);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

test("Program DB participant logins receive Claw Member Community access", async () => {
  const previous = captureEnv([
    "SPARKCLAW_ENABLE_FORUM",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SPARKCLAW_PROGRAM_SUPABASE_URL",
    "SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY"
  ]);
  const originalFetch = global.fetch;
  const participantEmail = `community-${Date.now()}@participant.example`;
  process.env.SPARKCLAW_ENABLE_FORUM = "true";
  process.env.SUPABASE_URL = "https://arena.example";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SPARKCLAW_PROGRAM_SUPABASE_URL = "https://program.example";
  process.env.SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY = "program-secret";

  global.fetch = async (url) => {
    const value = String(url);
    if (value.startsWith("https://arena.example") && value.includes("/auth/v1/user")) {
      return Response.json({ id: "program-community-member", email: participantEmail, app_metadata: {}, user_metadata: {} });
    }
    if (value.startsWith("https://program.example") && value.includes("/rest/v1/teams")) {
      return Response.json([{ id: 11, name: "Program Member", email: participantEmail, status: "active" }]);
    }
    return originalFetch(url);
  };

  try {
    const response = await forum(new Request("https://example.test/api/forum", { headers: { Authorization: "Bearer participant-session" } }));
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.viewer.role, "member");
    assert.equal(payload.founderCommonsAccess, true);
    assert.ok(payload.categories.some((category) => category.slug === "ask"));

    const createResponse = await forum(new Request("https://example.test/api/forum", {
      method: "POST",
      headers: { Authorization: "Bearer participant-session", "content-type": "application/json" },
      body: JSON.stringify({
        action: "createForumThread",
        payload: {
          title: "참가기업 고객 검증 경험 공유",
          categorySlug: "ask",
          bodyMarkdown: "다른 참가기업에게 고객 검증 경험을 공유하고 피드백을 요청합니다.",
          visibility: "members_only"
        }
      })
    }));
    const created = await createResponse.json();
    assert.equal(createResponse.status, 200, JSON.stringify(created));
    assert.equal(created.event.thread.authorEmail, participantEmail);
    assert.equal(created.event.thread.visibility, "members_only");
    assert.equal(created.snapshot.viewer.role, "member");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

test("forum can still be explicitly disabled", async () => {
  const previous = captureEnv(["SPARKCLAW_ENABLE_FORUM"]);
  process.env.SPARKCLAW_ENABLE_FORUM = "false";

  try {
    const response = await forum(new Request("https://example.test/api/forum"));
    assert.equal(response.status, 404);
  } finally {
    restoreEnv(previous);
  }
});

test("enabled forum rejects anonymous reads", async () => {
  const previous = captureEnv(["SPARKCLAW_ENABLE_FORUM", "SUPABASE_URL", "SUPABASE_ANON_KEY"]);
  process.env.SPARKCLAW_ENABLE_FORUM = "true";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";

  try {
    const response = await forum(new Request("https://example.test/api/forum"));
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.error, "Login required.");
  } finally {
    restoreEnv(previous);
  }
});

test("enabled forum still requires login for writes", async () => {
  const previous = captureEnv(["SPARKCLAW_ENABLE_FORUM", "SUPABASE_URL", "SUPABASE_ANON_KEY"]);
  process.env.SPARKCLAW_ENABLE_FORUM = "true";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";

  try {
    const response = await forum(
      new Request("https://example.test/api/forum", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createForumThread", payload: { title: "No auth", categorySlug: "ask", bodyMarkdown: "Blocked." } })
      })
    );
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.error, "Login required.");
  } finally {
    restoreEnv(previous);
  }
});

function captureEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
