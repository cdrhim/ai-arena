import { resolveEligibleProgramApplicantEmail } from "./program-hub.mjs";
import { loadArenaViewerAccess } from "./supabase-auth.mjs";
import {
  isIsolatedArenaTestEmail,
  isolatedArenaTestAppMetadata
} from "./isolated-test-account.mjs";

const MAX_ADMIN_PAGES = 5;
const ADMIN_PAGE_SIZE = 1000;
const WORKSPACE_SLUG = "sparkclaw-ai-arena";

export function arenaLoginBridgeConfig(env = process.env) {
  const arenaUrl = cleanUrl(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
  const arenaPublicKey = cleanText(
    env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
  );
  const arenaSecretKey = cleanText(
    env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
  );
  const programUrl = cleanUrl(env.SPARKCLAW_PROGRAM_SUPABASE_URL);
  const programSecretKey = cleanText(
    env.SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY ||
    env.SPARKCLAW_PROGRAM_SUPABASE_SERVICE_ROLE_KEY ||
    env.SPARKCLAW_PROGRAM_SUPABASE_SERVICE_KEY
  );
  return {
    arenaUrl,
    arenaPublicKey,
    arenaSecretKey,
    programUrl,
    programSecretKey,
    configured: Boolean(arenaUrl && arenaPublicKey && arenaSecretKey && programUrl && programSecretKey),
    requestTimeoutMs: boundedInteger(env.SPARKCLAW_LOGIN_BRIDGE_TIMEOUT_MS, 6000, 1000, 12000)
  };
}

export async function authenticateArenaLogin({
  email,
  password,
  env = process.env,
  fetchImpl = fetch,
  resolveApplicant = resolveEligibleProgramApplicantEmail,
  resolveArenaAccess = loadArenaViewerAccess
}) {
  const config = arenaLoginBridgeConfig(env);
  if (!config.configured) return { ok: false, status: 503, reason: "unconfigured" };

  const normalizedEmail = normalizeEmail(email);
  const programLookup = await findAuthUserByEmail({
    baseUrl: config.programUrl,
    secretKey: config.programSecretKey,
    email: normalizedEmail,
    fetchImpl,
    timeoutMs: config.requestTimeoutMs
  });
  if (!programLookup.ok) return { ok: false, status: 503, reason: "program_auth_unavailable" };

  if (!programLookup.user) {
    const arenaSession = await passwordSignIn({
      baseUrl: config.arenaUrl,
      apiKey: config.arenaPublicKey,
      email: normalizedEmail,
      password,
      fetchImpl,
      timeoutMs: config.requestTimeoutMs
    });
    if (!arenaSession.ok) {
      return { ok: false, status: arenaSession.status === 429 ? 429 : 401, reason: "invalid_credentials" };
    }
    const access = await resolveArenaAccess(arenaSession.session.user.id, env, fetchImpl);
    if (!access?.available) return { ok: false, status: 503, reason: "arena_access_unavailable" };
    const role = String(access.record?.membership_role || "").toLowerCase();
    const allowedPartner =
      access.record?.access_found === true &&
      access.record?.membership_status === "active" &&
      role === "partner" &&
      access.record?.partner_profile_status === "active";
    const allowedAdministrator =
      access.record?.access_found === true &&
      access.record?.membership_status === "active" &&
      ["admin", "staff"].includes(role) &&
      normalizedEmail.endsWith("@sparklabs.co.kr");
    return allowedAdministrator || allowedPartner
      ? {
          ok: true,
          status: 200,
          session: arenaSession.session,
          accountSource: allowedAdministrator ? "arena_administrator" : "arena_partner"
        }
      : { ok: false, status: 403, reason: "account_not_allowed" };
  }

  const programSession = await passwordSignIn({
    baseUrl: config.programUrl,
    apiKey: config.programSecretKey,
    email: normalizedEmail,
    password,
    fetchImpl,
    timeoutMs: config.requestTimeoutMs
  });
  if (!programSession.ok) {
    return { ok: false, status: programSession.status === 429 ? 429 : 401, reason: "invalid_credentials" };
  }

  const staff = normalizedEmail.endsWith("@sparklabs.co.kr");
  const isolatedTest = isIsolatedArenaTestEmail(normalizedEmail, env);
  let applicant = null;
  if (!staff && !isolatedTest) {
    try {
      applicant = await resolveApplicant(normalizedEmail, env, fetchImpl);
    } catch {
      return { ok: false, status: 503, reason: "program_directory_unavailable" };
    }
    if (!applicant?.eligible || !applicant?.team?.id) {
      return { ok: false, status: 403, reason: "not_eligible_applicant" };
    }
  }

  const synchronized = await synchronizeArenaUser({
    sourceUser: programSession.session?.user || programLookup.user,
    email: normalizedEmail,
    password,
    applicant,
    isolatedTest,
    config,
    fetchImpl
  });
  if (!synchronized.ok) return synchronized;

  const arenaSession = await passwordSignIn({
    baseUrl: config.arenaUrl,
    apiKey: config.arenaPublicKey,
    email: normalizedEmail,
    password,
    fetchImpl,
    timeoutMs: config.requestTimeoutMs
  });
  if (!arenaSession.ok) return { ok: false, status: 503, reason: "arena_session_unavailable" };
  return {
    ok: true,
    status: 200,
    session: arenaSession.session,
    accountSource: isolatedTest ? "isolated_test" : "program_management"
  };
}

async function synchronizeArenaUser({ sourceUser, email, password, applicant, isolatedTest, config, fetchImpl }) {
  const lookup = await findArenaUser({
    sourceUserId: sourceUser?.id,
    email,
    config,
    fetchImpl
  });
  if (!lookup.ok) return { ok: false, status: 503, reason: "arena_auth_unavailable" };

  let targetUser = lookup.user;
  let created = false;
  const staff = email.endsWith("@sparklabs.co.kr");
  const currentAppMetadata = targetUser?.app_metadata && typeof targetUser.app_metadata === "object"
    ? targetUser.app_metadata
    : {};
  const authorizationMetadata = isolatedTest
    ? isolatedArenaTestAppMetadata(currentAppMetadata)
    : {
        ...currentAppMetadata,
        arena_access_source: staff ? "sparklabs_admin" : "program_applicant",
        ...(staff ? {} : { program_team_id: applicant.team.id })
      };
  if (targetUser) {
    const updateResponse = await authFetch(fetchImpl, `${config.arenaUrl}/auth/v1/admin/users/${encodeURIComponent(targetUser.id)}`, {
      method: "PUT",
      headers: adminHeaders(config.arenaSecretKey),
      body: JSON.stringify({ password, email_confirm: true, app_metadata: authorizationMetadata })
    }, config.requestTimeoutMs);
    if (!updateResponse.ok) return { ok: false, status: 503, reason: "arena_password_sync_failed" };
    targetUser = await safeJson(updateResponse) || targetUser;
  } else {
    const createResponse = await authFetch(fetchImpl, `${config.arenaUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: adminHeaders(config.arenaSecretKey),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        app_metadata: authorizationMetadata,
        user_metadata: safeUserMetadata(sourceUser?.user_metadata)
      })
    }, config.requestTimeoutMs);
    if (!createResponse.ok) return { ok: false, status: 503, reason: "arena_account_create_failed" };
    targetUser = await safeJson(createResponse);
    created = true;
  }

  if (!targetUser?.id) return { ok: false, status: 503, reason: "arena_account_invalid" };
  if (isolatedTest) {
    return { ok: true, user: targetUser, membershipSynchronized: false, isolatedTest: true };
  }
  const membership = await syncInternalMembership({ user: targetUser, email, applicant, config, fetchImpl });
  if (!membership.ok) {
    if (created) await rollbackCreatedUser({ userId: targetUser.id, config, fetchImpl });
    return { ok: false, status: 503, reason: "arena_membership_sync_failed" };
  }
  return { ok: true, user: targetUser, membershipSynchronized: membership.ok };
}

async function findArenaUser({ sourceUserId, email, config, fetchImpl }) {
  if (sourceUserId) {
    const direct = await authFetch(fetchImpl, `${config.arenaUrl}/auth/v1/admin/users/${encodeURIComponent(sourceUserId)}`, {
      headers: adminHeaders(config.arenaSecretKey, false)
    }, config.requestTimeoutMs);
    if (direct.ok) return { ok: true, user: await safeJson(direct) };
    if (direct.status !== 404) return { ok: false, user: null };
  }
  return findAuthUserByEmail({
    baseUrl: config.arenaUrl,
    secretKey: config.arenaSecretKey,
    email,
    fetchImpl,
    timeoutMs: config.requestTimeoutMs
  });
}

async function findAuthUserByEmail({ baseUrl, secretKey, email, fetchImpl, timeoutMs }) {
  for (let page = 1; page <= MAX_ADMIN_PAGES; page += 1) {
    const response = await authFetch(
      fetchImpl,
      `${baseUrl}/auth/v1/admin/users?page=${page}&per_page=${ADMIN_PAGE_SIZE}`,
      { headers: adminHeaders(secretKey, false) },
      timeoutMs
    );
    if (!response.ok) return { ok: false, user: null };
    const payload = await safeJson(response);
    const users = Array.isArray(payload) ? payload : Array.isArray(payload?.users) ? payload.users : [];
    const user = users.find((candidate) => normalizeEmail(candidate?.email) === email);
    if (user) return { ok: true, user };
    if (users.length < ADMIN_PAGE_SIZE) return { ok: true, user: null };
  }
  return { ok: true, user: null };
}

async function passwordSignIn({ baseUrl, apiKey, email, password, fetchImpl, timeoutMs }) {
  const response = await authFetch(fetchImpl, `${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: authApiHeaders(apiKey),
    body: JSON.stringify({ email, password })
  }, timeoutMs);
  const session = await safeJson(response);
  return response.ok && session?.access_token && session?.user?.id
    ? { ok: true, status: response.status, session }
    : { ok: false, status: response.status, session: null };
}

async function syncInternalMembership({ user, email, applicant, config, fetchImpl }) {
  const staff = email.endsWith("@sparklabs.co.kr");
  const response = await authFetch(fetchImpl, `${config.arenaUrl}/rest/v1/rpc/sc_arena_sync_membership`, {
    method: "POST",
    headers: adminHeaders(config.arenaSecretKey),
    body: JSON.stringify({
      p_user_id: user.id,
      p_role: staff ? "staff" : "claw_member",
      p_organization_source: staff ? "arena_operator" : "program_team",
      p_organization_key: staff ? "sparklabs" : applicant.team.id,
      p_organization_name: staff ? "SparkLabs" : applicant.team.name,
      p_organization_type: staff ? "operator" : applicant.team.organizationType,
      p_workspace_slug: WORKSPACE_SLUG
    })
  }, config.requestTimeoutMs);
  return { ok: response.ok };
}

async function rollbackCreatedUser({ userId, config, fetchImpl }) {
  try {
    await authFetch(fetchImpl, `${config.arenaUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: adminHeaders(config.arenaSecretKey, false)
    }, config.requestTimeoutMs);
  } catch {
    // The login remains failed even if the defensive rollback cannot complete.
  }
}

function adminHeaders(secretKey, json = true) {
  const headers = { apikey: secretKey };
  if (!String(secretKey).startsWith("sb_secret_")) headers.Authorization = `Bearer ${secretKey}`;
  if (json) headers["content-type"] = "application/json";
  return headers;
}

function authApiHeaders(apiKey) {
  const headers = { apikey: apiKey, "content-type": "application/json" };
  if (!String(apiKey).startsWith("sb_secret_") && !String(apiKey).startsWith("sb_publishable_")) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function authFetch(fetchImpl, url, options, timeoutMs) {
  const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined;
  return fetchImpl(url, { ...options, ...(signal ? { signal } : {}) });
}

function safeUserMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (serialized.length > 16_000) return {};
  return JSON.parse(serialized);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function cleanText(value) {
  return String(value || "").trim();
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback;
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}
