import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260818130000_sc_arena_legacy_owned_tables.sql",
  import.meta.url
);
const sql = await readFile(migrationUrl, "utf8");
const compact = sql.replace(/\s+/g, " ").trim().toLowerCase();

function policy(name, nextMarker) {
  const start = compact.indexOf(`create policy ${name}`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = compact.indexOf(nextMarker, start + 1);
  return compact.slice(start, end === -1 ? compact.length : end);
}

function table(name, nextTable) {
  const start = compact.indexOf(`create table if not exists public.sc_arena_${name}`);
  assert.notEqual(start, -1, `missing sc_arena_${name}`);
  const end = nextTable
    ? compact.indexOf(`create table if not exists public.sc_arena_${nextTable}`, start + 1)
    : compact.indexOf("create unique index", start + 1);
  return compact.slice(start, end);
}

test("remaining Arena-owned tables use canonical sc_arena_ physical names", () => {
  for (const table of [
    "members",
    "perk_requests",
    "spark_hunt_events",
    "audit_logs",
    "email_logs"
  ]) {
    assert.match(compact, new RegExp(`create table if not exists public\\.sc_arena_${table} \\(`));
    assert.doesNotMatch(compact, new RegExp(`create table if not exists public\\.${table} \\(`));
  }

  assert.doesNotMatch(compact, /create\s+(?:or replace\s+)?view/);
  assert.doesNotMatch(compact, /create\s+trigger/);
});

test("migration preserves source rows by renaming but also builds a fresh target", () => {
  for (const table of [
    "members",
    "perk_requests",
    "spark_hunt_events",
    "audit_logs",
    "email_logs"
  ]) {
    assert.match(compact, new RegExp(`'${table}'`));
  }
  assert.match(compact, /v_prefixed_name := 'sc_arena_' \|\| v_legacy_name/);
  assert.match(compact, /alter table public\.%i rename to %i/);
  assert.match(compact, /both public\.% and public\.% are tables; reconcile them before applying this migration/);
  assert.match(compact, /v_legacy_kind is not null and v_legacy_kind not in \('r', 'p'\)/);
  assert.match(compact, /v_prefixed_kind is not null and v_prefixed_kind not in \('r', 'p'\)/);
  assert.match(compact, /^--[\s\S]*?begin;/);
  assert.match(compact, /commit;$/);
});

test("member identity, uniqueness, status, and lookup contracts match live", () => {
  const members = table("members", "perk_requests");
  for (const column of [
    "id uuid primary key default gen_random_uuid()",
    "user_id uuid not null",
    "name text not null",
    "email text not null",
    "company text not null",
    "status text not null default 'pending'",
    "registered_at timestamptz not null default now()",
    "verified_at timestamptz",
    "verified_by text",
    "spark_points integer not null default 0"
  ]) {
    assert.ok(members.includes(column), `members missing ${column}`);
  }
  assert.match(members, /constraint sc_arena_members_user_id_key unique \(user_id\)/);
  assert.match(members, /constraint sc_arena_members_email_key unique \(email\)/);
  assert.match(members, /foreign key \(user_id\) references auth\.users\(id\) on delete cascade/);
  assert.match(members, /check \(status in \('pending', 'verified', 'rejected'\)\)/);
  assert.match(compact, /create unique index if not exists sc_arena_members_email_lower_uidx on public\.sc_arena_members \(lower\(email\)\)/);
  assert.match(compact, /create unique index if not exists sc_arena_members_user_id_uidx on public\.sc_arena_members \(user_id\)/);
});

test("dependent tables keep live foreign keys and check constraints", () => {
  const perks = table("perk_requests", "spark_hunt_events");
  const sparkEvents = table("spark_hunt_events", "audit_logs");
  for (const column of [
    "id uuid primary key default gen_random_uuid()",
    "member_id uuid not null",
    "member_email text not null",
    "member_name text not null",
    "project text not null",
    "use_case text not null",
    "supervisor_email text not null",
    "status text not null default 'pending'",
    "requested_at timestamptz not null default now()",
    "approved_at timestamptz",
    "approved_by text",
    "forwarded_at timestamptz"
  ]) {
    assert.ok(perks.includes(column), `perk_requests missing ${column}`);
  }
  assert.match(
    perks,
    /foreign key \(member_id\) references public\.sc_arena_members\(id\) on delete cascade/
  );
  assert.match(
    perks,
    /check \(status in \('pending', 'approved', 'forwarded', 'rejected'\)\)/
  );
  for (const column of [
    "id uuid primary key default gen_random_uuid()",
    "user_id uuid not null",
    "member_id uuid not null",
    "points integer not null",
    "source text not null default 'mini_game'",
    "created_at timestamptz not null default now()"
  ]) {
    assert.ok(sparkEvents.includes(column), `spark_hunt_events missing ${column}`);
  }
  assert.match(
    sparkEvents,
    /foreign key \(user_id\) references auth\.users\(id\) on delete cascade/
  );
  assert.match(sparkEvents, /foreign key \(member_id\) references public\.sc_arena_members\(id\) on delete cascade/);
  assert.match(sparkEvents, /check \(points > 0 and points <= 1000\)/);
});

test("audit and email logs retain every live column and default", () => {
  const audit = table("audit_logs", "email_logs");
  const email = table("email_logs");
  for (const column of [
    "id uuid primary key default gen_random_uuid()",
    "actor text not null",
    "action text not null",
    "details text not null",
    "created_at timestamptz not null default now()"
  ]) {
    assert.ok(audit.includes(column), `audit_logs missing ${column}`);
  }
  for (const column of [
    "id uuid primary key default gen_random_uuid()",
    "recipient text not null",
    "subject text not null",
    "body text not null",
    "related_action text not null",
    "status text not null default 'queued'",
    "error text",
    "created_at timestamptz not null default now()",
    "sent_at timestamptz"
  ]) {
    assert.ok(email.includes(column), `email_logs missing ${column}`);
  }
  assert.match(email, /check \(status in \('queued', 'sent', 'failed'\)\)/);
});

test("all five tables enable RLS and replace renamed policies", () => {
  for (const table of [
    "members",
    "perk_requests",
    "spark_hunt_events",
    "audit_logs",
    "email_logs"
  ]) {
    assert.match(compact, new RegExp(`alter table public\\.sc_arena_${table} enable row level security`));
  }
  assert.match(compact, /from pg_policies/);
  assert.match(compact, /drop policy %i on %i\.%i/);
});

test("prefixed admin helper is hardened and reads only prefixed members", () => {
  const helper = compact.slice(
    compact.indexOf("create or replace function public.sc_arena_is_sparklabs_admin"),
    compact.indexOf("create policy sc_arena_audit_logs_select_admin")
  );
  assert.match(helper, /security definer set search_path = ''/);
  assert.match(helper, /from public\.sc_arena_members m/);
  assert.match(helper, /auth\.uid\(\) as user_id/);
  assert.match(helper, /lower\(trim\(coalesce\(auth\.jwt\(\) ->> 'email', ''\)\)\) as email/);
  assert.match(helper, /m\.user_id = c\.user_id/);
  assert.match(helper, /m\.status = 'verified'/);
  assert.match(helper, /lower\(trim\(m\.email\)\) = c\.email/);
  assert.match(helper, /lower\(trim\(m\.email\)\) like '%@sparklabs\.co\.kr'/);
  assert.match(helper, /c\.email like '%@sparklabs\.co\.kr'/);
  assert.doesNotMatch(helper, /from public\.members(?:\s|$)/);
  assert.match(helper, /revoke all on function public\.sc_arena_is_sparklabs_admin\(\) from public, anon, authenticated/);
  assert.match(helper, /grant execute on function public\.sc_arena_is_sparklabs_admin\(\) to authenticated, service_role/);
});

test("audit and email writes and reads require a verified SparkLabs admin", () => {
  const auditSelect = policy(
    "sc_arena_audit_logs_select_admin",
    "create policy sc_arena_audit_logs_insert_admin"
  );
  const auditInsert = policy(
    "sc_arena_audit_logs_insert_admin",
    "create policy sc_arena_email_logs_select_admin"
  );
  const emailSelect = policy(
    "sc_arena_email_logs_select_admin",
    "create policy sc_arena_email_logs_insert_admin"
  );
  const emailInsert = policy(
    "sc_arena_email_logs_insert_admin",
    "create policy sc_arena_email_logs_update_admin"
  );
  const emailUpdate = policy(
    "sc_arena_email_logs_update_admin",
    "create policy sc_arena_members_select_own_or_admin"
  );

  for (const adminPolicy of [auditSelect, auditInsert, emailSelect, emailInsert, emailUpdate]) {
    assert.match(adminPolicy, /to authenticated/);
    assert.match(adminPolicy, /sc_arena_is_sparklabs_admin\(\)/);
  }
  assert.match(auditInsert, /for insert/);
  assert.match(emailInsert, /for insert/);
  assert.doesNotMatch(`${auditInsert} ${emailInsert}`, /with check \(true\)/);
  assert.match(emailUpdate, /for update/);
  assert.match(emailUpdate, /with check \(\(select public\.sc_arena_is_sparklabs_admin\(\)\)\)/);
});

test("member and perk policies preserve own-row and verified-member access", () => {
  const memberSelect = policy(
    "sc_arena_members_select_own_or_admin",
    "create policy sc_arena_members_insert_own"
  );
  const memberInsert = policy(
    "sc_arena_members_insert_own",
    "create policy sc_arena_members_update_admin"
  );
  const perkSelect = policy(
    "sc_arena_perk_requests_select_own_or_admin",
    "create policy sc_arena_perk_requests_insert_verified_member"
  );
  const perkInsert = policy(
    "sc_arena_perk_requests_insert_verified_member",
    "create policy sc_arena_perk_requests_update_admin"
  );

  assert.match(memberSelect, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(memberSelect, /sc_arena_is_sparklabs_admin\(\)/);
  assert.match(memberInsert, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(memberInsert, /status = 'pending'/);
  assert.match(memberInsert, /nullif\(trim\(auth\.jwt\(\) ->> 'email'\), ''\) is not null/);
  assert.match(memberInsert, /lower\(trim\(email\)\) = lower\(trim\(auth\.jwt\(\) ->> 'email'\)\)/);
  assert.doesNotMatch(memberInsert, /status = 'pending' or/);
  assert.doesNotMatch(memberInsert, /status = 'verified'/);
  assert.match(perkSelect, /m\.id = sc_arena_perk_requests\.member_id/);
  assert.match(perkSelect, /m\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(perkInsert, /m\.status = 'verified'/);
});

test("Spark Hunt is owner/admin-readable and service-only writable", () => {
  const sparkSelect = policy(
    "sc_arena_spark_hunt_events_select_own_or_admin",
    "revoke all on table"
  );
  assert.match(sparkSelect, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(sparkSelect, /sc_arena_is_sparklabs_admin\(\)/);
  assert.doesNotMatch(compact, /create policy sc_arena_spark_hunt_events_[^ ]+[^;]+for (?:insert|update|delete)/);
  assert.match(compact, /grant select on table public\.sc_arena_spark_hunt_events to authenticated/);
});

test("browser grants are bounded by the live policy operations", () => {
  assert.match(compact, /revoke all on table public\.sc_arena_members,[\s\S]+from public, anon, authenticated/);
  assert.match(compact, /grant select, insert, update on table public\.sc_arena_members to authenticated/);
  assert.match(compact, /grant select, insert, update on table public\.sc_arena_perk_requests to authenticated/);
  assert.match(compact, /grant select, insert on table public\.sc_arena_audit_logs to authenticated/);
  assert.match(compact, /grant select, insert, update on table public\.sc_arena_email_logs to authenticated/);
  assert.match(compact, /grant all on table public\.sc_arena_members,[\s\S]+to service_role/);
});
