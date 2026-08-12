create table if not exists public.arena_team_keywords (
  team_id uuid primary key,
  company_name text not null,
  service_name text not null default '',
  keywords text[] not null default '{}',
  keyword_version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint arena_team_keywords_has_keywords check (cardinality(keywords) > 0)
);

alter table public.arena_team_keywords enable row level security;

drop policy if exists "Public can read safe team keywords" on public.arena_team_keywords;
create policy "Public can read safe team keywords"
  on public.arena_team_keywords
  for select
  to anon, authenticated
  using (true);

grant select on public.arena_team_keywords to anon, authenticated;
revoke insert, update, delete on public.arena_team_keywords from anon, authenticated;

comment on table public.arena_team_keywords is
  'Public-safe company and service keywords used for deterministic AI Arena collaboration matching.';
