import { polishCommunityHighlights } from "../lib/community-highlights.mjs";
import { consumeRateLimit } from "../lib/rate-limit.mjs";
import { resolveProgramParticipantViewer } from "../lib/program-hub.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

async function communityHighlights(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);

  try {
    const auth = await (options.verifyRequest || verifyArenaRequest)(req);
    if (!auth.ok) return json({ error: "Arena 소식을 정리하려면 로그인이 필요합니다." }, auth.status);
    const env = options.env || process.env;
    const viewer = await communityViewer(auth.viewer, options.resolveProgramViewer || resolveProgramParticipantViewer, env, options.fetchImpl || fetch);
    if (!viewer?.canScore && !["member", "b2b_partner", "human_validator"].includes(viewer?.role)) {
      return json({ error: "승인된 Arena 계정만 소식 정리를 이용할 수 있습니다." }, 403);
    }
    const rateLimit = await (options.consumeRateLimit || consumeRateLimit)(
      `community-highlights:${viewer.id || viewer.email}`,
      {
        max: env.SPARKCLAW_COMMUNITY_HIGHLIGHTS_LIMIT_PER_HOUR || 20,
        windowMs: env.SPARKCLAW_COMMUNITY_HIGHLIGHTS_WINDOW_MS || 60 * 60 * 1000
      }
    );
    if (!rateLimit.allowed) return json({ error: "Arena 소식 정리 요청이 많습니다." }, 429, { "retry-after": String(rateLimit.retryAfterSeconds) });

    const payload = await readJson(req);
    const highlights = await (options.polishCommunityHighlights || polishCommunityHighlights)(
      { items: payload.items },
      { env, fetchImpl: options.fetchImpl || fetch }
    );
    return json({ ok: true, highlights });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json({ error: status < 500 ? error.message : "현재 Arena 소식을 정리하지 못했습니다." }, status);
  }
}

export default withScArenaDevelopmentLogging("community-highlights", communityHighlights);

async function communityViewer(viewer, resolveViewer, env, fetchImpl) {
  if (viewer?.role !== "public") return viewer;
  try {
    return (await resolveViewer(viewer, env, fetchImpl))?.viewer || viewer;
  } catch {
    return viewer;
  }
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > 12_000) throw statusError("Arena 소식 정리 요청이 너무 큽니다.", 413);
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
