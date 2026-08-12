const expectedArenaRef = "ilsoatwwizyahhlzapie";

const arenaUrl = requiredUrl("ARENA_SUPABASE_URL");
const arenaSecret = required("ARENA_SUPABASE_SECRET");
const programUrl = requiredUrl("PROGRAM_SUPABASE_URL");
const programSecret = required("PROGRAM_SUPABASE_SECRET");

if (new URL(arenaUrl).hostname.split(".")[0] !== expectedArenaRef) {
  throw new Error(`Refusing to audit unexpected Arena project: ${new URL(arenaUrl).hostname}`);
}

const teamQuery = new URL(`${programUrl}/rest/v1/teams`);
teamQuery.searchParams.set("select", "id,name,company_name,email,status");
teamQuery.searchParams.set("order", "name.asc");
teamQuery.searchParams.set("limit", "1000");

const teams = await requestJson(teamQuery, programSecret);
if (!Array.isArray(teams) || teams.length !== 76) {
  throw new Error(`Expected 76 Program DB teams, received ${Array.isArray(teams) ? teams.length : "non-array"}.`);
}

const normalizedTeams = teams.map((team) => ({
  ...team,
  email: normalizeEmail(team.email)
}));
const invalidEmails = normalizedTeams.filter((team) => !isValidEmail(team.email));
const emailCounts = new Map();
for (const team of normalizedTeams) emailCounts.set(team.email, (emailCounts.get(team.email) || 0) + 1);
const duplicateEmails = [...emailCounts.entries()].filter(([email, count]) => email && count > 1);

const authUsers = await listAuthUsers(arenaUrl, arenaSecret);
const authEmails = new Set(authUsers.map((user) => normalizeEmail(user.email)).filter(Boolean));
const existing = normalizedTeams.filter((team) => authEmails.has(team.email));
const missing = normalizedTeams.filter((team) => !authEmails.has(team.email));

console.log(JSON.stringify({
  arenaProjectRef: expectedArenaRef,
  programTeams: normalizedTeams.length,
  validTeamEmails: normalizedTeams.length - invalidEmails.length,
  invalidTeamEmails: invalidEmails.length,
  duplicateTeamEmails: duplicateEmails.length,
  arenaAuthUsers: authUsers.length,
  alreadyExistingAmong76: existing.length,
  missingAmong76: missing.length
}));

async function listAuthUsers(baseUrl, secret) {
  const all = [];
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(`${baseUrl}/auth/v1/admin/users`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "1000");
    const payload = await requestJson(url, secret);
    const users = Array.isArray(payload) ? payload : payload?.users;
    if (!Array.isArray(users)) throw new Error("Unexpected Supabase Auth users response.");
    all.push(...users);
    if (users.length < 1000) break;
  }
  return all;
}

async function requestJson(url, secret) {
  const headers = {
    apikey: secret,
    Accept: "application/json"
  };
  if (!secret.startsWith("sb_secret_")) headers.Authorization = `Bearer ${secret}`;
  const response = await fetch(url, {
    headers
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Request failed (${response.status}) at ${new URL(url).pathname}: ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredUrl(name) {
  return required(name).replace(/\/$/, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
