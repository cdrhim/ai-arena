import { buildComparisonSummary } from "../lib/compare-summary.mjs";
import { buildArenaSnapshot } from "../lib/arena-core.mjs";
import { loadArenaEvents } from "../lib/arena-store.mjs";
import { loadPartnerDirectory, resolveProgramParticipantViewer } from "../lib/program-hub.mjs";
import { consumeRateLimit } from "../lib/rate-limit.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";
import { loadArenaSubmissions } from "../lib/supabase-submissions-store.mjs";

const COMPARISON_ROLES = new Set(["member", "b2b_partner", "human_validator", "sparklabs", "admin"]);

async function compareSummary(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);

  try {
    const verifyRequest = options.verifyRequest || verifyArenaRequest;
    const auth = await verifyRequest(req);
    if (!auth.ok) return json({ error: "기업 비교 요약을 이용하려면 로그인이 필요합니다." }, auth.status);
    const env = options.env || process.env;
    const viewer = await comparisonViewer(
      auth.viewer,
      options.resolveProgramViewer || resolveProgramParticipantViewer,
      env,
      options.fetchImpl || fetch
    );
    if (!viewer?.canScore && !viewer?.canRequestConnections && !COMPARISON_ROLES.has(viewer?.role)) {
      return json({ error: "승인된 Arena 계정만 기업 비교 요약을 이용할 수 있습니다." }, 403);
    }

    const teamIds = await comparisonTeamIds(req);
    const rateLimit = await (options.consumeRateLimit || consumeRateLimit)(`compare-summary:${viewer.id || viewer.email}`, {
      max: env.SPARKCLAW_COMPARE_SUMMARY_LIMIT_PER_HOUR || 30,
      windowMs: env.SPARKCLAW_COMPARE_SUMMARY_WINDOW_MS || 60 * 60 * 1000
    });
    if (!rateLimit.allowed) {
      return json({ error: "비교 요약 요청이 많습니다. 잠시 후 다시 시도해 주세요." }, 429, {
        "retry-after": String(rateLimit.retryAfterSeconds)
      });
    }

    const teams = await loadComparisonTeams(teamIds, viewer, options);
    if (teams.length !== teamIds.length) return json({ error: "선택한 기업의 공개 프로필을 확인할 수 없습니다." }, 400);

    const summary = await (options.buildComparisonSummary || buildComparisonSummary)(teams, {
      env,
      fetchImpl: options.fetchImpl || fetch
    });
    return json({ ok: true, summary });
  } catch (error) {
    const status = Number(error?.status) === 400 ? 400 : 500;
    return json({ error: status === 400 ? "비교할 기업을 두 곳 이상 선택해 주세요." : "기업 비교 요약을 생성하지 못했습니다." }, status);
  }
}

export default withScArenaDevelopmentLogging("compare-summary", compareSummary);

async function comparisonViewer(viewer, resolveViewer, env, fetchImpl) {
  if (viewer?.role !== "public") return viewer;
  try {
    return (await resolveViewer(viewer, env, fetchImpl))?.viewer || viewer;
  } catch {
    return viewer;
  }
}

export async function loadComparisonTeams(teamIds, viewer, options = {}) {
  const programTeams = await (options.loadPartnerDirectory || loadPartnerDirectory)(options.env || process.env, options.fetchImpl || fetch);
  const programById = new Map(programTeams.map((team) => [String(team.id), team]));
  const missingIds = teamIds.filter((id) => !programById.has(String(id)));
  if (!missingIds.length) return teamIds.map((id) => programById.get(String(id))).filter(Boolean);

  const [events, submissions] = await Promise.all([
    (options.loadArenaEvents || loadArenaEvents)(),
    (options.loadArenaSubmissions || loadArenaSubmissions)(options.env || process.env)
  ]);
  const snapshot = (options.buildArenaSnapshot || buildArenaSnapshot)(events, new Date().toISOString(), submissions);
  return selectComparisonTeams(teamIds, programTeams, snapshot.startups || [], snapshot.submissions || submissions, viewer);
}

export function selectComparisonTeams(teamIds, programTeams = [], arenaStartups = [], arenaSubmissions = [], viewer = {}) {
  const selectedById = new Map(programTeams.map((team) => [String(team.id), team]));
  const publicArenaIds = new Set(
    arenaSubmissions
      .filter((submission) => submission?.status === "published" && submission?.visibility === "public")
      .map((submission) => String(submission.id))
  );

  for (const startup of arenaStartups) {
    const id = String(startup?.id || "");
    if (!id || (!viewer?.canScore && !publicArenaIds.has(id))) continue;
    if (!selectedById.has(id)) selectedById.set(id, startup);
  }
  return teamIds.map((id) => selectedById.get(String(id))).filter(Boolean);
}

async function comparisonTeamIds(req) {
  const text = await req.text();
  let payload;
  try {
    payload = JSON.parse(text || "{}");
  } catch {
    const error = new Error("Invalid JSON");
    error.status = 400;
    throw error;
  }
  const ids = [...new Set((Array.isArray(payload.teamIds) ? payload.teamIds : [])
    .map((id) => String(id || "").trim().slice(0, 120))
    .filter(Boolean))].slice(0, 3);
  if (ids.length < 2) {
    const error = new Error("At least two companies are required.");
    error.status = 400;
    throw error;
  }
  return ids;
}

function json(payload, status = 200, headers = {}) {
  return corsResponse(JSON.stringify(payload), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
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
