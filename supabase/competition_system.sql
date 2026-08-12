-- SparkClaw Arena competition and validation schema.
-- Run this in Supabase SQL editor after `arena_submissions.sql`.

create table if not exists public.arena_challenges (
  id text primary key,
  slug text unique not null,
  title text not null,
  short_description text,
  long_description text,
  status text not null check (status in ('draft', 'open', 'paused', 'locked', 'ended', 'private_revealed', 'archived')),
  visibility text not null check (visibility in ('public', 'private', 'invite_only')),
  challenge_type text not null check (challenge_type in ('csv_prediction', 'product_benchmark', 'endpoint_eval', 'pairwise_validation', 'composite')),
  evaluation_mode text not null check (evaluation_mode in ('automatic', 'staff_recorded', 'hybrid')),
  metric_key text not null,
  metric_display_name text not null,
  higher_is_better boolean not null default true,
  metric_config jsonb not null default '{}'::jsonb,
  submission_id_column text not null default 'id',
  required_columns text[] not null default array['id', 'prediction'],
  expected_row_count integer,
  submission_limit_per_day integer,
  max_selected_submissions integer not null default 1,
  public_split_percentage numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  private_revealed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.challenge_files (
  id text primary key,
  challenge_id text not null references public.arena_challenges(id) on delete cascade,
  file_type text not null check (file_type in ('public_dataset', 'sample_submission', 'rules', 'docs', 'other')),
  storage_path text,
  url text,
  display_name text,
  mime_type text,
  size_bytes bigint,
  checksum text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_solutions (
  id text primary key,
  challenge_id text not null references public.arena_challenges(id) on delete cascade,
  storage_path text,
  encrypted_blob_ref text,
  checksum text not null,
  schema_json jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.arena_teams (
  id text primary key,
  challenge_id text references public.arena_challenges(id) on delete cascade,
  name text not null,
  slug text not null,
  owner_user_id text,
  owner_email text,
  organization text,
  created_at timestamptz not null default now()
);

create table if not exists public.arena_team_members (
  id text primary key,
  team_id text not null references public.arena_teams(id) on delete cascade,
  user_id text,
  email text,
  role text not null check (role in ('owner', 'member', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_submissions (
  id text primary key,
  challenge_id text not null references public.arena_challenges(id) on delete cascade,
  team_id text not null references public.arena_teams(id) on delete cascade,
  submitter_user_id text,
  submitter_email text,
  submission_type text not null check (submission_type in ('csv', 'endpoint', 'product_profile', 'manual_benchmark', 'pairwise_candidate')),
  status text not null check (status in ('uploaded', 'queued', 'validating', 'schema_failed', 'scored', 'failed', 'disqualified', 'selected_for_private', 'withdrawn')),
  artifact_path text,
  artifact_checksum text,
  endpoint_url text,
  model_url text,
  product_id text,
  startup_id text,
  public_score numeric,
  private_score numeric,
  composite_score numeric,
  rank_public integer,
  rank_private integer,
  error_code text,
  error_message_public text,
  error_message_private text,
  metric_breakdown jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  scored_at timestamptz,
  selected_for_private_at timestamptz,
  disqualified_at timestamptz,
  disqualified_by text
);

create table if not exists public.submission_validation_reports (
  id text primary key,
  submission_id text not null references public.challenge_submissions(id) on delete cascade,
  schema_valid boolean not null default false,
  row_count integer,
  missing_columns jsonb not null default '[]'::jsonb,
  extra_columns jsonb not null default '[]'::jsonb,
  duplicate_ids jsonb not null default '[]'::jsonb,
  missing_ids jsonb not null default '[]'::jsonb,
  invalid_values jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  logs_public jsonb not null default '[]'::jsonb,
  logs_private jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.leaderboard_entries (
  id text primary key,
  challenge_id text not null references public.arena_challenges(id) on delete cascade,
  submission_id text not null references public.challenge_submissions(id) on delete cascade,
  team_id text not null references public.arena_teams(id) on delete cascade,
  split text not null check (split in ('public', 'private')),
  score numeric,
  rank integer,
  metric_breakdown jsonb not null default '{}'::jsonb,
  is_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pairwise_votes (
  id text primary key,
  challenge_id text not null references public.arena_challenges(id) on delete cascade,
  winner_submission_id text,
  loser_submission_id text,
  winner_product_id text,
  loser_product_id text,
  judge_user_id text,
  judge_email text,
  criteria jsonb not null default '{}'::jsonb,
  confidence numeric,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.validation_reviews (
  id text primary key,
  challenge_id text not null references public.arena_challenges(id) on delete cascade,
  submission_id text,
  product_id text,
  startup_id text,
  reviewer_user_id text,
  reviewer_email text,
  status text not null check (status in ('pending', 'approved', 'needs_changes', 'rejected', 'disqualified')),
  public_note text,
  private_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id text primary key,
  actor_user_id text,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.arena_challenges enable row level security;
alter table public.challenge_files enable row level security;
alter table public.challenge_solutions enable row level security;
alter table public.arena_teams enable row level security;
alter table public.arena_team_members enable row level security;
alter table public.challenge_submissions enable row level security;
alter table public.submission_validation_reports enable row level security;
alter table public.leaderboard_entries enable row level security;
alter table public.pairwise_votes enable row level security;
alter table public.validation_reviews enable row level security;
alter table public.audit_logs enable row level security;

create index if not exists arena_challenges_status_idx on public.arena_challenges(status);
create index if not exists challenge_submissions_challenge_idx on public.challenge_submissions(challenge_id, status, submitted_at desc);
create index if not exists leaderboard_entries_challenge_split_idx on public.leaderboard_entries(challenge_id, split, rank);
create index if not exists validation_reports_submission_idx on public.submission_validation_reports(submission_id);
