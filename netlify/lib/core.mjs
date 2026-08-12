import crypto from "node:crypto";

const ENV_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-(.*?))?\}/g;
const ANTHROPIC_ADMIN_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_ADMIN_PROVIDER_TYPES = new Set(["anthropic_admin_api_key", "anthropic_admin_total"]);

export function expandEnv(value, env = process.env) {
  if (typeof value === "string") {
    return value.replace(ENV_PATTERN, (_, name, fallback) => {
      if (Object.prototype.hasOwnProperty.call(env, name)) {
        return env[name] ?? "";
      }
      return fallback ?? "";
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => expandEnv(item, env));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandEnv(item, env)]));
  }
  return value;
}

export function splitList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => splitList(item));
  return String(value)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getJsonPath(data, path) {
  if (!path) return undefined;
  const normalized = String(path).startsWith("$.") ? String(path).slice(2) : String(path);
  const parts = normalized.replaceAll("[", ".").replaceAll("]", "").split(".").filter(Boolean);
  let current = data;
  for (const part of parts) {
    if (Array.isArray(current)) {
      current = current[Number(part)];
    } else if (current && typeof current === "object") {
      current = current[part];
    } else {
      throw new Error(`Cannot read JSON path ${path}; ${part} is not addressable.`);
    }
    if (current === undefined) {
      throw new Error(`JSON path ${path} did not resolve at ${part}.`);
    }
  }
  return current;
}

export function statusFingerprint(status) {
  return stableHash({
    provider_id: status.provider_id,
    state: status.state,
    balance: status.balance,
    unit: status.unit,
    metric: status.metric,
    expires_at: status.expires_at,
    token_due_date: status.token_due_date,
    error: status.error
  });
}

export function stableHash(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function detectChanges(previousStatuses = [], currentStatuses = [], checkedAt = new Date().toISOString()) {
  const previousById = new Map(previousStatuses.map((status) => [status.provider_id, status]));
  const changes = [];

  for (const current of currentStatuses) {
    const previous = previousById.get(current.provider_id);
    if (!previous) continue;
    if (statusFingerprint(previous) === statusFingerprint(current)) continue;
    changes.push({
      provider_id: current.provider_id,
      provider_name: current.provider_name,
      changed_at: checkedAt,
      previous,
      current,
      summary: summarizeChange(previous, current)
    });
  }

  return changes;
}

export function detectAuditEvents(
  previousStatuses = [],
  currentStatuses = [],
  checkedAt = new Date().toISOString(),
  previousEvents = []
) {
  const previousById = new Map(previousStatuses.map((status) => [status.provider_id, status]));
  const registeredIds = new Set(
    previousEvents
      .filter((event) => event.event_type === "registered" || event.event_type === "initial")
      .map((event) => event.provider_id)
  );
  const events = [];

  for (const current of currentStatuses) {
    const previous = previousById.get(current.provider_id);
    if (!registeredIds.has(current.provider_id)) {
      events.push(registrationEvent(current, checkedAt));
    }
    if (!previous) continue;
    if (statusFingerprint(previous) === statusFingerprint(current)) continue;
    events.push(changeEvent(previous, current, checkedAt));
  }

  return events;
}

export function registrationEvent(current, checkedAt) {
  const when = current.api_created_at || checkedAt;
  return {
    event_type: "registered",
    provider_id: current.provider_id,
    provider_name: current.provider_name,
    owner_email: current.owner_email || null,
    changed_at: when,
    logged_at: checkedAt,
    previous: null,
    current,
    summary: `Registered with initial ${valueWithUnit(current.balance, current.unit)} ${metricLabel(current.metric)}.`,
    details: [
      ["Owner", current.owner_email],
      ["Created", current.api_created_at],
      ["Last used", current.api_last_used_at],
      ["Initial value", valueWithUnit(current.balance, current.unit)]
    ]
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([label, value]) => `${label}: ${value}`)
  };
}

