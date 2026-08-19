import { arenaAuthConfig, bearerToken, viewerFromUser } from "./supabase-auth.mjs";
import {
  isIsolatedArenaTestEmail,
  isIsolatedArenaTestViewer
} from "./isolated-test-account.mjs";

const WORKSPACE_SLUG = "sparkclaw-ai-arena";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSING_SCHEMA_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
const DEFAULT_REQUEST_TIMEOUT_MS = 4_000;
const MIN_REQUEST_TIMEOUT_MS = 250;
const MAX_REQUEST_TIMEOUT_MS = 10_000;

export function scArenaActivityConfig(env = process.env) {
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const secretKey = String(
    env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || ""
  ).trim();
  const anonKey = String(
    env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || ""
  ).trim();
  const requestTimeoutMs = boundedInteger(
    env.SC_ARENA_ACTIVITY_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    MIN_REQUEST_TIMEOUT_MS,
    MAX_REQUEST_TIMEOUT_MS
  );
  return {
    supabaseUrl,
    secretKey,
    anonKey,
    requestTimeoutMs,
    writeConfigured: Boolean(supabaseUrl && secretKey),
    readConfigured: Boolean(supabaseUrl && secretKey && anonKey)
  };
}

export function activityMembershipForViewer(viewer, context = {}) {
  if (isIsolatedArenaTestViewer(viewer)) return null;
  const role = activityMembershipRole(viewer);
  const userId = cleanText(viewer?.id, 64);
  if (!UUID_PATTERN.test(userId) || !role) return null;
  const teamId = cleanText(context.viewerTeam?.id || context.viewerTeamId, 160);
  const organizationHint = cleanText(
    context.viewerTeam?.name || context.viewerTeam?.companyName || viewer.organization,
    240
  );
  const organizationName = organizationHint || roleLabel(role);
  if (teamId) {
    return {
      userId,
      role,
      organizationSource: "program_team",
      organizationKey: teamId,
      organizationName,
      organizationType: "startup"
    };
  }
  if (role === "partner") {
    return {
      userId,
      role,
      organizationSource: "external_partner",
      organizationKey: cleanText(viewer.b2bProfileId || slugKey(organizationHint) || userId, 160),
      organizationName,
      organizationType: "partner"
    };
  }
  if (["staff", "admin"].includes(role)) {
    return {
      userId,
      role,
      organizationSource: "arena_operator",
      organizationKey: "sparklabs",
      organizationName: organizationName || "SparkLabs",
      organizationType: "operator"
    };
  }
  if (role === "human_validator") {
    return {
      userId,
      role,
      organizationSource: "arena_validator",
      organizationKey: userId,
      organizationName,
      organizationType: "validator"
    };
  }
  return {
    userId,
    role,
    organizationSource: "arena_user",
    organizationKey: userId,
    organizationName,
    organizationType: "startup"
  };
}

export function activityRecordForSource(sourceSystem, event, viewer, context = {}) {
  if (!event?.id) return null;
  const membership = activityMembershipForViewer(viewer, context);
  if (!membership) return null;
  const base = {
    sourceSystem: cleanText(sourceSystem, 80),
    sourceEventId: cleanText(event.id, 240),
    actorUserId: membership.userId,
    actorLabel: cleanText(viewer.organization || context.viewerTeam?.name || roleLabel(membership.role), 160),
    actorRole: membership.role,
    actorOrganizationSource: membership.organizationSource,
    actorOrganizationKey: membership.organizationKey,
    actorOrganizationName: membership.organizationName,
    actorOrganizationType: membership.organizationType,
    audienceScope: "actor_only",
    routeTarget: "workspace",
    summary: "",
    metadata: {},
    relatedEntities: [],
    viewerUserIds: [],
    occurredAt: event.createdAt || new Date().toISOString()
  };
  if (sourceSystem === "arena") return arenaActivityRecord(event, viewer, context, base);
  if (sourceSystem === "program_actions") return programActivityRecord(event, context, base);
  if (sourceSystem === "forum") return forumActivityRecord(event, context, base);
  if (sourceSystem === "competition") return competitionActivityRecord(event, context, base);
  return null;
}

export async function recordScArenaActivity({ sourceSystem, event, viewer, context = {}, env = process.env, fetchImpl = fetch }) {
  if (isIsolatedArenaTestViewer(viewer, env)) return { stored: false, reason: "isolated_test" };
  const record = activityRecordForSource(sourceSystem, event, viewer, context);
  if (!record) return { stored: false, reason: "not_loggable" };
  return appendScArenaActivityRecord(record, env, fetchImpl);
}

