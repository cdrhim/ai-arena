-- SparkClaw AI Arena: move the remaining Arena-owned legacy tables under the
-- public.sc_arena_ namespace. On the source project, renames preserve rows and
-- foreign keys. On a fresh target project, the canonical tables are created.

begin;

do $migration$
declare
  v_legacy_name text;
  v_prefixed_name text;
  v_legacy_kind "char";
  v_prefixed_kind "char";
begin
  foreach v_legacy_name in array array[
    'members',
    'perk_requests',
    'spark_hunt_events',
    'audit_logs',
    'email_logs'
  ]
  loop
    v_prefixed_name := 'sc_arena_' || v_legacy_name;
    v_legacy_kind := null;
    v_prefixed_kind := null;

    select c.relkind into v_legacy_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_legacy_name;

    select c.relkind into v_prefixed_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_prefixed_name;

    if v_legacy_kind is not null and v_legacy_kind not in ('r', 'p') then
      raise exception 'public.% exists but is not a table', v_legacy_name;
    elsif v_prefixed_kind is not null and v_prefixed_kind not in ('r', 'p') then
      raise exception 'public.% exists but is not a table', v_prefixed_name;
    elsif v_legacy_kind in ('r', 'p') and v_prefixed_kind in ('r', 'p') then
      raise exception
        'Both public.% and public.% are tables; reconcile them before applying this migration',
        v_legacy_name,
        v_prefixed_name;
    elsif v_legacy_kind in ('r', 'p') and v_prefixed_kind is null then
      execute format(
        'alter table public.%I rename to %I',
        v_legacy_name,
        v_prefixed_name
      );
    end if;
  end loop;
end;
$migration$;

create table if not exists public.sc_arena_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  email text not null,
  company text not null,
  status text not null default 'pending',
  registered_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by text,
  spark_points integer not null default 0,
  constraint sc_arena_members_user_id_key unique (user_id),
  constraint sc_arena_members_email_key unique (email),
  constraint sc_arena_members_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint sc_arena_members_status_check
    check (status in ('pending', 'verified', 'rejected'))
);

create table if not exists public.sc_arena_perk_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null,
  member_email text not null,
  member_name text not null,
  project text not null,
  use_case text not null,
  supervisor_email text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by text,
  forwarded_at timestamptz,
  constraint sc_arena_perk_requests_member_id_fkey
    foreign key (member_id) references public.sc_arena_members(id) on delete cascade,
  constraint sc_arena_perk_requests_status_check
    check (status in ('pending', 'approved', 'forwarded', 'rejected'))
);

create table if not exists public.sc_arena_spark_hunt_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  member_id uuid not null,
  points integer not null,
  source text not null default 'mini_game',
  created_at timestamptz not null default now(),
  constraint sc_arena_spark_hunt_events_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint sc_arena_spark_hunt_events_member_id_fkey
    foreign key (member_id) references public.sc_arena_members(id) on delete cascade,
  constraint sc_arena_spark_hunt_events_points_check
    check (points > 0 and points <= 1000)
);

create table if not exists public.sc_arena_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  details text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sc_arena_email_logs (
  id uuid primary key default gen_random_uuid(),
  recipient text not null,
  subject text not null,
  body text not null,
  related_action text not null,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint sc_arena_email_logs_status_check
    check (status in ('queued', 'sent', 'failed'))
);

-- The live schema has both constraint-backed unique indexes and these explicit
-- indexes. Retain that lookup/uniqueness contract after a rename or fresh build.
create unique index if not exists sc_arena_members_email_lower_uidx
  on public.sc_arena_members (lower(email));
create unique index if not exists sc_arena_members_user_id_uidx
  on public.sc_arena_members (user_id);

alter table public.sc_arena_members enable row level security;
alter table public.sc_arena_perk_requests enable row level security;
alter table public.sc_arena_spark_hunt_events enable row level security;
alter table public.sc_arena_audit_logs enable row level security;
alter table public.sc_arena_email_logs enable row level security;

-- A renamed source table keeps its old policies. Replace all policies on these
-- owned tables so no expression continues to reference the legacy helper/table.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'sc_arena_members',
        'sc_arena_perk_requests',
        'sc_arena_spark_hunt_events',
        'sc_arena_audit_logs',
        'sc_arena_email_logs'
      )
  loop
    execute format(
      'drop policy %I on %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );
  end loop;
end;
$$;

create or replace function public.sc_arena_is_sparklabs_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select
      auth.uid() as user_id,
      lower(trim(coalesce(auth.jwt() ->> 'email', ''))) as email
  )
  select exists (
    select 1
    from public.sc_arena_members m
    cross join caller c
    where m.user_id = c.user_id
      and m.status = 'verified'
      and lower(trim(m.email)) = c.email
      and lower(trim(m.email)) like '%@sparklabs.co.kr'
      and c.email like '%@sparklabs.co.kr'
  )
