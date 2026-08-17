import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/20260817140000_sc_arena_admin_activity_explorer.sql", import.meta.url);

test("admin activity migration adds login and page events with lookup indexes", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /'system\.session_started'/);
  assert.match(sql, /'system\.page_viewed'/);
  assert.match(sql, /sc_arena_activity_actor_time_idx/);
  assert.match(sql, /sc_arena_activity_type_time_idx/);
});
test("cross-user activity RPCs are fail-closed to authenticated workspace staff", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create or replace function public\.sc_arena_admin_activity_users/);
  assert.match(sql, /create or replace function public\.sc_arena_admin_activity\(/);
  assert.equal((sql.match(/sc_arena_private\.user_is_workspace_staff/g) || []).length, 2);
  assert.match(sql, /join auth\.users u on u\.id = m\.user_id/);
  assert.match(sql, /left join auth\.users u on u\.id = e\.actor_user_id/);
  assert.match(sql, /revoke all on function public\.sc_arena_admin_activity_users[\s\S]*?from public, anon/);
  assert.match(sql, /revoke all on function public\.sc_arena_admin_activity\([\s\S]*?from public, anon/);
  assert.match(sql, /grant execute on function public\.sc_arena_admin_activity_users[\s\S]*?to authenticated/);
  assert.match(sql, /grant execute on function public\.sc_arena_admin_activity\([\s\S]*?to authenticated/);
});

test("activity explorer supports user, action, domain, date and keyset filters", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /p_actor_user_id uuid default null/);
  assert.match(sql, /p_domain text default null/);
  assert.match(sql, /p_event_type text default null/);
  assert.match(sql, /p_occurred_from timestamptz default null/);
  assert.match(sql, /p_occurred_to timestamptz default null/);
  assert.match(sql, /\(e\.occurred_at, e\.id\) < \(p_before_occurred_at/);
});
