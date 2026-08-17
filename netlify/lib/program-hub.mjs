import { programDatabaseConfig } from "./program-database.mjs";
import { collaborationFitMetrics, collaborationFitNotApplicable } from "./collaboration-fit.mjs";
import { loadTeamKeywordRows, teamKeywordsById } from "./team-keyword-store.mjs";
import { deriveTeamKeywords } from "./team-keywords.mjs";
import { SPARKCLAW_APPLICANT_STARTUPS } from "./sparkclaw-applicant-seed.mjs";
import { rankedTaskDetails, TASK_KEYWORD_PENDING } from "../../public/arena/task-keywords.js";
import { isCommunityEventFromOrientation, partnerVisibleProgramEvents } from "../../public/arena/event-timeline.js";

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
    "activity_links",
    "ir_deck_url",
    "is_incorporated",
    "incorporation_date",
    "expertise",
    "domain",
    "ai_idea_summary",
    "domain_level",
    "tech_level",
    "public_one_liner",
    "profile_updated_at",
    "dropped_out",
    "is_test_account",
    "mentor_id"
  ],
  team_members: ["id", "team_id", "is_founder", "title"],
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
  weekly_reports: ["id", "team_id", "week_number", "interview_count", "status"],
  weekly_report_notice: ["id", "title", "body", "button_label", "survey_intro", "updated_at"]
};

const SERVER_USER_AGENT = "sparkclaw-program-hub-reader";
const TABLE_LIMIT = 1000;
const SHARED_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "naver.com",
  "daum.net",
  "hanmail.net",
  "kakao.com",
  "yahoo.com",
  "yahoo.co.kr",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "qq.com",
  "163.com"
]);

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
  const viewerTeamRow = viewerTeamRowForEmail(rows, viewer?.email);
  return {
    directory: projectPartnerDirectory(rows, keywordRows),
    viewer: effectiveProgramViewer(viewer, viewerTeamRow),
    viewerTeamId: viewerTeamRow?.id == null ? null : String(viewerTeamRow.id),
    isParticipant: Boolean(viewerTeamRow)
  };
}

// Login only needs the authenticated viewer, its Program team link, and the
// contact-safe directory. The rest of the Program database is hydrated after
// the app is already visible, so a member is not blocked on every operational
// table during sign-in.
export async function loadProgramHubBootstrap(viewer, env = process.env, fetchImpl = fetch) {
  const context = await loadProgramDirectoryContext(viewer, env, fetchImpl);
  const generatedAt = new Date().toISOString();
  const effectiveViewer = context.viewer;
  const staff = Boolean(effectiveViewer?.canScore);
  const safeDirectory = context.directory;
  const teams = safeDirectory.map((team) => ({
    ...team,
    isViewerTeam: sameId(team.id, context.viewerTeamId)
  }));
  const viewerTeam = teams.find((team) => team.isViewerTeam) || null;
  const collaborationFit = viewerTeam
    ? collaborationFitMetrics({ candidateTeams: safeDirectory, viewerTeam })
    : staff || effectiveViewer?.role === "human_validator"
      ? collaborationFitNotApplicable(safeDirectory.length)
      : collaborationFitMetrics({ candidateTeams: safeDirectory });
  const sectors = sectorSummary(teams);
  const profilesReady = teams.filter((team) => team.oneLiner && team.serviceSummary && team.websiteUrl).length;
  const partnerDirectory = effectiveViewer?.role === "b2b_partner" ? safeDirectory : null;
  const memberDirectory = effectiveViewer?.role === "member"
    ? safeDirectory.filter((team) => !sameId(team.id, context.viewerTeamId))
    : null;

  return {
    project: {
      name: "SparkClaw Program",
      cohort: dominantValue(teams.map((team) => team.group)) || "Discoverer",
      source: "program managing _ sparkclaw",
      generatedAt
    },
    viewer: effectiveViewer,
    viewerTeam,
    permissions: {
      canViewOperations: staff,
      canViewRawDatabase: staff,
      canApplyBenefits: Boolean(viewerTeam && effectiveViewer?.role === "member"),
      canRegisterEvents: Boolean(viewerTeam && effectiveViewer?.role === "member"),
      canSubmitWeeklyReport: Boolean(viewerTeam && effectiveViewer?.role === "member"),
      canManageProgramActions: staff
    },
    metrics: {
      teams: teams.length,
      curatedCompanies: teams.length,
      profilesReady: staff ? profilesReady : viewerTeam && viewerTeam.oneLiner && viewerTeam.serviceSummary && viewerTeam.websiteUrl ? 1 : 0,
      profilePopulation: staff ? teams.length : viewerTeam ? 1 : 0,
      sectors: sectors.length,
      activeBenefits: 0,
      events: 0,
      ...collaborationFit
    },
    sectors,
    teams,
    mentors: [],
    events: [],
    benefits: [],
    mentoringSessions: [],
    weeklyReports: [],
    benefitApplications: [],
    eventRegistrations: [],
    weeklyNotice: null,
    featuredCompanies: [],
    featuredCompaniesCycle: null,
    dataHealth: null,
    bootstrap: true,
    ...(partnerDirectory ? { partnerDirectory } : {}),
    ...(memberDirectory
      ? { memberDirectory, directoryScope: "other_participating_companies" }
      : {})
  };
}

