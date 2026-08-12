import { loadCompetitionEvents } from "../lib/competition/competition-store.mjs";
import { buildCompetitionSnapshot } from "../lib/competition/competition-core.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

export default async function arenaCompetition(req) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await verifyArenaRequest(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    if (!competitionAvailableToViewer(auth.viewer)) {
      return json({ error: "Bounty Board is available to approved Arena accounts." }, 403);
    }

    const events = await loadCompetitionEvents();
    return json({
      competition: buildCompetitionSnapshot(events, auth.viewer),
      viewer: auth.viewer
    });
  } catch (error) {
    return json({ error: error.message }, error.status || 400);
  }
}

function competitionAvailableToViewer(viewer) {
  return Boolean(
    viewer?.canScore ||
      ["member", "b2b_partner", "human_validator"].includes(String(viewer?.role || "").toLowerCase())
  );
}

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
