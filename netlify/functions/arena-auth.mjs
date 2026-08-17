import { publicArenaAuthConfig } from "../lib/supabase-auth.mjs";
import { netlifyCountryCode, recommendedPublicBriefLanguage } from "../lib/public-locale.mjs";
import { withScArenaDevelopmentLogging } from "../lib/sc-arena-operational-logs.mjs";

async function arenaAuth(req, context = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  return json({
    ...publicArenaAuthConfig(),
    recommendedLanguage: recommendedPublicBriefLanguage(netlifyCountryCode(context))
  });
}

export default withScArenaDevelopmentLogging("arena-auth", arenaAuth);

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