export function changeEvent(previous, current, checkedAt) {
  const details = changeDetails(previous, current);
  return {
    event_type: "changed",
    provider_id: current.provider_id,
    provider_name: current.provider_name,
    owner_email: current.owner_email || previous.owner_email || null,
    changed_at: checkedAt,
    logged_at: checkedAt,
    previous,
    current,
    summary: summarizeChange(previous, current),
    details
  };
}

export function summarizeChange(previous, current) {
  const fields = [
    ["balance", "balance"],
    ["unit", "unit"],
    ["expires_at", "expiry"],
    ["token_due_date", "token due date"],
    ["state", "state"],
    ["error", "error"]
  ];
  const pieces = fields
    .filter(([key]) => previous?.[key] !== current?.[key])
    .map(([key, label]) => `${label}: ${displayValue(previous?.[key])} -> ${displayValue(current?.[key])}`);
  return pieces.length ? pieces.join("; ") : "Provider status changed";
}

export function changeDetails(previous, current) {
  const details = [];
  if (
    comparableValue(previous?.balance) !== comparableValue(current?.balance) ||
    comparableValue(previous?.unit) !== comparableValue(current?.unit)
  ) {
    const label = titleCase(metricLabel(current?.metric || previous?.metric));
    details.push(`${label}: ${valueWithUnit(previous?.balance, previous?.unit)} -> ${valueWithUnit(current?.balance, current?.unit)}`);
  }

  const fields = [
    ["metric", "Credit type"],
    ["owner_email", "Email"],
    ["api_created_at", "Created"],
    ["api_last_used_at", "Last used"],
    ["expires_at", "Expires"],
    ["token_due_date", "Reference date"],
    ["state", "State"],
    ["error", "Error"]
  ];
  return details.concat(fields
    .filter(([key]) => comparableValue(previous?.[key]) !== comparableValue(current?.[key]))
    .map(([key, label]) => `${label}: ${displayValue(previous?.[key])} -> ${displayValue(current?.[key])}`));
}

