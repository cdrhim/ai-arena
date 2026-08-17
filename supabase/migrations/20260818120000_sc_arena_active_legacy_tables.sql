-- SparkClaw AI Arena: move the two active legacy tables under the sc_arena namespace.
-- A legacy-only database is upgraded in place. A fresh database creates the prefixed tables directly.

begin;

do $migration$
declare
  legacy_kind "char";
  prefixed_kind "char";
begin
  select c.relkind
    into legacy_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'arena_submissions';

  select c.relkind
    into prefixed_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'sc_arena_submissions';

  if prefixed_kind is not null and prefixed_kind not in ('r', 'p') then
    raise exception
      'public.sc_arena_submissions exists but is not a table.';
  elsif legacy_kind is not null and legacy_kind not in ('r', 'p', 'v') then
    raise exception
      'public.arena_submissions exists as an unsupported relation type.';
  elsif legacy_kind = 'v' and prefixed_kind is null then
    raise exception
      'public.arena_submissions is a compatibility view but public.sc_arena_submissions is missing.';
  elsif legacy_kind in ('r', 'p') and prefixed_kind in ('r', 'p') then
    raise exception
      'Both public.arena_submissions and public.sc_arena_submissions are tables; reconcile them before applying this migration.';
  elsif legacy_kind in ('r', 'p') and prefixed_kind is null then
    alter table public.arena_submissions rename to sc_arena_submissions;
    create view public.arena_submissions
      with (security_invoker = true)
      as select * from public.sc_arena_submissions;
  end if;

  legacy_kind := null;
  prefixed_kind := null;

  select c.relkind
    into legacy_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'arena_team_keywords';

  select c.relkind
    into prefixed_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'sc_arena_team_keywords';

  if prefixed_kind is not null and prefixed_kind not in ('r', 'p') then
    raise exception
      'public.sc_arena_team_keywords exists but is not a table.';
  elsif legacy_kind is not null and legacy_kind not in ('r', 'p', 'v') then
    raise exception
      'public.arena_team_keywords exists as an unsupported relation type.';
  elsif legacy_kind = 'v' and prefixed_kind is null then
    raise exception
      'public.arena_team_keywords is a compatibility view but public.sc_arena_team_keywords is missing.';
  elsif legacy_kind in ('r', 'p') and prefixed_kind in ('r', 'p') then
    raise exception
      'Both public.arena_team_keywords and public.sc_arena_team_keywords are tables; reconcile them before applying this migration.';
  elsif legacy_kind in ('r', 'p') and prefixed_kind is null then
    alter table public.arena_team_keywords rename to sc_arena_team_keywords;
    create view public.arena_team_keywords
      with (security_invoker = true)
      as select * from public.sc_arena_team_keywords;
  end if;
end
$migration$;

create table if not exists public.sc_arena_submissions (
  id text primary key,
  owner_id text not null,
  owner_email text not null,
  status text not null default 'draft',
  visibility text not null default 'private',
  slug text unique,
  name text not null default '',
  readiness_score integer not null default 0,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  constraint sc_arena_submissions_status_check check (
    status in ('draft', 'submitted', 'needs_changes', 'approved', 'published', 'archived')
  ),
  constraint sc_arena_submissions_visibility_check check (
    visibility in ('private', 'public')
  )
);

