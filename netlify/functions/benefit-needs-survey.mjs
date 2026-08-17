import { loadBenefitNeedsSurvey, loadBenefitNeedsSurveySummary, submitBenefitNeedsSurvey } from "../lib/benefit-needs-survey.mjs";
import { resolveProgramParticipantViewer } from "../lib/program-hub.mjs";
import { consumeRateLimit } from "../lib/rate-limit.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

async function benefitNeedsSurvey(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (!["GET", "POST"].includes(req.method)) return json({ error: "지원하지 않는 요청 방식입니다." }, 405);

  try {
    const env = options.env || process.env;
    const fetchImpl = options.fetchImpl || fetch;
    const auth = await (options.verifyRequest || verifyArenaRequest)(req, env);
    if (!auth.ok) return json({ error: auth.error || "로그인이 필요합니다." }, auth.status || 401);

    const staffViewer = Boolean(auth.viewer?.canScore)
      || ["sparklabs", "admin"].includes(String(auth.viewer?.role || "").toLowerCase());
    if (req.method === "GET" && staffViewer) {
      const result = await (options.loadSurveySummary || loadBenefitNeedsSurveySummary)({ env, fetchImpl });
      return json({
        available: result.available !== false,
        staffSummary: result.summary || null,
        reason: result.available === false ? result.reason || "unavailable" : ""
      }, result.reason === "schema_missing" ? 503 : 200);
    }

    const context = await resolveMemberContext(
      auth.viewer,
      options.resolveProgramViewer || resolveProgramParticipantViewer,
      env,
      fetchImpl
    );
    if (context.viewer?.role !== "member") {
      return json({ error: "Claw Member 계정에서만 혜택 수요를 등록할 수 있습니다." }, 403);
    }

    if (req.method === "GET") {
      const result = await (options.loadSurvey || loadBenefitNeedsSurvey)({
        viewer: context.viewer,
        env,
        fetchImpl
      });
      return json({
        available: result.available !== false,
        survey: result.survey || null,
        reason: result.available === false ? result.reason || "unavailable" : ""
      }, result.reason === "schema_missing" ? 503 : 200);
    }

    const rateLimit = await (options.consumeRateLimit || consumeRateLimit)(
      `benefit-needs-survey:${context.viewer.id || context.viewer.email}`,
      {
        max: env.SPARKCLAW_BENEFIT_SURVEY_LIMIT_PER_DAY || 12,
        windowMs: env.SPARKCLAW_BENEFIT_SURVEY_WINDOW_MS || 24 * 60 * 60 * 1000
      }
    );
    if (!rateLimit.allowed) {
      return json({ error: "설문 수정 횟수가 많습니다. 잠시 후 다시 저장해 주세요." }, 429, {
        "retry-after": String(rateLimit.retryAfterSeconds)
      });
    }

    const payload = await readJson(req);
    const result = await (options.submitSurvey || submitBenefitNeedsSurvey)({
      viewer: context.viewer,
      viewerTeamId: context.viewerTeamId,
      viewerTeamName: context.viewerTeamName,
      survey: payload,
      env,
      fetchImpl
    });
    if (!result.stored) {
      const message = result.reason === "schema_missing"
        ? "혜택 수요 데이터베이스를 준비하고 있습니다. 잠시 후 다시 시도해 주세요."
        : "혜택 수요를 저장하지 못했습니다.";
      return json({ error: message, reason: result.reason || "unavailable" }, 503);
    }
    return json({ ok: true, survey: result.survey });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json({ error: status < 500 ? error.message : "혜택 수요를 처리하지 못했습니다." }, status);
  }
}

export default withScArenaDevelopmentLogging("benefit-needs-survey", benefitNeedsSurvey);

async function resolveMemberContext(viewer, resolveViewer, env, fetchImpl) {
  if (viewer?.role === "public") {
    const resolved = await resolveViewer(viewer, env, fetchImpl);
    return {
      viewer: resolved?.viewer || viewer,
      viewerTeamId: resolved?.viewerTeamId || null,
      viewerTeamName: resolved?.viewer?.organization || viewer.organization || ""
    };
  }
  return {
    viewer,
    viewerTeamId: null,
    viewerTeamName: viewer?.organization || ""
  };
}

async function readJson(req) {
  const body = await req.text();
  if (body.length > 10_000) throw statusError("설문 응답이 너무 깁니다.", 413);
  try { return JSON.parse(body || "{}"); } catch { throw statusError("올바른 설문 응답 형식이 아닙니다.", 400); }
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(payload, status = 200, headers = {}) {
  return corsResponse(JSON.stringify(payload), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
    ...headers
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
import { withScArenaDevelopmentLogging } from "../lib/sc-arena-operational-logs.mjs";