export async function resolveProgramParticipantViewer(viewer, env = process.env, fetchImpl = fetch) {
  if (!viewer) return { viewer, viewerTeamId: null, isParticipant: false, communityDisplayNames: new Map() };
  const config = programDatabaseConfig(env);
  assertConfigured(config);
  const rows = await readFixedTable(config, "teams", PROGRAM_TABLES.teams, fetchImpl);
  const canResolveParticipant = ["public", "member"].includes(viewer.role);
  const viewerTeamRow = canResolveParticipant ? viewerTeamRowForEmail(rows, viewer.email) : null;
  return {
    viewer: effectiveProgramViewer(viewer, viewerTeamRow),
    viewerTeamId: viewerTeamRow?.id == null ? null : String(viewerTeamRow.id),
    isParticipant: Boolean(viewerTeamRow),
    communityDisplayNames: programCommunityDisplayNames(rows)
  };
}

export function projectPartnerDirectory(rows = [], keywordRows = [], activityByTeam = new Map()) {
  const keywordMap = teamKeywordsById(keywordRows);
  return (Array.isArray(rows) ? rows : [])
    .filter((team) => !isExcludedPartnerTeam(team))
    .map((team) => {
      const activity = activityByTeam.get(String(team.id)) || emptyActivity();
      const publicSignals = publicProgressSignals(activity);
      return {
        id: String(team.id || ""),
        name: directoryDisplayName(team),
        companyName: text(team.company_name, 240),
        sector: text(team.sector, 200),
        oneLiner: text(team.public_one_liner || team.one_liner, 1200),
        serviceSummary: text(team.service_summary, 3000),
        domain: text(team.domain, 300),
        aiIdeaSummary: text(team.ai_idea_summary, 3000),
        matchingKeywords: matchingKeywords(team, keywordMap),
        group: text(team.team_group || team.explorer_group, 120),
        programStage: programStage(team),
        publicSignals,
        investorProfile: investorTeamProfile(team, publicSignals),
        websiteUrl: safeUrl(team.website_url),
        privateDetailsVisible: false
      };
    })
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
  const viewerTeamRow = viewerTeamRowForEmail(data.teams, viewer?.email);
  const effectiveViewer = effectiveProgramViewer(viewer, viewerTeamRow);
  const safeProgramDirectory = projectPartnerDirectory(data.teams, keywordRows, activityByTeam);
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
        serviceSummary: text(team.service_summary, 5000),
        group: text(team.team_group || team.explorer_group, 120),
        programStage: programStage(team),
        websiteUrl: safeUrl(team.website_url),
        isIncorporated: canViewPrivate ? Boolean(team.is_incorporated) : null,
        incorporationDate: canViewPrivate ? text(team.incorporation_date, 40) : "",
        expertise: canViewPrivate ? text(team.expertise, 3000) : "",
        domain: text(team.domain, 300),
        aiIdeaSummary: text(team.ai_idea_summary, 5000),
        matchingKeywords: matchingKeywords(team, keywordMap),
        domainLevel: canViewPrivate ? text(team.domain_level, 120) : "",
        techLevel: canViewPrivate ? text(team.tech_level, 120) : "",
        investorProfile: investorTeamProfile(
          team,
          publicProgressSignals(activityByTeam.get(String(team.id)) || emptyActivity())
        ),
        mentor: canViewPrivate && mentor ? publicMentor(mentor) : null,
        privateDetailsVisible: canViewPrivate,
        isViewerTeam,
        activity: canViewPrivate ? activityByTeam.get(String(team.id)) || emptyActivity() : null,
        publicSignals: publicProgressSignals(activityByTeam.get(String(team.id)) || emptyActivity())
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

  const programEvents = data.events
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
    .filter(isCommunityEventFromOrientation)
    .sort(compareEventSchedule);
  const events = effectiveViewer?.role === "b2b_partner"
    ? partnerVisibleProgramEvents(programEvents)
    : programEvents;

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
  for (const row of data.team_members) {
    const item = activity(row.team_id);
    item.teamSize += 1;
    if (row.is_founder) item.founders += 1;
    const role = text(row.title, 80);
    if (role && !item.teamRoles.includes(role)) item.teamRoles.push(role);
  }
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
  for (const row of data.weekly_reports) {
    const item = activity(row.team_id);
    item.weeklyReports += 1;
    item.weeklyReportInterviews = Math.max(item.weeklyReportInterviews, finiteNumber(row.interview_count));
    item.latestReportWeek = Math.max(item.latestReportWeek, finiteNumber(row.week_number));
  }
  return map;
}

