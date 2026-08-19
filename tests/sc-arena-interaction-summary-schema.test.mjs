import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("supabase/migrations/20260818170000_sc_arena_interaction_summary.sql", "utf8");

test("interaction summary exposes only an authenticated aggregate RPC", () => {
  assert.match(sql, /create or replace function public\.sc_arena_interaction_event_count\(\)/i);
  assert.match(sql, /returns bigint/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /count\(\*\)::bigint/i);
  assert.match(sql, /source_system <> 'program_actions'/i);
  assert.match(sql, /revoke all on function public\.sc_arena_interaction_event_count\(\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.sc_arena_interaction_event_count\(\) to authenticated, service_role/i);
  assert.doesNotMatch(sql, /returns setof|returns table/i);
});
