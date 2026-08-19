import { loadCombinedInteractionSummary } from "../lib/interaction-summary.mjs";
import { withScArenaDevelopmentLogging } from "../lib/sc-arena-operational-logs.mjs";
import { bearerToken, verifyArenaRequest } from "../lib/supabase-auth.mjs";

export async function arenaInteractions(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const verifyRequest = options.verifyArenaRequest || verifyArenaRequest;
    const loadSummary = options.loadCombinedInteractionSummary || loadCombinedInteractionSummary;
    const auth = await verifyRequest(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    return json(await loadSummary(options.env || process.env, options.fetchImpl || fetch, {
      arenaAccessToken: bearerToken(req)
    }));
  } catch (error) {
    return json({ error: error.status < 500 ? error.message : "상호작용 집계를 불러오지 못했습니다." }, error.status || 500);
  }
}

export default withScArenaDevelopmentLogging("arena-interactions", arenaInteractions);

function json(payload, status = 200) {
  return corsResponse(JSON.stringify(payload), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
}

function corsResponse(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      ...headers
    }
  });
}
