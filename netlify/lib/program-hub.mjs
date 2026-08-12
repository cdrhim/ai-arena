import { programDatabaseConfig } from "./program-database.mjs";
import { collaborationFitMetrics, collaborationFitNotApplicable } from "./collaboration-fit.mjs";
import { loadTeamKeywordRows, teamKeywordsById } from "./team-keyword-store.mjs";
import { deriveTeamKeywords } from "./team-keywords.mjs";

const PROGRAM_TABLES = {
  teams: [
    "id",
    "name",
    "founder",
    "item",
    "status",
    "is_builder",
    "company_name",
    "email",
    "sector",
    "is_solo_founder",
    "one_liner",
    "service_summary",
    "explorer_group",
    "team_group",
    "website_url",
    "is_incorporated",
    "incorporation_date",
    "expertise",
    "domain",
    "ai_idea_summary",
    "domain_level",
    "tech_level",
    "mentor_id"
  ],
  mentors: ["id", "name", "affiliation", "booking_url", "color"],
  hypotheses: ["id", "team_id", "week_number", "created_at"],
  customer_interviews: ["id", "hypothesis_id", "team_id", "interview_date", "pain_level", "created_at"],
  mentoring_sessions: [
    "id",
    "team_id",
    "mentor_id",
    "week_number",
    "session_date",
    "attended",
    "customer_interview_done",
    "customer_interview_count",
    "paying_customer_exists",
    "paying_customer_count",
    "session_time",
    "report_submitted"
  ],
  pmf_survey_responses: [
    "id",
    "team_id",
    "poc_data",
    "paying_customers",
    "repurchase_rate",
    "interview_count",
    "interview_mode",
    "pmf_phase",
    "submitted_at"
  ],
  events: [
    "id",
    "title",
    "event_date",
    "event_time",
    "location",
    "category",
    "description",
    "kind",
    "is_online",
    "speaker",
    "target_group",
    "venue_status",
    "meal_status",
    "team_id"
  ],
  event_registrations: ["id", "event_id", "team_id", "attended", "registered_at"],
  benefits: [
    "id",
    "title",
    "provider",
    "category",
    "description",
    "tier",
    "value_text",
    "is_active",
    "sort_order",
    "logo_url"
  ],
  benefit_applications: ["id", "benefit_id", "team_id", "status", "applied_at", "reviewed_at"],
  report_reminders: ["id", "team_id", "week_number", "created_at"],
  weekly_report_notice: ["id", "title", "body", "button_label", "survey_intro", "updated_at"]
};

const SERVER_USER_AGENT = "sparkclaw-program-hub-reader";
const TABLE_LIMIT = 1000;

export async function loadPartnerDirectory(env = process.env, fetchImpl = fetch) {
  const context = await loadProgramDirectoryContext(null, env, fetchImpl);
  return context.directory;
}

export async function loadProgramDirectoryContext(viewer, env = process.env, fetchImpl = fetch) {
  const config = programDatabaseConfig(env);
  assertConfigured(config);
  const [rows, keywordRows] = await Promise.all([
    readFixedTable(config, "teams", PROGRAM_TABLES.teams, fetchImpl),
    loadTeamKeywordRows(env, fetchImpl)
  ]);
  const viewerTeamRow = rows.find((team) => teamEmailMatches(team.email, viewer?.email));
  return {
    directory: projectPartnerDirectory(rows, keywordRows),
    viewer: effectiveProgramViewer(viewer, viewerTeamRow),
    viewerTeamId: viewerTeamRow?.id == null ? null : String(viewerTeamRow.id),
    isParticipant: Boolean(viewerTeamRow)
  };
}

export async function resolveProgramParticipantViewer(viewer, env = process.env, fetchImpl = fetch) {
  if (!viewer || viewer.role !== "public") {
    return { viewer, viewerTeamId: null, isParticipant: viewer?.role === "member" };
  }
  const config = programDatabaseConfig(env);
  assertConfigured(config);
  const rows = await readFixedTable(config, "teams", PROGRAM_TABLES.teams, fetchImpl);
  const viewerTeamRow = rows.find((team) => teamEmailMatches(team.email, viewer.email));
  return {
    viewer: effectiveProgramViewer(viewer, viewerTeamRow),
    viewerTeamId: viewerTeamRow?.id == null ? null : String(viewerTeamRow.id),
    isParticipant: Boolean(viewerTeamRow)
  };
}