export function comparableValue(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

export function valueWithUnit(value, unit) {
  const shownValue = displayValue(value);
  if (!unit) return shownValue;
  return `${shownValue} ${normalizeUnit(unit)}`;
}

export function metricLabel(metric) {
  if (metric === "spend") return "used credit";
  if (metric === "remaining") return "owned credit";
  return "credit";
}

export function titleCase(value) {
  return String(value)
    .split(" ")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
}

export function normalizeUnit(unit) {
  return String(unit).toLowerCase() === "usd" ? "USD" : String(unit);
}

export function displayValue(value) {
  if (value === null || value === undefined || value === "") return "n/a";
  return String(value);
}

export function cleanAuditEvents(events = []) {
  const filtered = events
    .map((event) => normalizeAuditEvent(event))
    .filter((event) => {
      if (event.event_type !== "changed") return true;
      if (!Array.isArray(event.details) || event.details.length === 0) return true;
      if (event.details.every((detail) => /:\s*n\/a\s*->\s*n\/a\s*$/i.test(String(detail)))) return false;
      return !event.details.every((detail) => isAuditMetadataDetail(detail));
    })
    .sort((left, right) => auditEventTime(right) - auditEventTime(left));
  return dedupeRegisteredEvents(filtered);
}

export function isAuditMetadataDetail(detail) {
  const text = String(detail);
  if (/^(Email|Created|Last used|Credit type|Notes):/i.test(text)) return true;
  if (/^State:\s*ok\s*->\s*active$/i.test(text)) return true;
  return false;
}

export function normalizeAuditEvent(event) {
  const eventType = event.event_type || (event.previous || event.current ? "changed" : "changed");
  const ownerEmail = event.owner_email || event.current?.owner_email || event.previous?.owner_email || null;
  const details =
    Array.isArray(event.details) && event.details.length
      ? event.details
      : eventType === "changed" && event.previous && event.current
        ? changeDetails(event.previous, event.current)
        : event.summary
          ? [event.summary]
          : [];

  return {
    ...event,
    provider_id: normalizeProviderId(event.provider_id),
    provider_name: normalizeProviderName(event.provider_name),
    event_type: eventType,
    owner_email: ownerEmail,
    details: details.map((detail) => normalizeAuditDetail(detail))
  };
}

export function normalizeProviderId(providerId) {
  if (providerId === "anthropic_claude_code_key_finance_dlkz") return "anthropic_claude_code_key_finance_dikz";
  return providerId;
}

export function normalizeProviderName(providerName) {
  return String(providerName || "").replace("claude_code_key_finance_dlkz", "claude_code_key_finance_dikz");
}

export function dedupeRegisteredEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    if (event.event_type !== "registered" && event.event_type !== "initial") return true;
    const key = event.provider_id || event.provider_name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeAuditDetail(detail) {
  return String(detail).replace(/\busd\b/gi, "USD");
}

export function auditEventTime(event) {
  const parsed = Date.parse(event.changed_at || event.logged_at || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function shouldSendNotification(config, state, changes, now = new Date()) {
  const frequency = config.notification.frequency;
  if (["off", "none", "disabled"].includes(frequency)) {
    return { send: false, reason: "disabled" };
  }

  const reasons = [];
  if (["change", "change_only", "daily_or_change", "every_2_days_or_change"].includes(frequency) && changes.length) {
    reasons.push("change");
  }

  const periodMs = schedulePeriodMs(frequency);
  if (periodMs !== null) {
    if (frequency === "always") {
      reasons.push("scheduled");
    } else if (!state.lastEmailAt) {
      reasons.push("scheduled");
    } else if (now.getTime() - new Date(state.lastEmailAt).getTime() >= periodMs) {
      reasons.push("scheduled");
    }
  }

  if (!reasons.length) return { send: false, reason: "not due" };
  return { send: true, reason: [...new Set(reasons)].join(" and ") };
}

export function schedulePeriodMs(frequency) {
  if (["daily", "daily_or_change"].includes(frequency)) return 24 * 60 * 60 * 1000;
  if (["every_2_days", "every_2_days_or_change"].includes(frequency)) return 2 * 24 * 60 * 60 * 1000;
  if (frequency === "always") return 0;
  return null;
}

export async function collectStatuses(config, now = new Date().toISOString()) {
  const enabledProviders = config.providers.filter((provider) => provider.enabled !== false);
  const anthropicProviders = enabledProviders.filter((provider) => ANTHROPIC_ADMIN_PROVIDER_TYPES.has(provider.type));
  const regularProviders = enabledProviders.filter((provider) => !ANTHROPIC_ADMIN_PROVIDER_TYPES.has(provider.type));
  const [regularStatuses, anthropicStatuses] = await Promise.all([
    Promise.all(regularProviders.map((provider) => collectProviderStatus(provider, now))),
    anthropicProviders.length ? collectAnthropicAdminStatuses(anthropicProviders, now) : []
  ]);
  const byId = new Map([...regularStatuses, ...anthropicStatuses].map((status) => [status.provider_id, status]));
  return enabledProviders.map((provider) => byId.get(provider.id || provider.name)).filter(Boolean);
}

export async function collectProviderStatus(provider, checkedAt) {
  try {
    if ((provider.type || "manual") === "manual") return manualStatus(provider, checkedAt);
    if (provider.type === "http_json") return httpJsonStatus(provider, checkedAt);
    if (provider.type === "deepgram_balance") return deepgramBalanceStatus(provider, checkedAt);
    if (ANTHROPIC_ADMIN_PROVIDER_TYPES.has(provider.type)) {
      return (await collectAnthropicAdminStatuses([provider], checkedAt))[0];
    }
    throw new Error(`Unsupported provider type: ${provider.type}`);
  } catch (error) {
    return {
      provider_id: provider.id || provider.name || "unknown",
      provider_name: provider.name || provider.id || "Unknown provider",
      checked_at: checkedAt,
      state: "error",
      balance: null,
      unit: provider.unit || null,
      metric: provider.metric || null,
      owner_email: provider.owner_email || null,
      api_created_at: provider.api_created_at || null,
      api_last_used_at: provider.api_last_used_at || null,
      visible: provider.visible !== false,
      count_as_api: provider.count_as_api !== false,
      expires_at: null,
      token_due_date: null,
      account_url: provider.account_url || null,
      notes: provider.notes || null,
      error: error.message
    };
  }
}

export function manualStatus(provider, checkedAt) {
  return {
    provider_id: provider.id,
    provider_name: provider.name || provider.id,
    checked_at: checkedAt,
    state: provider.state || "ok",
    balance: provider.balance ?? null,
    unit: provider.unit || null,
    metric: provider.metric || "credit",
    owner_email: provider.owner_email || null,
    api_created_at: provider.api_created_at || null,
    api_last_used_at: provider.api_last_used_at || null,
    visible: provider.visible !== false,
    count_as_api: provider.count_as_api !== false,
    expires_at: provider.expires_at || null,
    token_due_date: provider.token_due_date || null,
    account_url: provider.account_url || null,
    notes: provider.notes || null,
    error: null
  };
}

export async function httpJsonStatus(provider, checkedAt) {
  const payload = await requestJson(provider);
  const paths = provider.paths || {};
  return {
    provider_id: provider.id,
    provider_name: provider.name || provider.id,
    checked_at: checkedAt,
    state: paths.state ? getJsonPath(payload, paths.state) : "ok",
    balance: getJsonPath(payload, paths.balance),
    unit: paths.unit ? getJsonPath(payload, paths.unit) : provider.unit || null,
    metric: provider.metric || "credit",
    owner_email: provider.owner_email || null,
    api_created_at: provider.api_created_at || null,
    api_last_used_at: provider.api_last_used_at || null,
    visible: provider.visible !== false,
    count_as_api: provider.count_as_api !== false,
    expires_at: paths.expires_at ? getJsonPath(payload, paths.expires_at) : null,
    token_due_date: paths.token_due_date ? getJsonPath(payload, paths.token_due_date) : null,
    account_url: provider.account_url || null,
    notes: provider.notes || null,
    error: null,
    raw: provider.store_raw ? payload : undefined
  };
}

export async function deepgramBalanceStatus(provider, checkedAt) {
  if (!provider.api_key) throw new Error("Deepgram provider requires api_key, usually ${DEEPGRAM_API_KEY}.");
  if (!provider.project_id) throw new Error("Deepgram provider requires project_id, usually ${DEEPGRAM_PROJECT_ID}.");

  const baseUrl = (provider.base_url || "https://api.deepgram.com/v1").replace(/\/$/, "");
  const balancePath = provider.balance_id ? `/balances/${provider.balance_id}` : "/balances";
  const payload = await requestJson({
    url: `${baseUrl}/projects/${provider.project_id}${balancePath}`,
    method: "GET",
    timeout_seconds: provider.timeout_seconds || 20,
    headers: {
      Authorization: `Token ${provider.api_key}`,
      Accept: "application/json"
    }
  });
  const balance = summarizeDeepgramBalance(payload);
  return {
    provider_id: provider.id,
    provider_name: provider.name || provider.id,
    checked_at: checkedAt,
    state: "ok",
    balance: balance.amount,
    unit: balance.unit,
    metric: provider.metric || "remaining",
    owner_email: provider.owner_email || null,
    api_created_at: provider.api_created_at || null,
    api_last_used_at: provider.api_last_used_at || null,
    visible: provider.visible !== false,
    count_as_api: provider.count_as_api !== false,
    expires_at: provider.expires_at || null,
    token_due_date: provider.token_due_date || null,
    account_url: provider.account_url || "https://console.deepgram.com/",
    notes: balance.notes,
    error: null,
    raw: provider.store_raw ? payload : undefined
  };
}

export async function collectAnthropicAdminStatuses(providers, checkedAt) {
  try {
    const adminKey = process.env.ANTHROPIC_ADMIN_API_KEY || providers.find((provider) => provider.admin_key)?.admin_key;
    if (!adminKey) {
      throw new Error("Anthropic Admin provider requires ANTHROPIC_ADMIN_API_KEY.");
    }

    const window = reportingWindow(providers, checkedAt);
    const needsKeys = providers.some((provider) => provider.type === "anthropic_admin_api_key");
    const needsTotal = providers.some((provider) => provider.type === "anthropic_admin_total");
    const [apiKeys, usageByKey, officialCost] = await Promise.all([
      needsKeys ? fetchAnthropicApiKeys(adminKey) : [],
      needsKeys ? fetchAnthropicUsageByApiKey(adminKey, window) : new Map(),
      needsTotal ? fetchAnthropicCostTotal(adminKey, window) : null
    ]);
    const keysById = new Map(apiKeys.map((key) => [key.id, key]));
    const keysByName = new Map(apiKeys.map((key) => [String(key.name || "").toLowerCase(), key]));

    return providers.map((provider) => {
      if (provider.type === "anthropic_admin_total") {
        return anthropicTotalStatus(provider, checkedAt, officialCost, window);
      }
      return anthropicApiKeyStatus(provider, checkedAt, keysById, keysByName, usageByKey, window);
    });
  } catch (error) {
    return providers.map((provider) => ({
      provider_id: provider.id || provider.name || "anthropic_unknown",
      provider_name: provider.name || provider.id || "Anthropic Claude",
      checked_at: checkedAt,
      state: "error",
      balance: provider.balance ?? null,
      unit: provider.unit || "USD",
      metric: provider.metric || "spend_estimate",
      owner_email: provider.owner_email || null,
      api_created_at: provider.api_created_at || null,
      api_last_used_at: provider.api_last_used_at || null,
      visible: provider.visible !== false,
      count_as_api: provider.count_as_api !== false,
      expires_at: provider.expires_at || null,
      token_due_date: provider.token_due_date || null,
      account_url: provider.account_url || "https://console.anthropic.com/settings/keys",
      notes: provider.notes || null,
      error: error.message
    }));
  }
}

export function anthropicApiKeyStatus(provider, checkedAt, keysById, keysByName, usageByKey, window) {
  const key = keysById.get(provider.api_key_id) || keysByName.get(String(provider.api_key_name || "").toLowerCase());
  const usage = key ? usageByKey.get(key.id) : null;
  const keyName = key?.name || provider.api_key_name || provider.name?.replace(/^Anthropic Claude:\s*/i, "") || provider.id;
  const createdAt = dateOnly(key?.created_at) || provider.api_created_at || null;
  const lastUsedAt = latestDate(usage?.last_used_at, provider.api_last_used_at);
  const tokenText = usage
    ? `${formatInteger(usage.input + usage.cache_creation + usage.cache_read)} input/cache tokens, ${formatInteger(usage.output)} output tokens`
    : "no Usage API token activity in reporting window";
  return {
    provider_id: provider.id,
    provider_name: provider.name || `Anthropic Claude: ${keyName}`,
    checked_at: checkedAt,
    state: key?.status || "missing",
    balance: provider.balance ?? null,
    unit: provider.unit || "USD",
    metric: provider.metric || "spend_estimate",
    owner_email: provider.owner_email || null,
    api_created_at: createdAt,
    api_last_used_at: lastUsedAt,
    visible: provider.visible !== false,
    count_as_api: provider.count_as_api !== false,
    expires_at: provider.expires_at || null,
    token_due_date: lastUsedAt || provider.token_due_date || null,
    account_url: provider.account_url || "https://console.anthropic.com/settings/keys",
    notes: [
      `Live Anthropic Admin API status for ${keyName}.`,
      `Window ${window.startDate} to ${window.endDate}: ${tokenText}.`,
      "Per-key USD is the last console snapshot; official total USD is tracked separately."
    ].join(" "),
    error: null
  };
}

export function anthropicTotalStatus(provider, checkedAt, officialCost, window) {
  return {
    provider_id: provider.id,
    provider_name: provider.name || "Anthropic Claude Official Total",
    checked_at: checkedAt,
    state: "ok",
    balance: roundCurrency(officialCost?.usd || 0),
    unit: "USD",
    metric: "spend",
    owner_email: provider.owner_email || null,
    api_created_at: provider.api_created_at || null,
    api_last_used_at: window.endDate,
    visible: provider.visible !== false,
    count_as_api: provider.count_as_api !== false,
    expires_at: null,
    token_due_date: window.endDate,
    account_url: provider.account_url || "https://console.anthropic.com/settings/cost",
    notes: `Official Anthropic Cost API total for ${window.startDate} to ${window.endDate}; API does not support cost grouping by API key.`,
    error: null
  };
}

export async function fetchAnthropicApiKeys(adminKey) {
  const keys = [];
  let page = null;
  for (let index = 0; index < 10; index += 1) {
    const params = new URLSearchParams({ limit: "100" });
    if (page) params.set("page", page);
    const payload = await anthropicRequestJson(adminKey, `/organizations/api_keys?${params.toString()}`);
    keys.push(...(Array.isArray(payload?.data) ? payload.data : []));
    if (!payload?.has_more || !payload.next_page) break;
    page = payload.next_page;
  }
  return keys;
}

export async function fetchAnthropicUsageByApiKey(adminKey, window) {
  const usageByKey = new Map();
  let page = null;
  for (let index = 0; index < 10; index += 1) {
    const params = new URLSearchParams({
      starting_at: `${window.startDate}T00:00:00Z`,
      ending_at: `${window.endDate}T00:00:00Z`,
      bucket_width: "1d",
      limit: String(window.days)
    });
    params.append("group_by[]", "api_key_id");
    if (page) params.set("page", page);
    const payload = await anthropicRequestJson(adminKey, `/organizations/usage_report/messages?${params.toString()}`);
    summarizeAnthropicUsage(payload, usageByKey);
    if (!payload?.has_more || !payload.next_page) break;
    page = payload.next_page;
  }
  return usageByKey;
}

export function summarizeAnthropicUsage(payload, usageByKey = new Map()) {
  for (const bucket of Array.isArray(payload?.data) ? payload.data : []) {
    const bucketDate = dateOnly(bucket.starting_at);
    for (const row of Array.isArray(bucket.results) ? bucket.results : []) {
      if (!row?.api_key_id) continue;
      const usage = usageByKey.get(row.api_key_id) || {
        input: 0,
        output: 0,
        cache_read: 0,
        cache_creation: 0,
        last_used_at: null
      };
      usage.input += Number(row.uncached_input_tokens || 0);
      usage.output += Number(row.output_tokens || 0);
      usage.cache_read += Number(row.cache_read_input_tokens || 0);
      usage.cache_creation += Number(row.cache_creation?.ephemeral_5m_input_tokens || 0);
      usage.cache_creation += Number(row.cache_creation?.ephemeral_1h_input_tokens || 0);
      if (bucketDate && (usage.input || usage.output || usage.cache_read || usage.cache_creation)) {
        usage.last_used_at = bucketDate;
      }
      usageByKey.set(row.api_key_id, usage);
    }
  }
  return usageByKey;
}

export async function fetchAnthropicCostTotal(adminKey, window) {
  let totalCents = 0;
  let page = null;
  for (let index = 0; index < 10; index += 1) {
    const params = new URLSearchParams({
      starting_at: `${window.startDate}T00:00:00Z`,
      ending_at: `${window.endDate}T00:00:00Z`,
      bucket_width: "1d",
      limit: String(window.days)
    });
    params.append("group_by[]", "workspace_id");
    params.append("group_by[]", "description");
    if (page) params.set("page", page);
    const payload = await anthropicRequestJson(adminKey, `/organizations/cost_report?${params.toString()}`);
    totalCents += summarizeAnthropicCostCents(payload);
    if (!payload?.has_more || !payload.next_page) break;
    page = payload.next_page;
  }
  return { cents: totalCents, usd: totalCents / 100 };
}

export function summarizeAnthropicCostCents(payload) {
  let total = 0;
  for (const bucket of Array.isArray(payload?.data) ? payload.data : []) {
    for (const row of Array.isArray(bucket.results) ? bucket.results : []) {
      total += Number(row.amount || 0);
    }
  }
  return total;
}

export async function anthropicRequestJson(adminKey, path) {
  return requestJson({
    url: `${ANTHROPIC_ADMIN_BASE_URL}${path}`,
    method: "GET",
    timeout_seconds: 25,
    headers: {
      "x-api-key": adminKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "user-agent": "SparkLabsCreditTracker/1.0"
    }
  });
}

export function reportingWindow(providers, checkedAt) {
  const end = startOfUtcDay(addDays(new Date(checkedAt), 1));
  const maxDays = Math.max(1, Math.min(31, Number(providers.find((provider) => provider.period_days)?.period_days || 31)));
  const fallbackStart = addDays(end, -maxDays);
  const configuredStarts = providers
    .map((provider) => provider.period_start || provider.api_created_at)
    .filter(Boolean)
    .map((value) => startOfUtcDay(new Date(value)))
    .filter((date) => Number.isFinite(date.getTime()));
  const earliestConfigured = configuredStarts.length
    ? new Date(Math.min(...configuredStarts.map((date) => date.getTime())))
    : fallbackStart;
  const start = earliestConfigured > fallbackStart ? earliestConfigured : fallbackStart;
  const days = Math.max(1, Math.min(31, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))));
  return {
    startDate: isoDate(start),
    endDate: isoDate(end),
    days
  };
}

export function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function dateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return isoDate(date);
}

