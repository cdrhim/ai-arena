create table if not exists public.arena_submissions (
  id text primary key,
  owner_id text not null,
  owner_email text not null,
  status text not null default 'draft',
  visibility text not null default 'private',
  slug text unique,
  name text not null default '',
  readiness_score integer not null default 0,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  constraint arena_submissions_status_check check (
    status in ('draft', 'submitted', 'needs_changes', 'approved', 'published', 'archived')
  ),
  constraint arena_submissions_visibility_check check (
    visibility in ('private', 'public')
  )
);

create index if not exists arena_submissions_owner_idx on public.arena_submissions (owner_id);
create index if not exists arena_submissions_owner_email_idx on public.arena_submissions (owner_email);
create index if not exists arena_submissions_status_idx on public.arena_submissions (status);
create index if not exists arena_submissions_visibility_idx on public.arena_submissions (visibility);
create index if not exists arena_submissions_updated_idx on public.arena_submissions (updated_at desc);
create index if not exists arena_submissions_payload_gin_idx on public.arena_submissions using gin (payload);

alter table public.arena_submissions enable row level security;

create or replace function public.is_sparklabs_staff()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'email') ilike '%@sparklabs.co.kr', false)
$$;

drop policy if exists "arena submissions read own public staff" on public.arena_submissions;
create policy "arena submissions read own public staff"
on public.arena_submissions
for select
using (
  public.is_sparklabs_staff()
  or owner_id = auth.uid()::text
  or owner_email = lower(auth.jwt() ->> 'email')
  or (status = 'published' and visibility = 'public')
);

drop policy if exists "arena submissions insert own" on public.arena_submissions;
create policy "arena submissions insert own"
on public.arena_submissions
for insert
with check (
  public.is_sparklabs_staff()
  or owner_id = auth.uid()::text
  or owner_email = lower(auth.jwt() ->> 'email')
);

drop policy if exists "arena submissions update own drafts" on public.arena_submissions;
create policy "arena submissions update own drafts"
on public.arena_submissions
for update
using (
  public.is_sparklabs_staff()
  or (
    (owner_id = auth.uid()::text or owner_email = lower(auth.jwt() ->> 'email'))
    and status in ('draft', 'submitted', 'needs_changes')
  )
)
with check (
  public.is_sparklabs_staff()
  or (
    (owner_id = auth.uid()::text or owner_email = lower(auth.jwt() ->> 'email'))
    and status in ('draft', 'submitted', 'needs_changes')
    and coalesce((payload ->> 'arenaScore')::numeric, 0) = 0
  )
);

drop policy if exists "arena submissions delete staff only" on public.arena_submissions;
create policy "arena submissions delete staff only"
on public.arena_submissions
for delete
using (public.is_sparklabs_staff());
