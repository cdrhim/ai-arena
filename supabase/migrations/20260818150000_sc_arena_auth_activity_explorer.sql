begin;

-- Authentication events stay in Supabase Auth's audit trail. They are exposed
-- only through the staff-gated explorer RPC below and are never copied into a
-- member's personal activity feed.
insert into public.sc_arena_activity_event_types (event_type, domain, label, default_retention_days)
values
  ('system.auth_login', 'system', '인증 로그인', 1095),
  ('system.auth_logout', 'system', '인증 로그아웃', 1095)
on conflict (event_type) do update
set domain = excluded.domain,
    label = excluded.label,
    default_retention_days = excluded.default_retention_days;

create index if not exists sc_arena_memberships_workspace_user_active_idx
  on public.sc_arena_memberships (workspace_id, user_id)
  where status = 'active';

-- Recent Activity is intentionally product activity only. In particular,
-- browser session telemetry and Supabase authentication events are not
-- returned to the member who generated them.
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
    and e.domain in ('discover', 'community', 'bounty')
    and (p_domain is null or e.domain = p_domain)
    and (
      p_before_occurred_at is null
      or (e.occurred_at, e.id) < (p_before_occurred_at, coalesce(p_before_id, 9223372036854775807))
    )
  order by e.occurred_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- The high ID range keeps Auth audit rows separate from ledger identity IDs
-- while retaining the existing (occurred_at, id) keyset cursor contract.
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
  with ledger_activity as (
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
  ),
  auth_audit as (
    select
      (
        2305843009213693952::bigint
        + (hashtextextended(a.id::text, 0) & 2305843009213693951::bigint)
      )::bigint as id,
      a.id as event_uid,
      parsed.actor_user_id,
      coalesce(u.email, '')::text as actor_email,
      coalesce(nullif(o.name, ''), split_part(coalesce(u.email, ''), '@', 1), 'Arena user')::text as actor_label,
      coalesce(m.role, 'registered')::text as actor_role,
      coalesce(o.name, '')::text as organization_name,
      'system'::text as domain,
      case parsed.action
        when 'login' then 'system.auth_login'
        else 'system.auth_logout'
      end::text as event_type,
      case parsed.action
        when 'login' then '인증 로그인'
        else '인증 로그아웃'
      end::text as event_label,
      case parsed.action
        when 'login' then 'AI Arena 계정 로그인'
        else 'AI Arena 계정 로그아웃'
      end::text as title,
      case parsed.action
        when 'login' then 'Supabase Auth에서 사용자 인증 로그인이 확인되었습니다.'
        else 'Supabase Auth에서 사용자 인증 로그아웃이 확인되었습니다.'
      end::text as summary,
      'operations'::text as route_target,
      'supabase_auth'::text as source_system,
      a.created_at as occurred_at,
      a.created_at as recorded_at,
      jsonb_build_object('auth_action', parsed.action) as metadata
    from auth.audit_log_entries a
    cross join lateral (
      select
        lower(coalesce(a.payload->>'action', ''))::text as action,
        case
          when coalesce(a.payload->>'actor_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (a.payload->>'actor_id')::uuid
          else null::uuid
        end as actor_user_id
    ) parsed
    join auth.users u on u.id = parsed.actor_user_id
    left join public.sc_arena_memberships m
      on m.workspace_id = v_workspace_id
     and m.user_id = parsed.actor_user_id
     and m.status = 'active'
    left join public.sc_arena_organizations o
      on o.workspace_id = m.workspace_id and o.id = m.organization_id
    where parsed.action in ('login', 'logout')
      and a.created_at is not null
      and not exists (
        select 1
        from public.sc_arena_activity_events e
        where e.workspace_id = v_workspace_id
          and e.actor_user_id = parsed.actor_user_id
          and e.source_system = 'arena_client'
          and e.event_type = case parsed.action
            when 'login' then 'system.auth_login'
            else 'system.auth_logout'
          end
          and e.occurred_at between a.created_at - interval '60 seconds' and a.created_at + interval '60 seconds'
      )
  ),
  combined as (
    select * from ledger_activity
    union all
    select * from auth_audit
  )
  select combined.*
  from combined
  where (p_actor_user_id is null or combined.actor_user_id = p_actor_user_id)
    and (p_domain is null or combined.domain = p_domain)
    and (p_event_type is null or combined.event_type = p_event_type)
    and (p_occurred_from is null or combined.occurred_at >= p_occurred_from)
    and (p_occurred_to is null or combined.occurred_at < p_occurred_to)
    and (
      p_before_occurred_at is null
      or (combined.occurred_at, combined.id) < (
        p_before_occurred_at,
        coalesce(p_before_id, 9223372036854775807)
      )
    )
  order by combined.occurred_at desc, combined.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function public.sc_arena_my_log(text, text, timestamptz, bigint, integer) from public, anon;
grant execute on function public.sc_arena_my_log(text, text, timestamptz, bigint, integer) to authenticated;

revoke all on function public.sc_arena_admin_activity(text, uuid, text, text, timestamptz, timestamptz, timestamptz, bigint, integer) from public, anon;
grant execute on function public.sc_arena_admin_activity(text, uuid, text, text, timestamptz, timestamptz, timestamptz, bigint, integer) to authenticated;

comment on function public.sc_arena_admin_activity(text, uuid, text, text, timestamptz, timestamptz, timestamptz, bigint, integer) is
  'Staff-only AI Arena activity timeline. Includes sanitized Supabase Auth login/logout audit events without exposing IP addresses or raw audit payloads.';

comment on function public.sc_arena_my_log(text, text, timestamptz, bigint, integer) is
  'Member Recent Activity for Discover, Community, and Bounty only. Authentication and system telemetry are intentionally excluded.';

commit;
