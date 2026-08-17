begin;

create table if not exists public.sc_arena_admin_audit_logs (
  id bigint generated always as identity primary key,
  audit_uid uuid not null default gen_random_uuid() unique,
  workspace_id uuid not null references public.sc_arena_workspaces(id) on delete restrict,
  activity_event_id bigint not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('staff', 'admin')),
  action_type text not null check (action_type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  domain text not null check (domain in ('discover', 'community', 'bounty', 'system')),
  resource_type text not null default '' check (char_length(resource_type) <= 80),
  resource_id uuid,
  source_system text not null check (char_length(source_system) between 1 and 80),
  source_event_id text not null check (char_length(source_event_id) between 1 and 240),
  outcome text not null default 'succeeded' check (outcome in ('succeeded', 'denied', 'failed')),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null default '' check (char_length(summary) <= 1000),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
    check (octet_length(metadata::text) <= 8192),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  retention_until timestamptz not null default (now() + interval '7 years'),
  unique (workspace_id, activity_event_id),
  foreign key (workspace_id, activity_event_id)
    references public.sc_arena_activity_events(workspace_id, id) on delete restrict
);

create table if not exists public.sc_arena_development_logs (
  id bigint generated always as identity primary key,
  log_uid uuid not null default gen_random_uuid() unique,
  workspace_id uuid not null references public.sc_arena_workspaces(id) on delete restrict,
  environment text not null default 'unknown'
    check (environment in ('production', 'deploy-preview', 'branch-deploy', 'local', 'test', 'unknown')),
  severity text not null check (severity in ('debug', 'info', 'warn', 'error', 'fatal')),
  source text not null check (char_length(source) between 1 and 120),
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  message text not null check (char_length(message) between 1 and 2000),
  fingerprint text not null default '' check (char_length(fingerprint) <= 160),
  request_id text not null default '' check (char_length(request_id) <= 160),
  release_id text not null default '' check (char_length(release_id) <= 160),
  actor_user_id uuid references auth.users(id) on delete set null,
  http_method text not null default '' check (char_length(http_method) <= 12),
  http_path text not null default '' check (char_length(http_path) <= 240),
  http_status smallint check (http_status is null or http_status between 100 and 599),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 600000),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
    check (octet_length(metadata::text) <= 8192),
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  retention_until timestamptz not null default (now() + interval '180 days')
);

create index if not exists sc_arena_admin_audit_time_idx
  on public.sc_arena_admin_audit_logs (workspace_id, occurred_at desc, id desc);
create index if not exists sc_arena_admin_audit_actor_time_idx
  on public.sc_arena_admin_audit_logs (workspace_id, actor_user_id, occurred_at desc, id desc);
create index if not exists sc_arena_admin_audit_action_time_idx
  on public.sc_arena_admin_audit_logs (workspace_id, action_type, occurred_at desc, id desc);
create index if not exists sc_arena_development_time_idx
  on public.sc_arena_development_logs (workspace_id, occurred_at desc, id desc);
create index if not exists sc_arena_development_severity_time_idx
  on public.sc_arena_development_logs (workspace_id, severity, occurred_at desc, id desc);
create index if not exists sc_arena_development_source_time_idx
  on public.sc_arena_development_logs (workspace_id, source, occurred_at desc, id desc);
create index if not exists sc_arena_development_retention_idx
  on public.sc_arena_development_logs (retention_until, id);

alter table public.sc_arena_admin_audit_logs enable row level security;
alter table public.sc_arena_development_logs enable row level security;
alter table public.sc_arena_admin_audit_logs force row level security;
alter table public.sc_arena_development_logs force row level security;

revoke all on public.sc_arena_admin_audit_logs from public, anon, authenticated, service_role;
revoke all on public.sc_arena_development_logs from public, anon, authenticated, service_role;