export async function recordScArenaClientActivity({
  action,
  clientEventId,
  page = "",
  viewer,
  context = {},
  env = process.env,
  fetchImpl = fetch
}) {
  if (isIsolatedArenaTestViewer(viewer, env)) return { stored: false, reason: "isolated_test" };
  const membership = activityMembershipForViewer(viewer, context);
  const eventId = cleanText(clientEventId, 180);
  const normalizedAction = cleanText(action, 40).toLowerCase();
  const normalizedPage = cleanText(page, 40).toLowerCase();
  const pageLabels = {
    overview: "Discover Home",
    teams: "Company Directory",
    discover: "Task-driven Search",
    passports: "Tech Passports",
    compare: "Compare",
    partnerships: "Partnerships",
    community: "Community",
    arena: "Bounty",
    workspace: "My Log",
    operations: "Operations",
    database: "Database"
  };
  if (!membership || !/^[a-zA-Z0-9:_-]{12,180}$/.test(eventId)) {
    return { stored: false, reason: "invalid_client_event" };
  }
  if (normalizedAction === "page_viewed" && !pageLabels[normalizedPage]) {
    return { stored: false, reason: "invalid_page" };
  }
  if (!new Set(["auth_login", "auth_logout", "session_started", "page_viewed"]).has(normalizedAction)) {
    return { stored: false, reason: "unsupported_client_action" };
  }

  const actorLabel = cleanText(
    context.viewerTeam?.name || context.viewerTeamName || viewer.organization || roleLabel(membership.role),
    160
  );
  const isAuthLogin = normalizedAction === "auth_login";
  const isAuthLogout = normalizedAction === "auth_logout";
  const isSession = normalizedAction === "session_started";
  const eventType = isAuthLogin
    ? "system.auth_login"
    : isAuthLogout
      ? "system.auth_logout"
      : isSession
        ? "system.session_started"
        : "system.page_viewed";
  const title = isAuthLogin
    ? "AI Arena 계정 로그인"
    : isAuthLogout
      ? "AI Arena 계정 로그아웃"
      : isSession
        ? "AI Arena 세션 시작"
        : `${pageLabels[normalizedPage]} 열람`;
  const summary = isAuthLogin
    ? "Supabase 인증을 거쳐 AI Arena에 로그인했습니다."
    : isAuthLogout
      ? "AI Arena에서 로그아웃하고 Supabase 세션을 종료했습니다."
      : isSession
        ? "SparkClaw AI Arena 세션을 시작했습니다."
        : `${pageLabels[normalizedPage]} 페이지를 열었습니다.`;
  const record = {
    sourceSystem: "arena_client",
    sourceEventId: eventId,
    actorUserId: membership.userId,
    actorLabel,
    actorRole: membership.role,
    actorOrganizationSource: membership.organizationSource,
    actorOrganizationKey: membership.organizationKey,
    actorOrganizationName: membership.organizationName,
    actorOrganizationType: membership.organizationType,
    eventType,
    primaryEntityType: null,
    primaryEntityKey: null,
    primaryEntityLabel: null,
    audienceScope: isAuthLogin || isAuthLogout ? "staff" : "actor_only",
    title,
    summary,
    routeTarget: isAuthLogin || isAuthLogout ? "operations" : isSession ? "workspace" : normalizedPage,
    metadata: isAuthLogin || isAuthLogout
      ? { client: "web", authAction: isAuthLogin ? "login" : "logout" }
      : isSession
        ? { client: "web" }
        : { page: normalizedPage },
    relatedEntities: [],
    viewerUserIds: [],
    occurredAt: new Date().toISOString()
  };
  return appendScArenaActivityRecord(record, env, fetchImpl);
}

async function appendScArenaActivityRecord(record, env, fetchImpl) {
  const config = scArenaActivityConfig(env);
  if (!config.writeConfigured) return { stored: false, reason: "unconfigured" };
  const response = await activityFetch(fetchImpl, `${config.supabaseUrl}/rest/v1/rpc/sc_arena_append_activity`, {
    method: "POST",
    headers: serviceHeaders(config.secretKey),
    body: JSON.stringify(activityRpcPayload(record))
  }, config.requestTimeoutMs);
  const payload = await safeJson(response);
  if (!response.ok) {
    if (missingSchema(response, payload)) return { stored: false, reason: "schema_missing" };
    const error = new Error(payload?.message || payload?.error || "Arena activity could not be stored.");
    error.status = response.status;
    throw error;
  }
  return { stored: true, id: Number(payload) || null, record };
}

export async function recordScArenaActivitySafely(input) {
  try {
    return await recordScArenaActivity(input);
  } catch (error) {
    console.warn("[sc-arena-activity] activity write failed", {
      sourceSystem: input?.sourceSystem || "unknown",
      sourceEventId: input?.event?.id || "unknown",
      message: error?.message || "unknown"
    });
    return { stored: false, reason: "write_failed" };
  }
}

export async function loadScArenaMyLog({
  req,
  viewer,
  viewerTeamId = null,
  viewerTeamName = "",
  domain = null,
  cursor = null,
  limit = 50,
  env = process.env,
  fetchImpl = fetch
}) {
  if (isIsolatedArenaTestViewer(viewer, env)) {
    return { available: true, events: [], nextCursor: null, reason: "" };
  }
  const config = scArenaActivityConfig(env);
  const token = bearerToken(req);
  if (!config.readConfigured || !token || !UUID_PATTERN.test(cleanText(viewer?.id, 64))) {
    return { available: false, events: [], nextCursor: null, reason: "unconfigured" };
  }
  const membership = activityMembershipForViewer(viewer, {
    viewerTeamId,
    viewerTeam: viewerTeamId ? { id: viewerTeamId, name: viewerTeamName } : null
  });
  if (!membership) return { available: false, events: [], nextCursor: null, reason: "membership_unresolved" };

  const membershipResponse = await activityFetch(fetchImpl, `${config.supabaseUrl}/rest/v1/rpc/sc_arena_sync_membership`, {
    method: "POST",
    headers: serviceHeaders(config.secretKey),
    body: JSON.stringify(membershipRpcPayload(membership))
  }, config.requestTimeoutMs);
  const membershipPayload = await safeJson(membershipResponse);
  if (!membershipResponse.ok) {
    if (missingSchema(membershipResponse, membershipPayload)) {
      return { available: false, events: [], nextCursor: null, reason: "schema_missing" };
    }
    throw new Error(membershipPayload?.message || "Arena membership could not be synchronized.");
  }

  const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const cursorValue = parseCursor(cursor);
  const response = await activityFetch(fetchImpl, `${config.supabaseUrl}/rest/v1/rpc/sc_arena_my_log`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      p_workspace_slug: WORKSPACE_SLUG,
      p_domain: ["discover", "community", "bounty"].includes(domain) ? domain : null,
      p_before_occurred_at: cursorValue?.occurredAt || null,
      p_before_id: cursorValue?.id || null,
      p_limit: boundedLimit
    })
  }, config.requestTimeoutMs);
  const payload = await safeJson(response);
  if (!response.ok) {
    if (missingSchema(response, payload)) return { available: false, events: [], nextCursor: null, reason: "schema_missing" };
    const error = new Error(payload?.message || payload?.error || "My Log could not be loaded.");
    error.status = response.status;
    throw error;
  }
  const rows = Array.isArray(payload) ? payload : [];
  const events = rows.filter(isScArenaPlatformActivity).map(publicActivityEvent).filter(Boolean);
  const lastRow = rows.length === boundedLimit ? rows[rows.length - 1] : null;
  return {
    available: true,
    events,
    nextCursor: lastRow && isValidTimestamp(lastRow.occurred_at) && Number.isSafeInteger(Number(lastRow.id))
      ? encodeCursor(lastRow.occurred_at, Number(lastRow.id))
      : null,
    reason: ""
  };
}

