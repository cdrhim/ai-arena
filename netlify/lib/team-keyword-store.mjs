import { normalizeStoredKeywords } from "./team-keywords.mjs";

const TABLE = "arena_team_keywords";

export function teamKeywordStoreConfig(env = process.env) {
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "").trim();
  return { supabaseUrl, key, configured: Boolean(supabaseUrl && key) };
}

export async function loadTeamKeywordRows(env = process.env, fetchImpl = fetch) {
  const config = teamKeywordStoreConfig(env);
  if (!config.configured) return [];
  const url = new URL(`${config.supabaseUrl}/rest/v1/${TABLE}`);
  url.searchParams.set("select", "team_id,company_name,service_name,keywords,keyword_version,updated_at");
  url.searchParams.set("limit", "1000");
  const response = await fetchImpl(url, {
    headers: {
      apikey: config.key,
      Accept: "application/json",
      "user-agent": "sparkclaw-team-keyword-reader"
    }
  });
  if (!response.ok) return [];
  const payload = await safeJson(response);
  return (Array.isArray(payload) ? payload : []).map((row) => ({
    teamId: String(row.team_id || ""),
    companyName: text(row.company_name, 240),
    serviceName: text(row.service_name, 240),
    keywords: normalizeStoredKeywords(row.keywords),
    keywordVersion: Number(row.keyword_version || 0),
    updatedAt: row.updated_at || null
  })).filter((row) => row.teamId && row.keywords.length);
}

export function teamKeywordsById(rows = []) {
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.teamId), row]));
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function text(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}