do $migration$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.sc_arena_submissions'::regclass
       and conname = 'arena_submissions_pkey'
  ) and not exists (
    select 1 from pg_constraint
     where conrelid = 'public.sc_arena_submissions'::regclass
       and conname = 'sc_arena_submissions_pkey'
  ) then
    alter table public.sc_arena_submissions
      rename constraint arena_submissions_pkey to sc_arena_submissions_pkey;
  end if;

  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.sc_arena_submissions'::regclass
       and conname = 'arena_submissions_slug_key'
  ) and not exists (
    select 1 from pg_constraint
     where conrelid = 'public.sc_arena_submissions'::regclass
       and conname = 'sc_arena_submissions_slug_key'
  ) then
    alter table public.sc_arena_submissions
      rename constraint arena_submissions_slug_key to sc_arena_submissions_slug_key;
  end if;

  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.sc_arena_submissions'::regclass
       and conname = 'arena_submissions_status_check'
  ) and not exists (
    select 1 from pg_constraint
     where conrelid = 'public.sc_arena_submissions'::regclass
       and conname = 'sc_arena_submissions_status_check'
  ) then
    alter table public.sc_arena_submissions
      rename constraint arena_submissions_status_check to sc_arena_submissions_status_check;
  end if;

  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.sc_arena_submissions'::regclass
       and conname = 'arena_submissions_visibility_check'
  ) and not exists (
    select 1 from pg_constraint
     where conrelid = 'public.sc_arena_submissions'::regclass
       and conname = 'sc_arena_submissions_visibility_check'
  ) then
    alter table public.sc_arena_submissions
      rename constraint arena_submissions_visibility_check to sc_arena_submissions_visibility_check;
  end if;

  if to_regclass('public.sc_arena_submissions_owner_idx') is null
     and to_regclass('public.arena_submissions_owner_idx') is not null then
    alter index public.arena_submissions_owner_idx rename to sc_arena_submissions_owner_idx;
  end if;
  if to_regclass('public.sc_arena_submissions_owner_email_idx') is null
     and to_regclass('public.arena_submissions_owner_email_idx') is not null then
    alter index public.arena_submissions_owner_email_idx rename to sc_arena_submissions_owner_email_idx;
  end if;
  if to_regclass('public.sc_arena_submissions_status_idx') is null
     and to_regclass('public.arena_submissions_status_idx') is not null then
    alter index public.arena_submissions_status_idx rename to sc_arena_submissions_status_idx;
  end if;
  if to_regclass('public.sc_arena_submissions_visibility_idx') is null
     and to_regclass('public.arena_submissions_visibility_idx') is not null then
    alter index public.arena_submissions_visibility_idx rename to sc_arena_submissions_visibility_idx;
  end if;
  if to_regclass('public.sc_arena_submissions_updated_idx') is null
     and to_regclass('public.arena_submissions_updated_idx') is not null then
    alter index public.arena_submissions_updated_idx rename to sc_arena_submissions_updated_idx;
  end if;
  if to_regclass('public.sc_arena_submissions_payload_gin_idx') is null
     and to_regclass('public.arena_submissions_payload_gin_idx') is not null then
    alter index public.arena_submissions_payload_gin_idx rename to sc_arena_submissions_payload_gin_idx;
  end if;
end
$migration$;

create index if not exists sc_arena_submissions_owner_idx
  on public.sc_arena_submissions (owner_id);
create index if not exists sc_arena_submissions_owner_email_idx
  on public.sc_arena_submissions (owner_email);
create index if not exists sc_arena_submissions_status_idx
  on public.sc_arena_submissions (status);
create index if not exists sc_arena_submissions_visibility_idx
  on public.sc_arena_submissions (visibility);
create index if not exists sc_arena_submissions_updated_idx
  on public.sc_arena_submissions (updated_at desc);
create index if not exists sc_arena_submissions_payload_gin_idx
  on public.sc_arena_submissions using gin (payload);

alter table public.sc_arena_submissions enable row level security;
alter table public.sc_arena_submissions force row level security;

create or replace function public.is_sparklabs_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users staff_user
    where staff_user.id = (select auth.uid())
      and staff_user.email_confirmed_at is not null
      and lower(coalesce(staff_user.email, '')) like '%@sparklabs.co.kr'
  )
$$;

revoke all on function public.is_sparklabs_staff() from public, anon;
grant execute on function public.is_sparklabs_staff() to authenticated, service_role;

drop policy if exists "arena submissions read own public staff" on public.sc_arena_submissions;
drop policy if exists "sc arena submissions read own public staff" on public.sc_arena_submissions;
create policy "sc arena submissions read own public staff"
on public.sc_arena_submissions
for select
using (
  public.is_sparklabs_staff()
  or (
    owner_id = (select auth.uid())::text
    and lower(owner_email) = lower((select auth.jwt()) ->> 'email')
  )
);

drop policy if exists "arena submissions insert own" on public.sc_arena_submissions;
drop policy if exists "sc arena submissions insert own" on public.sc_arena_submissions;
create policy "sc arena submissions insert own"
on public.sc_arena_submissions
for insert
with check (
  public.is_sparklabs_staff()
  or (
    owner_id = (select auth.uid())::text
    and lower(owner_email) = lower((select auth.jwt()) ->> 'email')
    and status = 'draft'
    and visibility = 'private'
    and submitted_at is null
    and approved_at is null
    and published_at is null
    and coalesce(payload ->> 'id', '') = id
    and coalesce(payload ->> 'ownerId', '') = owner_id
    and lower(coalesce(payload ->> 'ownerEmail', '')) = lower(owner_email)
    and coalesce(payload ->> 'status', 'draft') = 'draft'
    and coalesce(payload ->> 'visibility', 'private') = 'private'
    and coalesce((payload ->> 'arenaScore')::numeric, 0) = 0
  )
);

