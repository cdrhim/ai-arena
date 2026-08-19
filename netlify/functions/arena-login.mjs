import { createHash } from "node:crypto";

import { authenticateArenaLogin } from "../lib/arena-login-bridge.mjs";
import { consumeRateLimit } from "../lib/rate-limit.mjs";
import { withScArenaDevelopmentLogging } from "../lib/sc-arena-operational-logs.mjs";

const MAX_BODY_BYTES = 8 * 1024;
const GENERIC_AUTH_ERROR = "이메일 또는 비밀번호를 확인해 주세요.";

async function arenaLogin(req, context = {}) {
  return handleArenaLoginRequest(req, {
    env: context.env || process.env,
    fetchImpl: context.fetchImpl || fetch,
    consumeLimit: context.consumeLimit || consumeRateLimit,
    authenticate: context.authenticate || authenticateArenaLogin
  });
}

export default withScArenaDevelopmentLogging("arena-login", arenaLogin);

export async function handleArenaLoginRequest(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);

  const env = options.env || process.env;
  const consumeLimit = options.consumeLimit || consumeRateLimit;
  try {
    const credentials = await readCredentials(req);
    const rateLimit = await consumeLoginLimits({ req, email: credentials.email, env, consumeLimit });
    if (!rateLimit.allowed) {
      return json({ error: "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요." }, 429, {
        "retry-after": String(rateLimit.retryAfterSeconds)
      });
    }

    const result = await (options.authenticate || authenticateArenaLogin)({
      ...credentials,
      env,
      fetchImpl: options.fetchImpl || fetch
    });
    if (!result.ok) {
      if (result.status === 401) return json({ error: GENERIC_AUTH_ERROR }, 401);
      if (result.status === 403) {
        return json({ error: "기존 SparkClaw 참여사에 등록된 이메일만 AI Arena에 로그인할 수 있습니다." }, 403);
      }
      if (result.status === 429) return json({ error: "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
      return json({ error: "로그인 계정 동기화 서비스를 잠시 사용할 수 없습니다." }, 503);
    }
    return json(result.session, 200);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json({ error: status < 500 ? error.message : "로그인을 처리하지 못했습니다." }, status);
  }
}

async function readCredentials(req) {
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw statusError("로그인 요청이 너무 큽니다.", 413);
  let payload;
  try { payload = JSON.parse(text || "{}"); } catch { throw statusError("올바른 로그인 요청 형식이 아닙니다.", 400); }
  const email = String(payload?.email || "").trim().toLowerCase();
  const password = String(payload?.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320 || !password || password.length > 1024) {
    throw statusError(GENERIC_AUTH_ERROR, 401);
  }
  return { email, password };
}

async function consumeLoginLimits({ req, email, env, consumeLimit }) {
  const windowMs = Number(env.SPARKCLAW_LOGIN_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
  const emailFingerprint = createHash("sha256").update(email).digest("hex");
  const clientIp = String(
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for") ||
    "unknown"
  ).split(",")[0].trim();
  const [clientLimit, accountLimit] = await Promise.all([
    consumeLimit(`arena-login:client:${clientIp}`, {
      max: Number(env.SPARKCLAW_LOGIN_LIMIT_PER_CLIENT) || 30,
      windowMs
    }),
    consumeLimit(`arena-login:account:${emailFingerprint}`, {
      max: Number(env.SPARKCLAW_LOGIN_LIMIT_PER_ACCOUNT) || 10,
      windowMs
    })
  ]);
  return {
    allowed: clientLimit.allowed && accountLimit.allowed,
    retryAfterSeconds: Math.max(clientLimit.retryAfterSeconds || 1, accountLimit.retryAfterSeconds || 1)
  };
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(payload, status = 200, headers = {}) {
  return corsResponse(JSON.stringify(payload), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
    ...headers
  });
}

function corsResponse(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      ...headers
    }
  });
}
