import assert from "node:assert/strict";
import test from "node:test";

import arenaCompetition from "../netlify/functions/arena-competition.mjs";

test("approved Claw members see Bounty seeds as preparing until release", async () => {
  const previous = captureEnv(["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) {
      return Response.json({
        id: "member_1",
        email: "member@example.com",
        app_metadata: { role: "member" }
      });
    }
    return originalFetch(url);
  };

  try {
    const response = await arenaCompetition(
      new Request("https://example.test/api/arena-competition", {
        headers: { Authorization: "Bearer member-token" }
      })
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.competition.releaseState, "preparing");
    assert.equal(payload.competition.metrics.openChallenges, 0);
    assert.deepEqual(payload.competition.challenges, []);
    assert.deepEqual(payload.competition.leaderboards, []);
    assert.deepEqual(payload.competition.submissions, []);
    assert.equal(Object.hasOwn(payload.competition, "solutions"), false);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

test("Bounty release flag alone never exposes demo seeds to approved Claw members", async () => {
  const previous = captureEnv(["SUPABASE_URL", "SUPABASE_ANON_KEY", "SPARKCLAW_ENABLE_BOUNTIES"]);
  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SPARKCLAW_ENABLE_BOUNTIES = "true";
  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) {
      return Response.json({ id: "member_1", email: "member@example.com", app_metadata: { role: "member" } });
    }
    return originalFetch(url);
  };

  try {
    const response = await arenaCompetition(new Request("https://example.test/api/arena-competition", {
      headers: { Authorization: "Bearer member-token" }
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.competition.releaseState, "preparing");
    assert.equal(payload.competition.metrics.openChallenges, 0);
    assert.deepEqual(payload.competition.challenges, []);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

test("Bounty-only API remains login-gated", async () => {
  const previous = captureEnv(["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  try {
    const response = await arenaCompetition(new Request("https://example.test/api/arena-competition"));
    assert.equal(response.status, 401);
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
