-- SparkClaw AI Arena activity ledger
-- Target: the Supabase project used by SUPABASE_URL (Arena Auth), not the separate Program DB.
-- Naming rule: every new AI Arena table uses the public.sc_arena_ prefix.

begin;

create schema if not exists sc_arena_private;
revoke all on schema sc_arena_private from public, anon, authenticated;
grant usage on schema sc_arena_private to authenticated;

create table if not exists public.sc_arena_workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  name text not null check (char_length(name) between 1 and 160),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sc_arena_organizations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sc_arena_workspaces(id) on delete restrict,
  external_source text not null check (char_length(external_source) between 1 and 80),
  external_key text not null check (char_length(external_key) between 1 and 160),
  name text not null check (char_length(name) between 1 and 240),
  organization_type text not null default 'startup'
    check (organization_type in ('startup', 'partner', 'operator', 'validator', 'other')),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, external_source, external_key),
  unique (workspace_id, id)
);

create table if not exists public.sc_arena_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sc_arena_workspaces(id) on delete cascade,
  organization_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('claw_member', 'partner', 'staff', 'admin', 'human_validator')),
  status text not null default 'active' check (status in ('active', 'inactive', 'revoked')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  foreign key (workspace_id, organization_id)
    references public.sc_arena_organizations(workspace_id, id)
    on delete set null (organization_id)
);

create table if not exists public.sc_arena_entities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sc_arena_workspaces(id) on delete cascade,
  organization_id uuid,
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  source_system text not null check (char_length(source_system) between 1 and 80),
  source_key text not null check (char_length(source_key) between 1 and 200),
  label text not null default '' check (char_length(label) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, source_system, entity_type, source_key),
  unique (workspace_id, id),
  foreign key (workspace_id, organization_id)
    references public.sc_arena_organizations(workspace_id, id)
    on delete set null (organization_id)
);

