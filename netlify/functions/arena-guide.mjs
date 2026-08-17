import { answerArenaGuide } from "../lib/arena-guide.mjs";
import { consumeRateLimit } from "../lib/rate-limit.mjs";
import { resolveProgramParticipantViewer } from "../lib/program-hub.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

async function arenaGuide(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);

  try {
    const env = options.env || process.env;
    const viewer = await resolveGuideViewer(req, options, env);
    const identity = viewer.id || viewer.email || clientIdentity(req);
    const rateLimit = await (options.consumeRateLimit || consumeRateLimit)(`arena-guide:${identity}`, {
      max: env.SPARKCLAW_ARENA_GUIDE_LIMIT_PER_HOUR || 40,
      windowMs: env.SPARKCLAW_ARENA_GUIDE_WINDOW_MS || 60 * 60 * 1000
    });
    if (!rateLimit.allowed) return json({ error: "클로이가 잠시 숨을 고르고 있어요. 잠시 후 다시 말씀해 주세요." }, 429, { "retry-after": String(rateLimit.retryAfterSeconds) });

    const payload = await readJson(req);
    const result = await (options.answerArenaGuide || answerArenaGuide)(payload, {
      viewer,
      env,
      fetchImpl: options.fetchImpl || fetch
    });
    return json({ ok: true, guide: result });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json({ error: status < 500 ? error.message : "클로이가 안내를 정리하지 못했어요. 잠시 후 다시 시도해 주세요." }, status);
  }
}

export default withScArenaDevelopmentLogging("arena-guide", arenaGuide);

async function resolveGuideViewer(req, options, env) {
  if (!req.headers.get("authorization")) return { id: null, email: "", role: "public" };
  const auth = await (options.verifyRequest || verifyArenaRequest)(req, env);
  if (!auth.ok) throw statusError("로그인 세션을 다시 확인해 주세요.", auth.status);
  if (auth.viewer?.role !== "public") return auth.viewer;
  try {
    return (await (options.resolveProgramViewer || resolveProgramParticipantViewer)(auth.viewer, env, options.fetchImpl || fetch))?.viewer || auth.viewer;
  } catch {
    return auth.viewer;
  }
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > 8_000) throw statusError("클로이에게 보낸 요청이 너무 길어요.", 413);
  try { return JSON.parse(text || "{}"); } catch { throw statusError("요청 본문은 올바른 JSON이어야 합니다.", 400); }
}

function clientIdentity(req) {
  return String(req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "anonymous").split(",")[0].trim();
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(payload, status = 200, headers = {}) {
  return corsResponse(JSON.stringify(payload), status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
}

function corsResponse(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      ...headers
    }
  });
}
import { withScArenaDevelopmentLogging } from "../lib/sc-arena-operational-logs.mjs";