export function projectPartnerDirectory(rows = [], keywordRows = []) {
  const keywordMap = teamKeywordsById(keywordRows);
  return (Array.isArray(rows) ? rows : [])
    .filter((team) => !isExcludedPartnerTeam(team))
    .map((team) => ({
      id: String(team.id || ""),
      name: directoryDisplayName(team),
      companyName: text(team.company_name, 240),
      sector: text(team.sector, 200),
      oneLiner: text(team.one_liner, 1200),
      serviceSummary: text(team.service_summary, 3000),
      domain: text(team.domain, 300),
      aiIdeaSummary: text(team.ai_idea_summary, 3000),
      matchingKeywords: matchingKeywords(team, keywordMap),
      group: text(team.team_group || team.explorer_group, 120),
      websiteUrl: safeUrl(team.website_url),
      privateDetailsVisible: false
    }))
    .filter((team) => team.id && team.name);
}

export async function loadProgramHub(viewer, env = process.env, fetchImpl = fetch) {
  const config = programDatabaseConfig(env);
  assertConfigured(config);

  const [tableEntries, keywordRows] = await Promise.all([
    Promise.all(
      Object.entries(PROGRAM_TABLES).map(async ([table, columns]) => {
        const rows = await readFixedTable(config, table, columns, fetchImpl);
        return [table, rows];
      })
    ),
    loadTeamKeywordRows(env, fetchImpl)
  ]);
  const data = Object.fromEntries(tableEntries);
  const keywordMap = teamKeywordsById(keywordRows);
  const generatedAt = new Date().toISOString();
  const mentorsById = new Map(data.mentors.map((mentor) => [String(mentor.id), mentor]));
  const activityByTeam = buildActivityByTeam(data);
  const staff = Boolean(viewer?.canScore);
  const viewerTeamRow = data.teams.find((team) => teamEmailMatches(team.email, viewer?.email));
  const effectiveViewer = effectiveProgramViewer(viewer, viewerTeamRow);
  const safeProgramDirectory = projectPartnerDirectory(data.teams, keywordRows);
  const partnerDirectory = effectiveViewer?.role === "b2b_partner"
    ? safeProgramDirectory
    : null;
  const memberDirectory = effectiveViewer?.role === "member"
    ? safeProgramDirectory.filter((team) => !sameId(team.id, viewerTeamRow?.id))
    : null;

  const teams = data.teams
    .map((team) => {
      const mentor = team.mentor_id ? mentorsById.get(String(team.mentor_id)) : null;
      const isViewerTeam = sameId(team.id, viewerTeamRow?.id);
      const canViewPrivate = staff || isViewerTeam;
      return {
        id: team.id,
        name: directoryDisplayName(team),
        companyName: text(team.company_name, 240),
        founder: canViewPrivate ? text(team.founder, 200) : "",
        item: canViewPrivate ? text(team.item, 3000) : "",
        status: text(team.status, 100),
        sector: text(team.sector, 200),
        isBuilder: canViewPrivate ? Boolean(team.is_builder) : null,
        isSoloFounder: canViewPrivate ? Boolean(team.is_solo_founder) : null,
        oneLiner: text(team.one_liner, 1200),
        serviceSummary: canViewPrivate ? text(team.service_summary, 5000) : "",
        group: text(team.team_group || team.explorer_group, 120),
        websiteUrl: safeUrl(team.website_url),
        isIncorporated: canViewPrivate ? Boolean(team.is_incorporated) : null,
        incorporationDate: canViewPrivate ? text(team.incorporation_date, 40) : "",
        expertise: canViewPrivate ? text(team.expertise, 3000) : "",
        domain: canViewPrivate ? text(team.domain, 300) : "",
        aiIdeaSummary: canViewPrivate ? text(team.ai_idea_summary, 5000) : "",
        matchingKeywords: matchingKeywords(team, keywordMap),
        domainLevel: canViewPrivate ? text(team.domain_level, 120) : "",
        techLevel: canViewPrivate ? text(team.tech_level, 120) : "",
        mentor: canViewPrivate && mentor ? publicMentor(mentor) : null,
        privateDetailsVisible: canViewPrivate,
        isViewerTeam,
        activity: canViewPrivate ? activityByTeam.get(String(team.id)) || emptyActivity() : null
      };
    })
    .filter((team) => isMeaningfulDirectoryValue(team.name))
    .sort((left, right) => left.name.localeCompare(right.name, "ko"));

  const teamNames = new Map(teams.map((team) => [String(team.id), team.name]));
  const mentorNames = new Map(data.mentors.map((mentor) => [String(mentor.id), text(mentor.name, 200)]));
  const benefitTitles = new Map(data.benefits.map((benefit) => [String(benefit.id), text(benefit.title, 240)]));
  const eventTitles = new Map(data.events.map((event) => [String(event.id), text(event.title, 240)]));
  const allMentoringSessions = data.mentoring_sessions.map((session) => ({
    id: String(session.id),
    teamId: session.team_id,
    teamName: teamNames.get(String(session.team_id)) || "Team",
    mentorId: session.mentor_id,
    mentorName: mentorNames.get(String(session.mentor_id)) || "",
    weekNumber: finiteNumber(session.week_number),
    date: text(session.session_date, 40),
    time: text(session.session_time, 40),
    attended: Boolean(session.attended),
    customerInterviewDone: Boolean(session.customer_interview_done),
    customerInterviewCount: finiteNumber(session.customer_interview_count),
    payingCustomerExists: Boolean(session.paying_customer_exists),
    payingCustomerCount: finiteNumber(session.paying_customer_count),
    reportSubmitted: Boolean(session.report_submitted)
  }));
  const mentoringSessions = staff
    ? allMentoringSessions
    : allMentoringSessions.filter((session) => sameId(session.teamId, viewerTeamRow?.id));
  const allWeeklyReports = data.mentoring_sessions
    .filter((session) => session.report_submitted)
    .map((session) => ({
      id: `program_report_${session.id}`,
      teamId: session.team_id,
      teamName: teamNames.get(String(session.team_id)) || "Team",
      weekLabel: session.week_number ? `Week ${session.week_number}` : text(session.session_date, 40) || "Program report",
      progress: "기존 프로그램 DB에서 제출 완료로 확인된 리포트입니다.",
      nextSteps: "",
      blockers: "",
      status: "reviewed",
      submittedAt: session.session_date || null,
      updatedAt: session.session_date || null,
      source: "program_database"
    }));
  const weeklyReports = staff
    ? allWeeklyReports
    : allWeeklyReports.filter((report) => sameId(report.teamId, viewerTeamRow?.id));
  const allBenefitApplications = data.benefit_applications.map((application) => ({
    id: String(application.id),
    benefitId: application.benefit_id,
    benefitTitle: benefitTitles.get(String(application.benefit_id)) || "Benefit",
    teamId: application.team_id,
    teamName: teamNames.get(String(application.team_id)) || "Team",
    status: text(application.status || "submitted", 40),
    appliedAt: application.applied_at || null,
    reviewedAt: application.reviewed_at || null,
    updatedAt: application.reviewed_at || application.applied_at || null,
    source: "program_database"
  }));
  const allEventRegistrations = data.event_registrations.map((registration) => ({
    id: String(registration.id),
    eventId: registration.event_id,
    eventTitle: eventTitles.get(String(registration.event_id)) || "Event",
    teamId: registration.team_id,
    teamName: teamNames.get(String(registration.team_id)) || "Team",
    status: registration.attended ? "attended" : "registered",
    registeredAt: registration.registered_at || null,
    updatedAt: registration.registered_at || null,
    source: "program_database"
  }));
  const benefitApplications = staff
    ? allBenefitApplications
    : allBenefitApplications.filter((application) => sameId(application.teamId, viewerTeamRow?.id));
  const eventRegistrations = staff
    ? allEventRegistrations
    : allEventRegistrations.filter((registration) => sameId(registration.teamId, viewerTeamRow?.id));

  const events = data.events
    .map((event) => ({
      id: event.id,
      title: text(event.title, 240),
      date: text(event.event_date, 40),
      time: text(event.event_time, 40),
      location: text(event.location, 300),
      category: text(event.category || event.kind, 100),
      kind: text(event.kind, 100),
      description: text(event.description, 2500),
      isOnline: Boolean(event.is_online),
      speaker: text(event.speaker, 200),
      targetGroup: text(event.target_group, 200),
      venueStatus: text(event.venue_status, 100),
      mealStatus: text(event.meal_status, 100),
      teamId: event.team_id,
      registrations: data.event_registrations.filter((registration) => sameId(registration.event_id, event.id)).length,
      attendance: data.event_registrations.filter(
        (registration) => sameId(registration.event_id, event.id) && registration.attended
      ).length,
      viewerRegistration:
        latestRecord(eventRegistrations.filter((registration) => sameId(registration.eventId, event.id))) || null
    }))
    .sort(compareEventSchedule);

  const benefits = data.benefits
    .map((benefit) => ({
      id: benefit.id,
      title: text(benefit.title, 240),
      provider: text(benefit.provider, 200),
      category: text(benefit.category, 120),
      description: text(benefit.description, 3000),
      tier: text(benefit.tier, 100),
      value: text(benefit.value_text, 500),
      isActive: Boolean(benefit.is_active),
      sortOrder: finiteNumber(benefit.sort_order),
      logoUrl: safeUrl(benefit.logo_url),
      applications: data.benefit_applications.filter((application) => sameId(application.benefit_id, benefit.id)).length,
      viewerApplication:
        latestRecord(benefitApplications.filter((application) => sameId(application.benefitId, benefit.id))) || null
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.provider.localeCompare(right.provider, "ko"));

  const mentors = data.mentors.map(publicMentor).sort((left, right) => left.name.localeCompare(right.name, "ko"));
  const metrics = buildMetrics(teams, events, benefits, mentors, data);
  const safeCandidateTeams = safeProgramDirectory;
  const viewerTeamForMatching = viewerTeamRow
    ? { ...viewerTeamRow, matchingKeywords: matchingKeywords(viewerTeamRow, keywordMap) }
    : null;
  Object.assign(
    metrics,
    viewerTeamRow
      ? collaborationFitMetrics({ candidateTeams: safeCandidateTeams, viewerTeam: viewerTeamForMatching })
      : staff || effectiveViewer?.role === "human_validator"
        ? collaborationFitNotApplicable(safeCandidateTeams.length)
        : collaborationFitMetrics({ candidateTeams: safeCandidateTeams })
  );
  if (!staff) {
    const viewerTeam = teams.find((team) => team.isViewerTeam);
    metrics.builders = null;
    metrics.incorporated = null;
    metrics.profilesReady = viewerTeam?.oneLiner && viewerTeam?.serviceSummary && viewerTeam?.websiteUrl ? 1 : 0;
    metrics.profilePopulation = viewerTeam ? 1 : 0;
  } else {
    metrics.profilePopulation = teams.length;
  }
  const dataHealth = staff ? buildDataHealth(teams, data) : null;
  const latestNotice = [...data.weekly_report_notice]
    .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))[0];

  return {
    project: {
      name: "SparkClaw Program",
      cohort: dominantValue(teams.map((team) => team.group)) || "Discoverer",
      source: "program managing _ sparkclaw",
      generatedAt
    },
    viewer: effectiveViewer,
    viewerTeam: teams.find((team) => team.isViewerTeam) || null,
    permissions: {
      canViewOperations: staff,
      canViewRawDatabase: staff,
      canApplyBenefits: Boolean(viewerTeamRow && effectiveViewer?.role === "member"),
      canRegisterEvents: Boolean(viewerTeamRow && effectiveViewer?.role === "member"),
      canSubmitWeeklyReport: Boolean(viewerTeamRow && effectiveViewer?.role === "member"),
      canManageProgramActions: staff
    },
    metrics,
    sectors: sectorSummary(teams),
    teams,
    mentors,
    events,
    benefits,
    mentoringSessions,
    weeklyReports,
    benefitApplications,
    eventRegistrations,
    weeklyNotice: latestNotice
      ? {
          title: text(latestNotice.title, 300),
          body: text(latestNotice.body, 5000),
          buttonLabel: text(latestNotice.button_label, 160),
          surveyIntro: text(latestNotice.survey_intro, 2000),
          updatedAt: latestNotice.updated_at || null
        }
      : null,
    dataHealth,
    ...(partnerDirectory ? { partnerDirectory } : {}),
    ...(memberDirectory
      ? { memberDirectory, directoryScope: "other_participating_companies" }
      : {})
  };
}

