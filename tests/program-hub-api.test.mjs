import assert from "node:assert/strict";
import test from "node:test";

import programHub from "../netlify/functions/program-hub.mjs";
import { loadPartnerDirectory, loadProgramHub, loadProgramHubBootstrap } from "../netlify/lib/program-hub.mjs";

const PROGRAM_ENV = {
  SPARKCLAW_PROGRAM_SUPABASE_URL: "https://program.supabase.co",
  SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY: "server-secret"
};

test("program hub projects team data and aggregates activity without writes", async () => {
  const requests = [];
  const snapshot = await loadProgramHub(
    { email: "staff@sparklabs.co.kr", role: "sparklabs", canScore: true },
    PROGRAM_ENV,
    async (url, options) => {
      requests.push({ url: String(url), options });
      const table = new URL(url).pathname.split("/").pop();
      return Response.json(fixtures()[table] || []);
    }
  );

  assert.equal(snapshot.metrics.teams, 2);
  assert.equal(snapshot.metrics.activeBenefits, 1);
  assert.equal(snapshot.metrics.mentoringSessions, 1);
  assert.equal(snapshot.metrics.customerInterviews, 1);
  assert.equal(snapshot.teams[0].activity.mentoringSessions, 1);
  assert.equal(snapshot.teams[0].activity.interviews, 1);
  assert.equal(snapshot.teams[0].publicSignals.teamSize, 2);
  assert.equal(snapshot.teams[0].publicSignals.customerInterviews, 5);
  assert.equal(snapshot.teams[0].publicSignals.weeklyReports, 1);
  assert.equal(snapshot.teams[0].programStage, "discoverer");
  assert.equal(snapshot.teams[0].founder, "Founder One");
  assert.equal(snapshot.permissions.canViewRawDatabase, true);
  assert.equal(snapshot.metrics.collaborationFitStatus, "not_applicable");
  assert.equal(snapshot.metrics.collaborationFitCount, null);
  assert.equal(snapshot.dataHealth.tableCounts.teams, 2);
  assert.deepEqual(
    snapshot.dataHealth.profileCompleteness.find((item) => item.key === "oneLiner").missingTeams,
    ["Beta"]
  );
  assert.deepEqual(
    snapshot.dataHealth.profileCompleteness.find((item) => item.key === "mentor").missingTeams,
    ["Alpha", "Beta"]
  );
  assert.ok(requests.every((request) => request.options.method === undefined));
  assert.ok(requests.every((request) => request.options.headers.apikey === "server-secret"));
  assert.ok(requests.every((request) => request.options.headers["user-agent"].includes("program-hub-reader")));
});

test("login bootstrap reads only the team directory before background hydration", async () => {
  const requestedTables = [];
  const snapshot = await loadProgramHubBootstrap(
    { email: "member@example.com", role: "member", canScore: false },
    PROGRAM_ENV,
    async (url) => {
      const table = new URL(url).pathname.split("/").pop();
      requestedTables.push(table);
      return Response.json(fixtures()[table] || []);
    }
  );

  assert.deepEqual(requestedTables, ["teams"]);
  assert.equal(snapshot.bootstrap, true);
  assert.equal(snapshot.viewerTeam.id, "1");
  assert.equal(snapshot.viewer.role, "member");
  assert.deepEqual(snapshot.memberDirectory.map((team) => team.name), ["Beta"]);
  assert.deepEqual(snapshot.events, []);
  assert.deepEqual(snapshot.benefits, []);
  assert.equal(snapshot.metrics.teams, 2);
  assert.equal(snapshot.metrics.collaborationFitStatus, "ready");
});

