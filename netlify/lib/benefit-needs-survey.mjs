import { scArenaActivityConfig } from "./sc-arena-activity.mjs";

const WORKSPACE_SLUG = "sparkclaw-ai-arena";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSING_SCHEMA_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
const LEGACY_CATEGORY_FALLBACK = ["other"];
const LEGACY_NEEDED_BY_FALLBACK = "exploring";
const LEGACY_NAME_PREFIX = "솔루션 명: ";
const LEGACY_DETAILS_PREFIX = "솔루션 세부 내용: ";
const LEGACY_REASON_PREFIX = "필요한 이유: ";

export function validateBenefitNeedsSurvey(input = {}) {
  const solutionName = cleanInput(input.solutionName);
  const solutionDetails = cleanInput(input.solutionDetails);
  const solutionReason = cleanInput(input.solutionReason);
  if (solutionName.length < 2 || solutionName.length > 100) {
    throw statusError("필요한 솔루션 명을 2자 이상 100자 이하로 적어주세요.", 400);
  }
  if (solutionDetails.length < 10 || solutionDetails.length > 500) {
    throw statusError("솔루션 세부 내용을 10자 이상 500자 이하로 적어주세요.", 400);
  }
  if (solutionReason.length < 10 || solutionReason.length > 500) {
    throw statusError("필요한 이유를 10자 이상 500자 이하로 적어주세요.", 400);
  }
  return { solutionName, solutionDetails, solutionReason };
}

export async function submitBenefitNeedsSurvey({
  viewer,
  viewerTeamId = null,
  viewerTeamName = "",
  survey,
  env = process.env,
  fetchImpl = fetch
}) {
  const identity = surveyIdentity(viewer, viewerTeamId, viewerTeamName);
  const validated = validateBenefitNeedsSurvey(survey);
  const config = scArenaActivityConfig(env);
  if (!config.writeConfigured) return { stored: false, reason: "unconfigured", survey: null };
  if (!identity) return { stored: false, reason: "identity_unresolved", survey: null };

  const response = await timedFetch(fetchImpl, `${config.supabaseUrl}/rest/v1/rpc/sc_arena_submit_benefit_solution_request`, {
    method: "POST",
    headers: serviceHeaders(config.secretKey),
    body: JSON.stringify({
      p_workspace_slug: WORKSPACE_SLUG,
      p_user_id: identity.userId,
      p_organization_source: identity.organizationSource,
      p_organization_key: identity.organizationKey,
      p_organization_name: identity.organizationName,
      p_solution_name: validated.solutionName,
      p_solution_details: validated.solutionDetails,
      p_solution_reason: validated.solutionReason
    })
  }, config.requestTimeoutMs);
  const payload = await safeJson(response);
  if (response.ok) return { stored: true, reason: "", survey: publicSurvey(payload) };
  if (!isMissingSchema(response, payload)) {
    return failedResponse(response, payload, "혜택 수요를 저장하지 못했습니다.");
  }

  const fallbackResponse = await timedFetch(fetchImpl, `${config.supabaseUrl}/rest/v1/rpc/sc_arena_submit_benefit_need_survey`, {
    method: "POST",
    headers: serviceHeaders(config.secretKey),
    body: JSON.stringify({
      p_workspace_slug: WORKSPACE_SLUG,
      p_user_id: identity.userId,
      p_organization_source: identity.organizationSource,
      p_organization_key: identity.organizationKey,
      p_organization_name: identity.organizationName,
      p_categories: LEGACY_CATEGORY_FALLBACK,
      p_details: encodeLegacySurvey(validated),
      p_needed_by: LEGACY_NEEDED_BY_FALLBACK
    })
  }, config.requestTimeoutMs);
  const fallbackPayload = await safeJson(fallbackResponse);
  if (!fallbackResponse.ok) return failedResponse(fallbackResponse, fallbackPayload, "혜택 수요를 저장하지 못했습니다.");
  return {
    stored: true,
    reason: "legacy_schema",
    survey: publicSurvey({
      ...fallbackPayload,
      solution_name: validated.solutionName,
      solution_details: validated.solutionDetails,
      solution_reason: validated.solutionReason
    })
  };
}

export async function loadBenefitNeedsSurvey({ viewer, env = process.env, fetchImpl = fetch }) {
  const userId = text(viewer?.id, 64);
  const config = scArenaActivityConfig(env);
  if (!config.writeConfigured) return { available: false, reason: "unconfigured", survey: null };
  if (!UUID_PATTERN.test(userId)) return { available: false, reason: "identity_unresolved", survey: null };

  const response = await timedFetch(fetchImpl, `${config.supabaseUrl}/rest/v1/rpc/sc_arena_latest_benefit_solution_request`, {
    method: "POST",
    headers: serviceHeaders(config.secretKey),
    body: JSON.stringify({ p_workspace_slug: WORKSPACE_SLUG, p_user_id: userId })
  }, config.requestTimeoutMs);
  const payload = await safeJson(response);
  if (response.ok) return { available: true, reason: "", survey: publicSurvey(payload) };
  if (!isMissingSchema(response, payload)) {
    return failedResponse(response, payload, "혜택 수요를 불러오지 못했습니다.");
  }

  const fallbackResponse = await timedFetch(fetchImpl, `${config.supabaseUrl}/rest/v1/rpc/sc_arena_latest_benefit_need_survey`, {
    method: "POST",
    headers: serviceHeaders(config.secretKey),
    body: JSON.stringify({ p_workspace_slug: WORKSPACE_SLUG, p_user_id: userId })
  }, config.requestTimeoutMs);
  const fallbackPayload = await safeJson(fallbackResponse);
  if (!fallbackResponse.ok) return failedResponse(fallbackResponse, fallbackPayload, "혜택 수요를 불러오지 못했습니다.");
  return { available: true, reason: "legacy_schema", survey: publicSurvey(fallbackPayload) };
}