function publicProgressSignals(activity = emptyActivity()) {
  return {
    teamSize: finiteNumber(activity.teamSize),
    teamRoles: activity.teamRoles.slice(0, 8),
    customerInterviews: Math.max(
      finiteNumber(activity.interviews),
      finiteNumber(activity.reportedInterviews),
      finiteNumber(activity.weeklyReportInterviews)
    ),
    hypotheses: finiteNumber(activity.hypotheses),
    mentoringSessions: finiteNumber(activity.mentoringSessions),
    pmfResponses: finiteNumber(activity.pmfResponses),
    payingCustomers: finiteNumber(activity.payingCustomers),
    weeklyReports: finiteNumber(activity.weeklyReports),
    pmfPhase: text(activity.latestPmfPhase, 120)
  };
}

function programStage(team = {}) {
  const raw = text(team.team_group || team.explorer_group, 120).toLowerCase();
  if (raw.includes("scaler")) return "scaler";
  if (raw.includes("validator")) return "validator";
  if (raw.includes("discoverer")) return "discoverer";
  return raw || "미입력";
}

function emptyActivity() {
  return {
    teamSize: 0,
    founders: 0,
    teamRoles: [],
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
    reportReminders: 0,
    weeklyReports: 0,
    weeklyReportInterviews: 0,
    latestReportWeek: 0
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
    const raw = String(value || "").trim();
    const url = new URL(canonicalProgramWebsite(raw));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function canonicalProgramWebsite(value) {
  const normalized = String(value || "").trim();
  if (/^https?:\/\/(?:www\.)?acscent\.co\.kr(?:\/|$)/i.test(normalized)) {
    return "https://www.acscent.co.kr/";
  }
  return normalized;
}

function safeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : "";
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

const GENERIC_PROFILE_ALIASES = new Set(["company", "startup", "service", "platform", "labs", "studio", "테크", "랩스"]);
const APPLICANT_PROFILE_INDEX = buildApplicantProfileIndex(SPARKCLAW_APPLICANT_STARTUPS);

export function investorTeamProfile(team = {}, publicSignals = {}) {
  const application = applicantProfileForTeam(team);
  const submittedTeamStory = safeProfileCopy(application?.description, 1400);
  const submittedTraction = safeProfileCopy(application?.traction, 900);
  const serviceStory = text(
    team.public_one_liner || team.service_summary || team.one_liner || team.ai_idea_summary || team.item,
    1000
  );
  const teamSummary = submittedTeamStory || serviceStory || "제출된 팀·창업자 소개를 보완하고 있습니다.";
  const programProof = programProofSummary(publicSignals);
  const metrics = investorMetricHighlights(submittedTraction, publicSignals);
  const specialtyTasks = investorSpecialtyTasks(application, team, metrics, programProof);
  const partneringSummary = investorPartneringSummary(application, teamSummary, metrics, programProof);
  const roleTitles = uniqueStrings(publicSignals.teamRoles, 6, 60);
  const sourceParts = [application ? "팀 제출 지원자료" : "Program Supabase 팀 프로필"];
  if (programProof) sourceParts.push("Program Supabase 운영 집계");
  const profileUpdatedAt = validTimestamp(team.profile_updated_at);
  const evidenceLinks = structuredEntryCount(team.activity_links);
  const proofPoints = [];

  if (submittedTraction) {
    proofPoints.push({ label: "시장·실행 근거", value: submittedTraction });
  }
  if (programProof) {
    proofPoints.push({ label: "프로그램 검증", value: programProof });
  }
  if (roleTitles.length) {
    proofPoints.push({ label: "팀 역할 구성", value: roleTitles.join(" · ") });
  }
  const readiness = [
    team.is_incorporated ? `법인 설립${team.incorporation_date ? ` (${text(team.incorporation_date, 20)})` : ""}` : "",
    safeUrl(team.ir_deck_url) ? "IR 자료 등록" : "",
    evidenceLinks ? `외부 활동 근거 ${evidenceLinks}건 등록` : ""
  ].filter(Boolean).join(" · ");
  if (readiness) proofPoints.push({ label: "투자 검토 준비도", value: readiness });

  return {
    teamSummary,
    partneringSummary,
    tractionSummary: submittedTraction,
    programProof,
    metrics,
    specialtyTasks,
    proofPoints: proofPoints.slice(0, 4),
    strengthTags: uniqueStrings(application?.tags, 6, 50),
    sourceLabel: sourceParts.join(" · "),
    profileUpdatedAt,
    requiresVerification: true
  };
}

const INVESTOR_TASK_BY_CATEGORY = new Map([
  ["AI / SaaS", ["에이전트 기반 핵심 업무 자동화", "반복 업무를 여러 도구와 연결해 사람이 확인할 결과물까지 완성하는 운영형 AI를 구축합니다."]],
  ["Climate / Energy", ["설비 에너지·탄소 운영 최적화", "설비와 운영 데이터를 연결해 에너지 비용, 배출량과 감축 실행을 현장 단위로 관리합니다."]],
  ["Commerce / Retail", ["상품·재고·구매전환 운영", "상품과 고객 행동 데이터를 연결해 재고, 추천, 가격과 구매전환 의사결정을 개선합니다."]],
  ["Creative / Art", ["창작물 탐색·거래·권리화", "창작자와 콘텐츠 데이터를 구조화해 발견, 거래, 제작과 권리 관리의 병목을 줄입니다."]],
  ["Developer / AI Infrastructure", ["AI 개발·배포 인프라 자동화", "모델과 코드를 실제 서비스에 배포하고 관측·평가·운영하는 개발 워크플로를 단축합니다."]],
  ["Education / Research", ["학습·연구 개인화 운영", "학습자와 연구 데이터를 기반으로 콘텐츠, 피드백과 다음 학습·연구 행동을 개인화합니다."]],
  ["Finance / Investment", ["금융 심사·결제·리스크 판단", "거래와 금융 데이터를 구조화해 심사, 결제, 자산관리와 이상징후 판단을 지원합니다."]],
  ["Food / F&B", ["식품·외식 상품화와 매장 운영", "수요와 상품·매장 데이터를 연결해 메뉴 개발, 생산, 재고와 고객 운영을 최적화합니다."]],
  ["HR / Workforce", ["채용·인력 배치·성과 운영", "직무와 구성원 데이터를 구조화해 후보 탐색, 평가, 배치와 인력 운영의 반복 업무를 줄입니다."]],
  ["Healthcare / Bio", ["임상·의료 데이터 기반 현장 의사결정", "의료·건강·바이오 데이터를 실제 진료, 연구, 환자관리와 규제 업무에 적용할 수 있게 구조화합니다."]],
  ["Legal / IP", ["법률·특허 문서 검토와 권리화", "계약·법률·특허 자료에서 핵심 근거를 추출해 검토, 출원과 컴플라이언스 의사결정을 빠르게 합니다."]],
  ["Manufacturing / Materials", ["제조·소재 데이터 기반 공정 의사결정", "시험·설비·생산 데이터를 연결해 소재 선정, 품질 판정과 공정 최적화 시간을 줄입니다."]],
  ["Marketing / AdTech", ["캠페인·콘텐츠·고객반응 운영 자동화", "고객 반응과 콘텐츠·광고 데이터를 연결해 제작, 집행, 측정과 후속 최적화를 자동화합니다."]],
  ["Media / Entertainment", ["미디어 제작·유통·팬 반응 운영", "콘텐츠와 이용자 데이터를 바탕으로 제작, 편집, 유통과 팬 참여 업무를 확장합니다."]],
  ["Operations / Productivity", ["문서·승인·후속업무 워크플로 자동화", "조직의 반복 문서와 승인·후속 업무를 연결해 처리시간과 운영 누락을 줄입니다."]],
  ["Real Estate / PropTech", ["부동산 문의·승인·자산운영 자동화", "매물·고객·자산 데이터를 연결해 문의 접수부터 승인, 후속관리와 자산운영까지 자동화합니다."]],
  ["Robotics / Mobility", ["로봇·모빌리티 현장 인지와 제어", "센서와 현장 데이터를 바탕으로 이동, 작업, 안전과 유지보수 판단을 자동화합니다."]],
  ["Security / Compliance", ["보안 이상징후·규제 대응 자동화", "로그와 정책·거래 데이터를 연결해 위협 탐지, 조사와 규제 증빙 업무를 단축합니다."]],
  ["Travel / Hospitality", ["여행 상품·예약·현장운영 최적화", "고객 수요와 상품·예약 데이터를 연결해 여행 설계, 판매와 현장 운영을 효율화합니다."]]
]);

function investorSpecialtyTasks(application, team, metrics, programProof) {
  const category = text(application?.category, 120);
  const [taskLabel, categoryDescription] = INVESTOR_TASK_BY_CATEGORY.get(category) || [
    nicheTaskLabel(team),
    safeProfileCopy(team.service_summary || team.ai_idea_summary || team.one_liner, 320) || "공개 프로필에서 가장 강한 업무 적용 범위를 추가 확인하고 있습니다."
  ];
  const productName = safeProfileCopy(application?.products?.[0]?.name || team.item || team.name || team.company_name, 90);
  const operatingSentence = bestOperatingSentence(application?.description);
  const evidence = metrics[0] || programProof || "공개 정량 근거 보완 필요";
  const primaryTask = {
    label: [productName, taskLabel].filter(Boolean).join(" · "),
    description: operatingSentence || categoryDescription,
    evidence,
    rank: 1,
    tier: "core",
    basis: [application ? "지원서 원문" : "Program Supabase 프로필"]
  };
  const rankedTasks = rankedTaskDetails({
    name: team.name,
    companyName: team.company_name,
    item: team.item,
    category: application?.category,
    sector: team.sector,
    domain: team.domain,
    tagline: application?.tagline,
    description: [application?.description, application?.traction].filter(Boolean).join(" "),
    oneLiner: team.public_one_liner || team.one_liner,
    serviceSummary: team.service_summary,
    aiIdeaSummary: team.ai_idea_summary,
    expertise: team.expertise,
    functions: application?.functions,
    tags: application?.tags,
    products: application?.products,
    matchingKeywords: deriveTeamKeywords(team)
  }, 32)
    .filter((task) => task.label !== TASK_KEYWORD_PENDING)
    .filter((task) => !normalizeProfileAlias(primaryTask.label).includes(normalizeProfileAlias(task.label)))
    .map((task, index) => ({
      ...task,
      rank: index + 2,
      tier: index < 2 ? "adjacent" : "extended",
      evidence: task.evidenceTerms?.length
        ? task.evidenceTerms.join(" · ")
        : task.basis?.join(" · ") || evidence
    }));
  return [primaryTask, ...rankedTasks];
}

function investorPartneringSummary(application, teamSummary, metrics, programProof) {
  if (!application) return safeProfileCopy(teamSummary, 420);
  const teamProof = firstSentence(teamSummary, 260);
  const executionProof = metrics[0] || programProof;
  return [teamProof, executionProof ? `실행 근거: ${executionProof}` : ""].filter(Boolean).join(" ");
}

function bestOperatingSentence(value) {
  const sentences = String(value || "")
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => safeProfileCopy(sentence, 360))
    .filter(Boolean);
  const best = sentences
    .map((sentence, index) => ({
      sentence,
      score: (/(?:운영|처리|분석|예측|자동|모델|에이전트|워크플로|플랫폼|시스템|검증|구축)/u.test(sentence) ? 5 : 0)
        + (/\d/u.test(sentence) ? 2 : 0)
        - (index === 0 && /(?:대표|창업가|출신|졸업|전공|학력|MBA|경력)/iu.test(sentence) ? 4 : 0)
    }))
    .sort((left, right) => right.score - left.score)[0];
  return best?.score > 0 ? best.sentence : "";
}

function nicheTaskLabel(team = {}) {
  const name = text(team.domain || team.sector, 120);
  return name ? `${name} 특화 업무` : "핵심 업무 자동화";
}

function firstSentence(value, maxLength) {
  return safeProfileCopy(String(value || "").split(/(?<=[.!?])\s+/u)[0], maxLength);
}

function buildApplicantProfileIndex(startups = []) {
  return (Array.isArray(startups) ? startups : []).map((startup) => ({
    startup,
    aliases: profileAliases([
      startup.name,
      startup.founder,
      ...(Array.isArray(startup.products) ? startup.products.map((product) => product?.name) : [])
    ])
  }));
}

function applicantProfileForTeam(team = {}) {
  const aliases = profileAliases([team.name, team.company_name, team.item]);
  const founder = normalizeProfileAlias(team.founder);
  let best = null;
  let bestScore = 0;
  for (const candidate of APPLICANT_PROFILE_INDEX) {
    let score = profileAliasScore(aliases, candidate.aliases);
    if (founder && founder === normalizeProfileAlias(candidate.startup?.founder)) score += 40;
    if (score > bestScore) {
      best = candidate.startup;
      bestScore = score;
    }
  }
  return bestScore >= 90 ? best : null;
}

function profileAliases(values = []) {
  const aliases = new Set();
  for (const source of Array.isArray(values) ? values : [values]) {
    const value = String(source || "").normalize("NFKC").trim();
    if (!value) continue;
    for (const part of [value, ...value.split(/[\/|·()]+/)]) {
      const alias = normalizeProfileAlias(part);
      if (alias.length >= 3 && !GENERIC_PROFILE_ALIASES.has(alias)) aliases.add(alias);
    }
  }
  return [...aliases];
}

function normalizeProfileAlias(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(?:주식회사|유한회사|㈜|\(주\)|\b(?:co|corp|corporation|inc|ltd|company)\b)/gi, "")
    .replace(/[^0-9a-z가-힣]/gi, "");
}

