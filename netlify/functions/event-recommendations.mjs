import { buildEventRecommendations, publicRecommendationProfile } from "../lib/event-recommendations.mjs";
import {
  externalPartnerProfileForViewer,
  loadExternalPartnerProfiles,
  safeExternalPartnerProfile
} from "../lib/external-partner-profiles.mjs";
import { loadProgramHub } from "../lib/program-hub.mjs";
import { loadProgramActionEvents } from "../lib/program-actions-store.mjs";
import { buildProgramActionSnapshot } from "../lib/program-actions.mjs";
import { buildPublicArenaSnapshot } from "../lib/public-arena.mjs";
import { consumeRateLimit } from "../lib/rate-limit.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

const PUBLIC_VIEWER = Object.freeze({ role: "public", roleLabel: "Public visitor", canScore: false });
const PUBLIC_CATALOG_PROJECTOR = Object.freeze({ role: "sparklabs", roleLabel: "Public catalog projector", canScore: true });

async function eventRecommendations(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);

  try {
    const verifyRequest = options.verifyRequest || verifyArenaRequest;
    const auth = await verifyRequest(req);
    if (!auth.ok) return json({ error: "맞춤 이벤트 추천을 이용하려면 로그인이 필요합니다." }, auth.status);
    if (!auth.viewer?.canScore && !["member", "b2b_partner", "human_validator"].includes(auth.viewer?.role)) {
      return json({ error: "승인된 Arena 계정만 맞춤 이벤트 추천을 이용할 수 있습니다." }, 403);
    }

    const rateLimit = await (options.consumeRateLimit || consumeRateLimit)(
      `event-recommendations:${auth.viewer.id || auth.viewer.email}`,
      {
        max: (options.env || process.env).SPARKCLAW_EVENT_RECOMMENDATION_LIMIT_PER_HOUR || 20,
        windowMs: (options.env || process.env).SPARKCLAW_EVENT_RECOMMENDATION_WINDOW_MS || 60 * 60 * 1000
      }
    );
    if (!rateLimit.allowed) {
      return json({ error: "맞춤 추천 요청이 많습니다. 잠시 후 다시 계산해 주세요." }, 429, {
        "retry-after": String(rateLimit.retryAfterSeconds)
      });
    }

    const [catalog, profile] = await Promise.all([
      loadPublicRecommendationCatalog(options),
      recommendationProfileForViewer(auth.viewer, options)
    ]);
    const recommendation = await (options.buildEventRecommendations || buildEventRecommendations)(
      { profile, events: catalog.events, benefits: catalog.benefits, now: options.now || new Date().toISOString() },
      { env: options.env || process.env, fetchImpl: options.fetchImpl || fetch }
    );
    return json({ ok: true, recommendation });
  } catch (error) {
    return json({ error: "현재 맞춤 이벤트 추천을 계산하지 못했습니다. 잠시 후 다시 시도해 주세요." }, error.status || 500);
  }
}

export default withScArenaDevelopmentLogging("event-recommendations", eventRecommendations);

export async function loadPublicRecommendationCatalog(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const [hub, actionEvents] = await Promise.all([
    (options.loadProgramHub || loadProgramHub)(PUBLIC_VIEWER, env, fetchImpl),
    (options.loadProgramActionEvents || loadProgramActionEvents)()
  ]);
  const program = (options.buildProgramActionSnapshot || buildProgramActionSnapshot)(hub, actionEvents, PUBLIC_CATALOG_PROJECTOR);
  const snapshot = (options.buildPublicArenaSnapshot || buildPublicArenaSnapshot)({
    program,
    publicEventIds: splitEnv(env.SPARKCLAW_PUBLIC_EVENT_IDS)
  });
  return { events: snapshot.events || [], benefits: snapshot.benefits || [] };
}

export async function recommendationProfileForViewer(viewer = {}, options = {}) {
  if (viewer.role === "b2b_partner") {
    const profiles = await (options.loadExternalPartnerProfiles || loadExternalPartnerProfiles)(options.profileStoreOptions || {});
    const profile = (options.externalPartnerProfileForViewer || externalPartnerProfileForViewer)(viewer, profiles);
    return publicRecommendationProfile({
      ...((options.safeExternalPartnerProfile || safeExternalPartnerProfile)(profile, { audience: "owner" }) || {
        organizationName: viewer.organization,
        profileLabel: viewer.roleLabel
      }),
      audienceMode: "partner_utilization"
    });
  }
  return publicRecommendationProfile({
    audienceMode: viewer.canScore ? "staff_operations" : "member_utilization",
    organizationName: viewer.organization || viewer.name || "Arena 회원",
    profileLabel: viewer.roleLabel,
    focusCategories: viewer.canScore ? ["AI 스타트업 성장", "기업 파트너십", "프로그램 운영"] : [],
    priorityProblems: viewer.canScore ? ["참가 기업과 파트너가 현재 일정과 혜택을 효과적으로 활용하도록 지원"] : []
  });
}

function splitEnv(value) {
  return String(value || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
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
