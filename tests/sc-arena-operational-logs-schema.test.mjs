import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260817173000_sc_arena_admin_and_development_logs.sql", import.meta.url);

test("admin audits and development diagnostics use separate protected tables", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table if not exists public\.sc_arena_admin_audit_logs/);
  assert.match(sql, /create table if not exists public\.sc_arena_development_logs/);
  assert.equal((sql.match(/force row level security/g) || []).length, 2);
  assert.match(sql, /revoke all on public\.sc_arena_admin_audit_logs from public, anon, authenticated/);
  assert.match(sql, /revoke all on public\.sc_arena_development_logs from public, anon, authenticated/);
});

test("every staff activity is copied transactionally and existing history is backfilled", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create trigger sc_arena_capture_staff_activity_audit/);
  assert.match(sql, /after insert on public\.sc_arena_activity_events/);
  assert.match(sql, /new\.actor_role not in \('staff', 'admin'\)/);
  assert.match(sql, /where a\.actor_role in \('staff', 'admin'\)/);
  assert.match(sql, /on conflict \(workspace_id, activity_event_id\) do nothing/);
});

test("development writes are service-only and both read APIs fail closed to workspace staff", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create or replace function public\.sc_arena_append_development_log/);
  assert.match(sql, /grant execute on function public\.sc_arena_append_development_log[\s\S]*?to service_role/);
  assert.match(sql, /create or replace function public\.sc_arena_admin_audit_log/);
  assert.match(sql, /create or replace function public\.sc_arena_development_log/);
  assert.equal((sql.match(/sc_arena_private\.user_is_workspace_staff/g) || []).length, 2);
  assert.match(sql, /Request bodies, authorization headers, tokens, secrets/);
});
