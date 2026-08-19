import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260818180000_sc_arena_personal_my_log.sql",
  import.meta.url
);

test("My Log remains actor-only for members and SparkLabs staff", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create or replace function public\.sc_arena_my_log/);
  assert.match(sql, /e\.actor_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /e\.domain in \('discover', 'community', 'bounty'\)/);
  assert.doesNotMatch(sql, /auth\.audit_log_entries|user_is_workspace_staff/);
  assert.match(sql, /grant execute on function public\.sc_arena_my_log[\s\S]*?to authenticated/);
});

test("personal My Log keeps bounded keyset pagination for the scrollable feed", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /\(e\.occurred_at, e\.id\) < \(p_before_occurred_at/);
  assert.match(sql, /order by e\.occurred_at desc, e\.id desc/);
  assert.match(sql, /limit least\(greatest\(coalesce\(p_limit, 50\), 1\), 100\)/);
});
