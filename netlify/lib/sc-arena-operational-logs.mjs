import { createHash } from "node:crypto";

const WORKSPACE_SLUG = "sparkclaw-ai-arena";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSING_SCHEMA_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
const SECRET_PATTERN = /(bearer\s+)[a-z0-9._~+\/-]+|\b(?:sb_secret_|sb_publishable_|sk-)[a-z0-9._-]+|([?&](?:token|key|secret|code|password)=)[^&\s]+/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function scArenaOperationalLogConfig(env = process.env) {
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const secretKey = String(
    env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || ""
  ).trim();
  return {
    supabaseUrl,
    secretKey,
    configured: Boolean(supabaseUrl && secretKey),
    timeoutMs: Math.min(Math.max(Number(env.SC_ARENA_OPERATIONAL_LOG_TIMEOUT_MS) || 2000, 250), 5000)
  };
}

export function developmentLogRecord({ source, error = null, req = null, responseStatus = null, durationMs = null, viewer = null, env = process.env }) {
  const normalizedSource = cleanText(source, 120) || "unknown-function";
  const status = validStatus(responseStatus) ? Number(responseStatus) : validStatus(error?.status) ? Number(error.status) : null;
  const errorName = cleanText(error?.name, 80) || (status && status >= 500 ? "HttpServerError" : "ApplicationError");
  const rawMessage = error?.message || (status ? `HTTP ${status} response` : "Unhandled server error");
  const message = sanitizeDiagnosticText(rawMessage, 2000) || "Unhandled server error";
  const requestUrl = safeUrl(req?.url);
  const requestId = cleanText(
    req?.headers?.get?.("x-nf-request-id") || req?.headers?.get?.("x-request-id") || req?.headers?.get?.("traceparent"),
    160
  );
  const occurredAt = new Date().toISOString();
  return {
    severity: status && status >= 500 ? "error" : "warn",
    source: normalizedSource,
    eventType: status && status >= 500 ? "server.http_failure" : "server.unhandled_error",
    message,
    environment: normalizeEnvironment(env.CONTEXT || env.DEPLOY_CONTEXT || env.NODE_ENV),
    fingerprint: createHash("sha256").update(`${normalizedSource}|${errorName}|${message}`).digest("hex").slice(0, 40),
    requestId,
    releaseId: cleanText(env.DEPLOY_ID || env.COMMIT_REF || env.HEAD, 160),
    actorUserId: UUID_PATTERN.test(cleanText(viewer?.id, 64)) ? cleanText(viewer.id, 64) : null,
    httpMethod: cleanText(req?.method, 12).toUpperCase(),
    httpPath: cleanText(requestUrl?.pathname, 240),
    httpStatus: status,
    durationMs: boundedDuration(durationMs),
    metadata: { errorName, runtime: "netlify-functions" },
    occurredAt
  };
}

export async function recordScArenaDevelopmentLog(input, env = process.env, fetchImpl = fetch) {
  const config = scArenaOperationalLogConfig(env);
  if (!config.configured) return { stored: false, reason: "unconfigured" };
  const record = developmentLogRecord({ ...input, env });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/sc_arena_append_development_log`, {
      method: "POST",
      headers: {
        apikey: config.secretKey,
        Authorization: `Bearer ${config.secretKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(developmentLogRpcPayload(record)),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  const payload = await safeJson(response);
  if (!response.ok) {
    if (MISSING_SCHEMA_CODES.has(String(payload?.code || ""))) return { stored: false, reason: "schema_missing" };
    const storeError = new Error("Development log could not be stored.");
    storeError.status = response.status;
    throw storeError;
  }
  return { stored: true, id: Number(payload) || null, record };
}

export async function recordScArenaDevelopmentLogSafely(input, env = process.env, fetchImpl = fetch) {
  try {
    return await recordScArenaDevelopmentLog(input, env, fetchImpl);
  } catch (error) {
    console.warn("[sc-arena-operational-logs] development log write failed", {
      source: cleanText(input?.source, 120) || "unknown-function",
      status: Number(error?.status) || 0
    });
    return { stored: false, reason: "write_failed" };
  }
}

export function withScArenaDevelopmentLogging(source, handler) {
  return async function loggedNetlifyFunction(req, context = {}) {
    const startedAt = Date.now();
    const env = context?.env || process.env;
    const fetchImpl = context?.fetchImpl || fetch;
    try {
      const response = await handler(req, context);
      if (Number(response?.status) >= 500) {
        await recordScArenaDevelopmentLogSafely({
          source,
          req,
          responseStatus: response.status,
          durationMs: Date.now() - startedAt
        }, env, fetchImpl);
      }
      return response;
    } catch (error) {
      await recordScArenaDevelopmentLogSafely({
        source,
        error,
        req,
        responseStatus: Number(error?.status) || 500,
        durationMs: Date.now() - startedAt
      }, env, fetchImpl);
      throw error;
    }
  };
}

function developmentLogRpcPayload(record) {
  return {
    p_severity: record.severity,
    p_source: record.source,
    p_event_type: record.eventType,
    p_message: record.message,
    p_environment: record.environment,
    p_fingerprint: record.fingerprint,
    p_request_id: record.requestId,
    p_release_id: record.releaseId,
    p_actor_user_id: record.actorUserId,
    p_http_method: record.httpMethod,
    p_http_path: record.httpPath,
    p_http_status: record.httpStatus,
    p_duration_ms: record.durationMs,
    p_metadata: record.metadata,
    p_occurred_at: record.occurredAt,
    p_workspace_slug: WORKSPACE_SLUG
  };
}

function sanitizeDiagnosticText(value, maxLength) {
  return cleanText(value, maxLength * 2)
    .replace(SECRET_PATTERN, (_match, prefix, queryPrefix) => `${prefix || queryPrefix || ""}[redacted]`)
    .replace(EMAIL_PATTERN, "[email]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .slice(0, maxLength);
}

function safeUrl(value) {
  try { return new URL(String(value || "")); } catch { return null; }
}

function validStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599;
}

function boundedDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration) ? Math.min(Math.max(Math.round(duration), 0), 600000) : null;
}

function normalizeEnvironment(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["production", "deploy-preview", "branch-deploy", "test"].includes(normalized)) return normalized;
  if (["dev", "development", "local"].includes(normalized)) return "local";
  return "unknown";
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}
