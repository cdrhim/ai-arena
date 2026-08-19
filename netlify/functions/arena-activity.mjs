import {
  loadScArenaAdminActivity,
  recordScArenaClientActivity
} from "../lib/sc-arena-activity.mjs";
import { withScArenaDevelopmentLogging } from "../lib/sc-arena-operational-logs.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

const STAFF_ROLES = new Set(["admin", "sparklabs"]);
const ALLOWED_DOMAINS = new Set(["discover", "community", "bounty", "system"]);
const CLIENT_ACTIONS = new Set(["auth_login", "auth_logout", "session_started", "page_viewed"]);

async function arenaActivity(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (!new Set(["GET", "POST"]).has(req.method)) {
    return json({ error: "지원하지 않는 요청 방식입니다." }, 405);
  }

  try {
    const env = options.env || process.env;
    const fetchImpl = options.fetchImpl || fetch;
    const auth = await (options.verifyRequest || verifyArenaRequest)(req, env);
    if (!auth.ok) return json({ error: auth.error || "로그인이 필요합니다." }, auth.status || 401);

    if (req.method === "POST") {
      const body = await safeRequestJson(req);
      const action = limitedValue(body?.action, 40).toLowerCase();
      if (!CLIENT_ACTIONS.has(action)) return json({ error: "기록할 수 없는 활동입니다." }, 400);
      const result = await (options.recordClientActivity || recordScArenaClientActivity)({
        action,
        clientEventId: limitedValue(body?.clientEventId, 180),
        page: limitedValue(body?.page, 40),
        viewer: auth.viewer,
        context: {},
        env,
        fetchImpl
      });
      return json({ stored: Boolean(result?.stored), reason: result?.stored ? "" : limitedValue(result?.reason, 80) }, 200);
    }

    if (!isStaff(auth.viewer)) {
      return json({ error: "SparkLabs 관리자만 전체 사용자 활동을 열람할 수 있습니다." }, 403);
    }
    const url = new URL(req.url);
    const domainValue = limitedValue(url.searchParams.get("domain"), 40).toLowerCase();
    const eventTypeValue = limitedValue(url.searchParams.get("action"), 100).toLowerCase();
    const result = await (options.loadAdminActivity || loadScArenaAdminActivity)({
      req,
      viewer: auth.viewer,
      actorUserId: uuidOrNull(url.searchParams.get("user")),
      domain: ALLOWED_DOMAINS.has(domainValue) ? domainValue : null,
      eventType: /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(eventTypeValue) ? eventTypeValue : null,
      occurredFrom: timestampOrNull(url.searchParams.get("from")),
      occurredTo: timestampOrNull(url.searchParams.get("to")),
      cursor: limitedValue(url.searchParams.get("cursor"), 640),
      limit: boundedLimit(url.searchParams.get("limit")),
      includeUsers: url.searchParams.get("includeUsers") !== "0",
      env,
      fetchImpl
    });

    return json({
      available: Boolean(result?.available),
      users: Array.isArray(result?.users) ? result.users : [],
      events: Array.isArray(result?.events) ? result.events : [],
      totalCount: nonNegativeInteger(result?.totalCount),
      nextCursor: result?.nextCursor || null,
      reason: result?.available ? "" : limitedValue(result?.reason || "unavailable", 80)
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error("[arena-activity] request failed", {
      status,
      name: limitedValue(error?.name || "Error", 80),
      code: limitedValue(error?.code || "", 80),
      message: limitedValue(error?.message || "unknown", 320)
    });
    return json({ error: status < 500 ? error.message : "활동 기록을 불러오지 못했습니다." }, status);
  }
}

export default withScArenaDevelopmentLogging("arena-activity", arenaActivity);

function isStaff(viewer) {
  return Boolean(viewer?.canScore || STAFF_ROLES.has(String(viewer?.role || "").toLowerCase()));
}

function uuidOrNull(value) {
  const candidate = limitedValue(value, 64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

function timestampOrNull(value) {
  const candidate = limitedValue(value, 80);
  return candidate && Number.isFinite(Date.parse(candidate)) ? new Date(candidate).toISOString() : null;
}

function boundedLimit(value) {
  const parsed = Number.parseInt(String(value || "100"), 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 100, 1), 200);
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function limitedValue(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

async function safeRequestJson(req) {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 4096) {
    const error = new Error("활동 기록 요청이 너무 큽니다.");
    error.status = 413;
    throw error;
  }
  try {
    const value = await req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function json(payload, status = 200) {
  return corsResponse(JSON.stringify(payload), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store"
  });
}

function corsResponse(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      ...headers
    }
  });
}
