import { polishFeaturedKeywords } from "../lib/featured-keywords.mjs";
import { consumeRateLimit } from "../lib/rate-limit.mjs";
import { resolveProgramParticipantViewer } from "../lib/program-hub.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

const ALLOWED_ROLES = new Set(["member", "b2b_partner", "human_validator", "sparklabs", "admin"]);

async function featuredKeywords(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);

  try {
    const auth = await (options.verifyRequest || verifyArenaRequest)(req);
    if (!auth.ok) return json({ error: "Highlighted Companies를 확인하려면 로그인이 필요합니다." }, auth.status);
    const env = options.env || process.env;
    const viewer = await resolveViewer(
      auth.viewer,
      options.resolveProgramViewer || resolveProgramParticipantViewer,
      env,
      options.fetchImpl || fetch
    );
    if (!ALLOWED_ROLES.has(String(viewer?.role || "").toLowerCase())) {
      return json({ error: "승인된 Arena 계정만 Highlighted Companies를 이용할 수 있습니다." }, 403);
    }
    const rateLimit = await (options.consumeRateLimit || consumeRateLimit)(
      `featured-keywords:${viewer.id || viewer.email}`,
      {
        max: env.SPARKCLAW_FEATURED_KEYWORDS_LIMIT_PER_HOUR || 20,
        windowMs: env.SPARKCLAW_FEATURED_KEYWORDS_WINDOW_MS || 60 * 60 * 1000
      }
    );
    if (!rateLimit.allowed) return json({ error: "Highlighted Companies 정리 요청이 많습니다." }, 429, { "retry-after": String(rateLimit.retryAfterSeconds) });

    const payload = await readJson(req);
    const spotlight = await (options.polishFeaturedKeywords || polishFeaturedKeywords)(
      { ids: payload.ids },
      { env, fetchImpl: options.fetchImpl || fetch }
    );
    return json({ ok: true, spotlight });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json({ error: status < 500 ? error.message : "Highlighted Companies를 정리하지 못했습니다." }, status);
  }
}

export default withScArenaDevelopmentLogging("featured-keywords", featuredKeywords);

async function resolveViewer(viewer, resolver, env, fetchImpl) {
  if (viewer?.role !== "public") return viewer;
  try {
    return (await resolver(viewer, env, fetchImpl))?.viewer || viewer;
  } catch {
    return viewer;
  }
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > 2_000) throw statusError("Highlighted Companies 요청이 너무 큽니다.", 413);
  try { return JSON.parse(text || "{}"); } catch { throw statusError("요청 본문은 올바른 JSON이어야 합니다.", 400); }
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