export async function loadScArenaAdminActivity({
  req,
  viewer,
  viewerTeamId = null,
  viewerTeamName = "",
  actorUserId = null,
  domain = null,
  eventType = null,
  occurredFrom = null,
  occurredTo = null,
  cursor = null,
  limit = 100,
  includeUsers = true,
  env = process.env,
  fetchImpl = fetch
}) {
  const config = scArenaActivityConfig(env);
  const token = bearerToken(req);
  const viewerId = cleanText(viewer?.id, 64);
  if (!config.readConfigured || !token || !UUID_PATTERN.test(viewerId)) {
    return { available: false, users: [], events: [], totalCount: 0, nextCursor: null, reason: "unconfigured" };
  }
  const membership = activityMembershipForViewer(viewer, {
    viewerTeamId,
    viewerTeam: viewerTeamId ? { id: viewerTeamId, name: viewerTeamName } : null
  });
  if (!membership || !["staff", "admin"].includes(membership.role)) {
    const error = new Error("SparkLabs 관리자만 전체 사용자 활동을 열람할 수 있습니다.");
    error.status = 403;
    throw error;
  }

  const authHeaders = {
    apikey: config.anonKey,
    Authorization: `Bearer ${token}`,
    "content-type": "application/json"
  };
  let users = [];
  if (includeUsers) {
    const usersResponse = await activityFetch(fetchImpl, `${config.supabaseUrl}/rest/v1/rpc/sc_arena_admin_activity_users`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ p_workspace_slug: WORKSPACE_SLUG, p_search: null, p_limit: 500 })
    }, config.requestTimeoutMs);
    const usersPayload = await safeJson(usersResponse);
    if (!usersResponse.ok) {
      if (missingSchema(usersResponse, usersPayload)) {
        return { available: false, users: [], events: [], totalCount: 0, nextCursor: null, reason: "schema_missing" };
      }
      const error = new Error(usersPayload?.message || usersPayload?.error || "Arena users could not be loaded.");
      error.status = usersResponse.status;
      throw error;
    }
    users = (Array.isArray(usersPayload) ? usersPayload : [])
      .map(publicAdminActivityUser)
      .filter((user) => user && !isIsolatedArenaTestEmail(user.email, env));
  }

  const directoryUsers = await loadSupabaseAuthDirectory(config, env, fetchImpl);
  const isolatedUserIds = new Set(
    directoryUsers.filter((user) => user.isIsolatedTest).map((user) => user.userId)
  );

  const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const cursorValue = parseCursor(cursor);
  const normalizedActorId = UUID_PATTERN.test(cleanText(actorUserId, 64)) ? cleanText(actorUserId, 64) : null;
  const normalizedDomain = ["discover", "community", "bounty", "system"].includes(domain) ? domain : null;
  const normalizedEventType = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(cleanText(eventType, 100))
    ? cleanText(eventType, 100)
    : null;
  const response = await activityFetch(fetchImpl, `${config.supabaseUrl}/rest/v1/rpc/sc_arena_admin_activity_page`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      p_workspace_slug: WORKSPACE_SLUG,
      p_actor_user_id: normalizedActorId,
      p_domain: normalizedDomain,
      p_event_type: normalizedEventType,
      p_occurred_from: isValidTimestamp(occurredFrom) ? new Date(occurredFrom).toISOString() : null,
      p_occurred_to: isValidTimestamp(occurredTo) ? new Date(occurredTo).toISOString() : null,
      p_before_occurred_at: cursorValue?.occurredAt || null,
      p_before_id: cursorValue?.id || null,
      p_limit: boundedLimit,
      p_excluded_actor_user_ids: [...isolatedUserIds]
    })
  }, config.requestTimeoutMs);
  const payload = await safeJson(response);
  if (!response.ok) {
    if (missingSchema(response, payload)) {
      return { available: false, users, events: [], totalCount: 0, nextCursor: null, reason: "schema_missing" };
    }
    const error = new Error(payload?.message || payload?.error || "Arena activity could not be loaded.");
    error.status = response.status;
    throw error;
  }
  const rows = Array.isArray(payload) ? payload : [];
  const totalCount = includeUsers ? nonNegativeSafeInteger(rows[0]?.total_count) : null;
  const events = rows
    .map(publicAdminActivityEvent)
    .filter((event) => event
      && !isolatedUserIds.has(event.actorUserId)
      && !isIsolatedArenaTestEmail(event.actorEmail, env));
  const lastRow = rows.length === boundedLimit ? rows[rows.length - 1] : null;
  if (includeUsers) {
    users = mergeAdminActivityUsers(
      users,
      directoryUsers.filter((user) => !user.isIsolatedTest)
    ).map(({ isIsolatedTest: _isolated, isArchived: _archived, ...user }) => user);
  }
  return {
    available: true,
    users,
    events,
    totalCount,
    nextCursor: lastRow && isValidTimestamp(lastRow.occurred_at) && Number.isSafeInteger(Number(lastRow.id))
      ? encodeCursor(lastRow.occurred_at, Number(lastRow.id))
      : null,
    reason: ""
  };
}

function nonNegativeSafeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

async function loadSupabaseAuthDirectory(config, env, fetchImpl) {
  try {
    const response = await activityFetch(fetchImpl, `${config.supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
      headers: serviceHeaders(config.secretKey)
    }, config.requestTimeoutMs);
    const payload = await safeJson(response);
    if (!response.ok || !Array.isArray(payload?.users)) return [];
    const authConfig = arenaAuthConfig(env);
    return payload.users
      .map((user) => publicAuthDirectoryUser(user, authConfig))
      .filter((user) => user && !user.isArchived);
  } catch {
    // The activity ledger remains usable if the Auth Admin directory is
    // temporarily unavailable. Its users will be merged on the next refresh.
    return [];
  }
}

function publicAuthDirectoryUser(user, authConfig) {
  const userId = cleanText(user?.id, 64);
  if (!UUID_PATTERN.test(userId)) return null;
  const viewer = viewerFromUser(user, authConfig);
  const role = activityMembershipRole(viewer) || "registered";
  const email = cleanText(viewer.email, 320);
  const organizationName = cleanText(viewer.organization, 240);
  const appMetadata = user?.app_metadata && typeof user.app_metadata === "object"
    ? user.app_metadata
    : {};
  const isArchived = cleanText(appMetadata.arena_access_source, 80).toLowerCase() === "archived"
    || Boolean(appMetadata.arena_archived_at);
  return {
    userId,
    isIsolatedTest: viewer.isIsolatedTest === true,
    isArchived,
    email,
    label: organizationName || email || "Arena account",
    role,
    organizationName,
    eventCount: 0,
    firstActivityAt: null,
    lastActivityAt: null
  };
}

function mergeAdminActivityUsers(ledgerUsers = [], directoryUsers = []) {
  const byUserId = new Map();
  for (const user of directoryUsers) byUserId.set(user.userId, user);
  for (const ledgerUser of ledgerUsers) {
    const directoryUser = byUserId.get(ledgerUser.userId);
    byUserId.set(ledgerUser.userId, {
      ...directoryUser,
      ...ledgerUser,
      email: ledgerUser.email || directoryUser?.email || "",
      label: ledgerUser.label || directoryUser?.label || "Arena account",
      role: ledgerUser.role || directoryUser?.role || "registered",
      organizationName: ledgerUser.organizationName || directoryUser?.organizationName || ""
    });
  }
  return [...byUserId.values()].sort((left, right) => {
    const leftTime = Date.parse(left.lastActivityAt || "") || 0;
    const rightTime = Date.parse(right.lastActivityAt || "") || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    if (left.eventCount !== right.eventCount) return right.eventCount - left.eventCount;
    return String(left.label || left.email).localeCompare(String(right.label || right.email), "ko");
  });
}

export function isScArenaPlatformActivity(row) {
  const eventType = cleanText(row?.event_type || row?.eventType, 100).toLowerCase();
  const eventDomain = eventType.split(".")[0];
  if (!new Set(["discover", "community", "bounty"]).has(eventDomain)) return false;
  const declaredDomain = cleanText(row?.domain || row?.category, 40).toLowerCase();
  return !declaredDomain || declaredDomain === eventDomain;
}

function arenaActivityRecord(event, viewer, context, base) {
  const snapshot = context.snapshot || {};
  if (event.type === "connection_requested" && event.request) {
    const request = event.request;
    const targetName = startupName(snapshot, request.startupId) || "대상 기업";
    return {
      ...base,
      eventType: "discover.connection_requested",
      primaryEntityType: "connection_request",
      primaryEntityKey: request.id,
      primaryEntityLabel: targetName,
      audienceScope: "participants_and_staff",
      title: `${targetName} 협업 연결 요청`,
      summary: "기업 연결 검토 요청을 보냈습니다.",
      routeTarget: "myLogMatches",
      metadata: { status: request.status || "interest", startupId: request.startupId },
      relatedEntities: [organizationEntity(request.startupId, targetName, "target")],
      occurredAt: request.createdAt || event.createdAt
    };
  }
  if (event.type === "connection_request_updated" && event.update) {
    const current = (snapshot.connectionRequests || []).find((item) => item.id === event.update.requestId) || {};
    const targetName = startupName(snapshot, current.startupId) || "대상 기업";
    return {
      ...base,
      eventType: "discover.connection_status_changed",
      primaryEntityType: "connection_request",
      primaryEntityKey: event.update.requestId,
      primaryEntityLabel: targetName,
      audienceScope: "participants_and_staff",
      title: `${targetName} 연결 상태 변경`,
      summary: `연결 요청 상태가 ${statusLabel(event.update.status)}(으)로 변경되었습니다.`,
      routeTarget: "myLogMatches",
      metadata: { status: event.update.status || "updated", startupId: current.startupId || "" },
      relatedEntities: current.startupId ? [organizationEntity(current.startupId, targetName, "target")] : [],
      viewerUserIds: validUserIds([current.requesterUserId, event.update.founderConsentByUserId]),
      occurredAt: event.update.updatedAt || event.createdAt
    };
  }
  if (event.type === "bounty_requested" && event.request) {
    return {
      ...base,
      eventType: "bounty.brief_created",
      primaryEntityType: "bounty_brief",
      primaryEntityKey: event.request.id,
      audienceScope: "participants_and_staff",
      primaryEntityLabel: cleanText(event.request.problemTitle, 240),
      title: cleanText(event.request.problemTitle || "Bounty Brief 등록", 200),
      summary: "Bounty Brief가 접수되어 검토를 기다리고 있습니다.",
      routeTarget: "myLogBounties",
      metadata: { status: event.request.status || "intake" },
      occurredAt: event.request.createdAt || event.createdAt
    };
  }
  if (event.type === "bounty_request_updated" && event.update) {
    const request = (snapshot.bountyRequests || []).find((item) => item.id === event.update.requestId) || {};
    return {
      ...base,
      eventType: "bounty.brief_status_changed",
      primaryEntityType: "bounty_brief",
      primaryEntityKey: event.update.requestId,
      audienceScope: "participants_and_staff",
      primaryEntityLabel: cleanText(request.problemTitle || "Bounty Brief", 240),
      title: cleanText(request.problemTitle || "Bounty Brief 상태 변경", 200),
      summary: `Bounty Brief 상태가 ${statusLabel(event.update.status)}(으)로 변경되었습니다.`,
      routeTarget: "myLogBounties",
      metadata: { status: event.update.status || "updated" },
      viewerUserIds: validUserIds([request.requesterUserId]),
      occurredAt: event.update.updatedAt || event.createdAt
    };
  }
  if (String(event.type || "").startsWith("submission_") && event.submission) {
    return {
      ...base,
      eventType: "discover.tech_passport_updated",
      primaryEntityType: "tech_passport",
      primaryEntityKey: event.submission.id,
      audienceScope: "participants_and_staff",
      primaryEntityLabel: cleanText(event.submission.companyName || event.submission.name || "기술 프로필", 240),
      title: `${cleanText(event.submission.companyName || event.submission.name || "기업", 160)} 기술 프로필 업데이트`,
      summary: "기술 프로필의 최신 상태가 저장되었습니다.",
      routeTarget: "myLogMatches",
      metadata: { status: event.submission.status || "updated" },
      viewerUserIds: validUserIds([event.submission.ownerId]),
      occurredAt: event.submission.updatedAt || event.createdAt
    };
  }
  return null;
}

function programActivityRecord(event, context, base) {
  if (!["collaboration_review_created", "collaboration_review_status_updated"].includes(event.type)) return null;
  const audit = event.audit || {};
  const requested = event.type === "collaboration_review_created";
  const review = event.review || {};
  const update = event.update || {};
  const requesterName = cleanText(audit.requesterTeamName || review.requesterTeamName || "요청 기업", 160);
  const targetName = cleanText(audit.targetTeamName || review.targetTeamName || "대상 기업", 160);
  return {
    ...base,
    eventType: requested ? "discover.collaboration_review_requested" : "discover.collaboration_review_responded",
    primaryEntityType: "collaboration_review",
    primaryEntityKey: audit.entityId || review.id || update.reviewId,
    primaryEntityLabel: `${requesterName} ↔ ${targetName}`,
    audienceScope: "participants_and_staff",
    title: requested ? `${targetName} 협업 검토 요청` : `${requesterName} ↔ ${targetName} 협업 검토 응답`,
    summary: requested
      ? "상대 기업의 동의를 전제로 협업 검토를 요청했습니다."
      : `협업 검토 요청에 ${statusLabel(update.status || audit.action)} 응답을 남겼습니다.`,
    routeTarget: "myLogMatches",
    metadata: { status: update.status || review.status || audit.action || "pending" },
    relatedEntities: [
      organizationEntity(audit.requesterTeamId || review.requesterTeamId, requesterName, "subject"),
      organizationEntity(audit.targetTeamId || review.targetTeamId, targetName, "target")
    ].filter((item) => item.source_key),
    occurredAt: event.createdAt || audit.createdAt
  };
}

function forumActivityRecord(event, context, base) {
  const snapshot = context.forumSnapshot || { threads: [], comments: [] };
  if (event.type === "forum_thread_created" && event.thread) {
    return {
      ...base,
      eventType: "community.post_created",
      primaryEntityType: "forum_thread",
      primaryEntityKey: event.thread.id,
      audienceScope: "actor_only",
      primaryEntityLabel: cleanText(event.thread.title, 240),
      title: cleanText(event.thread.title || "Community 글 작성", 200),
      summary: "Community에 새 글을 작성했습니다.",
      routeTarget: "myLogCommunity",
      metadata: { category: event.thread.categorySlug || "general", visibility: event.thread.visibility || "members_only" }
    };
  }
  if (event.type === "forum_thread_updated" && event.threadId) {
    const thread = (snapshot.threads || []).find((item) => item.id === event.threadId) || {};
    const deleted = event.changes?.status === "deleted";
    return {
      ...base,
      eventType: "community.post_updated",
      primaryEntityType: "forum_thread",
      primaryEntityKey: event.threadId,
      audienceScope: "actor_only",
      primaryEntityLabel: cleanText(thread.title || "Community 글", 240),
      title: `${cleanText(thread.title || "Community 글", 160)} ${deleted ? "삭제" : "수정"}`,
      summary: deleted ? "Community 글을 삭제했습니다." : "Community 글을 수정했습니다.",
      routeTarget: "myLogCommunity",
      metadata: { change: deleted ? "deleted" : "updated" }
    };
  }
  if (event.type === "forum_comment_created" && event.comment) {
    const thread = (snapshot.threads || []).find((item) => item.id === event.comment.threadId) || {};
    return {
      ...base,
      eventType: "community.comment_created",
      primaryEntityType: "forum_comment",
      primaryEntityKey: event.comment.id,
      audienceScope: "actor_only",
      primaryEntityLabel: cleanText(thread.title || "Community 댓글", 240),
      title: `${cleanText(thread.title || "Community 글", 160)}에 댓글 작성`,
      summary: "Community 글에 댓글을 남겼습니다.",
      routeTarget: "myLogCommunity",
      metadata: { threadId: event.comment.threadId || "" },
      relatedEntities: thread.id ? [relatedEntity("forum_thread", "forum", thread.id, thread.title, "parent")] : [],
      viewerUserIds: validUserIds([thread.authorUserId])
    };
  }
  if (event.type === "forum_comment_updated" && event.commentId) {
    const comment = (snapshot.comments || []).find((item) => item.id === event.commentId) || {};
    const thread = (snapshot.threads || []).find((item) => item.id === comment.threadId) || {};
    const deleted = event.changes?.status === "deleted";
    return {
      ...base,
      eventType: "community.comment_updated",
      primaryEntityType: "forum_comment",
      primaryEntityKey: event.commentId,
      audienceScope: "actor_only",
      primaryEntityLabel: cleanText(thread.title || "Community 글", 240),
      title: `${cleanText(thread.title || "Community 글", 160)} 댓글 ${deleted ? "삭제" : "수정"}`,
      summary: deleted ? "Community 댓글을 삭제했습니다." : "Community 댓글을 수정했습니다.",
      routeTarget: "myLogCommunity",
      metadata: { threadId: comment.threadId || "", change: deleted ? "deleted" : "updated" },
      relatedEntities: thread.id ? [relatedEntity("forum_thread", "forum", thread.id, thread.title, "parent")] : [],
      viewerUserIds: validUserIds([thread.authorUserId])
    };
  }
  if (event.type === "forum_vote_cast") {
    const target = event.targetType === "comment"
      ? (snapshot.comments || []).find((item) => item.id === event.targetId)
      : (snapshot.threads || []).find((item) => item.id === event.targetId);
    const thread = target?.threadId
      ? (snapshot.threads || []).find((item) => item.id === target.threadId)
      : target;
    return {
      ...base,
      eventType: "community.reaction_added",
      primaryEntityType: event.targetType === "comment" ? "forum_comment" : "forum_thread",
      primaryEntityKey: event.targetId,
      audienceScope: "actor_only",
      primaryEntityLabel: cleanText(thread?.title || "Community 반응", 240),
      title: `${cleanText(thread?.title || "Community 글", 160)}에 반응`,
      summary: "Community 콘텐츠에 공감 반응을 남겼습니다.",
      routeTarget: "myLogCommunity",
      metadata: { targetType: event.targetType || "thread", voteType: event.voteType || "upvote" },
      viewerUserIds: validUserIds([target?.authorUserId])
    };
  }
  if (event.type === "forum_thread_bookmarked" && event.threadId) {
    const thread = (snapshot.threads || []).find((item) => item.id === event.threadId) || {};
    return {
      ...base,
      eventType: "community.thread_bookmarked",
      primaryEntityType: "forum_thread",
      primaryEntityKey: event.threadId,
      audienceScope: "actor_only",
      primaryEntityLabel: cleanText(thread.title || "Community 글", 240),
      title: `${cleanText(thread.title || "Community 글", 160)} 저장`,
      summary: "Community 글을 저장했습니다.",
      routeTarget: "myLogCommunity",
      metadata: {},
      viewerUserIds: validUserIds([thread.authorUserId])
    };
  }
  if (event.type === "forum_category_created" && event.category) {
    return {
      ...base,
      eventType: "community.category_created",
      primaryEntityType: "forum_category",
      primaryEntityKey: event.category.id,
      audienceScope: "actor_only",
      primaryEntityLabel: cleanText(event.category.label, 240),
      title: `${cleanText(event.category.label || "Community", 160)} 채널 생성`,
      summary: "Community 채널을 만들었습니다.",
      routeTarget: "community",
      metadata: { visibility: event.category.visibility || "public" }
    };
  }
  return null;
}

function competitionActivityRecord(event, context, base) {
  if (event.type === "competition_challenge_saved" && event.challenge) {
    return {
      ...base,
      eventType: "bounty.opportunity_created",
      primaryEntityType: "bounty_challenge",
      primaryEntityKey: event.challenge.id,
      primaryEntityLabel: cleanText(event.challenge.title || "Bounty", 240),
      audienceScope: "staff",
      title: cleanText(event.challenge.title || "Bounty 생성", 200),
      summary: "새 Bounty 기회가 저장되었습니다.",
      routeTarget: "myLogBounties",
      metadata: { status: event.challenge.status || "draft" }
    };
  }
  if (event.submission && String(event.type || "").startsWith("competition_submission_")) {
    const team = competitionTeamForEvent(event, context);
    return {
      ...base,
      eventType: event.type === "competition_submission_scored"
        ? "bounty.application_submitted"
        : "bounty.application_status_changed",
      primaryEntityType: "bounty_submission",
      primaryEntityKey: event.submission.id,
      audienceScope: "participants_and_staff",
      primaryEntityLabel: "Bounty 제출",
      title: "Bounty 결과 제출",
      summary: `제출 상태가 ${statusLabel(event.submission.status)}입니다.`,
      routeTarget: "myLogBounties",
      metadata: { status: event.submission.status || "submitted", challengeId: event.submission.challengeId || "" },
      relatedEntities: event.submission.teamId
        ? [organizationEntity(event.submission.teamId, team?.name || event.submission.teamId, "subject", "competition_team")]
        : [],
      viewerUserIds: validUserIds([
        event.submission.submitterUserId,
        event.member?.userId,
        team?.ownerUserId
      ]),
      occurredAt: event.submission.scoredAt || event.submission.submittedAt || event.createdAt
    };
  }
  if (["competition_opportunity_requested", "competition_opportunity_updated"].includes(event.type) && event.opportunity) {
    const requested = event.type === "competition_opportunity_requested";
    const team = competitionTeamForEvent(event, context);
    return {
      ...base,
      eventType: requested ? "bounty.opportunity_created" : "bounty.opportunity_status_changed",
      primaryEntityType: "bounty_opportunity",
      primaryEntityKey: event.opportunity.id,
      audienceScope: "participants_and_staff",
      primaryEntityLabel: "Bounty 기회 요청",
      title: requested ? "Bounty 후속 기회 요청" : "Bounty 후속 기회 상태 변경",
      summary: requested
        ? "검증 결과를 기반으로 후속 기회를 요청했습니다."
        : `후속 기회 상태가 ${statusLabel(event.opportunity.status)}(으)로 변경되었습니다.`,
      routeTarget: "myLogBounties",
      metadata: { status: event.opportunity.status || "requested", challengeId: event.opportunity.challengeId || "" },
      relatedEntities: event.opportunity.teamId
        ? [organizationEntity(event.opportunity.teamId, team?.name || event.opportunity.teamId, "subject", "competition_team")]
        : [],
      viewerUserIds: validUserIds([event.opportunity.requesterUserId]),
      occurredAt: event.opportunity.updatedAt || event.opportunity.requestedAt || event.createdAt
    };
  }
  return null;
}

function competitionTeamForEvent(event, context) {
  const teamId = cleanText(event?.team?.id || event?.submission?.teamId || event?.opportunity?.teamId, 160);
  if (!teamId) return event?.team || null;
  return event?.team ||
    (context?.competitionSnapshot?.teams || []).find((team) => String(team?.id || "") === teamId) ||
    null;
}

function activityRpcPayload(record) {
  return {
    p_event_type: record.eventType,
    p_source_system: record.sourceSystem,
    p_source_event_id: record.sourceEventId,
    p_actor_user_id: record.actorUserId,
    p_actor_label: record.actorLabel,
    p_actor_role: record.actorRole,
    p_actor_organization_source: record.actorOrganizationSource,
    p_actor_organization_key: record.actorOrganizationKey,
    p_actor_organization_name: record.actorOrganizationName,
    p_actor_organization_type: record.actorOrganizationType,
    p_primary_entity_type: record.primaryEntityType,
    p_primary_entity_key: record.primaryEntityKey,
    p_primary_entity_label: record.primaryEntityLabel,
    p_audience_scope: record.audienceScope,
    p_title: record.title,
    p_summary: record.summary,
    p_route_target: record.routeTarget,
    p_metadata: safeMetadata(record.metadata),
    p_related_entities: safeRelatedEntities(record.relatedEntities),
    p_viewer_user_ids: validUserIds(record.viewerUserIds),
    p_occurred_at: safeTimestamp(record.occurredAt),
    p_workspace_slug: WORKSPACE_SLUG
  };
}

function membershipRpcPayload(membership) {
  return {
    p_user_id: membership.userId,
    p_role: membership.role,
    p_organization_source: membership.organizationSource,
    p_organization_key: membership.organizationKey,
    p_organization_name: membership.organizationName,
    p_organization_type: membership.organizationType,
    p_workspace_slug: WORKSPACE_SLUG
  };
}

function publicActivityEvent(row) {
  const id = Number(row?.id);
  if (!Number.isSafeInteger(id) || id < 1 || !row?.event_type || !isValidTimestamp(row?.occurred_at)) return null;
  return {
    id,
    eventUid: row.event_uid,
    sourceSystem: cleanText(row.source_system, 80),
    sourceEventId: cleanText(row.source_event_id, 240),
    category: cleanText(row.domain, 40),
    eventType: cleanText(row.event_type, 100),
    title: cleanText(row.title, 200),
    detail: cleanText(row.summary, 1000),
    target: cleanText(row.route_target || "workspace", 80),
    actorLabel: cleanText(row.actor_label, 160),
    actorRole: cleanText(row.actor_role, 40),
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    readAt: row.read_at || null,
    metadata: safeMetadata(row.metadata),
    entities: Array.isArray(row.entities)
      ? row.entities.map((item) => ({
          id: cleanText(item?.id, 80),
          type: cleanText(item?.type, 80),
          label: cleanText(item?.label, 240),
          relation: cleanText(item?.relation, 20)
        }))
      : []
  };
}

function publicAdminActivityUser(row) {
  const userId = cleanText(row?.user_id, 64);
  if (!UUID_PATTERN.test(userId)) return null;
  return {
    userId,
    email: cleanText(row.email, 320),
    label: cleanText(row.actor_label || row.organization_name || row.email, 240),
    role: cleanText(row.role, 40),
    organizationName: cleanText(row.organization_name, 240),
    eventCount: Math.max(Number(row.event_count) || 0, 0),
    firstActivityAt: isValidTimestamp(row.first_activity_at) ? row.first_activity_at : null,
    lastActivityAt: isValidTimestamp(row.last_activity_at) ? row.last_activity_at : null
  };
}

function publicAdminActivityEvent(row) {
  const id = Number(row?.id);
  const actorUserId = cleanText(row?.actor_user_id, 64);
  if (!Number.isSafeInteger(id) || id < 1 || !UUID_PATTERN.test(actorUserId) || !isValidTimestamp(row?.occurred_at)) {
    return null;
  }
  return {
    id,
    eventUid: cleanText(row.event_uid, 64),
    actorUserId,
    actorEmail: cleanText(row.actor_email, 320),
    actorLabel: cleanText(row.actor_label, 160),
    actorRole: cleanText(row.actor_role, 40),
    organizationName: cleanText(row.organization_name, 240),
    category: cleanText(row.domain, 40),
    eventType: cleanText(row.event_type, 100),
    eventLabel: cleanText(row.event_label, 120),
    title: cleanText(row.title, 200),
    detail: cleanText(row.summary, 1000),
    target: cleanText(row.route_target || "workspace", 80),
    sourceSystem: cleanText(row.source_system, 80),
    occurredAt: row.occurred_at,
    recordedAt: isValidTimestamp(row.recorded_at) ? row.recorded_at : row.occurred_at,
    metadata: safeMetadata(row.metadata)
  };
}

function organizationEntity(id, name, relationType = "target", source = "program_team") {
  const sourceKey = cleanText(id, 160);
  return {
    entity_type: "organization",
    source_system: source,
    source_key: sourceKey,
    label: cleanText(name, 240),
    relation_type: relationType,
    organization_source: source,
    organization_key: sourceKey,
    organization_name: cleanText(name || sourceKey, 240),
    organization_type: "startup"
  };
}

function relatedEntity(type, source, key, label, relation = "context") {
  return {
    entity_type: cleanText(type, 80),
    source_system: cleanText(source, 80),
    source_key: cleanText(key, 200),
    label: cleanText(label, 240),
    relation_type: relation
  };
}

function startupName(snapshot, startupId) {
  return cleanText(
    (snapshot.startups || []).find((item) => item.id === startupId)?.name ||
      (snapshot.submissions || []).find((item) => item.id === startupId)?.companyName,
    160
  );
}

function activityMembershipRole(viewer) {
  if (viewer?.role === "admin") return "admin";
  if (viewer?.canScore || viewer?.role === "sparklabs") return "staff";
  if (viewer?.role === "b2b_partner") return "partner";
  if (viewer?.role === "human_validator") return "human_validator";
  if (viewer?.role === "member") return "claw_member";
  return "";
}

function roleLabel(role) {
  return ({ admin: "SparkLabs 관리자", staff: "SparkLabs 운영진", partner: "기업 파트너", claw_member: "Claw Member", human_validator: "검증 파트너" })[role] || "Arena 사용자";
}

function statusLabel(value) {
  const key = cleanText(value, 60);
  return ({ pending: "응답 대기", approved: "승인", declined: "거절", interest: "검토 접수", qualified: "검토 완료", founder_review: "팀 검토", mutually_accepted: "상호 동의", submitted: "제출", reviewing: "검토 중", matched: "연결", pilot: "Pilot", closed: "종료", intake: "접수", published: "공개", evaluating: "평가 중" })[key] || key || "업데이트";
}

function serviceHeaders(secretKey) {
  const headers = {
    apikey: secretKey,
    "content-type": "application/json"
  };
  // Supabase's current sb_secret_* keys are opaque API keys, not JWTs. Legacy
  // service_role JWTs still need the Authorization header.
  if (!String(secretKey).startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${secretKey}`;
  }
  return headers;
}

function validUserIds(values = []) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter((value) => UUID_PATTERN.test(value)))];
}

