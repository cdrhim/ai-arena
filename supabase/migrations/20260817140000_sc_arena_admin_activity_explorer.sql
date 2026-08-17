begin;

insert into public.sc_arena_activity_event_types (event_type, domain, label, default_retention_days)
values
  ('system.session_started', 'system', 'AI Arena 로그인', 1095),
  ('system.page_viewed', 'system', 'AI Arena 페이지 열람', 365),
  ('community.category_created', 'community', 'Community 채널 생성', 1095),
  ('community.post_updated', 'community', 'Community 글 수정·삭제', 1095),
  ('community.comment_updated', 'community', 'Community 댓글 수정·삭제', 1095),
  ('community.thread_bookmarked', 'community', 'Community 글 저장', 365)
on conflict (event_type) do update
set domain = excluded.domain,
    label = excluded.label,
    default_retention_days = excluded.default_retention_days;

create index if not exists sc_arena_activity_actor_time_idx
  on public.sc_arena_activity_events (workspace_id, actor_user_id, occurred_at desc, id desc);

create index if not exists sc_arena_activity_type_time_idx
  on public.sc_arena_activity_events (workspace_id, event_type, occurred_at desc, id desc);

create or replace function public.sc_arena_admin_activity_users(
  p_workspace_slug text default 'sparkclaw-ai-arena',
  p_search text default null,
  p_limit integer default 250
)
returns table (
  user_id uuid,
  email text,
  actor_label text,
  role text,
  organization_name text,
  event_count bigint,
  first_activity_at timestamptz,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  select w.id into v_workspace_id
  from public.sc_arena_workspaces w
  where w.slug = p_workspace_slug;

  if v_workspace_id is null
     or not sc_arena_private.user_is_workspace_staff(v_workspace_id, (select auth.uid())) then
    raise exception 'SparkLabs staff access required' using errcode = '42501';
  end if;

  return query
  with member_activity as (
    select
      m.user_id,
      (array_agg(e.actor_label order by e.occurred_at desc, e.id desc)
        filter (where e.actor_label <> ''))[1] as latest_actor_label,
      count(e.id) as event_count,
      min(e.occurred_at) as first_activity_at,
      max(e.occurred_at) as last_activity_at
    from public.sc_arena_memberships m
    left join public.sc_arena_activity_events e
      on e.workspace_id = m.workspace_id
     and e.actor_user_id = m.user_id
    where m.workspace_id = v_workspace_id
      and m.status = 'active'
    group by m.user_id
  )
  select
    m.user_id,
    coalesce(u.email, '')::text as email,
    coalesce(nullif(a.latest_actor_label, ''), nullif(o.name, ''), split_part(coalesce(u.email, ''), '@', 1), 'Arena user')::text as actor_label,
    m.role::text,
    coalesce(o.name, '')::text as organization_name,
    coalesce(a.event_count, 0)::bigint,
    a.first_activity_at,
    a.last_activity_at
  from public.sc_arena_memberships m
  join auth.users u on u.id = m.user_id
  left join public.sc_arena_organizations o
    on o.workspace_id = m.workspace_id and o.id = m.organization_id
  left join member_activity a on a.user_id = m.user_id
  where m.workspace_id = v_workspace_id
    and m.status = 'active'
    and (
      v_search is null
      or coalesce(u.email, '') ilike '%' || v_search || '%'
      or coalesce(o.name, '') ilike '%' || v_search || '%'
      or coalesce(a.latest_actor_label, '') ilike '%' || v_search || '%'
    )
  order by a.last_activity_at desc nulls last, u.email
  limit least(greatest(coalesce(p_limit, 250), 1), 500);
end;
$$;

create or replace function public.sc_arena_admin_activity(
  p_workspace_slug text default 'sparkclaw-ai-arena',
  p_actor_user_id uuid default null,
  p_domain text default null,
  p_event_type text default null,
  p_occurred_from timestamptz default null,
  p_occurred_to timestamptz default null,
  p_before_occurred_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 100
)
returns table (
  id bigint,
  event_uid uuid,
  actor_user_id uuid,
  actor_email text,
  actor_label text,
  actor_role text,
  organization_name text,
  domain text,
  event_type text,
  event_label text,
  title text,
  summary text,
  route_target text,
  source_system text,
  occurred_at timestamptz,
  recorded_at timestamptz,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  select w.id into v_workspace_id
  from public.sc_arena_workspaces w
  where w.slug = p_workspace_slug;

  if v_workspace_id is null
     or not sc_arena_private.user_is_workspace_staff(v_workspace_id, (select auth.uid())) then
    raise exception 'SparkLabs staff access required' using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.event_uid,
    e.actor_user_id,
    coalesce(u.email, '')::text as actor_email,
    e.actor_label,
    e.actor_role,
    coalesce(o.name, '')::text as organization_name,
    e.domain,
    e.event_type,
    t.label::text as event_label,
    e.title,
    e.summary,
    e.route_target,
    e.source_system,
    e.occurred_at,
    e.recorded_at,
    e.metadata
  from public.sc_arena_activity_events e
  join public.sc_arena_activity_event_types t on t.event_type = e.event_type
  left join auth.users u on u.id = e.actor_user_id
  left join public.sc_arena_organizations o
    on o.workspace_id = e.workspace_id and o.id = e.actor_organization_id
  where e.workspace_id = v_workspace_id
    and (p_actor_user_id is null or e.actor_user_id = p_actor_user_id)
    and (p_domain is null or e.domain = p_domain)
    and (p_event_type is null or e.event_type = p_event_type)
    and (p_occurred_from is null or e.occurred_at >= p_occurred_from)
    and (p_occurred_to is null or e.occurred_at < p_occurred_to)
    and (
      p_before_occurred_at is null
      or (e.occurred_at, e.id) < (p_before_occurred_at, coalesce(p_before_id, 9223372036854775807))
    )
  order by e.occurred_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function public.sc_arena_admin_activity_users(text, text, integer) from public, anon;
revoke all on function public.sc_arena_admin_activity(text, uuid, text, text, timestamptz, timestamptz, timestamptz, bigint, integer) from public, anon;
grant execute on function public.sc_arena_admin_activity_users(text, text, integer) to authenticated;
grant execute on function public.sc_arena_admin_activity(text, uuid, text, text, timestamptz, timestamptz, timestamptz, bigint, integer) to authenticated;

comment on function public.sc_arena_admin_activity_users(text, text, integer) is
  'Staff-only user directory for SparkClaw AI Arena Activity Explorer. Email is resolved at read time and is not copied into event metadata.';

comment on function public.sc_arena_admin_activity(text, uuid, text, text, timestamptz, timestamptz, timestamptz, bigint, integer) is
  'Staff-only filtered SparkClaw AI Arena activity timeline. The function rejects non-staff callers before returning any cross-user data.';

commit;
