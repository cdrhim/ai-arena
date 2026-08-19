import { splitList } from "./core.mjs";

const DEFAULT_ISOLATED_TEST_EMAILS = Object.freeze(["haeryong.rhim@gmail.com"]);
const ISOLATED_ACCESS_SOURCE = "isolated_test";

export function isolatedArenaTestEmails(env = process.env) {
  const configured = splitList(env.SPARKCLAW_ISOLATED_TEST_EMAILS)
    .map(normalizeEmail)
    .filter(Boolean);
  return configured.length ? configured : [...DEFAULT_ISOLATED_TEST_EMAILS];
}

export function isIsolatedArenaTestEmail(email, env = process.env) {
  return isolatedArenaTestEmails(env).includes(normalizeEmail(email));
}

export function isIsolatedArenaTestUser(user, envOrEmails = process.env) {
  const appMetadata = user?.app_metadata && typeof user.app_metadata === "object"
    ? user.app_metadata
    : {};
  const emails = Array.isArray(envOrEmails)
    ? envOrEmails.map(normalizeEmail).filter(Boolean)
    : isolatedArenaTestEmails(envOrEmails);
  return appMetadata.arena_access_source === ISOLATED_ACCESS_SOURCE
    && appMetadata.isolated_test === true
    && emails.includes(normalizeEmail(user?.email));
}

export function isIsolatedArenaTestViewer(viewer, env = process.env) {
  return viewer?.isIsolatedTest === true && isIsolatedArenaTestEmail(viewer?.email, env);
}

export function isolatedArenaTestAppMetadata(existing = {}) {
  const preserved = existing && typeof existing === "object" ? { ...existing } : {};
  delete preserved.program_team_id;
  delete preserved.b2b_profile_id;
  delete preserved.b2bProfileId;
  return {
    ...preserved,
    arena_access_source: ISOLATED_ACCESS_SOURCE,
    isolated_test: true
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}