test("member hub exposes its own private workspace and hides other teams' private data", async () => {
  const snapshot = await loadProgramHub(
    { email: "member@example.com", role: "member", canScore: false },
    PROGRAM_ENV,
    async (url) => {
      const table = new URL(url).pathname.split("/").pop();
      return Response.json(fixtures()[table] || []);
    }
  );

  const ownTeam = snapshot.teams.find((team) => team.id === 1);
  const otherTeam = snapshot.teams.find((team) => team.id === 2);

  assert.equal(ownTeam.founder, "Founder One");
  assert.equal(ownTeam.item, "AI product");
  assert.equal(ownTeam.serviceSummary, "Alpha service");
  assert.equal(ownTeam.aiIdeaSummary, "Alpha AI");
  assert.equal(ownTeam.expertise, "Enterprise sales");
  assert.equal(ownTeam.activity.mentoringSessions, 1);
  assert.equal(ownTeam.activity.interviews, 1);
  assert.equal(snapshot.viewerTeam.id, 1);
  assert.equal(ownTeam.isViewerTeam, true);
  assert.equal(Object.hasOwn(ownTeam, "email"), false);

  assert.equal(otherTeam.founder, "");
  assert.equal(otherTeam.item, "");
  assert.equal(otherTeam.serviceSummary, "Private clinical workflow details");
  assert.equal(otherTeam.aiIdeaSummary, "Private model strategy");
  assert.equal(otherTeam.expertise, "");
  assert.equal(otherTeam.activity, null);
  assert.deepEqual(otherTeam.publicSignals, {
    teamSize: 0,
    teamRoles: [],
    customerInterviews: 0,
    hypotheses: 0,
    mentoringSessions: 0,
    pmfResponses: 0,
    payingCustomers: 0,
    weeklyReports: 0,
    pmfPhase: ""
  });
  assert.equal(otherTeam.isViewerTeam, false);
  assert.deepEqual(snapshot.benefitApplications.map((item) => item.teamId), [1]);
  assert.deepEqual(snapshot.eventRegistrations.map((item) => item.teamId), [1]);
  assert.equal(snapshot.permissions.canViewOperations, false);
  assert.equal(snapshot.permissions.canViewRawDatabase, false);
  assert.equal(snapshot.metrics.collaborationFitStatus, "ready");
  assert.equal(typeof snapshot.metrics.collaborationFitCount, "number");
  assert.equal(snapshot.dataHealth, null);
  assert.equal(snapshot.directoryScope, "other_participating_companies");
  assert.deepEqual(snapshot.memberDirectory.map((team) => team.name), ["Beta"]);
  assert.equal(snapshot.memberDirectory[0].serviceSummary, "Private clinical workflow details");
  assert.equal(snapshot.memberDirectory[0].aiIdeaSummary, "Private model strategy");
  assert.equal(snapshot.memberDirectory[0].privateDetailsVisible, false);
  assert.equal(snapshot.memberDirectory[0].programStage, "discoverer");
  assert.equal(Object.hasOwn(snapshot.memberDirectory[0], "publicSignals"), true);
  assert.equal(typeof snapshot.memberDirectory[0].investorProfile.teamSummary, "string");
  assert.equal(Object.hasOwn(snapshot.memberDirectory[0], "email"), false);
  assert.equal(Object.hasOwn(snapshot.memberDirectory[0], "founder"), false);
  assert.equal(Object.hasOwn(snapshot.memberDirectory[0], "status"), false);
  assert.equal(Object.hasOwn(snapshot.memberDirectory[0], "activity"), false);
});

test("program events are returned in date and start-time order", async () => {
  const data = fixtures();
  data.events = [
    { id: 63, title: "October", event_date: "2026-10-01", event_time: "15:00:00", kind: "행사" },
    { id: 62, title: "September late", event_date: "2026-09-29", event_time: "15:00:00", kind: "행사" },
    { id: 61, title: "September early", event_date: "2026-09-29", event_time: "14:00:00", kind: "행사" }
  ];
  const snapshot = await loadProgramHub(
    { email: "staff@sparklabs.co.kr", role: "sparklabs", canScore: true },
    PROGRAM_ENV,
    async (url) => {
      const table = new URL(url).pathname.split("/").pop();
      return Response.json(data[table] || []);
    }
  );

  assert.deepEqual(snapshot.events.map((event) => event.id), [61, 62, 63]);
});