function missingSchema(response, payload) {
  return response?.status === 404 || MISSING_SCHEMA_CODES.has(String(payload?.code || ""));
}

function encodeCursor(occurredAt, id) {
  return Buffer.from(JSON.stringify({ occurredAt, id }), "utf8").toString("base64url");
}

function parseCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const id = Number(parsed?.id);
    if (!isValidTimestamp(parsed?.occurredAt) || !Number.isSafeInteger(id) || id < 1) return null;
    return { occurredAt: new Date(parsed.occurredAt).toISOString(), id };
  } catch {
    return null;
  }
}

function safeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = [];
  for (const [rawKey, item] of Object.entries(value)) {
    if (entries.length >= 16) break;
    const key = cleanText(rawKey, 80);
    if (!key || (typeof item === "object" && item !== null)) continue;
    if (typeof item === "number" && !Number.isFinite(item)) continue;
    entries.push([key, typeof item === "string" ? cleanText(item, 240) : item]);
  }
  return Object.fromEntries(entries);
}

function safeRelatedEntities(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 16).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entityType = cleanText(item.entity_type, 80);
    const sourceSystem = cleanText(item.source_system, 80);
    const sourceKey = cleanText(item.source_key, 200);
    if (!/^[a-z][a-z0-9_]{1,79}$/.test(entityType) || !sourceSystem || !sourceKey) return [];
    const relationType = ["subject", "target", "parent", "context"].includes(item.relation_type)
      ? item.relation_type
      : "context";
    const organizationType = ["startup", "partner", "operator", "validator", "other"].includes(item.organization_type)
      ? item.organization_type
      : "other";
    return [{
      entity_type: entityType,
      source_system: sourceSystem,
      source_key: sourceKey,
      label: cleanText(item.label, 240),
      relation_type: relationType,
      position: boundedInteger(item.position, 0, 0, 32_767),
      organization_source: cleanText(item.organization_source, 80),
      organization_key: cleanText(item.organization_key, 160),
      organization_name: cleanText(item.organization_name, 240),
      organization_type: organizationType
    }];
  });
}

function safeTimestamp(value) {
  return isValidTimestamp(value) ? new Date(value).toISOString() : new Date().toISOString();
}

function isValidTimestamp(value) {
  return Boolean(value) && Number.isFinite(Date.parse(String(value)));
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

async function activityFetch(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      const error = new Error(`Arena activity request timed out after ${timeoutMs}ms.`);
      error.name = "TimeoutError";
      error.code = "SC_ARENA_ACTIVITY_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => fetchImpl(url, { ...options, signal: controller.signal })),
      timeout
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function slugKey(value) {
  return cleanText(value, 160).toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "");
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
