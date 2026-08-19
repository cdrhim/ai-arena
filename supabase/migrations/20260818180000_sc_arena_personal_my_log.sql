-- My Log is always personal, including for SparkLabs staff. Cross-user
-- visibility belongs exclusively to the separately staff-gated explorer RPC.
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
    and e.actor_user_id = (select auth.uid())
    and e.domain in ('discover', 'community', 'bounty')
    and (p_domain is null or e.domain = p_domain)
    and (
      p_before_occurred_at is null
      or (e.occurred_at, e.id) < (p_before_occurred_at, coalesce(p_before_id, 9223372036854775807))
    )
  order by e.occurred_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.sc_arena_my_log(text, text, timestamptz, bigint, integer) from public, anon;
grant execute on function public.sc_arena_my_log(text, text, timestamptz, bigint, integer) to authenticated;

comment on function public.sc_arena_my_log(text, text, timestamptz, bigint, integer) is
  'Returns only the authenticated actor own Discover, Community, and Bounty activity; cross-user reads use the staff explorer.';
