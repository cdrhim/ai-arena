import { scArenaActivityConfig } from "./sc-arena-activity.mjs";

const WORKSPACE_SLUG = "sparkclaw-ai-arena";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSING_SCHEMA_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

export async function storeSimilarTeamRecommendations({
  viewer,
  subjectTeam,
  recommendations,
  algorithmVersion,
  sourceFingerprint,
  candidatePopulation = 0,
  generatedAt = new Date().toISOString(),
  env = process.env,
  fetchImpl = fetch
}) {
  const config = scArenaActivityConfig(env);
  const userId = text(viewer?.id, 64);
  const subjectTeamKey = text(subjectTeam?.id, 160);
  if (!config.writeConfigured) return { stored: false, reason: "unconfigured" };
  if (!UUID_PATTERN.test(userId) || !subjectTeamKey) return { stored: false, reason: "identity_unresolved" };

  const response = await timedFetch(fetchImpl, `${config.supabaseUrl}/rest/v1/rpc/sc_arena_publish_similarity_run`, {
    method: "POST",
    headers: serviceHeaders(config.secretKey),
    body: JSON.stringify({
      p_workspace_slug: WORKSPACE_SLUG,
      p_subject_user_id: userId,
      p_subject_team_key: subjectTeamKey,
      p_subject_team_name: text(subjectTeam?.name || subjectTeam?.companyName, 240),
      p_algorithm_version: text(algorithmVersion, 80),
      p_source_fingerprint: text(sourceFingerprint, 128),
      p_candidate_population: Math.min(Math.max(Number(candidatePopulation) || 0, 0), 10000),
      p_generated_at: generatedAt,
      p_recommendations: safeRecommendations(recommendations)
    })
  }, config.requestTimeoutMs);
  const payload = await safeJson(response);
  if (!response.ok) {
    if (response.status === 404 || MISSING_SCHEMA_CODES.has(String(payload?.code || ""))) {
      return { stored: false, reason: "schema_missing" };
    }
    const error = new Error(payload?.message || payload?.error || "Similar-team recommendations could not be stored.");
    error.status = response.status;
    throw error;
  }
  const runId = typeof payload === "string" ? payload : payload?.id || payload?.run_id || null;
  return { stored: true, runId };
}

export async function storeSimilarTeamRecommendationsSafely(input) {
  try {
    return await storeSimilarTeamRecommendations(input);
  } catch (error) {
    console.warn("[sc-arena-similarity] recommendation write failed", {
      subjectTeamId: input?.subjectTeam?.id || "unknown",
      message: error?.message || "unknown"
    });
    return { stored: false, reason: "write_failed" };
  }
}

function safeRecommendations(values) {
  return (Array.isArray(values) ? values : []).slice(0, 12).map((item, index) => ({
    candidate_team_key: text(item.teamId, 160),
    candidate_team_name: text(item.teamName, 240),
    rank: Math.min(Math.max(Number(item.rank) || index + 1, 1), 12),
    score: Math.min(Math.max(Math.round(Number(item.score) || 0), 0), 100),
    reason: text(item.reason, 500),
    shared_signals: stringList(item.sharedSignals, 8, 100),
    evidence: stringList(item.evidence, 8, 240)
  })).filter((item) => item.candidate_team_key);
}

function serviceHeaders(secretKey) {
  const headers = { apikey: secretKey, "content-type": "application/json" };
  if (!String(secretKey).startsWith("sb_secret_")) headers.Authorization = `Bearer ${secretKey}`;
  return headers;
}

async function timedFetch(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs || 4000);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}

function stringList(values, limit, length) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => text(value, length)).filter(Boolean))].slice(0, limit);
}

function text(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
