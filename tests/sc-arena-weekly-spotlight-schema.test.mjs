import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("supabase/migrations/20260812100000_sc_arena_weekly_spotlight.sql", "utf8");

test("weekly spotlight schema keeps snapshots related to workspace organizations", () => {
  assert.match(sql, /create table if not exists public\.sc_arena_featured_snapshots/);
  assert.match(sql, /create table if not exists public\.sc_arena_featured_snapshot_items/);
  assert.match(sql, /references public\.sc_arena_organizations\(workspace_id, id\)/);
  assert.match(sql, /unique \(snapshot_id, rank\)/);
  assert.match(sql, /unique \(snapshot_id, organization_id\)/);
});

test("weekly spotlight tables are service-only and expose safe copy through an RPC", () => {
  assert.match(sql, /force row level security/g);
  assert.match(sql, /revoke all on public\.sc_arena_featured_snapshots from public, anon, authenticated, service_role/);
  assert.match(sql, /revoke all on public\.sc_arena_featured_snapshot_items from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.sc_arena_publish_weekly_spotlight[\s\S]*?to service_role/);
  assert.match(sql, /grant execute on function public\.sc_arena_current_weekly_spotlight[\s\S]*?to service_role/);
  const reader = sql.match(/create or replace function public\.sc_arena_current_weekly_spotlight[\s\S]*?\$\$;/)?.[0] || "";
  assert.doesNotMatch(reader, /score|signal_count|signals/);
});
