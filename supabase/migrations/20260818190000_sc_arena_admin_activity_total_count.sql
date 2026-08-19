begin;

-- Keep the explorer page-bounded while returning an exact count for the full
-- staff-selected filter. Isolated test identities are removed at the database
-- boundary so neither their rows nor their aggregate count reach operations.
create or replace function public.sc_arena_admin_activity_page(
  p_workspace_slug text default 'sparkclaw-ai-arena',
  p_actor_user_id uuid default null,
  p_domain text default null,
  p_event_type text default null,
  p_occurred_from timestamptz default null,
  p_occurred_to timestamptz default null,
  p_before_occurred_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 100,
  p_excluded_actor_user_ids uuid[] default '{}'::uuid[]
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
  metadata jsonb,
  total_count bigint
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
  ),
  filtered as (
    select combined.*
    from combined
    where (p_actor_user_id is null or combined.actor_user_id = p_actor_user_id)
      and (p_domain is null or combined.domain = p_domain)
      and (p_event_type is null or combined.event_type = p_event_type)
      and (p_occurred_from is null or combined.occurred_at >= p_occurred_from)
      and (p_occurred_to is null or combined.occurred_at < p_occurred_to)
      and (
        combined.actor_user_id is null
        or cardinality(coalesce(p_excluded_actor_user_ids, '{}'::uuid[])) = 0
        or not (combined.actor_user_id = any(coalesce(p_excluded_actor_user_ids, '{}'::uuid[])))
      )
  ),
  counted as (
    select filtered.*, count(*) over ()::bigint as total_count
    from filtered
  )
  select counted.*
  from counted
  where (
    p_before_occurred_at is null
    or (counted.occurred_at, counted.id) < (
      p_before_occurred_at,
      coalesce(p_before_id, 9223372036854775807)
    )
  )
  order by counted.occurred_at desc, counted.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function public.sc_arena_admin_activity_page(
  text, uuid, text, text, timestamptz, timestamptz, timestamptz, bigint, integer, uuid[]
) from public, anon;

grant execute on function public.sc_arena_admin_activity_page(
  text, uuid, text, text, timestamptz, timestamptz, timestamptz, bigint, integer, uuid[]
) to authenticated;

comment on function public.sc_arena_admin_activity_page(
  text, uuid, text, text, timestamptz, timestamptz, timestamptz, bigint, integer, uuid[]
) is 'Staff-only paginated AI Arena activity timeline with an exact filtered total. Sanitized Auth login/logout events are included; isolated test identities are excluded.';

commit;
