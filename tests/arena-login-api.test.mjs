import assert from "node:assert/strict";
import test from "node:test";

import { handleArenaLoginRequest } from "../netlify/functions/arena-login.mjs";
import { authenticateArenaLogin } from "../netlify/lib/arena-login-bridge.mjs";

const ENV = {
  SUPABASE_URL: "https://arena.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_arena",
  SUPABASE_SECRET_KEY: "sb_secret_arena",
  SPARKCLAW_PROGRAM_SUPABASE_URL: "https://program.supabase.co",
  SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY: "sb_secret_program"
};
const PROGRAM_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "member@example.com",
  user_metadata: { full_name: "Program Member" }
};
const ARENA_USER = {
  ...PROGRAM_USER,
  app_metadata: { arena_access_source: "program_applicant", program_team_id: "program-team-1" }
};
const ISOLATED_PROGRAM_USER = {
  id: "55555555-5555-4555-8555-555555555555",
  email: "haeryong.rhim@gmail.com",
  user_metadata: { full_name: "Private Test User" }
};

test("Program Management credentials are authoritative and synchronize the Arena password", async () => {
  const calls = [];
  const result = await authenticateArenaLogin({
    email: "Member@Example.com",
    password: "qr-password",
    env: ENV,
    resolveApplicant: eligibleApplicant,
    fetchImpl: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, method: options.method || "GET", headers: options.headers, body });
      if (url === "https://program.supabase.co/auth/v1/admin/users?page=1&per_page=1000") {
        return Response.json({ users: [PROGRAM_USER] });
      }
      if (url === "https://program.supabase.co/auth/v1/token?grant_type=password") {
        return Response.json(sessionFor(PROGRAM_USER, "program-token"));
      }
      if (url === `https://arena.supabase.co/auth/v1/admin/users/${PROGRAM_USER.id}` && (options.method || "GET") === "GET") {
        return Response.json(ARENA_USER);
      }
      if (url === `https://arena.supabase.co/auth/v1/admin/users/${PROGRAM_USER.id}` && options.method === "PUT") {
        return Response.json(ARENA_USER);
      }
      if (url === "https://arena.supabase.co/rest/v1/rpc/sc_arena_sync_membership") {
        return Response.json([{ workspace_id: "workspace-1", organization_id: null }]);
      }
      if (url === "https://arena.supabase.co/auth/v1/token?grant_type=password") {
        return Response.json(sessionFor(ARENA_USER, "arena-token"));
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.accountSource, "program_management");
  assert.equal(result.session.access_token, "arena-token");
  const update = calls.find((call) => call.method === "PUT");
  assert.deepEqual(update.body, {
    password: "qr-password",
    email_confirm: true,
    app_metadata: { arena_access_source: "program_applicant", program_team_id: "program-team-1" }
  });
  const membership = calls.find((call) => call.url.endsWith("sc_arena_sync_membership"));
  assert.equal(membership.body.p_role, "claw_member");
  assert.equal(membership.body.p_user_id, PROGRAM_USER.id);
  assert.equal(calls.filter((call) => call.url.includes("grant_type=password")).length, 2);
  assert.equal(calls[0].headers.Authorization, undefined);
});