$$;

revoke all on function public.sc_arena_is_sparklabs_admin()
from public, anon, authenticated;
grant execute on function public.sc_arena_is_sparklabs_admin()
to authenticated, service_role;

create policy sc_arena_audit_logs_select_admin
  on public.sc_arena_audit_logs
  for select
  to authenticated
  using ((select public.sc_arena_is_sparklabs_admin()));

create policy sc_arena_audit_logs_insert_admin
  on public.sc_arena_audit_logs
  for insert
  to authenticated
  with check ((select public.sc_arena_is_sparklabs_admin()));

create policy sc_arena_email_logs_select_admin
  on public.sc_arena_email_logs
  for select
  to authenticated
  using ((select public.sc_arena_is_sparklabs_admin()));

create policy sc_arena_email_logs_insert_admin
  on public.sc_arena_email_logs
  for insert
  to authenticated
  with check ((select public.sc_arena_is_sparklabs_admin()));

create policy sc_arena_email_logs_update_admin
  on public.sc_arena_email_logs
  for update
  to authenticated
  using ((select public.sc_arena_is_sparklabs_admin()))
  with check ((select public.sc_arena_is_sparklabs_admin()));

create policy sc_arena_members_select_own_or_admin
  on public.sc_arena_members
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.sc_arena_is_sparklabs_admin())
  );

create policy sc_arena_members_insert_own
  on public.sc_arena_members
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and nullif(trim(auth.jwt() ->> 'email'), '') is not null
    and lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
  );

create policy sc_arena_members_update_admin
  on public.sc_arena_members
  for update
  to authenticated
  using ((select public.sc_arena_is_sparklabs_admin()))
  with check ((select public.sc_arena_is_sparklabs_admin()));

create policy sc_arena_perk_requests_select_own_or_admin
  on public.sc_arena_perk_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.sc_arena_members m
      where m.id = sc_arena_perk_requests.member_id
        and m.user_id = (select auth.uid())
    )
    or (select public.sc_arena_is_sparklabs_admin())
  );

create policy sc_arena_perk_requests_insert_verified_member
  on public.sc_arena_perk_requests
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.sc_arena_members m
      where m.id = sc_arena_perk_requests.member_id
        and m.user_id = (select auth.uid())
        and m.status = 'verified'
    )
  );

create policy sc_arena_perk_requests_update_admin
  on public.sc_arena_perk_requests
  for update
  to authenticated
  using ((select public.sc_arena_is_sparklabs_admin()))
  with check ((select public.sc_arena_is_sparklabs_admin()));

create policy sc_arena_spark_hunt_events_select_own_or_admin
  on public.sc_arena_spark_hunt_events
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.sc_arena_is_sparklabs_admin())
  );

revoke all on table
  public.sc_arena_members,
  public.sc_arena_perk_requests,
  public.sc_arena_spark_hunt_events,
  public.sc_arena_audit_logs,
  public.sc_arena_email_logs
from public, anon, authenticated;

grant select, insert, update on table public.sc_arena_members to authenticated;
grant select, insert, update on table public.sc_arena_perk_requests to authenticated;
grant select on table public.sc_arena_spark_hunt_events to authenticated;
grant select, insert on table public.sc_arena_audit_logs to authenticated;
grant select, insert, update on table public.sc_arena_email_logs to authenticated;

grant all on table
  public.sc_arena_members,
  public.sc_arena_perk_requests,
  public.sc_arena_spark_hunt_events,
  public.sc_arena_audit_logs,
  public.sc_arena_email_logs
to service_role;

comment on table public.sc_arena_members is
  'SparkClaw AI Arena member verification and Spark Points profile.';
comment on table public.sc_arena_perk_requests is
  'SparkClaw AI Arena member perk requests.';
comment on table public.sc_arena_spark_hunt_events is
  'SparkClaw AI Arena Spark Hunt point-award events.';
comment on table public.sc_arena_audit_logs is
  'SparkClaw AI Arena application audit entries.';
comment on table public.sc_arena_email_logs is
  'SparkClaw AI Arena outbound email delivery log.';

commit;