export function latestDate(...values) {
  const dates = values
    .filter(Boolean)
    .map((value) => dateOnly(value))
    .filter(Boolean);
  if (!dates.length) return null;
  return dates.sort().at(-1);
}

export function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function formatInteger(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function summarizeDeepgramBalance(payload) {
  const balances = Array.isArray(payload?.balances) ? payload.balances : [payload];
  const amountsByUnit = new Map();
  const purchaseOrders = [];

  for (const item of balances) {
    if (!item || typeof item !== "object") continue;
    const unit = item.units || item.unit || "USD";
    const amount = Number(item.amount || 0);
    amountsByUnit.set(unit, (amountsByUnit.get(unit) || 0) + amount);
    if (item.purchase_order_id) purchaseOrders.push(String(item.purchase_order_id));
  }

  if (amountsByUnit.size === 0) {
    return { amount: 0, unit: "USD", notes: "No Deepgram balances returned." };
  }

  if (amountsByUnit.size === 1) {
    const [[unit, amount]] = amountsByUnit.entries();
    const po = purchaseOrders.length ? `; PO: ${purchaseOrders.slice(0, 3).join(", ")}` : "";
    return { amount, unit, notes: `${balances.length} Deepgram balance record(s)${po}` };
  }

  return {
    amount: [...amountsByUnit.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([unit, amount]) => `${amount} ${unit}`)
      .join(", "),
    unit: null,
    notes: `${balances.length} Deepgram balance record(s)`
  };
}

export async function requestJson(provider) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(provider.timeout_seconds || 20) * 1000);
  try {
    const response = await fetch(provider.url, {
      method: provider.method || "GET",
      headers: provider.headers || {},
      body: provider.body ? JSON.stringify(provider.body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${provider.url}: ${text.slice(0, 300)}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}
