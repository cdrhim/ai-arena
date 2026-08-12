import { loadProgramHub } from "../lib/program-hub.mjs";
import {
  buildSimilarTeamRecommendations,
  similarTeamSourceFingerprint
} from "../lib/similar-team-recommendations.mjs";
import { storeSimilarTeamRecommendationsSafely } from "../lib/similar-team-recommendations-store.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

export default async function similarTeamRecommendations(req) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (!["GET", "POST"].includes(req.method)) return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await verifyArenaRequest(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const hub = await loadProgramHub(auth.viewer);
    if (hub.viewer?.role !== "member" || !hub.viewerTeam) {
      return json({ error: "Claw Member 팀 프로필이 연결된 계정에서만 이용할 수 있습니다." }, 403);
    }

    const candidateTeams = Array.isArray(hub.memberDirectory) ? hub.memberDirectory : [];
    const result = buildSimilarTeamRecommendations({
      candidateTeams,
      viewerTeam: hub.viewerTeam,
      limit: 6
    });
    const sourceFingerprint = similarTeamSourceFingerprint({ viewerTeam: hub.viewerTeam, candidateTeams });
    const generatedAt = new Date().toISOString();
    const storage = result.status === "ready"
      ? await storeSimilarTeamRecommendationsSafely({
          viewer: hub.viewer,
          subjectTeam: hub.viewerTeam,
          recommendations: result.recommendations,
          algorithmVersion: result.algorithmVersion,
          sourceFingerprint,
          candidatePopulation: result.population,
          generatedAt
        })
      : { stored: false, reason: "profile_required" };

    return json({
      available: true,
      subjectTeam: { id: String(hub.viewerTeam.id), name: hub.viewerTeam.name },
      status: result.status,
      algorithmVersion: result.algorithmVersion,
      population: result.population,
      recommendations: result.recommendations,
      generatedAt,
      stored: storage.stored,
      storageReason: storage.stored ? null : storage.reason
    });
  } catch (error) {
    return json({ error: error.message || "유사 팀 추천을 계산하지 못했습니다." }, error.status || 500);
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
