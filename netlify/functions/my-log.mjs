import { loadProgramDirectoryContext } from "../lib/program-hub.mjs";
import { loadScArenaMyLog } from "../lib/sc-arena-activity.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

const ALLOWED_ROLES = new Set(["admin", "sparklabs", "member", "b2b_partner", "human_validator"]);
const ALLOWED_DOMAINS = new Set(["discover", "community", "bounty"]);

export default async function myLog(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "GET") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);

  try {
    const env = options.env || process.env;
    const fetchImpl = options.fetchImpl || fetch;
    const auth = await (options.verifyRequest || verifyArenaRequest)(req, env);
    if (!auth.ok) return json({ error: auth.error || "My Log를 보려면 로그인이 필요합니다." }, auth.status || 401);

    const context = await resolveViewerContext(
      auth.viewer,
      options.resolveDirectoryContext || loadProgramDirectoryContext,
      env,
      fetchImpl
    );
    if (!ALLOWED_ROLES.has(context.viewer?.role)) {
      return json({ error: "승인된 Arena 계정만 My Log를 이용할 수 있습니다." }, 403);
    }

    const url = new URL(req.url);
    const domainValue = String(url.searchParams.get("domain") || "").trim().toLowerCase();
    const domain = ALLOWED_DOMAINS.has(domainValue) ? domainValue : null;
    const cursor = limitedValue(url.searchParams.get("cursor"), 640);
    const limit = boundedLimit(url.searchParams.get("limit"));
    const result = await (options.loadMyLog || loadScArenaMyLog)({
      req,
      viewer: context.viewer,
      viewerTeamId: context.viewerTeamId,
      viewerTeamName: context.viewerTeamName,
      domain,
      cursor,
      limit,
      env,
      fetchImpl
    });

    return json({
      available: Boolean(result?.available),
      events: Array.isArray(result?.events) ? result.events : [],
      nextCursor: result?.nextCursor || null,
      reason: result?.available ? "" : limitedValue(result?.reason || "unavailable", 80)
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json(
      { error: status < 500 ? error.message : "현재 My Log를 불러오지 못했습니다." },
      status
    );
  }
}

async function resolveViewerContext(viewer, resolveDirectoryContext, env, fetchImpl) {
  if (!["public", "member"].includes(viewer?.role)) {
    return { viewer, viewerTeamId: null, viewerTeamName: "" };
  }
  try {
    const context = await resolveDirectoryContext(viewer, env, fetchImpl);
    const viewerTeamId = context?.viewerTeamId == null ? null : String(context.viewerTeamId);
    const viewerTeam = (context?.directory || []).find((team) => String(team?.id || "") === viewerTeamId);
    return {
      viewer: context?.viewer || viewer,
      viewerTeamId,
      viewerTeamName: limitedValue(viewerTeam?.name || viewerTeam?.companyName, 240)
    };
  } catch {
    return { viewer, viewerTeamId: null, viewerTeamName: "" };
  }
}

function boundedLimit(value) {
  const parsed = Number.parseInt(String(value || "50"), 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 50, 1), 100);
}

function limitedValue(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
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
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      ...headers
    }
  });
}