drop policy if exists "arena submissions update own drafts" on public.sc_arena_submissions;
drop policy if exists "sc arena submissions update own drafts" on public.sc_arena_submissions;
create policy "sc arena submissions update own drafts"
on public.sc_arena_submissions
for update
using (
  public.is_sparklabs_staff()
  or (
    owner_id = (select auth.uid())::text
    and lower(owner_email) = lower((select auth.jwt()) ->> 'email')
    and status = 'draft'
    and visibility = 'private'
  )
)
with check (
  public.is_sparklabs_staff()
  or (
    owner_id = (select auth.uid())::text
    and lower(owner_email) = lower((select auth.jwt()) ->> 'email')
    and status = 'draft'
    and visibility = 'private'
    and submitted_at is null
    and approved_at is null
    and published_at is null
    and coalesce(payload ->> 'id', '') = id
    and coalesce(payload ->> 'ownerId', '') = owner_id
    and lower(coalesce(payload ->> 'ownerEmail', '')) = lower(owner_email)
    and coalesce(payload ->> 'status', 'draft') = 'draft'
    and coalesce(payload ->> 'visibility', 'private') = 'private'
    and coalesce((payload ->> 'arenaScore')::numeric, 0) = 0
  )
);

drop policy if exists "arena submissions delete staff only" on public.sc_arena_submissions;
drop policy if exists "sc arena submissions delete staff only" on public.sc_arena_submissions;
create policy "sc arena submissions delete staff only"
on public.sc_arena_submissions
for delete
using (public.is_sparklabs_staff());

revoke all on table public.sc_arena_submissions from public, anon, authenticated;
grant select, insert, update, delete on table public.sc_arena_submissions to authenticated;
grant all on table public.sc_arena_submissions to service_role;

create table if not exists public.sc_arena_team_keywords (
  team_id uuid primary key,
  company_name text not null,
  service_name text not null default '',
  keywords text[] not null default '{}',
  keyword_version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint sc_arena_team_keywords_has_keywords check (cardinality(keywords) > 0)
);

do $migration$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.sc_arena_team_keywords'::regclass
       and conname = 'arena_team_keywords_pkey'
  ) and not exists (
    select 1 from pg_constraint
     where conrelid = 'public.sc_arena_team_keywords'::regclass
       and conname = 'sc_arena_team_keywords_pkey'
  ) then
    alter table public.sc_arena_team_keywords
      rename constraint arena_team_keywords_pkey to sc_arena_team_keywords_pkey;
  end if;

  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.sc_arena_team_keywords'::regclass
       and conname = 'arena_team_keywords_has_keywords'
  ) and not exists (
    select 1 from pg_constraint
     where conrelid = 'public.sc_arena_team_keywords'::regclass
       and conname = 'sc_arena_team_keywords_has_keywords'
  ) then
    alter table public.sc_arena_team_keywords
      rename constraint arena_team_keywords_has_keywords to sc_arena_team_keywords_has_keywords;
  end if;
end
$migration$;

alter table public.sc_arena_team_keywords enable row level security;
alter table public.sc_arena_team_keywords force row level security;

drop policy if exists "Public can read safe team keywords" on public.sc_arena_team_keywords;
drop policy if exists "sc arena team keywords public read" on public.sc_arena_team_keywords;

revoke all on table public.sc_arena_team_keywords from public, anon, authenticated;
grant all on table public.sc_arena_team_keywords to service_role;

comment on table public.sc_arena_team_keywords is
  'Public-safe company and service keywords used for deterministic AI Arena collaboration matching.';

do $migration$
declare
  relation_kind "char";
begin
  select c.relkind
    into relation_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'arena_submissions';

  if relation_kind = 'v' then
    revoke all on table public.arena_submissions from public, anon, authenticated;
    grant select, insert, update, delete on table public.arena_submissions to authenticated;
    grant all on table public.arena_submissions to service_role;
    comment on view public.arena_submissions is
      'Compatibility view for clients migrating to public.sc_arena_submissions.';
  end if;

  relation_kind := null;

  select c.relkind
    into relation_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'arena_team_keywords';

  if relation_kind = 'v' then
    revoke all on table public.arena_team_keywords from public, anon, authenticated;
    grant all on table public.arena_team_keywords to service_role;
    comment on view public.arena_team_keywords is
      'Compatibility view for clients migrating to public.sc_arena_team_keywords.';
  end if;
end
$migration$;

commit;