async function readFixedTable(config, table, columns, fetchImpl) {
  const url = new URL(`${config.restUrl}/${table}`);
  url.searchParams.set("select", columns.join(","));
  url.searchParams.set("limit", String(TABLE_LIMIT));
  const response = await fetchImpl(url, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "user-agent": SERVER_USER_AGENT,
      Prefer: "count=exact"
    }
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `Unable to read Program table: ${table}.`);
    error.status = 502;
    throw error;
  }
  return Array.isArray(payload) ? payload : [];
}

function buildActivityByTeam(data) {
  const map = new Map();
  const activity = (teamId) => {
    const key = String(teamId || "");
    if (!map.has(key)) map.set(key, emptyActivity());
    return map.get(key);
  };

  for (const row of data.hypotheses) activity(row.team_id).hypotheses += 1;
  for (const row of data.customer_interviews) activity(row.team_id).interviews += 1;
  for (const row of data.pmf_survey_responses) {
    const item = activity(row.team_id);
    item.pmfResponses += 1;
    item.latestPmfPhase = text(row.pmf_phase, 120);
    item.reportedInterviews = Math.max(item.reportedInterviews, finiteNumber(row.interview_count));
  }
  for (const row of data.mentoring_sessions) {
    const item = activity(row.team_id);
    item.mentoringSessions += 1;
    if (row.attended) item.mentoringAttendance += 1;
    item.reportedInterviews = Math.max(item.reportedInterviews, finiteNumber(row.customer_interview_count));
    item.payingCustomers = Math.max(item.payingCustomers, finiteNumber(row.paying_customer_count));
    if (row.report_submitted) item.reportsSubmitted += 1;
    if (String(row.session_date || "") > String(item.latestSessionDate || "")) {
      item.latestSessionDate = row.session_date || null;
    }
  }
  for (const row of data.event_registrations) {
    const item = activity(row.team_id);
    item.eventRegistrations += 1;
    if (row.attended) item.eventAttendance += 1;
  }
  for (const row of data.benefit_applications) activity(row.team_id).benefitApplications += 1;
  for (const row of data.report_reminders) activity(row.team_id).reportReminders += 1;
  return map;
}