test("Community Events exclude schedules before BootCamp Orientation on 13 August 2026", async () => {
  const data = fixtures();
  data.events = [
    { id: 60, title: "Earlier event", event_date: "2026-08-12", event_time: "15:00:00", kind: "행사" },
    { id: 61, title: "BootCamp Orientation", event_date: "2026-08-13", event_time: "10:00:00", kind: "행사" },
    { id: 62, title: "Follow-up session", event_date: "2026-08-14", event_time: "14:00:00", kind: "행사" },
    { id: 63, title: "Undated event", event_date: "", event_time: "", kind: "행사" }
  ];
  const snapshot = await loadProgramHub(
    { email: "staff@sparklabs.co.kr", role: "sparklabs", canScore: true },
    PROGRAM_ENV,
    async (url) => {
      const table = new URL(url).pathname.split("/").pop();
      return Response.json(data[table] || []);
    }
  );

  assert.deepEqual(snapshot.events.map((event) => event.id), [61, 62]);
  assert.equal(snapshot.metrics.events, 2);
});

test("B2B partners receive the OT anchor and later public major events only", async () => {
  const data = fixtures();
  data.events = [
    { id: 60, title: "Earlier event", event_date: "2026-08-12", event_time: "15:00:00", kind: "행사" },
    { id: 61, title: "Internal team check-in", event_date: "2026-08-20", event_time: "10:00:00", kind: "미팅", team_id: 1 },
    { id: 62, title: "SparkClaw Demo Day", event_date: "2026-09-30", event_time: "14:00:00", kind: "데모데이", target_group: "전체 공개" }
  ];
  const snapshot = await loadProgramHub(
    { id: "partner-1", email: "partner@example.com", role: "b2b_partner", canScore: false },
    PROGRAM_ENV,
    async (url) => {
      const table = new URL(url).pathname.split("/").pop();
      return Response.json(data[table] || []);
    }
  );

  assert.deepEqual(snapshot.events.map((event) => event.id), ["partner-program-orientation-2026-08-13", 62]);
  assert.equal(snapshot.events[0].date, "2026-08-13");
  assert.equal(snapshot.events[1].title, "SparkClaw Demo Day");
});

