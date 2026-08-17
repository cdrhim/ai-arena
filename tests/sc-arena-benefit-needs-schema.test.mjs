import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../supabase/migrations/20260814183000_sc_arena_benefit_need_surveys.sql", import.meta.url), "utf8");
const solutionSql = await readFile(new URL("../supabase/migrations/20260817203000_sc_arena_solution_need_survey.sql", import.meta.url), "utf8");
const reasonSql = await readFile(new URL("../supabase/migrations/20260817204500_sc_arena_benefit_solution_reason.sql", import.meta.url), "utf8");

test("benefit-needs survey has a separate relational, revisioned Arena table", () => {
  assert.match(sql, /create table if not exists public\.sc_arena_benefit_need_surveys/i);
  assert.match(sql, /references public\.sc_arena_workspaces/i);
  assert.match(sql, /references public\.sc_arena_organizations\(workspace_id, id\)/i);
  assert.match(sql, /respondent_user_id uuid not null references auth\.users/i);
  assert.match(sql, /response_version integer not null/i);
  assert.match(sql, /where is_current/i);
  assert.match(sql, /status in \('submitted', 'reviewing', 'matched', 'closed'\)/i);
});

test("benefit request stores a bounded reason through service-only RPCs", () => {
  assert.match(reasonSql, /add column if not exists solution_reason text/i);
  assert.match(reasonSql, /solution_reason is null or char_length\(solution_reason\) between 10 and 500/i);
  assert.match(reasonSql, /create or replace function public\.sc_arena_submit_benefit_solution_request/i);
  assert.match(reasonSql, /p_solution_reason text/i);
  assert.match(reasonSql, /create or replace function public\.sc_arena_latest_benefit_solution_request/i);
  assert.match(reasonSql, /revoke all[\s\S]*?from public, anon, authenticated/i);
  assert.match(reasonSql, /grant execute[\s\S]*?to service_role/i);
});

test("survey responses are private and only bounded service RPCs can access them", () => {
  assert.match(sql, /force row level security/i);
  assert.match(sql, /revoke all on public\.sc_arena_benefit_need_surveys[\s\S]*?service_role/i);
  assert.match(sql, /create or replace function public\.sc_arena_submit_benefit_need_survey/i);
  assert.match(sql, /create or replace function public\.sc_arena_latest_benefit_need_survey/i);
  assert.match(sql, /security definer/g);
  assert.match(sql, /grant execute on function public\.sc_arena_submit_benefit_need_survey[\s\S]*?to service_role/i);
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete)\s+on[\s\S]+to authenticated/i);
});

test("new survey revisions replace the current response without deleting history", () => {
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /select coalesce\(max\(s\.response_version\), 0\) \+ 1/i);
  assert.match(sql, /update public\.sc_arena_benefit_need_surveys[\s\S]*?set is_current = false/i);
  assert.doesNotMatch(sql, /delete from public\.sc_arena_benefit_need_surveys/i);
});

test("solution request schema adds the two-field RPC without discarding prior revisions", () => {
  assert.match(solutionSql, /add column if not exists solution_name text/i);
  assert.match(solutionSql, /solution_name is null or char_length\(solution_name\) between 2 and 120/i);
  assert.match(solutionSql, /create or replace function public\.sc_arena_submit_solution_need_survey/i);
  assert.match(solutionSql, /p_solution_details text/i);
  assert.match(solutionSql, /array\['other'\]::text\[\]/i);
  assert.match(solutionSql, /create or replace function public\.sc_arena_latest_solution_need_survey/i);
  assert.match(solutionSql, /grant execute[\s\S]*?to service_role/i);
  assert.doesNotMatch(solutionSql, /delete from public\.sc_arena_benefit_need_surveys/i);
});
