-- SparkClaw AI Arena: staff-only benefit request queue.
-- The service-only RPC returns the latest current requests without respondent identity or contact fields.

begin;

create or replace function public.sc_arena_benefit_need_survey_summary(
  p_workspace_slug text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with current_requests as (
    select
      s.id,
      o.name as organization_name,
      s.details,
      s.status,
      s.submitted_at
    from public.sc_arena_benefit_need_surveys s
    join public.sc_arena_workspaces w on w.id = s.workspace_id
    join public.sc_arena_organizations o
      on o.workspace_id = s.workspace_id
     and o.id = s.organization_id
    where w.slug = p_workspace_slug
      and w.status = 'active'
      and s.is_current
  ), latest_requests as (
    select *
    from current_requests
    order by submitted_at desc, id desc
    limit 12
  )
  select jsonb_build_object(
    'new_request_count', (select count(*) from current_requests where status = 'submitted'),
    'current_request_count', (select count(*) from current_requests),
    'latest_submitted_at', (select max(submitted_at) from current_requests where status = 'submitted'),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'organization_name', r.organization_name,
        'details', r.details,
        'status', r.status,
        'submitted_at', r.submitted_at
      ) order by r.submitted_at desc, r.id desc)
      from latest_requests r
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.sc_arena_benefit_need_survey_summary(text)
from public, anon, authenticated;

grant execute on function public.sc_arena_benefit_need_survey_summary(text)
to service_role;

comment on function public.sc_arena_benefit_need_survey_summary(text) is
  'Returns a bounded staff queue of current benefit requests. Respondent identity and contact fields are excluded.';

commit;
