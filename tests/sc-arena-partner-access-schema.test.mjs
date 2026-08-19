import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql = fs.readFileSync(
  new URL("../supabase/migrations/20260818140000_sc_arena_partner_access.sql", import.meta.url),
  "utf8"
);

test("external partner credentials and authorization are stored separately", () => {
  assert.match(sql, /create table if not exists public\.sc_arena_partner_profiles/i);
  assert.match(sql, /organization_id uuid not null/i);
  assert.match(sql, /references auth\.users\(id\)/i);
  assert.match(sql, /alter table public\.sc_arena_partner_profiles force row level security/i);
  assert.match(sql, /revoke all on table public\.sc_arena_partner_profiles from public, anon, authenticated, service_role/i);
});

test("existing Program Auth accounts are backfilled as internal memberships", () => {
  assert.match(sql, /from auth\.users account/i);
  assert.match(sql, /then 'staff'[\s\S]*else 'claw_member'/i);
  assert.match(sql, /when public\.sc_arena_memberships\.status = 'revoked' then 'revoked'/i);
});

test("viewer access is exposed only through a service-only bounded RPC", () => {
  assert.match(sql, /create or replace function public\.sc_arena_resolve_viewer_access/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /grant execute on function public\.sc_arena_resolve_viewer_access\(uuid, text\)[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.sc_arena_resolve_viewer_access\(uuid, text\)[\s\S]*to authenticated/i);
});
