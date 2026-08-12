import { programDatabaseConfig } from "./program-database.mjs";
import { deriveTeamKeywords } from "./team-keywords.mjs";

const SOURCE_TABLES = {
  teams: ["id", "name", "company_name", "status", "sector", "one_liner", "service_summary", "domain", "ai_idea_summary"],
  hypotheses: ["id", "team_id", "week_number", "created_at"],
  customer_interviews: ["id", "hypothesis_id", "team_id", "interview_date", "pain_level", "created_at"],
  mentoring_sessions: [
    "id", "team_id", "week_number", "session_date", "attended", "customer_interview_done",
    "customer_interview_count", "paying_customer_exists", "paying_customer_count", "report_submitted"
  ],
  pmf_survey_responses: ["id", "team_id", "poc_data", "paying_customers", "repurchase_rate", "interview_count", "pmf_phase", "submitted_at"]
};

const TABLE_LIMIT = 1000;
const SERVER_USER_AGENT = "sparkclaw-weekly-featured-reader";

export async function loadWeeklyFeaturedSource(env = process.env, fetchImpl = fetch) {
  const config = programDatabaseConfig(env);
  if (!config.configured) throw statusError("Program database is not configured.", 503);
  const entries = await Promise.all(Object.entries(SOURCE_TABLES).map(async ([table, columns]) => {
    const url = new URL(`${config.restUrl}/${table}`);
    url.searchParams.set("select", columns.join(","));
    url.searchParams.set("limit", String(TABLE_LIMIT));
    const response = await fetchImpl(url, {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "user-agent": SERVER_USER_AGENT
      }
    });
    const payload = await safeJson(response);
    if (!response.ok) throw statusError(payload?.message || `Unable to read weekly source table: ${table}.`, 502);
    return [table, Array.isArray(payload) ? payload : []];
  }));
  return Object.fromEntries(entries);
}

export function buildWeeklyFeaturedSnapshot(source = {}, { now = new Date(), limit = 4 } = {}) {
  const teams = Array.isArray(source.teams) ? source.teams : [];
  const completedReports = (Array.isArray(source.mentoring_sessions) ? source.mentoring_sessions : [])
    .filter((row) => Boolean(row.report_submitted) && row.team_id != null);
  if (!completedReports.length) return null;

  const numberedWeeks = completedReports.map((row) => finiteNumber(row.week_number)).filter((value) => value != null);
  const latestWeek = numberedWeeks.length ? Math.max(...numberedWeeks) : null;
  const reports = latestWeek == null
    ? reportsFromLatestDatedCycle(completedReports)
    : completedReports.filter((row) => finiteNumber(row.week_number) === latestWeek);
  if (!reports.length) return null;

  const cycleDate = latestDate(reports.map((row) => row.session_date)) || kstDateKey(now);
  const cycleKey = latestWeek == null ? `program-date-${cycleDate}` : `program-week-${latestWeek}`;
  const weekLabel = latestWeek == null ? `${cycleDate.replaceAll("-", ".")} update` : `Week ${latestWeek}`;
  const reportTeamIds = new Set(reports.map((row) => String(row.team_id)));
  const hypotheses = (Array.isArray(source.hypotheses) ? source.hypotheses : []).filter((row) => {
    if (!reportTeamIds.has(String(row.team_id))) return false;
    return latestWeek == null || finiteNumber(row.week_number) === latestWeek;
  });
  const hypothesisIds = new Set(hypotheses.map((row) => String(row.id)));
  const interviews = (Array.isArray(source.customer_interviews) ? source.customer_interviews : []).filter((row) =>
    reportTeamIds.has(String(row.team_id)) && (!hypothesisIds.size || hypothesisIds.has(String(row.hypothesis_id)))
  );
  const pmfByTeam = latestRowsByTeam(source.pmf_survey_responses || [], "submitted_at");
  const teamsById = new Map(teams.map((team) => [String(team.id), team]));

  const items = reports
    .map((report) => weeklyCandidate({
      report,
      team: teamsById.get(String(report.team_id)),
      interviews: interviews.filter((row) => String(row.team_id) === String(report.team_id)),
      hypotheses: hypotheses.filter((row) => String(row.team_id) === String(report.team_id)),
      pmf: pmfByTeam.get(String(report.team_id)) || null
    }))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || right.signalCount - left.signalCount || left.companyName.localeCompare(right.companyName, "ko"))
    .slice(0, clamp(limit, 1, 4))
    .map((item, index) => ({ ...item, rank: index + 1 }));
  if (!items.length) return null;

  const sourceUpdatedAt = latestDate([
    ...reports.map((row) => row.session_date),
    ...interviews.flatMap((row) => [row.interview_date, row.created_at]),
    ...[...pmfByTeam.values()].map((row) => row.submitted_at)
  ]);
  return {
    cycleKey,
    weekLabel,
    scheduledFor: mondayRefreshAt(now),
    sourceUpdatedAt: sourceUpdatedAt ? `${sourceUpdatedAt}T00:00:00+09:00` : new Date(now).toISOString(),
    generatedAt: new Date(now).toISOString(),
    items
  };
}