function emptyActivity() {
  return {
    mentoringSessions: 0,
    mentoringAttendance: 0,
    hypotheses: 0,
    interviews: 0,
    reportedInterviews: 0,
    pmfResponses: 0,
    latestPmfPhase: "",
    payingCustomers: 0,
    reportsSubmitted: 0,
    latestSessionDate: null,
    eventRegistrations: 0,
    eventAttendance: 0,
    benefitApplications: 0,
    reportReminders: 0
  };
}

function compareEventSchedule(left, right) {
  const leftDate = eventDateOrder(left.date);
  const rightDate = eventDateOrder(right.date);
  const leftIsValid = Number.isFinite(leftDate);
  const rightIsValid = Number.isFinite(rightDate);
  if (leftIsValid !== rightIsValid) return leftIsValid ? -1 : 1;
  if (leftIsValid && leftDate !== rightDate) return leftDate - rightDate;

  const timeDifference = eventTimeOrder(left.time) - eventTimeOrder(right.time);
  if (timeDifference) return timeDifference;
  return String(left.title || left.id || "").localeCompare(String(right.title || right.id || ""), "ko");
}

function eventDateOrder(value) {
  const textValue = String(value || "").trim();
  const dateMatch = textValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
  if (dateMatch) {
    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month - 1 &&
      candidate.getUTCDate() === day
    ) {
      return candidate.getTime();
    }
  }
  const timestamp = Date.parse(textValue);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function eventTimeOrder(value) {
  const match = String(value || "").match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/);
  if (!match) return 86_399;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
}

