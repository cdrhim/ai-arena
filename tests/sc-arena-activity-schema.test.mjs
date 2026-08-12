import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260812090000_sc_arena_activity_ledger.sql", import.meta.url);
const sql = (await readFile(migrationUrl, "utf8")).replace(/\r\n/g, "\n");
const compact = sql.replace(/\s+/g, " ").toLowerCase();
const readme = (await readFile(new URL("../README.md", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

function section(start, end) {
  const startIndex = compact.indexOf(start.toLowerCase());
  assert.notEqual(startIndex, -1, `missing SQL section: ${start}`);
  const endIndex = compact.indexOf(end.toLowerCase(), startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing SQL section terminator: ${end}`);
  return compact.slice(startIndex, endIndex);
}

test("activity ledger uses only sc_arena_ table names and workspace-safe relationships", () => {
  const expectedTables = [
    "workspaces",
    "organizations",
    "memberships",
    "entities",
    "activity_event_types",
    "activity_events",
    "activity_event_entities",
    "activity_viewers",
    "activity_user_state"
  ];
  for (const table of expectedTables) {
    assert.match(compact, new RegExp(`create table if not exists public\\.sc_arena_${table} \\(`));
  }
  const createdTables = [...compact.matchAll(/create table if not exists public\.([a-z0-9_]+)/g)].map((match) => match[1]);
  assert.equal(createdTables.length, expectedTables.length);
  assert.ok(createdTables.every((name) => name.startsWith("sc_arena_")));

  assert.match(compact, /foreign key \(workspace_id, organization_id\) references public\.sc_arena_organizations\(workspace_id, id\) on delete set null \(organization_id\)/);
  assert.match(compact, /foreign key \(workspace_id, actor_organization_id\) references public\.sc_arena_organizations\(workspace_id, id\) on delete set null \(actor_organization_id\)/);
  assert.match(compact, /foreign key \(workspace_id, event_id\) references public\.sc_arena_activity_events\(workspace_id, id\) on delete cascade/);
  assert.match(compact, /foreign key \(workspace_id, entity_id\) references public\.sc_arena_entities\(workspace_id, id\) on delete restrict/);
});

test("all activity tables force RLS and visibility requires an active workspace membership", () => {
  const forced = [...compact.matchAll(/alter table public\.(sc_arena_[a-z0-9_]+) force row level security/g)]
    .map((match) => match[1]);
  assert.equal(new Set(forced).size, 9);

  const canView = section(
    "create or replace function sc_arena_private.can_view_activity_event",
    "revoke all on function sc_arena_private.user_is_workspace_staff"
  );
  assert.match(canView, /active_membership\.workspace_id = p_workspace_id/);
  assert.match(canView, /active_membership\.user_id = p_user_id/);
  assert.match(canView, /active_membership\.status = 'active'/);
  assert.match(canView, /p_user_id = \(select auth\.uid\(\)\)/);
  assert.match(canView, /v\.workspace_id = p_workspace_id and v\.event_id = p_event_id/);
  assert.doesNotMatch(canView, /or sc_arena_private\.user_is_workspace_staff/);
  assert.match(canView, /p_audience_scope in \('organization', 'participants', 'participants_and_staff'\)/);
  assert.match(canView, /p_audience_scope in \('participants', 'participants_and_staff'\)/);
  assert.match(canView, /ee\.relation_type in \('subject', 'target'\)/);
  assert.match(canView, /e\.entity_type = 'organization'/);
  assert.match(canView, /p_audience_scope in \('staff', 'participants_and_staff'\) and sc_arena_private\.user_is_workspace_staff/);

  assert.match(compact, /check \(audience_scope in \('actor_only', 'participants', 'organization', 'staff', 'participants_and_staff'\)\)/);

  const viewersPolicy = section(
    "create policy sc_arena_activity_viewers_select",
    "drop policy if exists sc_arena_activity_user_state_select"
  );
  assert.match(viewersPolicy, /using \(viewer_user_id = \(select auth\.uid\(\)\)\)/);
  assert.doesNotMatch(viewersPolicy, /can_view_activity_event/);

  for (const policyName of ["sc_arena_activity_user_state_insert", "sc_arena_activity_user_state_update"]) {
    const policyEnd = policyName.endsWith("insert")
      ? "drop policy if exists sc_arena_activity_user_state_update"
      : "revoke all on";
    const policy = section(`create policy ${policyName}`, policyEnd);
    assert.match(policy, /sc_arena_private\.can_view_activity_event/);
    assert.match(policy, /ae\.workspace_id = sc_arena_activity_user_state\.workspace_id/);
  }
});

test("the server append path is idempotent, append-only, and cannot revive revoked users", () => {
  const sync = section(
    "create or replace function public.sc_arena_sync_membership",
    "create or replace function public.sc_arena_append_activity"
  );
  assert.match(sync, /m\.status = 'revoked'/);
  assert.match(sync, /if found then return query select v_workspace_id, v_organization_id; return; end if/);
  assert.match(sync, /when public\.sc_arena_memberships\.status = 'revoked' then 'revoked'/);
  assert.match(sync, /p_organization_source[\s\S]*= 'arena_user'/);
  assert.match(sync, /o\.external_source <> 'arena_user'/);
  assert.match(sync, /current_organization\.external_source <> 'arena_user'/);

  const append = section(
    "create or replace function public.sc_arena_append_activity",
    "create or replace function public.sc_arena_my_log"
  );
  assert.match(append, /on conflict \(workspace_id, source_system, source_event_id\) do nothing returning id into v_event_id/);
  assert.match(append, /p_audience_scope in \('actor_only', 'participants', 'organization', 'staff', 'participants_and_staff'\)/);
  const duplicateReturn = append.indexOf("if v_event_id is null then");
  const relationshipWrite = append.indexOf("insert into public.sc_arena_activity_event_entities");
  assert.ok(duplicateReturn >= 0 && relationshipWrite > duplicateReturn);
  assert.match(append.slice(duplicateReturn, relationshipWrite), /return v_event_id/);
  assert.doesNotMatch(append, /update public\.sc_arena_activity_events|delete from public\.sc_arena_activity_events/);

  assert.doesNotMatch(compact, /create policy [a-z0-9_]+ on public\.sc_arena_activity_events for (insert|update|delete)/);
});

test("service_role has no direct DML path to any sc_arena table", () => {
  const serviceDmlRevoke = section(
    "revoke insert, update, delete, truncate on",
    "from service_role;"
  );
  const revokedTables = [...serviceDmlRevoke.matchAll(/public\.(sc_arena_[a-z0-9_]+)/g)]
    .map((match) => match[1]);
  assert.deepEqual(revokedTables, [
    "sc_arena_workspaces",
    "sc_arena_organizations",
    "sc_arena_memberships",
    "sc_arena_entities",
    "sc_arena_activity_event_types",
    "sc_arena_activity_events",
    "sc_arena_activity_event_entities",
    "sc_arena_activity_viewers",
    "sc_arena_activity_user_state"
  ]);

  assert.ok(compact.includes("grant insert, update on public.sc_arena_activity_user_state to authenticated"));
  assert.doesNotMatch(compact, /grant (insert|update|delete|truncate)[^;]+to service_role/);
});

test("RPC grants use the exact exposed signatures and My Log joins remain workspace-bound", () => {
  const appendSignature = "public.sc_arena_append_activity(text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, uuid[], timestamptz, text)";
  assert.ok(compact.includes(`revoke all on function ${appendSignature} from public, anon, authenticated`));
  assert.ok(compact.includes(`grant execute on function ${appendSignature} to service_role`));
  assert.ok(compact.includes("grant execute on function public.sc_arena_my_log(text, text, timestamptz, bigint, integer) to authenticated"));
  assert.doesNotMatch(compact, /grant execute on function public\.sc_arena_append_activity[^;]+to authenticated/);

  const myLog = section("create or replace function public.sc_arena_my_log", "revoke all on function public.sc_arena_sync_membership");
  assert.match(myLog, /en\.workspace_id = ee\.workspace_id and en\.id = ee\.entity_id/);
  assert.match(myLog, /ee\.workspace_id = e\.workspace_id and ee\.event_id = e\.id/);
  assert.match(myLog, /s\.workspace_id = e\.workspace_id and s\.event_id = e\.id/);
});

test("expired activity purge is bounded, lock-safe, cascading, and service-only", () => {
  const purge = section(
    "create or replace function public.sc_arena_purge_expired_activity",
    "revoke all on function public.sc_arena_sync_membership"
  );
  assert.match(purge, /security definer set search_path = ''/);
  assert.match(purge, /e\.retention_until is not null and e\.retention_until <= now\(\)/);
  assert.match(purge, /limit least\(greatest\(coalesce\(p_limit, 1000\), 1\), 5000\)/);
  assert.match(purge, /for update skip locked/);
  assert.match(purge, /delete from public\.sc_arena_activity_events e using victims v/);

  assert.ok(compact.includes("revoke all on function public.sc_arena_purge_expired_activity(integer) from public, anon, authenticated"));
  assert.ok(compact.includes("grant execute on function public.sc_arena_purge_expired_activity(integer) to service_role"));
  assert.doesNotMatch(compact, /grant execute on function public\.sc_arena_purge_expired_activity\(integer\) to (anon|authenticated)/);
  assert.match(compact, /references public\.sc_arena_activity_events\(workspace_id, id\) on delete cascade/);
});

test("README documents audience boundaries, retention, Cron, and erasure handling", () => {
  assert.match(readme, /`participants_and_staff`/);
  assert.match(readme, /`arena_user` 조직으로 임시 동기화/);
  assert.match(readme, /sc_arena_purge_expired_activity\(5000\)/);
  assert.match(readme, /cron\.schedule/);
  assert.match(readme, /탈퇴·삭제 요청/);
  assert.match(readme, /actor_label/);
});