function profileAliasScore(left = [], right = []) {
  let score = 0;
  for (const a of left) {
    for (const b of right) {
      if (a === b) score = Math.max(score, 100 + Math.min(a.length, 30));
      else if (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a))) {
        score = Math.max(score, 72 + Math.min(a.length, b.length));
      }
    }
  }
  return score;
}

function safeProfileCopy(value, maxLength) {
  return text(value, maxLength)
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "")
    .replace(/(?:\+?82[-.\s]?)?(?:0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function investorMetricHighlights(traction, publicSignals = {}) {
  const highlights = [];
  for (const chunk of String(traction || "").split(/(?<=[.!?])\s+|\s*[·;]\s*|,(?=\s*[^\d])|(?<!\d),/u)) {
    const value = text(chunk, 120);
    if (/\d/.test(value) && value.length >= 5 && !highlights.includes(value)) highlights.push(value);
    if (highlights.length >= 3) break;
  }
  if (!highlights.length) {
    const fallback = programProofSummary(publicSignals);
    if (fallback) highlights.push(fallback);
  }
  return highlights.slice(0, 3);
}

function programProofSummary(signals = {}) {
  const values = [
    finiteNumber(signals.teamSize) ? `팀 ${finiteNumber(signals.teamSize)}명` : "",
    finiteNumber(signals.customerInterviews) ? `고객 인터뷰 ${finiteNumber(signals.customerInterviews)}회` : "",
    finiteNumber(signals.payingCustomers) ? `유료 고객 ${finiteNumber(signals.payingCustomers)}곳` : "",
    finiteNumber(signals.weeklyReports) ? `주간 리포트 ${finiteNumber(signals.weeklyReports)}회` : "",
    finiteNumber(signals.hypotheses) ? `검증 가설 ${finiteNumber(signals.hypotheses)}개` : "",
    finiteNumber(signals.mentoringSessions) ? `멘토링 ${finiteNumber(signals.mentoringSessions)}회` : ""
  ].filter(Boolean);
  return values.slice(0, 4).join(" · ");
}

function uniqueStrings(values, limit, maxLength) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => text(value, maxLength)).filter(Boolean))].slice(0, limit);
}

