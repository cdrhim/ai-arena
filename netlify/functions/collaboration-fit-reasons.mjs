import { buildCollaborationFitReasons } from "../lib/collaboration-fit-reasons.mjs";
import { collaborationFitMetrics } from "../lib/collaboration-fit.mjs";
import {
  externalPartnerProfileForViewer,
  loadExternalPartnerProfiles,
  safeExternalPartnerProfile
} from "../lib/external-partner-profiles.mjs";
import { loadProgramHub } from "../lib/program-hub.mjs";
import { consumeRateLimit } from "../lib/rate-limit.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

const SUPPORTED_ROLES = new Set(["member", "b2b_partner"]);

async function collaborationFitReasons(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);

  try {
    const auth = await (options.verifyRequest || verifyArenaRequest)(req);
    if (!auth.ok) return json({ error: "협업 선정 이유를 확인하려면 로그인이 필요합니다." }, auth.status);
    const payload = await readJson(req);
    const env = options.env || process.env;
    const rateLimit = await (options.consumeRateLimit || consumeRateLimit)(
      `collaboration-fit-reasons:${auth.viewer.id || auth.viewer.email}`,
      {
        max: env.SPARKCLAW_COLLABORATION_REASON_LIMIT_PER_HOUR || 12,
        windowMs: env.SPARKCLAW_COLLABORATION_REASON_WINDOW_MS || 60 * 60 * 1000
      }
    );
    if (!rateLimit.allowed) {
      return json({ error: "협업 선정 이유 요청이 많습니다. 잠시 후 다시 확인해 주세요." }, 429, {
        "retry-after": String(rateLimit.retryAfterSeconds)
      });
    }

    const context = await trustedFitContext(auth.viewer, payload.ids, options);
    if (!SUPPORTED_ROLES.has(context.role)) {
      return json({ error: "참가기업과 기업 파트너 계정에서 이용할 수 있습니다." }, 403);
    }
    const reasons = await (options.buildCollaborationFitReasons || buildCollaborationFitReasons)(
      { subjectLabel: context.subjectLabel, companies: context.companies },
      { env, fetchImpl: options.fetchImpl || fetch }
    );
    return json({ ok: true, reasons });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json({
      error: status < 500 ? error.message : "현재 협업 선정 이유를 정리하지 못했습니다. 잠시 후 다시 확인해 주세요."
    }, status);
  }
}

export default withScArenaDevelopmentLogging("collaboration-fit-reasons", collaborationFitReasons);

export async function trustedFitContext(viewer = {}, requestedIds = [], options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const hub = await (options.loadProgramHub || loadProgramHub)(viewer, env, fetchImpl);
  const role = String(hub.viewer?.role || "public").toLowerCase();
  let subjectLabel = hub.viewerTeam?.name || hub.viewer?.organization || hub.viewer?.roleLabel || "현재 계정";
  let companies = Array.isArray(hub.metrics?.collaborationFitCompanies)
    ? hub.metrics.collaborationFitCompanies
    : [];

  if (role === "b2b_partner") {
    const profiles = await (options.loadExternalPartnerProfiles || loadExternalPartnerProfiles)(options.profileStoreOptions || {});
    const rawProfile = (options.externalPartnerProfileForViewer || externalPartnerProfileForViewer)(hub.viewer, profiles);
    const profile = (options.safeExternalPartnerProfile || safeExternalPartnerProfile)(rawProfile, { audience: "owner" });
    subjectLabel = profile?.organizationName || subjectLabel;
    companies = collaborationFitMetrics({
      candidateTeams: Array.isArray(hub.partnerDirectory) ? hub.partnerDirectory : [],
      partnerProfile: profile
    }).collaborationFitCompanies;
  }

  const allowedIds = new Set(safeIds(requestedIds));
  if (allowedIds.size) companies = companies.filter((company) => allowedIds.has(String(company?.id || "")));
  return { role, subjectLabel, companies };
}

function safeIds(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : [])
    .slice(0, 60)
    .map((id) => String(id || "").trim().slice(0, 120))
    .filter(Boolean))];
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > 10_000) throw statusError("협업 선정 이유 요청이 너무 큽니다.", 413);
  try { return JSON.parse(text || "{}"); } catch { throw statusError("요청 본문은 올바른 JSON이어야 합니다.", 400); }
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
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
