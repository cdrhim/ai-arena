const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const SERVER_USER_AGENT = "sparkclaw-program-database-reader";

export function programDatabaseConfig(env = process.env) {
  const rawUrl = String(
    env.SPARKCLAW_PROGRAM_SUPABASE_URL ||
      env.SPARKCLAW_PROGRAM_DATA_API_URL ||
      env.PROGRAM_SUPABASE_URL ||
      ""
  ).trim();
  const supabaseUrl = normalizeSupabaseUrl(rawUrl);
  const key = String(
    env.SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY ||
      env.SPARKCLAW_PROGRAM_SUPABASE_SERVICE_ROLE_KEY ||
      env.SPARKCLAW_PROGRAM_SUPABASE_SERVICE_KEY ||
      env.SPARKCLAW_PROGRAM_SUPABASE_PUBLISHABLE_KEY ||
      env.SPARKCLAW_PROGRAM_SUPABASE_ANON_KEY ||
      ""
  ).trim();
  const maxLimit = clampInteger(env.SPARKCLAW_PROGRAM_DB_MAX_LIMIT, 1, MAX_LIMIT, MAX_LIMIT);

  return {
    supabaseUrl,
    restUrl: supabaseUrl ? `${supabaseUrl}/rest/v1` : "",
    key,
    maxLimit,
    configured: Boolean(supabaseUrl && key)
  };
}

export async function loadProgramDatabaseSchema(env = process.env, fetchImpl = fetch) {
  const config = programDatabaseConfig(env);
  assertConfigured(config);

  const response = await fetchImpl(`${config.restUrl}/`, {
    headers: {
      ...restHeaders(config),
      Accept: "application/openapi+json"
    }
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Unable to load Program database schema.");
  }

  const tables = openApiTables(payload);
  return {
    project: "program managing _ sparkclaw",
    sourceUrl: config.supabaseUrl,
    generatedAt: new Date().toISOString(),
    tables
  };
}

export async function readProgramDatabaseTable(options = {}, env = process.env, fetchImpl = fetch) {
  const config = programDatabaseConfig(env);
  assertConfigured(config);

  const schema = options.schema || (await loadProgramDatabaseSchema(env, fetchImpl));
  const tableName = cleanIdentifier(options.table);
  const table = schema.tables.find((item) => item.name === tableName);
  if (!table) {
    const error = new Error("Unknown Program database table.");
    error.status = 400;
    throw error;
  }

  const limit = clampInteger(options.limit, 1, config.maxLimit, DEFAULT_LIMIT);
  const offset = clampInteger(options.offset, 0, Number.MAX_SAFE_INTEGER, 0);
  const url = new URL(`${config.restUrl}/${encodeURIComponent(table.name)}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const response = await fetchImpl(url, {
    headers: {
      ...restHeaders(config),
      Prefer: "count=exact"
    }
  });
  const rows = await safeJson(response);
  if (!response.ok) {
    throw new Error(rows?.message || rows?.error || `Unable to read ${table.name}.`);
  }

  const contentRange = response.headers.get("content-range") || "";
  return {
    table,
    rows: Array.isArray(rows) ? rows : [],
    limit,
    offset,
    contentRange,
    totalCount: totalFromContentRange(contentRange),
    generatedAt: new Date().toISOString()
  };
}

export function assertProgramDatabaseAccess(viewer, env = process.env) {
  if (!viewer?.canScore) {
    const error = new Error("Only SparkLabs staff can read the Program database.");
    error.status = viewer?.email ? 403 : 401;
    throw error;
  }

  const allowlist = splitList(env.SPARKCLAW_PROGRAM_DB_ALLOWED_EMAILS).map((email) => email.toLowerCase());
  if (allowlist.length && !allowlist.includes(String(viewer.email || "").toLowerCase())) {
    const error = new Error("This staff account is not allowlisted for the Program database.");
    error.status = 403;
    throw error;
  }
}

export function openApiTables(payload) {
  const definitions = payload?.definitions || {};
  return Object.entries(definitions)
    .map(([name, definition]) => ({
      name,
      columns: openApiColumns(definition),
      required: Array.isArray(definition?.required) ? definition.required : []
    }))
    .filter((table) => cleanIdentifier(table.name) === table.name)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function openApiColumns(definition = {}) {
  return Object.entries(definition.properties || {})
    .map(([name, column]) => ({
      name,
      type: column?.format || column?.type || "unknown"
    }))
    .filter((column) => cleanIdentifier(column.name) === column.name);
}

function restHeaders(config) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "user-agent": SERVER_USER_AGENT
  };
}

function assertConfigured(config) {
  if (!config.configured) {
    const error = new Error(
      "Program database is not configured. Set SPARKCLAW_PROGRAM_SUPABASE_URL and SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY."
    );
    error.status = 503;
    throw error;
  }
}

function normalizeSupabaseUrl(value) {
  return String(value || "")
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "");
}

function cleanIdentifier(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : "";
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function totalFromContentRange(value) {
  const match = String(value || "").match(/\/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function splitList(value) {
  return String(value || "")
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
