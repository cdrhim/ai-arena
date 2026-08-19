import { isIsolatedArenaTestEmail } from "../netlify/lib/isolated-test-account.mjs";

const EXPECTED_ARENA_REF = "gfmummaahlrnmrgnirxu";
const EXPECTED_PROGRAM_REF = "fismlrkkppqmkfpgctue";
const EXPECTED_REPRESENTATIVE_COUNT = 75;
const ARCHIVE_REASON = "not_in_current_75_program_representative_accounts_2026-08-19";

const arenaUrl = requiredUrl("SUPABASE_URL");
const arenaSecret = required("SUPABASE_SECRET_KEY");
const programUrl = requiredUrl("SPARKCLAW_PROGRAM_SUPABASE_URL");
const programSecret = required("SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY");
const apply = process.argv.includes("--apply");

assertProjectRef(arenaUrl, EXPECTED_ARENA_REF, "Arena");
assertProjectRef(programUrl, EXPECTED_PROGRAM_REF, "Program");

const [teams, arenaUsers] = await Promise.all([
  readProgramTeams(),
  listAuthUsers(arenaUrl, arenaSecret)
]);

const eligibleTeams = teams.filter((team) => !isExcludedPartnerTeam(team));
const representativeEmails = new Set();
for (const team of eligibleTeams) {
  const emails = normalizedTeamEmails(team.email);
  if (emails.length !== 1) {
    throw new Error(`Expected one representative email for Program team ${String(team.id || "unknown")}.`);
  }
  representativeEmails.add(emails[0]);
}
if (eligibleTeams.length !== EXPECTED_REPRESENTATIVE_COUNT || representativeEmails.size !== EXPECTED_REPRESENTATIVE_COUNT) {
  throw new Error(
    `Refusing to archive: expected ${EXPECTED_REPRESENTATIVE_COUNT} unique representatives, ` +
    `received ${eligibleTeams.length} teams and ${representativeEmails.size} emails.`
  );
}

const protectedUsers = [];
const archiveUsers = [];
for (const user of arenaUsers) {
  const email = normalizeEmail(user.email);
  const appMetadata = object(user.app_metadata);
  const accessSource = String(appMetadata.arena_access_source || "").trim().toLowerCase();
  const protectedAccount =
    representativeEmails.has(email) ||
    email.endsWith("@sparklabs.co.kr") ||
    isIsolatedArenaTestEmail(email, process.env) ||
    accessSource === "arena_partner" ||
    accessSource === "external_partner" ||
    accessSource === "isolated_test";
  if (protectedAccount) protectedUsers.push(user);
  else if (accessSource !== "archived") archiveUsers.push(user);
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  representativeCompanies: representativeEmails.size,
  arenaAuthUsers: arenaUsers.length,
  protectedUsers: protectedUsers.length,
  archiveCandidates: archiveUsers.length
}));

if (!apply || archiveUsers.length === 0) process.exit(0);
if (archiveUsers.length > 60) {
  throw new Error(`Refusing to archive an unexpectedly large candidate set (${archiveUsers.length}).`);
}

const archiveResponse = await requestJson(
  new URL(`${arenaUrl}/rest/v1/rpc/sc_arena_archive_accounts`),
  arenaSecret,
  {
    method: "POST",
    body: JSON.stringify({
      p_user_ids: archiveUsers.map((user) => user.id),
      p_reason: ARCHIVE_REASON,
      p_workspace_slug: "sparkclaw-ai-arena"
    })
  }
);

const result = Array.isArray(archiveResponse) ? archiveResponse[0] : archiveResponse;
console.log(JSON.stringify({
  archived: Number(result?.archived_count || 0),
  membershipsRevoked: Number(result?.revoked_membership_count || 0)
}));

async function readProgramTeams() {
  const url = new URL(`${programUrl}/rest/v1/teams`);
  url.searchParams.set("select", "id,name,company_name,email,status,dropped_out,is_test_account");
  url.searchParams.set("limit", "1000");
  const rows = await requestJson(url, programSecret);
  if (!Array.isArray(rows)) throw new Error("Program teams response is not an array.");
  return rows;
}

async function listAuthUsers(baseUrl, secret) {
  const users = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = new URL(`${baseUrl}/auth/v1/admin/users`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "1000");
    const payload = await requestJson(url, secret);
    const rows = Array.isArray(payload) ? payload : payload?.users;
    if (!Array.isArray(rows)) throw new Error("Arena Auth users response is not an array.");
    users.push(...rows);
    if (rows.length < 1000) break;
  }
  return users;
}

async function requestJson(url, secret, init = {}) {
  const headers = {
    apikey: secret,
    Accept: "application/json",
    ...(init.body ? { "content-type": "application/json" } : {})
  };
  if (!secret.startsWith("sb_secret_")) headers.Authorization = `Bearer ${secret}`;
  const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Request failed (${response.status}) at ${url.pathname}: ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : null;
}

function isExcludedPartnerTeam(team) {
  if (team?.dropped_out === true || team?.is_test_account === true) return true;
  const status = String(team?.status || "").trim().toLowerCase();
  const restrictedEnglish = /(^|[_\s-])(blacklist|blocked|rejected|inactive|removed|private|draft|pending(?:[_\s-]?review)?|under[_\s-]?review|waitlist(?:ed)?|applicant|applied|submitted|paused|on[_\s-]?hold)($|[_\s-])/i;
  const restrictedKorean = /(탈락|차단|비공개|초안|심사\s*중|검토\s*중|대기자?|지원(?:서|접수|중)?|신청\s*중|논의\s*중|보류)/;
  return !directoryDisplayName(team) || restrictedEnglish.test(status) || restrictedKorean.test(status);
}

function directoryDisplayName(team) {
  return [team?.name, team?.company_name].map((value) => String(value || "").trim()).find(Boolean) || "";
}

function normalizedTeamEmails(value) {
  return String(value || "").split(/[,\n;]+/).map(normalizeEmail).filter((email) => email.includes("@"));
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function assertProjectRef(url, expectedRef, label) {
  const actualRef = new URL(url).hostname.split(".")[0];
  if (actualRef !== expectedRef) throw new Error(`Refusing unexpected ${label} project: ${actualRef}`);
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredUrl(name) {
  return required(name).replace(/\/$/, "");
}