function structuredEntryCount(value) {
  if (Array.isArray(value)) return value.filter(Boolean).length;
  if (value && typeof value === "object") return Object.values(value).filter(Boolean).length;
  const raw = String(value || "").trim();
  if (!raw) return 0;
  try {
    return structuredEntryCount(JSON.parse(raw));
  } catch {
    return raw.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean).length;
  }
}

function validTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function sameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

function isExcludedPartnerTeam(team) {
  if (team?.dropped_out === true || team?.is_test_account === true) return true;
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
  return normalizedTeamEmails(value).includes(target);
}

function normalizedTeamEmails(value) {
  return String(value || "")
    .split(/[,\n;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"));
}

function emailDomain(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  return separator > 0 ? normalized.slice(separator + 1) : "";
}

function viewerTeamRowForEmail(rows = [], viewerEmail) {
  const teams = Array.isArray(rows) ? rows : [];
  const exact = teams.find((team) => teamEmailMatches(team.email, viewerEmail));
  if (exact) return exact;

  const domain = emailDomain(viewerEmail);
  if (!domain || SHARED_EMAIL_DOMAINS.has(domain)) return null;
  const matches = teams.filter((team) =>
    normalizedTeamEmails(team.email).some((email) => emailDomain(email) === domain)
  );
  return matches.length === 1 ? matches[0] : null;
}

export function programCommunityDisplayNames(rows = []) {
  const displayNames = new Map();
  const domainCandidates = new Map();
  for (const team of Array.isArray(rows) ? rows : []) {
    const displayName = directoryDisplayName(team);
    if (!displayName) continue;
    for (const email of normalizedTeamEmails(team.email)) {
      displayNames.set(email, displayName);
      const domain = emailDomain(email);
      if (!domain || SHARED_EMAIL_DOMAINS.has(domain)) continue;
      if (!domainCandidates.has(domain)) domainCandidates.set(domain, new Set());
      domainCandidates.get(domain).add(displayName);
    }
  }
  for (const [domain, names] of domainCandidates) {
    if (names.size === 1) displayNames.set(`@${domain}`, [...names][0]);
  }
  return displayNames;
}

function effectiveProgramViewer(viewer, viewerTeamRow) {
  const effectiveViewer = viewerTeamRow && viewer?.role === "public"
    ? {
        ...viewer,
        role: "member",
        roleLabel: "Approved member",
        canSubmitProducts: true,
        canViewPartnerRequests: true
      }
    : viewer;
  const communityDisplayName = viewerTeamRow ? directoryDisplayName(viewerTeamRow) : "";
  return communityDisplayName
    ? { ...effectiveViewer, communityDisplayName }
    : effectiveViewer;
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
