import assert from "node:assert/strict";
import test from "node:test";

import weeklyFeaturedRefresh, { config as scheduleConfig } from "../netlify/functions/weekly-featured-refresh.mjs";
import { buildWeeklyFeaturedSnapshot } from "../netlify/lib/weekly-featured-companies.mjs";
import { loadWeeklyFeaturedSnapshot, publishWeeklyFeaturedSnapshot } from "../netlify/lib/weekly-featured-store.mjs";

test("weekly spotlight ranks the latest completed report cycle and excludes test teams", () => {
  const snapshot = buildWeeklyFeaturedSnapshot(fixtures(), { now: new Date("2026-08-12T03:00:00Z") });
  assert.equal(snapshot.cycleKey, "program-week-2");
  assert.equal(snapshot.weekLabel, "Week 2");
  assert.equal(snapshot.scheduledFor, "2026-08-10T09:00:00+09:00");
  assert.deepEqual(snapshot.items.map((item) => item.companyName), ["Paid AI", "Interview AI", "PMF AI", "Execution AI"]);
  assert.deepEqual(snapshot.items.map((item) => item.rank), [1, 2, 3, 4]);
  assert.ok(snapshot.items.every((item) => item.keywords.length >= 1 && item.keywords.length <= 3));
  assert.ok(snapshot.items.every((item) => !/3명|5건|고객 수/.test(item.achievement)));
  assert.equal(snapshot.items.some((item) => item.companyName.includes("Test")), false);
});

test("weekly spotlight keeps the previous snapshot when no report is complete", () => {
  const source = fixtures();
  source.mentoring_sessions = source.mentoring_sessions.map((row) => ({ ...row, report_submitted: false }));
  assert.equal(buildWeeklyFeaturedSnapshot(source), null);
});

test("scheduled refresh runs every Monday at 09:00 KST and publishes one stable snapshot", async () => {
  let published = null;
  const response = await weeklyFeaturedRefresh(new Request("https://example.test"), {}, {
    now: new Date("2026-08-12T03:00:00Z"),
    loadSource: async () => fixtures(),
    publishSnapshot: async (snapshot) => {
      published = snapshot;
      return { stored: true, snapshotId: "snapshot-id" };
    }
  });
  assert.equal(scheduleConfig.schedule, "0 0 * * 1");
  assert.equal(response.status, 200);
  assert.equal(published.cycleKey, "program-week-2");
  assert.equal(published.items.length, 4);
});

test("weekly spotlight store uses service-only publish and current-snapshot RPCs", async () => {
  const calls = [];
  const env = { SUPABASE_URL: "https://arena.supabase.co", SUPABASE_SECRET_KEY: "server-secret" };
  const snapshot = buildWeeklyFeaturedSnapshot(fixtures(), { now: new Date("2026-08-12T03:00:00Z") });
  const publishResult = await publishWeeklyFeaturedSnapshot(snapshot, env, async (url, init) => {
    calls.push({ url, init });
    return Response.json("snapshot-id");
  });
  const loadResult = await loadWeeklyFeaturedSnapshot(env, async (url, init) => {
    calls.push({ url, init });
    return Response.json([{
      snapshot_id: "snapshot-id",
      cycle_key: "program-week-2",
      week_label: "Week 2",
      source_updated_at: "2026-08-11T00:00:00Z",
      published_at: "2026-08-12T00:00:00Z",
      rank: 1,
      organization_key: "1",
      company_name: "Paid AI",
      achievement: "고객 검증 업데이트를 완료했습니다.",
      hook: "고객 검증 진전",
      keywords: ["고객 검증", "SaaS"]
    }]);
  });
  assert.equal(publishResult.stored, true);
  assert.equal(loadResult.available, true);
  assert.equal(loadResult.items[0].companyName, "Paid AI");
  assert.match(calls[0].url, /rpc\/sc_arena_publish_weekly_spotlight$/);
  assert.match(calls[1].url, /rpc\/sc_arena_current_weekly_spotlight$/);
  assert.ok(calls.every((call) => call.init.headers.Authorization === "Bearer server-secret"));
});

test("weekly spotlight store treats current Supabase secret keys as opaque API keys", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return Response.json([]);
  };
  await loadWeeklyFeaturedSnapshot({
    SUPABASE_URL: "https://arena.example.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_current"
  }, fetchImpl);
  assert.equal(calls[0].init.headers.apikey, "sb_secret_current");
  assert.equal("Authorization" in calls[0].init.headers, false);
});

function fixtures() {
  const teams = [
    [1, "Paid AI", "SaaS"],
    [2, "Interview AI", "Healthcare"],
    [3, "PMF AI", "Education"],
    [4, "Execution AI", "Manufacturing"],
    [5, "Test Team", "SaaS"]
  ].map(([id, name, sector]) => ({ id, name, company_name: name, sector, status: "selected", one_liner: `${sector} workflow AI` }));
  return {
    teams,
    mentoring_sessions: [
      { id: 1, team_id: 1, week_number: 1, report_submitted: true, session_date: "2026-08-04" },
      { id: 2, team_id: 1, week_number: 2, report_submitted: true, attended: true, customer_interview_done: true, customer_interview_count: 5, paying_customer_exists: true, paying_customer_count: 2, session_date: "2026-08-11" },
      { id: 3, team_id: 2, week_number: 2, report_submitted: true, attended: true, customer_interview_done: true, customer_interview_count: 6, session_date: "2026-08-11" },
      { id: 4, team_id: 3, week_number: 2, report_submitted: true, attended: true, session_date: "2026-08-11" },
      { id: 5, team_id: 4, week_number: 2, report_submitted: true, attended: true, session_date: "2026-08-11" },
      { id: 6, team_id: 5, week_number: 2, report_submitted: true, paying_customer_exists: true, session_date: "2026-08-11" }
    ],
    hypotheses: [
      { id: 20, team_id: 1, week_number: 2 },
      { id: 21, team_id: 2, week_number: 2 }
    ],
    customer_interviews: [
      { id: 30, team_id: 1, hypothesis_id: 20, interview_date: "2026-08-10" },
      { id: 31, team_id: 2, hypothesis_id: 21, interview_date: "2026-08-10" }
    ],
    pmf_survey_responses: [
      { id: 40, team_id: 3, pmf_phase: "solution_validation", submitted_at: "2026-08-11T02:00:00Z" }
    ]
  };
}
