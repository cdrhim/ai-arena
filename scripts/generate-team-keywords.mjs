import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { deriveTeamKeywords, TEAM_KEYWORD_VERSION } from "../netlify/lib/team-keywords.mjs";

const programUrl = required("SPARKCLAW_PROGRAM_SUPABASE_URL").replace(/\/$/, "");
const programKey = required("SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY");
const outputPath = path.resolve(process.argv[2] || "outputs/20260810-team-keywords/team-keywords.json");
const columns = [
  "id",
  "name",
  "company_name",
  "item",
  "status",
  "sector",
  "one_liner",
  "service_summary",
  "expertise",
  "domain",
  "ai_idea_summary"
];

const url = new URL(`${programUrl}/rest/v1/teams`);
url.searchParams.set("select", columns.join(","));
url.searchParams.set("order", "name.asc");
url.searchParams.set("limit", "1000");

const headers = { apikey: programKey, Accept: "application/json" };
if (!programKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${programKey}`;
const response = await fetch(url, { headers });
const body = await response.text();
if (!response.ok) throw new Error(`Program DB teams query failed (${response.status}): ${body.slice(0, 180)}`);
const teams = JSON.parse(body);
if (!Array.isArray(teams) || teams.length !== 76) {
  throw new Error(`Expected 76 Program DB teams, received ${Array.isArray(teams) ? teams.length : "non-array"}.`);
}

const rows = teams.map((team) => {
  const keywords = deriveTeamKeywords(team);
  if (!keywords.length) throw new Error(`No keywords generated for team ${team.id}.`);
  return {
    teamId: String(team.id),
    companyName: clean(team.company_name || team.name, 240),
    serviceName: clean(team.name || team.company_name, 240),
    keywords,
    keywordVersion: TEAM_KEYWORD_VERSION,
    sourceHash: createHash("sha256").update(JSON.stringify(columns.map((column) => team[column] || ""))).digest("hex")
  };
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2), "utf8");

const keywordCounts = rows.map((row) => row.keywords.length);
console.log(JSON.stringify({
  outputPath,
  teams: rows.length,
  minimumKeywords: Math.min(...keywordCounts),
  maximumKeywords: Math.max(...keywordCounts),
  averageKeywords: Number((keywordCounts.reduce((sum, count) => sum + count, 0) / keywordCounts.length).toFixed(1))
}));

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}
