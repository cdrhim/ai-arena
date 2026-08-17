import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  loadArenaSubmissions,
  SUPABASE_SUBMISSIONS_TABLE,
  supabaseSubmissionConfig
} from "../netlify/lib/supabase-submissions-store.mjs";
import {
  loadTeamKeywordRows,
  TEAM_KEYWORDS_TABLE,
  teamKeywordStoreConfig
} from "../netlify/lib/team-keyword-store.mjs";

const migrationUrl = new URL(
  "../supabase/migrations/20260818120000_sc_arena_active_legacy_tables.sql",
  import.meta.url
);
const syncScriptUrl = new URL("../scripts/sync-team-keywords.mjs", import.meta.url);

test("active Arena storage uses only prefixed runtime table names", async () => {
  const syncScript = await readFile(syncScriptUrl, "utf8");

  assert.equal(SUPABASE_SUBMISSIONS_TABLE, "sc_arena_submissions");
  assert.equal(TEAM_KEYWORDS_TABLE, "sc_arena_team_keywords");
  assert.match(syncScript, /const TABLE_NAME = "sc_arena_team_keywords"/);
  assert.match(syncScript, /rest\/v1\/\$\{TABLE_NAME\}/);
  assert.match(syncScript, /serviceHeaders\(secretKey\)/);
  assert.doesNotMatch(syncScript, /rest\/v1\/arena_team_keywords/);
});

test("Arena-owned table readers require server-only Supabase credentials", async () => {
  assert.equal(supabaseSubmissionConfig({
    SUPABASE_URL: "https://arena.example",
    SUPABASE_ANON_KEY: "anon-only"
  }).configured, false);
  assert.equal(teamKeywordStoreConfig({
    SUPABASE_URL: "https://arena.example",
    SUPABASE_ANON_KEY: "anon-only"
  }).configured, false);

  const calls = [];
  await loadArenaSubmissions({
    SUPABASE_URL: "https://arena.example",
    SUPABASE_SECRET_KEY: "sb_secret_server"
  }, async (url, options) => {
    calls.push({ url: String(url), headers: options.headers });
    return Response.json([]);
  });
  await loadTeamKeywordRows({
    SUPABASE_URL: "https://arena.example",
    SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-jwt"
  }, async (url, options) => {
    calls.push({ url: String(url), headers: options.headers });
    return Response.json([]);
  });

  assert.match(calls[0].url, /\/rest\/v1\/sc_arena_submissions/);
  assert.equal(calls[0].headers.apikey, "sb_secret_server");
  assert.equal(Object.hasOwn(calls[0].headers, "Authorization"), false);
  assert.match(calls[1].url, /\/rest\/v1\/sc_arena_team_keywords/);
  assert.equal(calls[1].headers.Authorization, "Bearer legacy-service-role-jwt");
});

test("migration supports both legacy in-place upgrades and fresh targets", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /alter table public\.arena_submissions rename to sc_arena_submissions/);
  assert.match(sql, /alter table public\.arena_team_keywords rename to sc_arena_team_keywords/);
  assert.match(sql, /create table if not exists public\.sc_arena_submissions/);
  assert.match(sql, /create table if not exists public\.sc_arena_team_keywords/);
  assert.match(sql, /Both public\.arena_submissions and public\.sc_arena_submissions are tables/);
  assert.match(sql, /Both public\.arena_team_keywords and public\.sc_arena_team_keywords are tables/);
});

test("submission RLS denies anonymous raw payloads and prevents member self-publishing", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /alter table public\.sc_arena_submissions force row level security/);
  assert.match(sql, /security definer\s+set search_path = ''\s+as \$\$\s+select exists[\s\S]*?from auth\.users staff_user/);
  assert.match(sql, /staff_user\.email_confirmed_at is not null/);
  assert.doesNotMatch(sql, /status = 'published' and visibility = 'public'/);
  assert.match(sql, /and status = 'draft'\s+and visibility = 'private'/);
  assert.match(sql, /coalesce\(payload ->> 'status', 'draft'\) = 'draft'/);
  assert.match(sql, /coalesce\(payload ->> 'visibility', 'private'\) = 'private'/);
  assert.match(sql, /revoke all on table public\.sc_arena_submissions from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, update, delete on table public\.sc_arena_submissions to authenticated/);
  assert.doesNotMatch(sql, /grant [^;]*public\.sc_arena_submissions[^;]* to anon/);
});

test("team keywords are backend-only and compatibility views do not broaden access", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /create view public\.arena_submissions\s+with \(security_invoker = true\)\s+as select \* from public\.sc_arena_submissions/
  );
  assert.match(
    sql,
    /create view public\.arena_team_keywords\s+with \(security_invoker = true\)\s+as select \* from public\.sc_arena_team_keywords/
  );
  assert.match(sql, /alter table public\.sc_arena_team_keywords force row level security/);
  assert.doesNotMatch(sql, /create policy "sc arena team keywords public read"/);
  assert.match(sql, /revoke all on table public\.sc_arena_team_keywords from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant [^;]*public\.sc_arena_team_keywords[^;]* to (?:anon|authenticated)/);
  assert.match(sql, /revoke all on table public\.arena_submissions from public, anon, authenticated/);
  assert.match(sql, /revoke all on table public\.arena_team_keywords from public, anon, authenticated/);
});
