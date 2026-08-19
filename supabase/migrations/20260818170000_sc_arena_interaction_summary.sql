begin;

create or replace function public.sc_arena_interaction_event_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*)::bigint
  from public.sc_arena_activity_events as event
  where event.source_system <> 'program_actions';
$function$;

revoke all on function public.sc_arena_interaction_event_count() from public, anon, authenticated;
grant execute on function public.sc_arena_interaction_event_count() to authenticated, service_role;

commit;