create table if not exists public.sc_arena_activity_event_types (
  event_type text primary key check (event_type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  domain text not null check (domain in ('discover', 'community', 'bounty', 'system')),
  label text not null check (char_length(label) between 1 and 120),
  default_retention_days integer check (default_retention_days is null or default_retention_days >= 30),
  created_at timestamptz not null default now()
);

create table if not exists public.sc_arena_activity_events (
  id bigint generated always as identity primary key,
  event_uid uuid not null default gen_random_uuid() unique,
  workspace_id uuid not null references public.sc_arena_workspaces(id) on delete restrict,
  event_type text not null references public.sc_arena_activity_event_types(event_type) on delete restrict,
  domain text generated always as (split_part(event_type, '.', 1)) stored,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_organization_id uuid,
  actor_label text not null default 'System' check (char_length(actor_label) between 1 and 160),
  actor_role text not null default 'system' check (char_length(actor_role) between 1 and 40),
  primary_entity_id uuid,
  audience_scope text not null default 'actor_only'
    check (audience_scope in ('actor_only', 'participants', 'organization', 'staff', 'participants_and_staff')),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null default '' check (char_length(summary) <= 1000),
  route_target text not null default 'workspace' check (char_length(route_target) between 1 and 80),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
    check (octet_length(metadata::text) <= 8192),
  source_system text not null check (char_length(source_system) between 1 and 80),
  source_event_id text not null check (char_length(source_event_id) between 1 and 240),
  correlation_uid uuid,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  retention_until timestamptz,
  unique (workspace_id, source_system, source_event_id),
  unique (workspace_id, id),
  foreign key (workspace_id, actor_organization_id)
    references public.sc_arena_organizations(workspace_id, id)
    on delete set null (actor_organization_id),
  foreign key (workspace_id, primary_entity_id)
    references public.sc_arena_entities(workspace_id, id) on delete restrict
);

create table if not exists public.sc_arena_activity_event_entities (
  workspace_id uuid not null,
  event_id bigint not null,
  entity_id uuid not null,
  relation_type text not null check (relation_type in ('subject', 'target', 'parent', 'context')),
  position smallint not null default 0 check (position >= 0),
  primary key (event_id, entity_id, relation_type),
  foreign key (workspace_id, event_id)
    references public.sc_arena_activity_events(workspace_id, id) on delete cascade,
  foreign key (workspace_id, entity_id)
    references public.sc_arena_entities(workspace_id, id) on delete restrict
);

create table if not exists public.sc_arena_activity_viewers (
  workspace_id uuid not null,
  event_id bigint not null,
  viewer_user_id uuid not null references auth.users(id) on delete cascade,
  viewer_reason text not null default 'participant'
    check (viewer_reason in ('actor', 'participant', 'content_owner', 'requester', 'target', 'staff')),
  created_at timestamptz not null default now(),
  primary key (event_id, viewer_user_id),
  foreign key (workspace_id, event_id)
    references public.sc_arena_activity_events(workspace_id, id) on delete cascade
);

create table if not exists public.sc_arena_activity_user_state (
  workspace_id uuid not null,
  event_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz,
  read_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (workspace_id, event_id)
    references public.sc_arena_activity_events(workspace_id, id) on delete cascade
);

insert into public.sc_arena_workspaces (id, slug, name)
values ('00000000-0000-4000-8000-000000000001', 'sparkclaw-ai-arena', 'SparkClaw AI Arena')
on conflict (slug) do update set name = excluded.name, updated_at = now();

insert into public.sc_arena_activity_event_types (event_type, domain, label, default_retention_days)
values
  ('discover.connection_requested', 'discover', '기업 연결 요청', 1095),
  ('discover.connection_status_changed', 'discover', '기업 연결 상태 변경', 1095),
  ('discover.collaboration_review_requested', 'discover', '협업 검토 요청', 1095),
  ('discover.collaboration_review_responded', 'discover', '협업 검토 응답', 1095),
  ('discover.tech_passport_updated', 'discover', '기술 프로필 업데이트', 1095),
  ('community.post_created', 'community', 'Community 글 작성', 1095),
  ('community.comment_created', 'community', 'Community 댓글 작성', 1095),
  ('community.reaction_added', 'community', 'Community 반응', 365),
  ('bounty.brief_created', 'bounty', 'Bounty Brief 등록', 2555),
  ('bounty.brief_status_changed', 'bounty', 'Bounty Brief 상태 변경', 2555),
  ('bounty.application_submitted', 'bounty', 'Bounty 결과 제출', 2555),
  ('bounty.application_status_changed', 'bounty', 'Bounty 제출 상태 변경', 2555),
  ('bounty.opportunity_created', 'bounty', 'Bounty 기회 생성', 2555),
  ('bounty.opportunity_status_changed', 'bounty', 'Bounty 기회 상태 변경', 2555)
on conflict (event_type) do update
set domain = excluded.domain,
    label = excluded.label,
    default_retention_days = excluded.default_retention_days;

create index if not exists sc_arena_organizations_workspace_name_idx
  on public.sc_arena_organizations (workspace_id, name);
create index if not exists sc_arena_memberships_user_workspace_idx
  on public.sc_arena_memberships (user_id, workspace_id, status, role);
create index if not exists sc_arena_memberships_org_workspace_idx
  on public.sc_arena_memberships (organization_id, workspace_id, status)
  where organization_id is not null;
create index if not exists sc_arena_entities_org_idx
  on public.sc_arena_entities (organization_id, id)
  where organization_id is not null;
create index if not exists sc_arena_activity_workspace_time_idx
  on public.sc_arena_activity_events (workspace_id, occurred_at desc, id desc);
create index if not exists sc_arena_activity_domain_time_idx
  on public.sc_arena_activity_events (workspace_id, domain, occurred_at desc, id desc);
create index if not exists sc_arena_activity_actor_time_idx
  on public.sc_arena_activity_events (actor_user_id, occurred_at desc, id desc)
  where actor_user_id is not null;
create index if not exists sc_arena_activity_retention_idx
  on public.sc_arena_activity_events (retention_until, id)
  where retention_until is not null;
create index if not exists sc_arena_activity_entities_entity_event_idx
  on public.sc_arena_activity_event_entities (entity_id, event_id desc);
create index if not exists sc_arena_activity_viewers_user_event_idx
  on public.sc_arena_activity_viewers (viewer_user_id, event_id desc);
create index if not exists sc_arena_activity_user_state_unread_idx
  on public.sc_arena_activity_user_state (user_id, event_id desc)
  where read_at is null;

create or replace function sc_arena_private.user_is_workspace_staff(
  p_workspace_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_user_id = (select auth.uid())
    and exists (
    select 1
    from public.sc_arena_memberships m
    where m.workspace_id = p_workspace_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and m.role in ('staff', 'admin')
  );
$$;

create or replace function sc_arena_private.can_view_activity_event(
  p_event_id bigint,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_actor_organization_id uuid,
  p_audience_scope text,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.sc_arena_memberships active_membership
      where active_membership.workspace_id = p_workspace_id
        and active_membership.user_id = p_user_id
        and active_membership.status = 'active'
    )
    and (
      p_actor_user_id = p_user_id
      or exists (
        select 1
        from public.sc_arena_activity_viewers v
        where v.workspace_id = p_workspace_id
          and v.event_id = p_event_id
          and v.viewer_user_id = p_user_id
      )
      or (
        p_audience_scope in ('organization', 'participants', 'participants_and_staff')
        and p_actor_organization_id is not null
        and exists (
          select 1
          from public.sc_arena_memberships m
          where m.workspace_id = p_workspace_id
            and m.organization_id = p_actor_organization_id
            and m.user_id = p_user_id
            and m.status = 'active'
        )
      )
      or (
        p_audience_scope in ('participants', 'participants_and_staff')
        and exists (
          select 1
          from public.sc_arena_activity_event_entities ee
          join public.sc_arena_entities e
            on e.workspace_id = ee.workspace_id and e.id = ee.entity_id
          join public.sc_arena_memberships m
            on m.workspace_id = e.workspace_id
           and m.organization_id = e.organization_id
          where ee.workspace_id = p_workspace_id
            and ee.event_id = p_event_id
            and ee.relation_type in ('subject', 'target')
            and e.entity_type = 'organization'
            and e.organization_id is not null
            and m.user_id = p_user_id
            and m.status = 'active'
        )
      )
      or (
        p_audience_scope in ('staff', 'participants_and_staff')
        and sc_arena_private.user_is_workspace_staff(p_workspace_id, p_user_id)
      )
    );
$$;

revoke all on function sc_arena_private.user_is_workspace_staff(uuid, uuid) from public, anon;
revoke all on function sc_arena_private.can_view_activity_event(bigint, uuid, uuid, uuid, text, uuid) from public, anon;
grant execute on function sc_arena_private.user_is_workspace_staff(uuid, uuid) to authenticated;
grant execute on function sc_arena_private.can_view_activity_event(bigint, uuid, uuid, uuid, text, uuid) to authenticated;

alter table public.sc_arena_workspaces enable row level security;
alter table public.sc_arena_organizations enable row level security;
alter table public.sc_arena_memberships enable row level security;
alter table public.sc_arena_entities enable row level security;
alter table public.sc_arena_activity_event_types enable row level security;
alter table public.sc_arena_activity_events enable row level security;
alter table public.sc_arena_activity_event_entities enable row level security;
alter table public.sc_arena_activity_viewers enable row level security;
alter table public.sc_arena_activity_user_state enable row level security;

alter table public.sc_arena_activity_events force row level security;
alter table public.sc_arena_activity_event_entities force row level security;
alter table public.sc_arena_activity_viewers force row level security;
alter table public.sc_arena_activity_user_state force row level security;
alter table public.sc_arena_workspaces force row level security;
alter table public.sc_arena_organizations force row level security;
alter table public.sc_arena_memberships force row level security;
alter table public.sc_arena_entities force row level security;
alter table public.sc_arena_activity_event_types force row level security;

drop policy if exists sc_arena_workspaces_select on public.sc_arena_workspaces;
create policy sc_arena_workspaces_select on public.sc_arena_workspaces
for select to authenticated
using (
  exists (
    select 1 from public.sc_arena_memberships m
    where m.workspace_id = sc_arena_workspaces.id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists sc_arena_memberships_select on public.sc_arena_memberships;
create policy sc_arena_memberships_select on public.sc_arena_memberships
for select to authenticated
using (
  user_id = (select auth.uid())
  or sc_arena_private.user_is_workspace_staff(workspace_id, (select auth.uid()))
);

drop policy if exists sc_arena_organizations_select on public.sc_arena_organizations;
create policy sc_arena_organizations_select on public.sc_arena_organizations
for select to authenticated
using (
  exists (
    select 1 from public.sc_arena_memberships m
    where m.workspace_id = sc_arena_organizations.workspace_id
      and m.organization_id = sc_arena_organizations.id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
  or sc_arena_private.user_is_workspace_staff(workspace_id, (select auth.uid()))
);

drop policy if exists sc_arena_activity_types_select on public.sc_arena_activity_event_types;
create policy sc_arena_activity_types_select on public.sc_arena_activity_event_types
for select to authenticated using (true);

drop policy if exists sc_arena_activity_events_select on public.sc_arena_activity_events;
create policy sc_arena_activity_events_select on public.sc_arena_activity_events
for select to authenticated
using (
  sc_arena_private.can_view_activity_event(
    id,
    workspace_id,
    actor_user_id,
    actor_organization_id,
    audience_scope,
    (select auth.uid())
  )
);

drop policy if exists sc_arena_entities_select on public.sc_arena_entities;
create policy sc_arena_entities_select on public.sc_arena_entities
for select to authenticated
using (
  exists (
    select 1
    from public.sc_arena_activity_event_entities ee
    join public.sc_arena_activity_events ae
      on ae.workspace_id = ee.workspace_id and ae.id = ee.event_id
    where ee.workspace_id = sc_arena_entities.workspace_id
      and ee.entity_id = sc_arena_entities.id
      and sc_arena_private.can_view_activity_event(
        ae.id, ae.workspace_id, ae.actor_user_id, ae.actor_organization_id,
        ae.audience_scope, (select auth.uid())
      )
  )
);

drop policy if exists sc_arena_activity_event_entities_select on public.sc_arena_activity_event_entities;
create policy sc_arena_activity_event_entities_select on public.sc_arena_activity_event_entities
for select to authenticated
using (
  exists (
    select 1
    from public.sc_arena_activity_events ae
    where ae.workspace_id = sc_arena_activity_event_entities.workspace_id
      and ae.id = sc_arena_activity_event_entities.event_id
      and sc_arena_private.can_view_activity_event(
        ae.id, ae.workspace_id, ae.actor_user_id, ae.actor_organization_id,
        ae.audience_scope, (select auth.uid())
      )
  )
);

drop policy if exists sc_arena_activity_viewers_select on public.sc_arena_activity_viewers;
create policy sc_arena_activity_viewers_select on public.sc_arena_activity_viewers
for select to authenticated
using (viewer_user_id = (select auth.uid()));

drop policy if exists sc_arena_activity_user_state_select on public.sc_arena_activity_user_state;
create policy sc_arena_activity_user_state_select on public.sc_arena_activity_user_state
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists sc_arena_activity_user_state_insert on public.sc_arena_activity_user_state;
create policy sc_arena_activity_user_state_insert on public.sc_arena_activity_user_state
for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.sc_arena_activity_events ae
    where ae.workspace_id = sc_arena_activity_user_state.workspace_id
      and ae.id = sc_arena_activity_user_state.event_id
      and sc_arena_private.can_view_activity_event(
        ae.id, ae.workspace_id, ae.actor_user_id, ae.actor_organization_id,
        ae.audience_scope, (select auth.uid())
      )
  )
);
drop policy if exists sc_arena_activity_user_state_update on public.sc_arena_activity_user_state;
create policy sc_arena_activity_user_state_update on public.sc_arena_activity_user_state
for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.sc_arena_activity_events ae
    where ae.workspace_id = sc_arena_activity_user_state.workspace_id
      and ae.id = sc_arena_activity_user_state.event_id
      and sc_arena_private.can_view_activity_event(
        ae.id, ae.workspace_id, ae.actor_user_id, ae.actor_organization_id,
        ae.audience_scope, (select auth.uid())
      )
  )
);

revoke all on
  public.sc_arena_workspaces,
  public.sc_arena_organizations,
  public.sc_arena_memberships,
  public.sc_arena_entities,
  public.sc_arena_activity_event_types,
  public.sc_arena_activity_events,
  public.sc_arena_activity_event_entities,
  public.sc_arena_activity_viewers,
  public.sc_arena_activity_user_state
from anon, authenticated;

grant select on
  public.sc_arena_workspaces,
  public.sc_arena_organizations,
  public.sc_arena_memberships,
  public.sc_arena_entities,
  public.sc_arena_activity_event_types,
  public.sc_arena_activity_events,
  public.sc_arena_activity_event_entities,
  public.sc_arena_activity_viewers,
  public.sc_arena_activity_user_state
to authenticated;
grant insert, update on public.sc_arena_activity_user_state to authenticated;

-- service_role bypasses RLS, so it receives no direct DML on any Arena table.
-- Server writes and maintenance must use the approved SECURITY DEFINER RPCs.
revoke insert, update, delete, truncate on
  public.sc_arena_workspaces,
  public.sc_arena_organizations,
  public.sc_arena_memberships,
  public.sc_arena_entities,
  public.sc_arena_activity_event_types,
  public.sc_arena_activity_events,
  public.sc_arena_activity_event_entities,
  public.sc_arena_activity_viewers,
  public.sc_arena_activity_user_state
from service_role;

create or replace function public.sc_arena_sync_membership(
  p_user_id uuid,
  p_role text,
  p_organization_source text default null,
  p_organization_key text default null,
  p_organization_name text default null,
  p_organization_type text default 'other',
  p_workspace_slug text default 'sparkclaw-ai-arena'
)
returns table (workspace_id uuid, organization_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_organization_id uuid;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;
  if p_role not in ('claw_member', 'partner', 'staff', 'admin', 'human_validator') then
    raise exception 'unsupported Arena membership role';
  end if;

  select w.id into v_workspace_id
  from public.sc_arena_workspaces w
  where w.slug = p_workspace_slug and w.status = 'active';
  if v_workspace_id is null then raise exception 'Arena workspace not found'; end if;

  -- A passive read must never reactivate or mutate a membership that an
  -- operator explicitly revoked.
  select m.organization_id into v_organization_id
  from public.sc_arena_memberships m
  where m.workspace_id = v_workspace_id
    and m.user_id = p_user_id
    and m.status = 'revoked';
  if found then
    return query select v_workspace_id, v_organization_id;
    return;
  end if;

  -- arena_user is a non-authoritative fallback for a signed-in Claw Member.
  -- Never let that fallback displace an already resolved Program DB or other
  -- official organization; a later official sync may replace arena_user.
  if left(coalesce(trim(p_organization_source), ''), 80) = 'arena_user' then
    select m.organization_id into v_organization_id
    from public.sc_arena_memberships m
    join public.sc_arena_organizations o
      on o.workspace_id = m.workspace_id and o.id = m.organization_id
    where m.workspace_id = v_workspace_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and o.external_source <> 'arena_user';
  end if;

  if v_organization_id is null
     and nullif(trim(p_organization_source), '') is not null
     and nullif(trim(p_organization_key), '') is not null then
    insert into public.sc_arena_organizations (
      workspace_id, external_source, external_key, name, organization_type
    ) values (
      v_workspace_id,
      left(trim(p_organization_source), 80),
      left(trim(p_organization_key), 160),
      left(coalesce(nullif(trim(p_organization_name), ''), trim(p_organization_key)), 240),
      case when p_organization_type in ('startup', 'partner', 'operator', 'validator', 'other')
        then p_organization_type else 'other' end
    )
    on conflict (workspace_id, external_source, external_key) do update
    set name = excluded.name,
        organization_type = excluded.organization_type,
        status = 'active',
        updated_at = now()
    returning id into v_organization_id;
  end if;

  insert into public.sc_arena_memberships (
    workspace_id, organization_id, user_id, role, status, last_seen_at
  ) values (
    v_workspace_id, v_organization_id, p_user_id, p_role, 'active', now()
  )
  on conflict (workspace_id, user_id) do update
  set organization_id = case
        when public.sc_arena_memberships.status = 'revoked'
          then public.sc_arena_memberships.organization_id
        when left(coalesce(trim(p_organization_source), ''), 80) = 'arena_user'
          and exists (
            select 1
            from public.sc_arena_organizations current_organization
            where current_organization.workspace_id = public.sc_arena_memberships.workspace_id
              and current_organization.id = public.sc_arena_memberships.organization_id
              and current_organization.external_source <> 'arena_user'
          )
          then public.sc_arena_memberships.organization_id
        else coalesce(excluded.organization_id, public.sc_arena_memberships.organization_id)
      end,
      role = case
        when public.sc_arena_memberships.status = 'revoked'
          then public.sc_arena_memberships.role
        else excluded.role
      end,
      status = case
        when public.sc_arena_memberships.status = 'revoked' then 'revoked'
        else 'active'
      end,
      last_seen_at = now(),
      updated_at = now()
  returning organization_id into v_organization_id;

  return query select v_workspace_id, v_organization_id;
end;
$$;

create or replace function public.sc_arena_append_activity(
  p_event_type text,
  p_source_system text,
  p_source_event_id text,
  p_actor_user_id uuid,
  p_actor_label text,
  p_actor_role text,
  p_actor_organization_source text,
  p_actor_organization_key text,
  p_actor_organization_name text,
  p_actor_organization_type text,
  p_primary_entity_type text,
  p_primary_entity_key text,
  p_primary_entity_label text,
  p_audience_scope text,
  p_title text,
  p_summary text,
  p_route_target text,
  p_metadata jsonb default '{}'::jsonb,
  p_related_entities jsonb default '[]'::jsonb,
  p_viewer_user_ids uuid[] default '{}'::uuid[],
  p_occurred_at timestamptz default now(),
  p_workspace_slug text default 'sparkclaw-ai-arena'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_actor_organization_id uuid;
  v_primary_entity_id uuid;
  v_event_id bigint;
  v_related jsonb;
  v_related_org_id uuid;
  v_related_entity_id uuid;
  v_viewer_id uuid;
  v_retention_days integer;
begin
  if not exists (
    select 1 from public.sc_arena_activity_event_types t where t.event_type = p_event_type
  ) then raise exception 'unsupported Arena activity event type'; end if;
  if p_actor_user_id is null then raise exception 'Arena activity actor is required'; end if;
  if nullif(trim(p_source_system), '') is null then raise exception 'Arena activity source is required'; end if;
  if nullif(trim(p_source_event_id), '') is null then raise exception 'Arena source event ID is required'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Arena activity title is required'; end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Arena activity metadata must be an object';
  end if;
  if jsonb_typeof(coalesce(p_related_entities, '[]'::jsonb)) <> 'array' then
    raise exception 'Arena related entities must be an array';
  end if;

  select m.workspace_id, m.organization_id
    into v_workspace_id, v_actor_organization_id
  from public.sc_arena_sync_membership(
    p_actor_user_id,
    p_actor_role,
    p_actor_organization_source,
    p_actor_organization_key,
    p_actor_organization_name,
    p_actor_organization_type,
    p_workspace_slug
  ) m;

  if not exists (
    select 1
    from public.sc_arena_memberships active_membership
    where active_membership.workspace_id = v_workspace_id
      and active_membership.user_id = p_actor_user_id
      and active_membership.status = 'active'
  ) then
    raise exception 'Arena membership is not active';
  end if;

  if nullif(trim(p_primary_entity_type), '') is not null
     and nullif(trim(p_primary_entity_key), '') is not null then
    insert into public.sc_arena_entities (
      workspace_id, organization_id, entity_type, source_system, source_key, label
    ) values (
      v_workspace_id,
      v_actor_organization_id,
      left(trim(p_primary_entity_type), 80),
      left(trim(p_source_system), 80),
      left(trim(p_primary_entity_key), 200),
      left(coalesce(p_primary_entity_label, ''), 240)
    )
    on conflict (workspace_id, source_system, entity_type, source_key) do update
    set label = excluded.label,
        updated_at = now()
    returning id into v_primary_entity_id;
  end if;

  select t.default_retention_days into v_retention_days
  from public.sc_arena_activity_event_types t where t.event_type = p_event_type;

  insert into public.sc_arena_activity_events (
    workspace_id, event_type, actor_user_id, actor_organization_id,
    actor_label, actor_role, primary_entity_id, audience_scope,
    title, summary, route_target, metadata,
    source_system, source_event_id, occurred_at, retention_until
  ) values (
    v_workspace_id,
    p_event_type,
    p_actor_user_id,
    v_actor_organization_id,
    left(coalesce(nullif(trim(p_actor_label), ''), 'System'), 160),
    left(coalesce(nullif(trim(p_actor_role), ''), 'system'), 40),
    v_primary_entity_id,
    case when p_audience_scope in ('actor_only', 'participants', 'organization', 'staff', 'participants_and_staff')
      then p_audience_scope else 'actor_only' end,
    left(trim(p_title), 200),
    left(coalesce(p_summary, ''), 1000),
    left(coalesce(nullif(trim(p_route_target), ''), 'workspace'), 80),
    coalesce(p_metadata, '{}'::jsonb),
    left(trim(p_source_system), 80),
    left(trim(p_source_event_id), 240),
    coalesce(p_occurred_at, now()),
    case when v_retention_days is null then null
      else coalesce(p_occurred_at, now()) + make_interval(days => v_retention_days) end
  )
  on conflict (workspace_id, source_system, source_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select e.id into v_event_id
    from public.sc_arena_activity_events e
    where e.workspace_id = v_workspace_id
      and e.source_system = left(trim(p_source_system), 80)
      and e.source_event_id = left(trim(p_source_event_id), 240);
    return v_event_id;
  end if;

  if v_primary_entity_id is not null then
    insert into public.sc_arena_activity_event_entities (
      workspace_id, event_id, entity_id, relation_type, position
    ) values (v_workspace_id, v_event_id, v_primary_entity_id, 'subject', 0)
    on conflict do nothing;
  end if;

  for v_related in select value from jsonb_array_elements(coalesce(p_related_entities, '[]'::jsonb)) loop
    v_related_org_id := null;
    v_related_entity_id := null;
    if nullif(trim(v_related->>'organization_source'), '') is not null
       and nullif(trim(v_related->>'organization_key'), '') is not null then
      insert into public.sc_arena_organizations (
        workspace_id, external_source, external_key, name, organization_type
      ) values (
        v_workspace_id,
        left(trim(v_related->>'organization_source'), 80),
        left(trim(v_related->>'organization_key'), 160),
        left(coalesce(nullif(trim(v_related->>'organization_name'), ''), trim(v_related->>'organization_key')), 240),
        case when v_related->>'organization_type' in ('startup', 'partner', 'operator', 'validator', 'other')
          then v_related->>'organization_type' else 'other' end
      )
      on conflict (workspace_id, external_source, external_key) do update
      set name = excluded.name,
          organization_type = excluded.organization_type,
          updated_at = now()
      returning id into v_related_org_id;
    end if;

    if nullif(trim(v_related->>'entity_type'), '') is not null
       and nullif(trim(v_related->>'source_key'), '') is not null then
      insert into public.sc_arena_entities (
        workspace_id, organization_id, entity_type, source_system, source_key, label
      ) values (
        v_workspace_id,
        v_related_org_id,
        left(trim(v_related->>'entity_type'), 80),
        left(coalesce(nullif(trim(v_related->>'source_system'), ''), trim(p_source_system)), 80),
        left(trim(v_related->>'source_key'), 200),
        left(coalesce(v_related->>'label', ''), 240)
      )
      on conflict (workspace_id, source_system, entity_type, source_key) do update
      set organization_id = coalesce(excluded.organization_id, public.sc_arena_entities.organization_id),
          label = excluded.label,
          updated_at = now()
      returning id into v_related_entity_id;

      insert into public.sc_arena_activity_event_entities (
        workspace_id, event_id, entity_id, relation_type, position
      )
      values (
        v_workspace_id,
        v_event_id,
        v_related_entity_id,
        case when v_related->>'relation_type' in ('subject', 'target', 'parent', 'context')
          then v_related->>'relation_type' else 'context' end,
        case
          when coalesce(v_related->>'position', '') ~ '^[0-9]{1,5}$'
            then least((v_related->>'position')::integer, 32767)::smallint
          else 0
        end
      )
      on conflict do nothing;
    end if;
  end loop;

  if p_actor_user_id is not null then
    insert into public.sc_arena_activity_viewers (
      workspace_id, event_id, viewer_user_id, viewer_reason
    ) values (v_workspace_id, v_event_id, p_actor_user_id, 'actor')
    on conflict do nothing;
  end if;

  foreach v_viewer_id in array coalesce(p_viewer_user_ids, '{}'::uuid[]) loop
    if v_viewer_id is not null then
      insert into public.sc_arena_activity_viewers (
        workspace_id, event_id, viewer_user_id, viewer_reason
      )
      select v_workspace_id, v_event_id, u.id, 'participant'
      from auth.users u
      where u.id = v_viewer_id
      on conflict do nothing;
    end if;
  end loop;

  return v_event_id;
end;
$$;

create or replace function public.sc_arena_my_log(
  p_workspace_slug text default 'sparkclaw-ai-arena',
  p_domain text default null,
  p_before_occurred_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 50
)
returns table (
  id bigint,
  event_uid uuid,
  source_system text,
  source_event_id text,
  domain text,
  event_type text,
  title text,
  summary text,
  route_target text,
  actor_label text,
  actor_role text,
  occurred_at timestamptz,
  recorded_at timestamptz,
  metadata jsonb,
  read_at timestamptz,
  entities jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id,
    e.event_uid,
    e.source_system,
    e.source_event_id,
    e.domain,
    e.event_type,
    e.title,
    e.summary,
    e.route_target,
    e.actor_label,
    e.actor_role,
    e.occurred_at,
    e.recorded_at,
    e.metadata,
    s.read_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', en.id,
          'type', en.entity_type,
          'label', en.label,
          'relation', ee.relation_type
        ) order by ee.position, en.label
      )
      from public.sc_arena_activity_event_entities ee
      join public.sc_arena_entities en
        on en.workspace_id = ee.workspace_id and en.id = ee.entity_id
      where ee.workspace_id = e.workspace_id
        and ee.event_id = e.id
    ), '[]'::jsonb) as entities
  from public.sc_arena_activity_events e
  join public.sc_arena_workspaces w on w.id = e.workspace_id
  left join public.sc_arena_activity_user_state s
    on s.workspace_id = e.workspace_id
   and s.event_id = e.id
   and s.user_id = (select auth.uid())
  where w.slug = p_workspace_slug
    and (p_domain is null or e.domain = p_domain)
    and (
      p_before_occurred_at is null
      or (e.occurred_at, e.id) < (p_before_occurred_at, coalesce(p_before_id, 9223372036854775807))
    )
  order by e.occurred_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.sc_arena_purge_expired_activity(
  p_limit integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  with victims as materialized (
    select e.id
    from public.sc_arena_activity_events e
    where e.retention_until is not null
      and e.retention_until <= now()
    order by e.retention_until, e.id
    limit least(greatest(coalesce(p_limit, 1000), 1), 5000)
    for update skip locked
  ), deleted as (
    delete from public.sc_arena_activity_events e
    using victims v
    where e.id = v.id
    returning e.id
  )
  select count(*)::integer into v_deleted from deleted;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.sc_arena_sync_membership(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.sc_arena_append_activity(text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, uuid[], timestamptz, text) from public, anon, authenticated;
revoke all on function public.sc_arena_my_log(text, text, timestamptz, bigint, integer) from public, anon;
revoke all on function public.sc_arena_purge_expired_activity(integer) from public, anon, authenticated;
grant execute on function public.sc_arena_sync_membership(uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.sc_arena_append_activity(text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, uuid[], timestamptz, text) to service_role;
grant execute on function public.sc_arena_my_log(text, text, timestamptz, bigint, integer) to authenticated;
grant execute on function public.sc_arena_purge_expired_activity(integer) to service_role;

comment on table public.sc_arena_activity_events is
  'Append-only, presentation-safe SparkClaw AI Arena activity ledger. Original domain tables remain the source of current state.';
comment on column public.sc_arena_activity_events.metadata is
  'Allowlisted, presentation-safe metadata only. Never store emails, phone numbers, credentials, raw private notes, or full post bodies.';

commit;