function buildMetrics(teams, events, benefits, mentors, data) {
  const now = new Date().toISOString().slice(0, 10);
  return {
    teams: teams.length,
    builders: teams.filter((team) => team.isBuilder).length,
    incorporated: teams.filter((team) => team.isIncorporated).length,
    profilesReady: teams.filter((team) => team.oneLiner && team.serviceSummary && team.websiteUrl).length,
    sectors: new Set(teams.flatMap((team) => splitSectors(team.sector))).size,
    mentors: mentors.length,
    events: events.length,
    upcomingEvents: events.filter((event) => event.date && event.date >= now).length,
    activeBenefits: benefits.filter((benefit) => benefit.isActive).length,
    mentoringSessions: data.mentoring_sessions.length,
    hypotheses: data.hypotheses.length,
    customerInterviews: data.customer_interviews.length,
    pmfResponses: data.pmf_survey_responses.length
  };
}

function buildDataHealth(teams, data) {
  const fields = [
    ["oneLiner", "한 줄 소개"],
    ["serviceSummary", "서비스 설명"],
    ["websiteUrl", "웹사이트"],
    ["sector", "산업 분류"],
    ["aiIdeaSummary", "AI 아이디어"],
    ["mentor", "담당 멘토"]
  ];
  return {
    tableCounts: Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length])),
    profileCompleteness: fields.map(([key, label]) => {
      const complete = teams.filter((team) => Boolean(team[key])).length;
      const missingTeams = teams
        .filter((team) => !team[key])
        .map((team) => text(team.name || team.companyName, 240) || `팀 ${team.id}`)
        .sort((left, right) => left.localeCompare(right, "ko"));
      return {
        key,
        label,
        complete,
        total: teams.length,
        percent: teams.length ? Math.round((complete / teams.length) * 100) : 0,
        missingTeams
      };
    })
  };
}

