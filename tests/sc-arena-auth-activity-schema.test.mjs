import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260818150000_sc_arena_auth_activity_explorer.sql",
  import.meta.url
);

test("staff explorer reads sanitized Supabase Auth login and logout audit events", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /from auth\.audit_log_entries a/);
  assert.match(sql, /parsed\.action in \('login', 'logout'\)/);
  assert.match(sql, /'system\.auth_login'/);
  assert.match(sql, /'system\.auth_logout'/);
  assert.match(sql, /sc_arena_private\.user_is_workspace_staff/);
  assert.match(sql, /join auth\.users u on u\.id = parsed\.actor_user_id/);
  assert.match(sql, /jsonb_build_object\('auth_action', parsed\.action\)/);
  assert.match(sql, /not exists \([\s\S]*?e\.source_system = 'arena_client'[\s\S]*?interval '60 seconds'/);
  assert.doesNotMatch(sql, /a\.ip_address|payload\s*->>\s*'ip_address'/);
  assert.doesNotMatch(sql, /actor_username/);
  assert.doesNotMatch(sql, /select\s+a\.payload/i);
});

test("member Recent Activity excludes all system and authentication events at the database boundary", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const myLog = sql.slice(
    sql.indexOf("create or replace function public.sc_arena_my_log"),
    sql.indexOf("create or replace function public.sc_arena_admin_activity")
  );
  assert.match(myLog, /e\.domain in \('discover', 'community', 'bounty'\)/);
  assert.doesNotMatch(myLog, /auth\.audit_log_entries/);
  assert.match(sql, /revoke all on function public\.sc_arena_my_log[\s\S]*?from public, anon/);
  assert.match(sql, /grant execute on function public\.sc_arena_my_log[\s\S]*?to authenticated/);
});

test("auth audit rows retain the explorer keyset cursor contract", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /2305843009213693952::bigint/);
  assert.match(sql, /hashtextextended\(a\.id::text, 0\)/);
  assert.match(sql, /\(combined\.occurred_at, combined\.id\) < \(/);
  assert.match(sql, /order by combined\.occurred_at desc, combined\.id desc/);
});