function weeklyCandidate({ report, team, interviews, hypotheses, pmf }) {
  if (!team || !eligibleTeam(team)) return null;
  const reportInterviewCount = Math.max(0, finiteNumber(report.customer_interview_count) || 0);
  const observedInterviewCount = interviews.length;
  const interviewCount = Math.max(reportInterviewCount, observedInterviewCount, finiteNumber(pmf?.interview_count) || 0);
  const payingCustomerCount = Math.max(0, finiteNumber(report.paying_customer_count) || 0, finiteNumber(pmf?.paying_customers) || 0);
  const repurchaseRate = normalizedRate(pmf?.repurchase_rate);
  const paidSignal = Boolean(report.paying_customer_exists) || payingCustomerCount > 0;
  const interviewSignal = Boolean(report.customer_interview_done) || interviewCount > 0;
  const pmfSignal = Boolean(pmf?.submitted_at || pmf?.pmf_phase || pmf?.poc_data);
  const attended = Boolean(report.attended);
  const score = clamp(Math.round(
    22
    + (attended ? 8 : 0)
    + (interviewSignal ? 14 : 0)
    + Math.min(interviewCount, 10) * 2
    + (paidSignal ? 22 : 0)
    + Math.min(payingCustomerCount, 5) * 3
    + (pmfSignal ? 8 : 0)
    + Math.min(repurchaseRate, 100) * 0.08
    + Math.min(hypotheses.length, 3) * 2
  ), 0, 100);
  const signalCount = [attended, interviewSignal, paidSignal, pmfSignal, hypotheses.length > 0].filter(Boolean).length;
  const achievement = safeAchievement({ paidSignal, interviewSignal, pmfSignal, attended });
  const hook = safeHook({ paidSignal, interviewSignal, pmfSignal });
  const profileKeywords = deriveTeamKeywords(team).filter((item) => String(item || "").trim()).slice(0, 2);
  const performanceKeyword = paidSignal ? "고객 검증" : interviewSignal ? "문제 검증" : pmfSignal ? "PMF 업데이트" : "주간 실행";
  return {
    teamId: String(team.id),
    companyName: cleanText(team.name || team.company_name, 240),
    achievement,
    hook,
    keywords: unique([performanceKeyword, ...profileKeywords]).slice(0, 3),
    score,
    signalCount,
    signals: {
      reportSubmitted: true,
      attended,
      interviewSignal,
      paidSignal,
      pmfSignal,
      hypothesisSignal: hypotheses.length > 0
    }
  };
}

function safeAchievement({ paidSignal, interviewSignal, pmfSignal, attended }) {
  if (paidSignal && interviewSignal) return "고객 인터뷰와 유료 고객 검증 신호를 포함한 주간 실행 업데이트를 완료했습니다.";
  if (paidSignal) return "유료 고객 검증 신호와 다음 실행 계획의 주간 업데이트를 완료했습니다.";
  if (interviewSignal && pmfSignal) return "고객 인터뷰 기반 문제 검증과 최신 PMF 업데이트를 완료했습니다.";
  if (interviewSignal) return "고객 인터뷰를 통한 문제 검증과 다음 실행 계획 업데이트를 완료했습니다.";
  if (pmfSignal) return "최신 PMF 데이터와 다음 실행 계획의 주간 업데이트를 완료했습니다.";
  return attended
    ? "멘토링 참여와 주간 실행 업데이트를 완료했습니다."
    : "이번 주 핵심 실행 내용과 다음 단계를 업데이트했습니다.";
}

function safeHook({ paidSignal, interviewSignal, pmfSignal }) {
  if (paidSignal) return "고객 검증에서 실제 사업 신호까지 진전";
  if (interviewSignal && pmfSignal) return "고객 근거와 PMF 데이터를 함께 업데이트";
  if (interviewSignal) return "고객 인터뷰로 문제 가설을 구체화";
  if (pmfSignal) return "최신 PMF 근거로 실행 방향을 정리";
  return "주간 실행 결과와 다음 단계를 명확히 정리";
}

function reportsFromLatestDatedCycle(reports) {
  const latest = latestDate(reports.map((row) => row.session_date));
  return latest ? reports.filter((row) => String(row.session_date || "").slice(0, 10) === latest) : reports;
}

function latestRowsByTeam(rows, dateField) {
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.team_id || "");
    if (!key) continue;
    const current = result.get(key);
    if (!current || Date.parse(row?.[dateField] || 0) > Date.parse(current?.[dateField] || 0)) result.set(key, row);
  }
  return result;
}

function eligibleTeam(team) {
  const name = cleanText(team.name || team.company_name, 240);
  const status = cleanText(team.status, 80).toLowerCase();
  return Boolean(name) && !/(^|\s)test($|\s)|테스트/i.test(name) && !["withdrawn", "rejected", "inactive"].includes(status);
}

function normalizedRate(value) {
  const number = finiteNumber(value);
  if (number == null || number < 0) return 0;
  return number <= 1 ? number * 100 : number;
}

function latestDate(values) {
  return (values || []).map((value) => String(value || "").slice(0, 10)).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort().at(-1) || "";
}

function kstDateKey(value) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function mondayRefreshAt(value) {
  const now = new Date(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short"
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const monday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - ((weekday + 6) % 7), 0, 0, 0));
  return `${monday.toISOString().slice(0, 10)}T09:00:00+09:00`;
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function unique(values) {
  const seen = new Set();
  return (values || []).filter((value) => {
    const text = String(value || "").trim();
    const key = text.toLocaleLowerCase("ko-KR");
    if (!text || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
