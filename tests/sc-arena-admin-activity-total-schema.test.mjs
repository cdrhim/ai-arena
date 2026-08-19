import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260818190000_sc_arena_admin_activity_total_count.sql",
  import.meta.url
);

test("staff activity explorer returns a full filtered count while keeping keyset pagination", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create or replace function public\.sc_arena_admin_activity_page/);
  assert.doesNotMatch(sql, /drop function|drop table/);
  assert.match(sql, /p_excluded_actor_user_ids uuid\[\]/);
  assert.match(sql, /count\(\*\) over \(\)::bigint as total_count/);
  assert.ok(sql.indexOf("count(*) over ()::bigint as total_count") < sql.indexOf("p_before_occurred_at is null"));
  assert.match(sql, /not \(combined\.actor_user_id = any/);
  assert.match(sql, /limit least\(greatest\(coalesce\(p_limit, 100\), 1\), 200\)/);
  assert.match(sql, /revoke all on function public\.sc_arena_admin_activity_page[\s\S]*?from public, anon/);
  assert.match(sql, /grant execute on function public\.sc_arena_admin_activity_page[\s\S]*?to authenticated/);
});