export async function loadBenefitNeedsSurveySummary({ env = process.env, fetchImpl = fetch } = {}) {
  const config = scArenaActivityConfig(env);
  if (!config.writeConfigured) return { available: false, reason: "unconfigured", summary: null };

  const response = await timedFetch(fetchImpl, `${config.supabaseUrl}/rest/v1/rpc/sc_arena_benefit_need_survey_summary`, {
    method: "POST",
    headers: serviceHeaders(config.secretKey),
    body: JSON.stringify({ p_workspace_slug: WORKSPACE_SLUG })
  }, config.requestTimeoutMs);
  const payload = await safeJson(response);
  if (!response.ok) return failedResponse(response, payload, "혜택 요청 현황을 불러오지 못했습니다.");
  return { available: true, reason: "", summary: publicSurveySummary(payload) };
}

function surveyIdentity(viewer, viewerTeamId, viewerTeamName) {
  const userId = text(viewer?.id, 64);
  if (!UUID_PATTERN.test(userId)) return null;
  const teamId = text(viewerTeamId, 160);
  return {
    userId,
    organizationSource: teamId ? "program_team" : "arena_user",
    organizationKey: teamId || userId,
    organizationName: text(viewerTeamName || viewer?.organization || "Claw Member", 240)
  };
}

function publicSurvey(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const legacy = parseLegacySurvey(value.details);
  return {
    id: text(value.id, 64),
    responseVersion: Math.max(Number(value.response_version) || 1, 1),
    solutionName: cleanInput(value.solution_name || legacy.solutionName).slice(0, 100),
    solutionDetails: cleanInput(value.solution_details || legacy.solutionDetails).slice(0, 500),
    solutionReason: cleanInput(value.solution_reason || legacy.solutionReason).slice(0, 500),
    status: text(value.status, 40) || "submitted",
    submittedAt: text(value.submitted_at, 80)
  };
}

function encodeLegacySurvey(value) {
  return `${LEGACY_NAME_PREFIX}${value.solutionName}\n\n${LEGACY_DETAILS_PREFIX}${value.solutionDetails}\n\n${LEGACY_REASON_PREFIX}${value.solutionReason}`;
}

function parseLegacySurvey(value) {
  const raw = cleanInputPreservingLines(value);
  const detailsSeparator = `\n\n${LEGACY_DETAILS_PREFIX}`;
  const reasonSeparator = `\n\n${LEGACY_REASON_PREFIX}`;
  if (raw.startsWith(LEGACY_NAME_PREFIX) && raw.includes(detailsSeparator)) {
    const detailsAt = raw.indexOf(detailsSeparator);
    const reasonAt = raw.indexOf(reasonSeparator, detailsAt + detailsSeparator.length);
    return {
      solutionName: raw.slice(LEGACY_NAME_PREFIX.length, detailsAt).trim(),
      solutionDetails: raw.slice(detailsAt + detailsSeparator.length, reasonAt === -1 ? raw.length : reasonAt).trim(),
      solutionReason: reasonAt === -1 ? "" : raw.slice(reasonAt + reasonSeparator.length).trim()
    };
  }
  return { solutionName: "", solutionDetails: raw, solutionReason: "" };
}

function publicSurveySummary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { newRequestCount: 0, currentRequestCount: 0, latestSubmittedAt: "", requests: [] };
  }
  return {
    newRequestCount: Math.max(0, Number(value.new_request_count) || 0),
    currentRequestCount: Math.max(0, Number(value.current_request_count) || 0),
    latestSubmittedAt: text(value.latest_submitted_at, 80),
    requests: Array.isArray(value.requests) ? value.requests.slice(0, 12).map(publicStaffRequest).filter(Boolean) : []
  };
}

function publicStaffRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const legacy = parseLegacySurvey(value.solution_details || value.details);
  const hasStructuredFields = Boolean(cleanInput(value.solution_name));
  return {
    id: text(value.id, 64),
    organizationName: text(value.organization_name, 240) || "Claw Member 팀",
    solutionName: cleanInput(value.solution_name || legacy.solutionName).slice(0, 100) || "혜택 요청",
    solutionDetails: cleanInput(hasStructuredFields ? value.solution_details : legacy.solutionDetails).slice(0, 500),
    solutionReason: cleanInput(hasStructuredFields ? value.solution_reason : legacy.solutionReason).slice(0, 500),
    status: text(value.status, 40) || "submitted",
    submittedAt: text(value.submitted_at, 80)
  };
}

function failedResponse(response, payload, fallbackMessage) {
  if (isMissingSchema(response, payload)) {
    return { stored: false, available: false, reason: "schema_missing", survey: null, summary: null };
  }
  throw statusError(payload?.message || payload?.error || fallbackMessage, response.status || 500);
}

function isMissingSchema(response, payload) {
  return response.status === 404 || MISSING_SCHEMA_CODES.has(String(payload?.code || ""));
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

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function text(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanInput(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim();
}

function cleanInputPreservingLines(value) {
  return cleanInput(value).replace(/\r\n?/g, "\n");
}