create or replace function sc_arena_private.capture_staff_activity_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource_type text := '';
begin
  if new.actor_role not in ('staff', 'admin') then return new; end if;

  select coalesce(e.entity_type, '') into v_resource_type
  from public.sc_arena_entities e
  where e.workspace_id = new.workspace_id and e.id = new.primary_entity_id;

  insert into public.sc_arena_admin_audit_logs (
    workspace_id, activity_event_id, actor_user_id, actor_role,
    action_type, domain, resource_type, resource_id,
    source_system, source_event_id, title, summary, metadata,
    occurred_at, retention_until
  ) values (
    new.workspace_id, new.id, new.actor_user_id, new.actor_role,
    new.event_type, new.domain, left(coalesce(v_resource_type, ''), 80), new.primary_entity_id,
    new.source_system, new.source_event_id, new.title, new.summary, new.metadata,
    new.occurred_at, new.occurred_at + interval '7 years'
  ) on conflict (workspace_id, activity_event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists sc_arena_capture_staff_activity_audit on public.sc_arena_activity_events;
create trigger sc_arena_capture_staff_activity_audit
after insert on public.sc_arena_activity_events
for each row execute function sc_arena_private.capture_staff_activity_audit();

insert into public.sc_arena_admin_audit_logs (
  workspace_id, activity_event_id, actor_user_id, actor_role,
  action_type, domain, resource_type, resource_id,
  source_system, source_event_id, title, summary, metadata,
  occurred_at, retention_until
)
select
  a.workspace_id, a.id, a.actor_user_id, a.actor_role,
  a.event_type, a.domain, coalesce(e.entity_type, ''), a.primary_entity_id,
  a.source_system, a.source_event_id, a.title, a.summary, a.metadata,
  a.occurred_at, a.occurred_at + interval '7 years'
from public.sc_arena_activity_events a
left join public.sc_arena_entities e
  on e.workspace_id = a.workspace_id and e.id = a.primary_entity_id
where a.actor_role in ('staff', 'admin')
on conflict (workspace_id, activity_event_id) do nothing;

create or replace function public.sc_arena_append_development_log(
  p_severity text,
  p_source text,
  p_event_type text,
  p_message text,
  p_environment text default 'unknown',
  p_fingerprint text default '',
  p_request_id text default '',
  p_release_id text default '',
  p_actor_user_id uuid default null,
  p_http_method text default '',
  p_http_path text default '',
  p_http_status integer default null,
  p_duration_ms integer default null,
  p_metadata jsonb default '{}'::jsonb,
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
  v_log_id bigint;
  v_actor_user_id uuid;
begin
  select w.id into v_workspace_id
  from public.sc_arena_workspaces w where w.slug = p_workspace_slug;
  if v_workspace_id is null then raise exception 'Arena workspace not found'; end if;
  if p_severity not in ('debug', 'info', 'warn', 'error', 'fatal') then raise exception 'unsupported log severity'; end if;
  if coalesce(p_event_type, '') !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$' then raise exception 'invalid development event type'; end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 8192 then
    raise exception 'development log metadata is invalid';
  end if;
  select u.id into v_actor_user_id from auth.users u where u.id = p_actor_user_id;

  insert into public.sc_arena_development_logs (
    workspace_id, environment, severity, source, event_type, message,
    fingerprint, request_id, release_id, actor_user_id,
    http_method, http_path, http_status, duration_ms, metadata,
    occurred_at, retention_until
  ) values (
    v_workspace_id,
    case when p_environment in ('production', 'deploy-preview', 'branch-deploy', 'local', 'test') then p_environment else 'unknown' end,
    p_severity, left(trim(p_source), 120), p_event_type, left(trim(p_message), 2000),
    left(coalesce(p_fingerprint, ''), 160), left(coalesce(p_request_id, ''), 160),
    left(coalesce(p_release_id, ''), 160), v_actor_user_id,
    left(upper(coalesce(p_http_method, '')), 12), left(coalesce(p_http_path, ''), 240),
    case when p_http_status between 100 and 599 then p_http_status else null end,
    case when p_duration_ms between 0 and 600000 then p_duration_ms else null end,
    coalesce(p_metadata, '{}'::jsonb), coalesce(p_occurred_at, now()),
    coalesce(p_occurred_at, now()) + interval '180 days'
  ) returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.sc_arena_admin_audit_log(
  p_workspace_slug text default 'sparkclaw-ai-arena',
  p_actor_user_id uuid default null,
  p_action_type text default null,
  p_occurred_from timestamptz default null,
  p_occurred_to timestamptz default null,
  p_before_occurred_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 100
)
returns table (
  id bigint, audit_uid uuid, actor_user_id uuid, actor_email text, actor_role text,
  action_type text, domain text, resource_type text, resource_id uuid,
  source_system text, title text, summary text, outcome text,
  occurred_at timestamptz, recorded_at timestamptz, metadata jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_workspace_id uuid;
begin
  select w.id into v_workspace_id from public.sc_arena_workspaces w where w.slug = p_workspace_slug;
  if v_workspace_id is null
     or not sc_arena_private.user_is_workspace_staff(v_workspace_id, (select auth.uid())) then
    raise exception 'SparkLabs staff access required' using errcode = '42501';
  end if;
  return query
  select a.id, a.audit_uid, a.actor_user_id, coalesce(u.email, '')::text, a.actor_role,
    a.action_type, a.domain, a.resource_type, a.resource_id,
    a.source_system, a.title, a.summary, a.outcome,
    a.occurred_at, a.recorded_at, a.metadata
  from public.sc_arena_admin_audit_logs a
  left join auth.users u on u.id = a.actor_user_id
  where a.workspace_id = v_workspace_id
    and (p_actor_user_id is null or a.actor_user_id = p_actor_user_id)
    and (p_action_type is null or a.action_type = p_action_type)
    and (p_occurred_from is null or a.occurred_at >= p_occurred_from)
    and (p_occurred_to is null or a.occurred_at < p_occurred_to)
    and (p_before_occurred_at is null
      or (a.occurred_at, a.id) < (p_before_occurred_at, coalesce(p_before_id, 9223372036854775807)))
  order by a.occurred_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

create or replace function public.sc_arena_development_log(
  p_workspace_slug text default 'sparkclaw-ai-arena',
  p_severity text default null,
  p_source text default null,
  p_occurred_from timestamptz default null,
  p_occurred_to timestamptz default null,
  p_before_occurred_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 100
)
returns table (
  id bigint, log_uid uuid, environment text, severity text, source text, event_type text,
  message text, fingerprint text, request_id text, release_id text,
  actor_user_id uuid, actor_email text, http_method text, http_path text,
  http_status smallint, duration_ms integer, occurred_at timestamptz, recorded_at timestamptz, metadata jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_workspace_id uuid;
begin
  select w.id into v_workspace_id from public.sc_arena_workspaces w where w.slug = p_workspace_slug;
  if v_workspace_id is null
     or not sc_arena_private.user_is_workspace_staff(v_workspace_id, (select auth.uid())) then
    raise exception 'SparkLabs staff access required' using errcode = '42501';
  end if;
  return query
  select d.id, d.log_uid, d.environment, d.severity, d.source, d.event_type,
    d.message, d.fingerprint, d.request_id, d.release_id,
    d.actor_user_id, coalesce(u.email, '')::text, d.http_method, d.http_path,
    d.http_status, d.duration_ms, d.occurred_at, d.recorded_at, d.metadata
  from public.sc_arena_development_logs d
  left join auth.users u on u.id = d.actor_user_id
  where d.workspace_id = v_workspace_id
    and (p_severity is null or d.severity = p_severity)
    and (p_source is null or d.source = p_source)
    and (p_occurred_from is null or d.occurred_at >= p_occurred_from)
    and (p_occurred_to is null or d.occurred_at < p_occurred_to)
    and (p_before_occurred_at is null
      or (d.occurred_at, d.id) < (p_before_occurred_at, coalesce(p_before_id, 9223372036854775807)))
  order by d.occurred_at desc, d.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function sc_arena_private.capture_staff_activity_audit() from public, anon, authenticated;
revoke all on function public.sc_arena_append_development_log(text, text, text, text, text, text, text, text, uuid, text, text, integer, integer, jsonb, timestamptz, text) from public, anon, authenticated;
revoke all on function public.sc_arena_admin_audit_log(text, uuid, text, timestamptz, timestamptz, timestamptz, bigint, integer) from public, anon;
revoke all on function public.sc_arena_development_log(text, text, text, timestamptz, timestamptz, timestamptz, bigint, integer) from public, anon;
grant execute on function public.sc_arena_append_development_log(text, text, text, text, text, text, text, text, uuid, text, text, integer, integer, jsonb, timestamptz, text) to service_role;
grant execute on function public.sc_arena_admin_audit_log(text, uuid, text, timestamptz, timestamptz, timestamptz, bigint, integer) to authenticated;
grant execute on function public.sc_arena_development_log(text, text, text, timestamptz, timestamptz, timestamptz, bigint, integer) to authenticated;

comment on table public.sc_arena_admin_audit_logs is
  'Append-only SparkLabs staff/admin audit ledger derived transactionally from authoritative Arena activity events. Retained for seven years.';
comment on table public.sc_arena_development_logs is
  'Sanitized server diagnostics. Request bodies, authorization headers, tokens, secrets, and raw user content must never be stored. Retained for 180 days.';

commit;
