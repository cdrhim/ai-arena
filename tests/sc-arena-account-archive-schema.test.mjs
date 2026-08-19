import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/20260819110000_sc_arena_account_archive.sql", import.meta.url);

test("account archive stores only reversible authorization metadata", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table if not exists public\.sc_arena_archived_accounts/i);
  assert.match(sql, /previous_membership_status text/i);
  assert.match(sql, /previous_banned_until timestamptz/i);
  assert.doesNotMatch(sql, /encrypted_password|refresh_token|recovery_token|confirmation_token/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /revoke all on table public\.sc_arena_archived_accounts[\s\S]*?service_role/i);
});

test("service-only archive is reversible and immediately revokes Arena access", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create or replace function public\.sc_arena_archive_accounts/i);
  assert.match(sql, /set status = 'revoked'/i);
  assert.match(sql, /banned_until = '9999-12-31 23:59:59\+00'/i);
  assert.match(sql, /'\{arena_access_source\}'[\s\S]*?'"archived"'::jsonb/i);
  assert.match(sql, /create or replace function public\.sc_arena_restore_archived_account/i);
  assert.match(sql, /grant execute on function public\.sc_arena_archive_accounts[\s\S]*?to service_role/i);
  assert.match(sql, /grant execute on function public\.sc_arena_restore_archived_account[\s\S]*?to service_role/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]*?to authenticated/i);
});
