import assert from "node:assert/strict";
import test from "node:test";

import b2bMatch, { discoveryProfiles, partnerVisibleDirectory } from "../netlify/functions/b2b-match.mjs";

test("B2B match endpoint requires login and rate limits authenticated users", async () => {
  const previous = captureEnv([
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_KEY",
    "SPARKCLAW_ENABLE_B2B_PORTAL",
    "SPARKCLAW_B2B_MATCH_LIMIT_PER_HOUR",
    "SPARKCLAW_B2B_MATCH_WINDOW_MS"
  ]);
  const originalFetch = global.fetch;
  const userId = `rate_user_${Date.now()}`;

  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_API_KEY;
  process.env.SPARKCLAW_ENABLE_B2B_PORTAL = "true";
  process.env.SPARKCLAW_B2B_MATCH_LIMIT_PER_HOUR = "1";
  process.env.SPARKCLAW_B2B_MATCH_WINDOW_MS = "60000";

  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) {
      return Response.json({
        id: userId,
        email: "buyer@example.com",
        app_metadata: { role: "b2b_partner" },
        user_metadata: { organization: "Retail Buyer" }
      });
    }
    if (String(url).includes("/rest/v1/arena_submissions")) {
      return Response.json([]);
    }
    return originalFetch(url);
  };

  try {
    const unsupported = await b2bMatch(new Request("https://example.test/api/b2b-match", { method: "DELETE" }));
    assert.equal(unsupported.status, 405);
    assert.match((await unsupported.json()).error, /지원하지 않는 요청 방식/);

    const unauthenticated = await b2bMatch(new Request("https://example.test/api/b2b-match"));
    assert.equal(unauthenticated.status, 401);

    process.env.SPARKCLAW_ENABLE_B2B_PORTAL = "false";
    const disabled = await b2bMatch(new Request("https://example.test/api/b2b-match", { headers: { Authorization: "Bearer token" } }));
    assert.equal(disabled.status, 403);

    process.env.SPARKCLAW_ENABLE_B2B_PORTAL = "true";
    const first = await b2bMatch(new Request("https://example.test/api/b2b-match", { headers: { Authorization: "Bearer token" } }));
    const second = await b2bMatch(new Request("https://example.test/api/b2b-match", { headers: { Authorization: "Bearer token" } }));
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal(second.headers.has("retry-after"), true);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

test("anonymous discovery is rejected before any company corpus is loaded", async () => {
  const previous = captureEnv([
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY"
  ]);
  const originalFetch = global.fetch;
  let fetchCalls = 0;

  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";

  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Unauthenticated discovery must not access data sources.");
  };

  try {
    const url = "https://example.test/api/b2b-match?q=document%20workflow%20automation";
    const response = await b2bMatch(new Request(url));
    const payload = await response.json();

    assert.equal(response.status, 401, JSON.stringify(payload));
    assert.match(payload.error, /로그인이 필요합니다/);
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

test("external partner discovery evaluates every eligible Program DB participant", async () => {
  const previous = captureEnv([
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SPARKCLAW_ENABLE_B2B_PORTAL",
    "SPARKCLAW_PROGRAM_SUPABASE_URL",
    "SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY",
    "SPARKCLAW_PARTNER_VISIBLE_TEAM_IDS",
    "SPARKCLAW_B2B_MATCH_LIMIT_PER_HOUR",
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_KEY"
  ]);
  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = "https://arena.example";
  process.env.SUPABASE_ANON_KEY = "anon";
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.SPARKCLAW_ENABLE_B2B_PORTAL = "true";
  process.env.SPARKCLAW_PROGRAM_SUPABASE_URL = "https://program.example";
  process.env.SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY = "program-secret";
  delete process.env.SPARKCLAW_PARTNER_VISIBLE_TEAM_IDS;
  process.env.SPARKCLAW_B2B_MATCH_LIMIT_PER_HOUR = "20";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_API_KEY;

  global.fetch = async (url) => {
    const value = String(url);
    if (value.startsWith("https://arena.example") && value.includes("/auth/v1/user")) {
      return Response.json({
        id: `authorized-directory-${Date.now()}`,
        email: "buyer@example.com",
        app_metadata: { role: "b2b_partner" },
        user_metadata: { organization: "Enterprise Buyer" }
      });
    }
    if (value.startsWith("https://arena.example") && value.includes("/rest/v1/arena_submissions")) {
      return Response.json([]);
    }
    if (value.startsWith("https://arena.example") && value.includes("/rest/v1/arena_team_keywords")) {
      return Response.json([]);
    }
    if (value.startsWith("https://program.example") && value.includes("/rest/v1/teams")) {
      return Response.json([
        { id: 7, name: "Consented Docs", sector: "Document AI", one_liner: "Korean document workflow automation", service_summary: "Enterprise document review automation", team_group: "Seed", website_url: "https://consented.example", status: "active" },
        { id: 8, name: "Private Vision", sector: "Computer Vision", one_liner: "Private profile", service_summary: "Not consented", team_group: "Seed", website_url: "https://private.example", status: "active" }
      ]);
    }
    return originalFetch(url);
  };

  try {
    const response = await b2bMatch(new Request("https://example.test/api/b2b-match?q=Korean%20document%20workflow%20automation", {
      headers: { Authorization: "Bearer valid-session" }
    }));
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.accessScope, "all_participating_companies");
    assert.equal(payload.evaluatedProductCount, 2);
    assert.equal(payload.matches[0]?.productId, "program-team-7");
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

test("partner directory is available in full to authenticated B2B viewers", () => {
  const directory = [{ id: 1 }, { id: "2" }, { id: 3 }];
  assert.deepEqual(partnerVisibleDirectory(directory, { role: "b2b_partner", canScore: false }, {}), directory);
  assert.deepEqual(partnerVisibleDirectory(directory, { role: "member" }, {}), directory);
  assert.deepEqual(partnerVisibleDirectory(directory, { role: "sparklabs", canScore: true }, {}), directory);
});

test("Program DB participants are recognized as members and can discover every other participant", async () => {
  const previous = captureEnv([
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SPARKCLAW_PROGRAM_SUPABASE_URL",
    "SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY",
    "SPARKCLAW_ENABLE_B2B_PORTAL",
    "SPARKCLAW_B2B_MATCH_LIMIT_PER_HOUR",
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_KEY"
  ]);
  const originalFetch = global.fetch;
  const participantEmail = `official-${Date.now()}@participant.example`;

  process.env.SUPABASE_URL = "https://arena.example";
  process.env.SUPABASE_ANON_KEY = "anon";
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.SPARKCLAW_PROGRAM_SUPABASE_URL = "https://program.example";
  process.env.SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY = "program-secret";
  process.env.SPARKCLAW_ENABLE_B2B_PORTAL = "true";
  process.env.SPARKCLAW_B2B_MATCH_LIMIT_PER_HOUR = "20";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_API_KEY;

  global.fetch = async (url) => {
    const value = String(url);
    if (value.startsWith("https://arena.example") && value.includes("/auth/v1/user")) {
      return Response.json({ id: `participant-${Date.now()}`, email: participantEmail, app_metadata: {}, user_metadata: {} });
    }
    if (value.startsWith("https://arena.example") && value.includes("/rest/v1/arena_submissions")) return Response.json([]);
    if (value.startsWith("https://arena.example") && value.includes("/rest/v1/arena_team_keywords")) return Response.json([]);
    if (value.startsWith("https://program.example") && value.includes("/rest/v1/teams")) {
      return Response.json([
        { id: 1, name: "Viewer Company", email: participantEmail, sector: "SaaS", one_liner: "Own company", service_summary: "Own profile", status: "active" },
        { id: 2, name: "Peer Vision", email: "peer@example.com", sector: "Computer Vision", one_liner: "Manufacturing quality inspection", service_summary: "AI visual inspection for factories", status: "active" },
        { id: 3, name: "Peer Docs", email: "docs@example.com", sector: "Document AI", one_liner: "Document workflow automation", service_summary: "Automates enterprise document review", status: "active" }
      ]);
    }
    return originalFetch(url);
  };

  try {
    const response = await b2bMatch(new Request("https://example.test/api/b2b-match?q=document%20workflow%20automation", {
      headers: { Authorization: "Bearer participant-session" }
    }));
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.accessScope, "other_participating_companies");
    assert.equal(payload.evaluatedProductCount, 2);
    assert.equal(payload.matches.some((match) => match.productId === "program-team-1"), false);
    assert.equal(payload.matches.some((match) => match.productId === "program-team-3"), true);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

test("an ad-hoc request augments instead of replacing the stored partner profile", () => {
  const [profile] = discoveryProfiles(
    {
      id: "youngone-corporation",
      organizationName: "영원무역",
      entityType: "corporate_cvc",
      focusCategories: ["Manufacturing / Materials", "Climate / Energy"],
      targetStages: ["Seed", "Growth"],
      preferredRegions: ["Korea", "Asia", "Global"],
      thesis: "글로벌 의류 제조 혁신 파트너 탐색",
      priorities: [{ title: "공장 DX·AX", matchingQuery: "MES·ERP 연동형 생산 최적화" }]
    },
    { role: "b2b_partner", organization: "영원무역" },
    { query: "AI 품질검사 PoC 기업을 찾아줘" }
  );

  assert.equal(profile.id, "youngone-corporation");
  assert.equal(profile.isDiscoveryQuery, true);
  assert.deepEqual(profile.targetStages, ["Seed", "Growth"]);
  assert.match(profile.thesis, /AI 품질검사 PoC/);
  assert.match(profile.thesis, /MES·ERP 연동형 생산 최적화/);
  assert.match(profile.thesis, /글로벌 의류 제조 혁신/);
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