export function sectorSummary(teams) {
  const counts = new Map();
  for (const team of teams) {
    for (const sector of splitSectors(team.sector)) counts.set(sector, (counts.get(sector) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ko"));
}

function splitSectors(value) {
  return String(value || "")
    .split(/[,/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function publicMentor(mentor) {
  return {
    id: mentor.id,
    name: text(mentor.name, 200),
    affiliation: text(mentor.affiliation, 240),
    bookingUrl: safeUrl(mentor.booking_url),
    color: safeColor(mentor.color)
  };
}

function dominantValue(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
}

function text(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : "";
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

function isExcludedPartnerTeam(team) {
  const status = String(team?.status || "").trim().toLowerCase();
  const restrictedEnglish = /(^|[_\s-])(blacklist|blocked|rejected|inactive|removed|private|draft|pending(?:[_\s-]?review)?|under[_\s-]?review|waitlist(?:ed)?|applicant|applied|submitted|paused|on[_\s-]?hold)($|[_\s-])/i;
  const restrictedKorean = /(탈락|차단|비공개|초안|심사\s*중|검토\s*중|대기자?|지원(?:서|접수|중)?|신청\s*중|논의\s*중|보류)/;
  return !directoryDisplayName(team) || restrictedEnglish.test(status) || restrictedKorean.test(status);
}

function directoryDisplayName(team = {}) {
  return [team.name, team.company_name, team.companyName]
    .map((value) => text(value, 240))
    .find(isMeaningfulDirectoryValue) || "";
}

function isMeaningfulDirectoryValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  const placeholders = new Set(["-", "--", "—", "–", "미분류", "미입력", "없음", "n/a", "na", "none", "null", "unknown"]);
  if (placeholders.has(normalized)) return false;
  return !/^(?:test(?:[\s_-]*(?:team|company|\d+))?|테스트(?:[\s_-]*(?:팀|회사))?)$/i.test(normalized);
}

function latestRecord(items) {
  return [...items].sort((left, right) =>
    String(right.updatedAt || right.appliedAt || right.registeredAt || "").localeCompare(
      String(left.updatedAt || left.appliedAt || left.registeredAt || "")
    )
  )[0];
}

function teamEmailMatches(value, viewerEmail) {
  const target = String(viewerEmail || "").trim().toLowerCase();
  if (!target) return false;
  return String(value || "")
    .split(/[,\n;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
    .includes(target);
}

function effectiveProgramViewer(viewer, viewerTeamRow) {
  return viewerTeamRow && viewer?.role === "public"
    ? {
        ...viewer,
        role: "member",
        roleLabel: "Approved member",
        canSubmitProducts: true,
        canViewPartnerRequests: true
      }
    : viewer;
}

function matchingKeywords(team, keywordMap) {
  const stored = keywordMap.get(String(team?.id || ""))?.keywords || [];
  return stored.length ? stored : deriveTeamKeywords(team);
}

function assertConfigured(config) {
  if (config.configured) return;
  const error = new Error(
    "Program database is not configured. Set SPARKCLAW_PROGRAM_SUPABASE_URL and SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY."
  );
  error.status = 503;
  throw error;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
