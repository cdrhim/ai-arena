import { programDatabaseConfig } from "./program-database.mjs";
import { scArenaActivityConfig } from "./sc-arena-activity.mjs";

const MANAGEMENT_INTERACTION_TABLES = Object.freeze([
  "mentoring_sessions",
  "hypotheses",
  "customer_interviews",
  "pmf_survey_responses",
  "event_registrations",
  "benefit_applications",
  "report_reminders",
  "weekly_reports"
]);
const SERVER_USER_AGENT = "sparkclaw-interaction-summary";
const DEFAULT_TIMEOUT_MS = 8_000;

export async function loadCombinedInteractionSummary(env = process.env, fetchImpl = fetch, options = {}) {
  const programConfig = programDatabaseConfig(env);
  const arenaConfig = scArenaActivityConfig(env);
  if (!programConfig.configured || !arenaConfig.writeConfigured) {
    const error = new Error("Interaction summary data sources are not configured.");
    error.status = 503;
    throw error;
  }

  const [managementEntries, arenaInteractions] = await Promise.all([
    Promise.all(
      MANAGEMENT_INTERACTION_TABLES.map(async (table) => [
        table,
        await exactTableCount({
          baseUrl: programConfig.restUrl,
          table,
          key: programConfig.key,
          fetchImpl
        })
      ])
    ),
    exactArenaInteractionCount({
      baseUrl: `${arenaConfig.supabaseUrl}/rest/v1`,
      key: arenaConfig.secretKey,
      accessToken: options.arenaAccessToken,
      fetchImpl
    })
  ]);
  const managementBreakdown = Object.fromEntries(managementEntries);
  const managementInteractions = Object.values(managementBreakdown).reduce((sum, count) => sum + count, 0);

  return {
    totalInteractions: managementInteractions + arenaInteractions,
    managementInteractions,
    arenaInteractions,
    managementBreakdown,
    generatedAt: new Date().toISOString(),
    refreshSeconds: 300
  };
}

async function exactArenaInteractionCount({ baseUrl, key, accessToken, fetchImpl }) {
  const response = await fetchImpl(`${baseUrl}/rpc/sc_arena_interaction_event_count`, {
    method: "POST",
    headers: {
      ...serviceHeaders(key),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      "content-type": "application/json"
    },
    body: "{}"
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || "Unable to count AI Arena interactions.");
    error.status = response.status;
    throw error;
  }
  const count = Number(payload);
  if (!Number.isSafeInteger(count) || count < 0) {
    const error = new Error("Supabase did not return a valid AI Arena interaction count.");
    error.status = 502;
    throw error;
  }
  return count;
}

async function exactTableCount({ baseUrl, table, key, filters = {}, fetchImpl }) {
  const url = new URL(`${baseUrl}/${table}`);
  url.searchParams.set("select", "id");
  url.searchParams.set("limit", "1");
  for (const [column, value] of Object.entries(filters)) url.searchParams.set(column, value);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: serviceHeaders(key),
      signal: controller.signal
    });
    if (!response.ok) {
      const payload = await safeJson(response);
      const error = new Error(payload?.message || payload?.error || `Unable to count ${table}.`);
      error.status = response.status;
      throw error;
    }
    const count = countFromContentRange(response.headers.get("content-range"));
    if (count == null) {
      const error = new Error(`Supabase did not return an exact count for ${table}.`);
      error.status = 502;
      throw error;
    }
    return count;
  } finally {
    clearTimeout(timeout);
  }
}

function serviceHeaders(key) {
  const headers = {
    apikey: key,
    Accept: "application/json",
    Prefer: "count=exact",
    "user-agent": SERVER_USER_AGENT
  };
  if (!String(key).startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function countFromContentRange(value) {
  const match = String(value || "").match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export const INTERACTION_TABLES = MANAGEMENT_INTERACTION_TABLES;
