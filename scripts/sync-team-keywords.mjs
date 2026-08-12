import { readFile } from "node:fs/promises";

const inputPath = process.argv[2] || "outputs/20260810-team-keywords/team-keywords.json";
const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const secretKey = required("SUPABASE_SECRET_KEY");
const dataset = JSON.parse(await readFile(inputPath, "utf8"));
const sourceRows = Array.isArray(dataset.rows) ? dataset.rows : [];

if (sourceRows.length !== 76) {
  throw new Error(`Expected 76 keyword rows, received ${sourceRows.length}.`);
}

const now = new Date().toISOString();
const rows = sourceRows.map((row) => ({
  team_id: String(row.teamId || ""),
  company_name: String(row.companyName || "").trim(),
  service_name: String(row.serviceName || "").trim(),
  keywords: Array.isArray(row.keywords) ? row.keywords : [],
  keyword_version: Number(row.keywordVersion || 1),
  updated_at: now
}));

if (rows.some((row) => !row.team_id || !row.company_name || !row.keywords.length)) {
  throw new Error("Keyword dataset contains an incomplete row.");
}

const upsertUrl = new URL(`${supabaseUrl}/rest/v1/arena_team_keywords`);
upsertUrl.searchParams.set("on_conflict", "team_id");
const upsertResponse = await fetch(upsertUrl, {
  method: "POST",
  headers: {
    apikey: secretKey,
    "content-type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal"
  },
  body: JSON.stringify(rows)
});

if (!upsertResponse.ok) {
  throw new Error(`Keyword upsert failed (${upsertResponse.status}): ${await upsertResponse.text()}`);
}

const verifyUrl = new URL(`${supabaseUrl}/rest/v1/arena_team_keywords`);
verifyUrl.searchParams.set("select", "team_id,keywords");
verifyUrl.searchParams.set("limit", "1000");
const verifyResponse = await fetch(verifyUrl, {
  headers: {
    apikey: secretKey,
    Accept: "application/json"
  }
});

if (!verifyResponse.ok) {
  throw new Error(`Keyword verification failed (${verifyResponse.status}): ${await verifyResponse.text()}`);
}

const storedRows = await verifyResponse.json();
const keywordCounts = storedRows.map((row) => Array.isArray(row.keywords) ? row.keywords.length : 0);
console.log(JSON.stringify({
  storedRows: storedRows.length,
  minimumKeywords: Math.min(...keywordCounts),
  maximumKeywords: Math.max(...keywordCounts),
  updatedAt: now
}));

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
