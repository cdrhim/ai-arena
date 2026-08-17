-- SparkClaw AI Arena: privacy-safe SparkLabs summary for current benefit requests.

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
  select jsonb_build_object(
    'new_request_count', count(*) filter (where s.status = 'submitted'),
    'current_request_count', count(*),
    'latest_submitted_at', max(s.submitted_at) filter (where s.status = 'submitted')
  )
  from public.sc_arena_benefit_need_surveys s
  join public.sc_arena_workspaces w on w.id = s.workspace_id
  where w.slug = p_workspace_slug
    and w.status = 'active'
    and s.is_current;
$$;

revoke all on function public.sc_arena_benefit_need_survey_summary(text)
from public, anon, authenticated;

grant execute on function public.sc_arena_benefit_need_survey_summary(text)
to service_role;

comment on function public.sc_arena_benefit_need_survey_summary(text) is
  'Returns staff-safe counts and the latest timestamp only; member request details remain private.';

commit;