test("program hub API requires a valid Arena login", async () => {
  const previous = captureEnv(["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
  process.env.SUPABASE_URL = "https://auth.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  try {
    const response = await programHub(new Request("https://example.test/api/program-hub"));
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.match(payload.error, /Login required/);
  } finally {
    restoreEnv(previous);
  }
});

test("Youngone B2B login receives every eligible participant as a contact-safe basic profile", async () => {
  const previous = captureEnv([
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SPARKCLAW_PROGRAM_SUPABASE_URL",
    "SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY"
  ]);
  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = "https://auth.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SPARKCLAW_PROGRAM_SUPABASE_URL = PROGRAM_ENV.SPARKCLAW_PROGRAM_SUPABASE_URL;
  process.env.SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY = PROGRAM_ENV.SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY;

  global.fetch = async (url) => {
    const value = String(url);
    if (value.startsWith("https://auth.supabase.co") && value.includes("/auth/v1/user")) {
      return Response.json({
        id: "youngone-user",
        email: "test@gmail.com",
        user_metadata: { role: "member", organization: "Spoofed" }
      });
    }
    if (value.startsWith("https://auth.supabase.co") && value.includes("/rest/v1/sc_arena_team_keywords")) {
      return Response.json([]);
    }
    if (value.startsWith(PROGRAM_ENV.SPARKCLAW_PROGRAM_SUPABASE_URL)) {
      const table = new URL(value).pathname.split("/").pop();
      return Response.json(fixtures()[table] || []);
    }
    return originalFetch(url);
  };

  try {
    const response = await programHub(new Request("https://example.test/api/program-hub", {
      headers: { Authorization: "Bearer valid-session" }
    }));
    const payload = await response.json();

    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.viewer.role, "b2b_partner");
    assert.equal(payload.viewer.organization, "영원무역");
    assert.equal(payload.partnerProfile.id, "youngone-corporation");
    assert.equal(payload.partnerProfile.organizationName, "영원무역");
    assert.ok(payload.partnerProfile.priorities.length >= 4);
    assert.equal(Object.hasOwn(payload.partnerProfile, "ownerEmails"), false);
    assert.equal(JSON.stringify(payload.partnerProfile).includes("test@gmail.com"), false);
    assert.equal(payload.directoryScope, "all_participating_companies");
    assert.deepEqual(payload.teams.map((team) => team.name), ["Alpha", "Beta"]);
    assert.equal(payload.metrics.teams, 2);
    assert.equal(payload.metrics.collaborationFitStatus, "ready");
    assert.equal(typeof payload.metrics.collaborationFitCount, "number");
    assert.equal(Array.isArray(payload.metrics.collaborationFitCompanies), true);
    assert.equal(Object.hasOwn(payload.metrics, "collaborationFitScores"), false);
    assert.equal(payload.sectors.length, 3);
    assert.equal(payload.teams[0].serviceSummary, "Alpha service");
    assert.equal(payload.teams[1].aiIdeaSummary, "Private model strategy");
    assert.ok(payload.teams.every((team) => team.privateDetailsVisible === false));
    assert.ok(payload.teams.every((team) => !Object.hasOwn(team, "email") && !Object.hasOwn(team, "founder") && !Object.hasOwn(team, "status")));
    assert.ok(payload.teams.every((team) => !Object.hasOwn(team, "item") && !Object.hasOwn(team, "expertise") && !Object.hasOwn(team, "activity")));
    assert.ok(payload.teams.every((team) => team.programStage === "discoverer" && Object.hasOwn(team, "publicSignals")));
    assert.ok(payload.teams.every((team) => !Object.hasOwn(team, "isBuilder") && !Object.hasOwn(team, "isSoloFounder")));
    assert.equal(payload.permissions.canViewRawDatabase, false);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

test("partner directory excludes rejected teams and private contact fields", async () => {
  const teams = await loadPartnerDirectory(PROGRAM_ENV, async () => Response.json([
    {
      id: 1,
      name: "Curated AI",
      email: "private@example.com",
      founder: "Private Founder",
      status: "최종 선발",
      sector: "SaaS",
      one_liner: "AI workflow",
      service_summary: "Enterprise automation",
      website_url: "https://curated.example.com"
    },
    { id: 2, name: "Rejected AI", status: "서류 탈락", one_liner: "Must not appear" },
    { id: 3, name: "Private AI", status: "private", one_liner: "Must not appear" },
    { id: 4, name: "Draft AI", status: "draft", one_liner: "Must not appear" },
    { id: 5, name: "Review AI", status: "심사 중", one_liner: "Must not appear" },
    { id: 6, name: "Waitlist AI", status: "waitlist", one_liner: "Must not appear" },
    { id: 7, name: "-", company_name: "-", status: "approved", sector: "-" },
    { id: 8, name: "-", company_name: "Fallback Corp", status: "최종 선발", sector: "SaaS" },
    { id: 9, name: "test", company_name: "test", status: "approved", sector: "Data Analytics" },
    { id: 10, name: "TEST", company_name: "Actual Company", status: "approved", sector: "SaaS" }
  ]));

  assert.deepEqual(teams.map((team) => team.name), ["Curated AI", "Fallback Corp", "Actual Company"]);
  assert.equal(Object.hasOwn(teams[0], "email"), false);
  assert.equal(Object.hasOwn(teams[0], "founder"), false);
  assert.equal(Object.hasOwn(teams[0], "isBuilder"), false);
  assert.equal(Object.hasOwn(teams[0], "isSoloFounder"), false);
  assert.equal(teams[0].websiteUrl, "https://curated.example.com/");
});

test("partner directory returns every eligible participant without an arbitrary 100-company cap", async () => {
  const rows = Array.from({ length: 125 }, (_, index) => ({
    id: index + 1,
    name: `Participant ${index + 1}`,
    status: "최종선발",
    sector: "AI",
    one_liner: "Eligible participant"
  }));
  const teams = await loadPartnerDirectory(PROGRAM_ENV, async () => Response.json(rows));
  assert.equal(teams.length, 125);
  assert.equal(teams.at(-1).name, "Participant 125");
});

test("partner directory repairs the legacy AC'SCENT URL that concatenated a second website", async () => {
  const teams = await loadPartnerDirectory(PROGRAM_ENV, async () => Response.json([
    {
      id: 53,
      name: "네안데르 / AC'SCENT",
      status: "최종 선발",
      sector: "Fashion",
      one_liner: "AI fragrance experience",
      website_url: "https://www.acscent.co.kr/en/https:/www.smoat.co.kr"
    }
  ]));

  assert.equal(teams[0].websiteUrl, "https://www.acscent.co.kr/");
});

function fixtures() {
  return {
    teams: [
      {
        id: 1,
        name: "Alpha",
        founder: "Founder One",
        email: "member@example.com",
        company_name: "Alpha Inc.",
        item: "AI product",
        status: "최종선발",
        sector: "SaaS",
        explorer_group: "discoverer",
        one_liner: "Alpha one liner",
        service_summary: "Alpha service",
        ai_idea_summary: "Alpha AI",
        expertise: "Enterprise sales",
        website_url: "https://alpha.example.com",
        is_builder: true,
        is_incorporated: true
      },
      {
        id: 2,
        name: "Beta",
        founder: "Founder Two",
        company_name: "Beta",
        status: "최종선발",
        sector: "Healthcare/Medicaltech",
        explorer_group: "discoverer",
        item: "Clinical decision support",
        service_summary: "Private clinical workflow details",
        ai_idea_summary: "Private model strategy",
        expertise: "Clinical operations",
        is_builder: false,
        is_incorporated: false
      }
    ],
    mentors: [{ id: 8, name: "Mentor", affiliation: "SparkLabs", booking_url: "https://example.com/book" }],
    team_members: [
      { id: 11, team_id: 1, is_founder: true },
      { id: 12, team_id: 1, is_founder: false }
    ],
    hypotheses: [{ id: 20, team_id: 1, week_number: 1 }],
    customer_interviews: [{ id: 30, team_id: 1, hypothesis_id: 20, pain_level: 4 }],
    mentoring_sessions: [
      {
        id: 40,
        team_id: 1,
        mentor_id: 8,
        attended: true,
        customer_interview_count: 3,
        paying_customer_count: 1,
        report_submitted: true,
        session_date: "2026-07-01"
      }
    ],
    pmf_survey_responses: [{ id: 50, team_id: 1, interview_count: 4, pmf_phase: "Problem validation" }],
    events: [{ id: 60, title: "Orientation", event_date: "2026-07-20", kind: "행사" }],
    event_registrations: [
      { id: 70, event_id: 60, team_id: 1, attended: true },
      { id: 71, event_id: 60, team_id: 2, attended: false }
    ],
    benefits: [{ id: 80, title: "Cloud credits", provider: "Cloud", category: "AI", is_active: true, sort_order: 1 }],
    benefit_applications: [
      { id: 90, benefit_id: 80, team_id: 1, status: "approved" },
      { id: 91, benefit_id: 80, team_id: 2, status: "submitted" }
    ],
    report_reminders: [{ id: 100, team_id: 1, week_number: 1 }],
    weekly_reports: [{ id: 105, team_id: 1, week_number: 2, interview_count: 5, status: "submitted" }],
    weekly_report_notice: [{ id: 110, title: "Weekly", body: "Submit report", updated_at: "2026-07-20T00:00:00Z" }]
  };
}

function captureEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
