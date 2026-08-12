const WORKSPACE_SLUG = "sparkclaw-ai-arena";
const DEFAULT_TIMEOUT_MS = 8_000;

export function weeklyFeaturedStoreConfig(env = process.env) {
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const secretKey = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || "").trim();
  return {
    supabaseUrl,
    secretKey,
    configured: Boolean(supabaseUrl && secretKey),
    timeoutMs: Math.min(Math.max(Number(env.SC_ARENA_FEATURED_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS, 500), 15_000)
  };
}

export async function publishWeeklyFeaturedSnapshot(snapshot, env = process.env, fetchImpl = fetch) {
  if (!snapshot?.cycleKey || !Array.isArray(snapshot.items) || !snapshot.items.length) {
    return { stored: false, reason: "empty_snapshot" };
  }
  const config = weeklyFeaturedStoreConfig(env);
  if (!config.configured) return { stored: false, reason: "unconfigured" };
  const response = await timedFetch(fetchImpl, `${config.supabaseUrl}/rest/v1/rpc/sc_arena_publish_weekly_spotlight`, {
    method: "POST",
    headers: serviceHeaders(config.secretKey),
    body: JSON.stringify({
      p_workspace_slug: WORKSPACE_SLUG,
      p_cycle_key: snapshot.cycleKey,
      p_week_label: snapshot.weekLabel || snapshot.cycleKey,
      p_source_updated_at: snapshot.sourceUpdatedAt || snapshot.generatedAt || new Date().toISOString(),
      p_items: snapshot.items
    })
  }, config.timeoutMs);
  const payload = await safeJson(response);
  if (!response.ok) throw statusError(payload?.message || payload?.error || "Weekly spotlight could not be stored.", response.status);
  return { stored: true, snapshotId: String(payload || "") || null };
}

export async function loadWeeklyFeaturedSnapshot(env = process.env, fetchImpl = fetch) {
  const config = weeklyFeaturedStoreConfig(env);
  if (!config.configured) return { available: false, items: [], reason: "unconfigured" };
  const response = await timedFetch(fetchImpl, `${config.supabaseUrl}/rest/v1/rpc/sc_arena_current_weekly_spotlight`, {
    method: "POST",
    headers: serviceHeaders(config.secretKey),
    body: JSON.stringify({ p_workspace_slug: WORKSPACE_SLUG })
  }, config.timeoutMs);
  const payload = await safeJson(response);
  if (!response.ok) {
    if ([404, 400].includes(response.status) && /PGRST20|does not exist|schema cache/i.test(String(payload?.code || payload?.message || ""))) {
      return { available: false, items: [], reason: "schema_missing" };
    }
    throw statusError(payload?.message || payload?.error || "Weekly spotlight could not be loaded.", response.status);
  }
  const rows = Array.isArray(payload) ? payload : [];
  const first = rows[0] || {};
  return {
    available: Boolean(rows.length),
    cycleKey: String(first.cycle_key || ""),
    weekLabel: String(first.week_label || ""),
    publishedAt: first.published_at || null,
    sourceUpdatedAt: first.source_updated_at || null,
    items: rows.map(publicFeaturedItem).filter(Boolean),
    reason: rows.length ? "" : "empty"
  };
}

export async function loadWeeklyFeaturedSnapshotSafely(env = process.env, fetchImpl = fetch) {
  try {
    return await loadWeeklyFeaturedSnapshot(env, fetchImpl);
  } catch (error) {
    console.warn("[weekly-featured] snapshot read failed", { message: error?.message || "unknown" });
    return { available: false, items: [], reason: "read_failed" };
  }
}

function publicFeaturedItem(row) {
  const teamId = cleanText(row.organization_key, 160);
  const companyName = cleanText(row.company_name, 240);
  if (!teamId || !companyName) return null;
  return {
    teamId,
    companyName,
    rank: Math.min(Math.max(Number(row.rank) || 0, 1), 4),
    achievement: cleanText(row.achievement, 320),
    hook: cleanText(row.hook, 180),
    keywords: (Array.isArray(row.keywords) ? row.keywords : []).map((item) => cleanText(item, 48)).filter(Boolean).slice(0, 3)
  };
}

function serviceHeaders(secretKey) {
  const headers = {
    apikey: secretKey,
    "content-type": "application/json"
  };
  // Current Supabase sb_secret_* keys are opaque API keys. Only legacy
  // service_role JWTs are valid Bearer tokens.
  if (!String(secretKey).startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${secretKey}`;
  }
  return headers;
}

async function timedFetch(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