test("a stale Arena temporary password cannot bypass a Program account", async () => {
  const calls = [];
  const result = await authenticateArenaLogin({
    email: PROGRAM_USER.email,
    password: "old-arena-temp-password",
    env: ENV,
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes("program.supabase.co/auth/v1/admin/users")) return Response.json({ users: [PROGRAM_USER] });
      if (url.includes("program.supabase.co/auth/v1/token")) return Response.json({ error: "invalid_credentials" }, { status: 400 });
      throw new Error(`Arena must not be contacted after a Program credential failure: ${url}`);
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(calls.some((url) => url.includes("arena.supabase.co")), false);
});

test("accounts absent from Program Management require an active Arena partner profile", async () => {
  const partner = { id: "22222222-2222-4222-8222-222222222222", email: "partner@outside.co" };
  const calls = [];
  const result = await authenticateArenaLogin({
    email: partner.email,
    password: "arena-partner-password",
    env: ENV,
    resolveArenaAccess: async () => ({
      configured: true,
      available: true,
      record: {
        access_found: true,
        membership_role: "partner",
        membership_status: "active",
        partner_profile_status: "active"
      }
    }),
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes("program.supabase.co/auth/v1/admin/users")) return Response.json({ users: [] });
      if (url === "https://arena.supabase.co/auth/v1/token?grant_type=password") {
        return Response.json(sessionFor(partner, "partner-token"));
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.accountSource, "arena_partner");
  assert.equal(result.session.access_token, "partner-token");
  assert.equal(calls.some((url) => url.includes("arena.supabase.co/auth/v1/admin/users")), false);
});

test("an Arena-native generic member cannot bypass the applicant email gate", async () => {
  const member = { id: "44444444-4444-4444-8444-444444444444", email: "extra@outside.co" };
  const result = await authenticateArenaLogin({
    email: member.email,
    password: "target-password",
    env: ENV,
    resolveArenaAccess: async () => ({
      configured: true,
      available: true,
      record: { access_found: true, membership_role: "claw_member", membership_status: "active" }
    }),
    fetchImpl: async (url) => {
      if (url.includes("program.supabase.co/auth/v1/admin/users")) return Response.json({ users: [] });
      if (url === "https://arena.supabase.co/auth/v1/token?grant_type=password") {
        return Response.json(sessionFor(member, "member-token"));
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("an active SparkLabs administrator can use an Arena-native account", async () => {
  const admin = { id: "33333333-3333-4333-8333-333333333333", email: "operator@sparklabs.co.kr" };
  const result = await authenticateArenaLogin({
    email: admin.email,
    password: "admin-password",
    env: ENV,
    resolveArenaAccess: async () => ({
      configured: true,
      available: true,
      record: { access_found: true, membership_role: "staff", membership_status: "active" }
    }),
    fetchImpl: async (url) => {
      if (url.includes("program.supabase.co/auth/v1/admin/users")) return Response.json({ users: [] });
      if (url === "https://arena.supabase.co/auth/v1/token?grant_type=password") {
        return Response.json(sessionFor(admin, "admin-token"));
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.accountSource, "arena_administrator");
  assert.equal(result.session.access_token, "admin-token");
});

test("new Program accounts are created in Arena and provisioned as internal members", async () => {
  const calls = [];
  const result = await authenticateArenaLogin({
    email: PROGRAM_USER.email,
    password: "qr-password",
    env: ENV,
    resolveApplicant: eligibleApplicant,
    fetchImpl: async (url, options = {}) => {
      const method = options.method || "GET";
      calls.push({ url, method, body: options.body ? JSON.parse(options.body) : null });
      if (url.includes("program.supabase.co/auth/v1/admin/users")) return Response.json({ users: [PROGRAM_USER] });
      if (url.includes("program.supabase.co/auth/v1/token")) return Response.json(sessionFor(PROGRAM_USER, "program-token"));
      if (url === `https://arena.supabase.co/auth/v1/admin/users/${PROGRAM_USER.id}` && method === "GET") {
        return Response.json({ message: "not found" }, { status: 404 });
      }
      if (url === "https://arena.supabase.co/auth/v1/admin/users?page=1&per_page=1000") return Response.json({ users: [] });
      if (url === "https://arena.supabase.co/auth/v1/admin/users" && method === "POST") return Response.json(ARENA_USER);
      if (url.endsWith("sc_arena_sync_membership")) return Response.json([{ workspace_id: "workspace-1" }]);
      if (url.includes("arena.supabase.co/auth/v1/token")) return Response.json(sessionFor(ARENA_USER, "arena-token"));
      throw new Error(`Unexpected request: ${url}`);
    }
  });

  assert.equal(result.ok, true);
  const create = calls.find((call) => call.url === "https://arena.supabase.co/auth/v1/admin/users" && call.method === "POST");
  assert.equal(create.body.email, PROGRAM_USER.email);
  assert.equal(create.body.password, "qr-password");
  assert.deepEqual(create.body.app_metadata, {
    arena_access_source: "program_applicant",
    program_team_id: "program-team-1"
  });
  assert.deepEqual(create.body.user_metadata, PROGRAM_USER.user_metadata);
});

test("the isolated Management test account keeps its password without joining an Arena team", async () => {
  const calls = [];
  let applicantResolved = false;
  const isolatedArenaUser = {
    ...ISOLATED_PROGRAM_USER,
    app_metadata: { arena_access_source: "isolated_test", isolated_test: true }
  };
  const result = await authenticateArenaLogin({
    email: ISOLATED_PROGRAM_USER.email,
    password: "management-password",
    env: ENV,
    resolveApplicant: async () => {
      applicantResolved = true;
      return { eligible: false };
    },
    fetchImpl: async (url, options = {}) => {
      const method = options.method || "GET";
      calls.push({ url, method, body: options.body ? JSON.parse(options.body) : null });
      if (url.includes("program.supabase.co/auth/v1/admin/users")) {
        return Response.json({ users: [ISOLATED_PROGRAM_USER] });
      }
      if (url.includes("program.supabase.co/auth/v1/token")) {
        return Response.json(sessionFor(ISOLATED_PROGRAM_USER, "program-isolated-token"));
      }
      if (url === `https://arena.supabase.co/auth/v1/admin/users/${ISOLATED_PROGRAM_USER.id}` && method === "GET") {
        return Response.json({ message: "not found" }, { status: 404 });
      }
      if (url === "https://arena.supabase.co/auth/v1/admin/users?page=1&per_page=1000") {
        return Response.json({ users: [] });
      }
      if (url === "https://arena.supabase.co/auth/v1/admin/users" && method === "POST") {
        return Response.json(isolatedArenaUser);
      }
      if (url.includes("arena.supabase.co/auth/v1/token")) {
        return Response.json(sessionFor(isolatedArenaUser, "arena-isolated-token"));
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.accountSource, "isolated_test");
  assert.equal(result.session.access_token, "arena-isolated-token");
  assert.equal(applicantResolved, false);
  const create = calls.find((call) => call.url === "https://arena.supabase.co/auth/v1/admin/users" && call.method === "POST");
  assert.equal(create.body.password, "management-password");
  assert.deepEqual(create.body.app_metadata, {
    arena_access_source: "isolated_test",
    isolated_test: true
  });
  assert.equal(calls.some((call) => call.url.endsWith("sc_arena_sync_membership")), false);
});

test("a valid Management account not linked to an eligible applicant company is rejected before Arena mutation", async () => {
  const calls = [];
  const result = await authenticateArenaLogin({
    email: PROGRAM_USER.email,
    password: "qr-password",
    env: ENV,
    resolveApplicant: async () => ({ eligible: false, reason: "not_registered", team: null }),
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes("program.supabase.co/auth/v1/admin/users")) return Response.json({ users: [PROGRAM_USER] });
      if (url.includes("program.supabase.co/auth/v1/token")) return Response.json(sessionFor(PROGRAM_USER, "program-token"));
      throw new Error(`Arena must not be changed for an ineligible account: ${url}`);
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(calls.some((url) => url.includes("arena.supabase.co")), false);
});

test("login API is no-store, rate limited, and never exposes credentials in errors", async () => {
  const request = () => new Request("https://sparkclaw-arena.netlify.app/api/arena-login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify({ email: "member@example.com", password: "do-not-echo-this" })
  });
  const failed = await handleArenaLoginRequest(request(), {
    env: ENV,
    consumeLimit: async () => ({ allowed: true, retryAfterSeconds: 1 }),
    authenticate: async () => ({ ok: false, status: 401, reason: "invalid_credentials" })
  });
  assert.equal(failed.status, 401);
  assert.equal(failed.headers.get("cache-control"), "private, no-store");
  assert.doesNotMatch(await failed.text(), /do-not-echo-this|member@example\.com/);

  const forbidden = await handleArenaLoginRequest(request(), {
    env: ENV,
    consumeLimit: async () => ({ allowed: true, retryAfterSeconds: 1 }),
    authenticate: async () => ({ ok: false, status: 403, reason: "not_eligible_applicant" })
  });
  assert.equal(forbidden.status, 403);
  assert.match((await forbidden.json()).error, /참여사에 등록된 이메일/);

  const limited = await handleArenaLoginRequest(request(), {
    env: ENV,
    consumeLimit: async () => ({ allowed: false, retryAfterSeconds: 90 })
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "90");
});

function sessionFor(user, accessToken) {
  return {
    access_token: accessToken,
    refresh_token: `${accessToken}-refresh`,
    token_type: "bearer",
    expires_in: 3600,
    user
  };
}

async function eligibleApplicant() {
  return {
    eligible: true,
    reason: "exact_registered_email",
    team: { id: "program-team-1", name: "Alpha Inc.", organizationType: "startup" }
  };
}
