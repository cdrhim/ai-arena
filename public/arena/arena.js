import { escapeHtml } from "./sanitize.js";
import { isBenefitReadyForDisplay } from "./benefit-visibility.js";
import { summarizeBenefit } from "./benefit-copy.js";
import {
  BENEFIT_QUALIFICATIONS,
  benefitMatchesQualification,
  benefitQualificationLabel,
  benefitTargetQualifications,
  classifyBenefitForViewer,
  viewerBenefitQualification
} from "./benefit-qualification.js";
import { plainEventDescription } from "./event-copy.js";
import { marketDataFromProgramHub } from "./program-market.js";
import { rankedTaskDetails, taskDetails, taskKeywords } from "./task-keywords.js";
import { taskMapEntries } from "./task-map.js";
import { companyIconMarkup } from "./company-icon.js";
import { companyLogoAsset } from "./company-logo.js";
import { companyExternalLinkIcon, companyExternalLinks } from "./company-external-links.js";
import { isAllowedGoogleAdminUser } from "./google-admin-auth.js";
import {
  curatedFeaturedTeams,
  FEATURED_EDITORIAL_CRITERIA,
  featuredCurationForTeam,
  featuredCurationUpdatedLabel
} from "./featured-curation.js";
import {
  advanceProcessStatus,
  finishProcessStatus,
  setProcessStatus,
  startProcessStatus
} from "./progress-status.js?v=ai-arena-20260817-save-progress-v87";
import {
  eventDescriptionPreview,
  formatEventTime,
  isCommunityEventFromOrientation,
  koreanWeekday,
  shouldCollapseEventDescription,
  sortEventsChronologically
} from "./event-timeline.js";
import {
  PUBLIC_BRIEF_LANGUAGE_STORAGE_KEY,
  hasExplicitPublicBriefLanguage,
  normalizePublicBriefLanguage,
  publicBriefCopy,
  publicBriefUrl,
  resolvePublicBriefLanguage
} from "./public-brief-i18n.js";
import { initArenaGuide } from "./arena-guide.js?v=ai-arena-20260817-prompt-transfer-v104";

const SESSION_KEY = "sparkclaw-program-hub-session-v1";
const ARENA_HISTORY_MARKER = "sparkclaw-arena-history-v1";
const ARENA_PAGE_HASHES = Object.freeze({
  overview: "discover",
  advisors: "global-advisors",
  teams: "company-directory",
  discover: "task-driven-search",
  passports: "tech-passports",
  compare: "compare",
  partnerships: "partnerships",
  community: "community",
  arena: "bounty",
  workspace: "my-log",
  calendar: "events",
  benefits: "perks",
  operations: "operations",
  database: "database"
});
const ARENA_HASH_PAGES = Object.freeze(
  Object.fromEntries(Object.entries(ARENA_PAGE_HASHES).map(([page, hash]) => [hash, page]))
);
const storedPublicBriefLanguage = readStoredPublicBriefLanguage();
let publicBriefLanguageWasChosen = hasExplicitPublicBriefLanguage({
  search: window.location.search,
  stored: storedPublicBriefLanguage
});
let publicBriefLanguage = resolvePublicBriefLanguage({
  search: window.location.search,
  stored: storedPublicBriefLanguage,
  browserLanguages: navigator.languages || [navigator.language]
});
const TABLE_LABELS = {
  teams: "팀",
  mentors: "멘토",
  hypotheses: "가설",
  customer_interviews: "고객 인터뷰",
  mentoring_sessions: "멘토링",
  pmf_survey_responses: "PMF 설문",
  events: "일정",
  event_registrations: "행사 등록",
  benefits: "혜택",
  benefit_applications: "혜택 신청",
  report_reminders: "리포트 알림",
  weekly_report_notice: "주간 안내"
};

let authConfig = null;
let authSession = null;
let hub = null;
let programHubLoadGeneration = 0;
let arenaData = null;
let marketData = null;
let selectedArenaChallengeId = "";
let arenaBountyFilter = "all";
let databaseSchema = null;
let applicantExportMetadata = null;
let toastTimer = null;
let programActionPending = false;
let memberAccessReturnFocus = null;
let eventRecommendationContextKey = "";
let eventRecommendationRequestId = 0;
let eventRecommendationPending = false;
let featuredSpotlightEntries = [];
let featuredSpotlightRequestId = 0;
let featuredSpotlightRequestKey = "";
let featuredSpotlightActiveIndex = 0;
let featuredSpotlightRotationTimer = 0;
let featuredSpotlightWheelLockUntil = 0;
let latestArenaAnnouncement = null;
let arenaAnnouncementRequestId = 0;
let adminBenefitNoticeRequestId = 0;
let collaborationFitReasonRequestId = 0;
let collaborationFitReasonRequestKey = "";
let collaborationFitReasonPending = false;
let collaborationFitReasonsById = new Map();
let ecosystemSwitcherCloseTimer = 0;
let activeArenaPage = "overview";
let activeArenaNavTarget = "";
let restoringArenaHistory = false;
let hubRenderRevision = 0;
const hubPageRenderRevisions = new Map();

const COMMUNITY_ROLES = new Set(["member", "b2b_partner", "human_validator", "sparklabs", "admin"]);
const FEATURED_CRITERIA_DEFAULTS = FEATURED_EDITORIAL_CRITERIA;
const LOGIN_PROGRESS_STEPS = [
  "계정 정보를 안전하게 확인하고 있습니다.",
  "회원 권한과 접근 범위를 확인하고 있습니다.",
  "AI Arena 데이터를 동기화하고 있습니다.",
  "개인화된 작업 공간을 준비하고 있습니다."
];
const REFRESH_PROGRESS_STEPS = [
  "Program Hub의 최신 상태를 확인하고 있습니다.",
  "공개 프로필과 프로그램 데이터를 동기화하고 있습니다.",
  "화면에 최신 정보를 반영하고 있습니다."
];
const PUBLIC_BRIEF_PROGRESS_STEPS = [
  "입력한 Brief의 필수 항목을 확인하고 있습니다.",
  "개인정보와 보안 입력 기준을 검증하고 있습니다.",
  "SparkLabs 검토 대기열에 안전하게 접수하고 있습니다."
];
const PARTNER_PROFILE_UPDATE_PROGRESS_STEPS = [
  "현재 파트너 프로필과 입력한 변경 내용을 비교하고 있습니다.",
  "우선 과제와 협업 조건의 변경 사항을 구조화하고 있습니다.",
  "SparkLabs 검토 대기열에 업데이트 요청을 안전하게 접수하고 있습니다."
];
const DATABASE_PROGRESS_STEPS = [
  "데이터 접근 권한을 확인하고 있습니다.",
  "요청한 구조와 레코드를 읽고 있습니다.",
  "조회 결과를 안전하게 정리하고 있습니다."
];
const PROGRAM_ACTION_PROGRESS_STEPS = [
  "요청 내용을 안전하게 전달하고 있습니다.",
  "권한과 입력 조건을 검증하고 있습니다.",
  "최신 상태를 작업 공간에 반영하고 있습니다."
];
const TEAM_CARD_VISIBILITY_PROGRESS_STEPS = [
  "Clawee가 선택한 공개 범위를 저장 요청으로 정리하고 있습니다.",
  "저장 요청을 서버에 전달했습니다. 계정 권한 확인을 기다리고 있습니다.",
  "Program 데이터베이스의 저장 응답을 기다리고 있습니다.",
  "아직 응답을 기다리고 있습니다. 저장 요청은 계속 처리 중입니다."
];
const EVENT_RECOMMENDATION_PROGRESS_STEPS = [
  "현재 파트너 프로필과 우선 과제를 확인하고 있습니다.",
  "클로이가 예정 일정과 검증된 혜택의 활용도를 비교하고 있습니다.",
  "지금 실행할 순서와 준비 사항을 정리하고 있습니다."
];

const els = {
  bootScreen: document.querySelector("#bootScreen"),
  globalProcessStatus: document.querySelector("#globalProcessStatus"),
  loginGate: document.querySelector("#loginGate"),
  loginForm: document.querySelector("#loginForm"),
  loginSubmitButton: document.querySelector('#loginForm button[type="submit"]'),
  googleAdminLoginGroup: document.querySelector("#googleAdminLoginGroup"),
  googleAdminLoginButton: document.querySelector("#googleAdminLoginButton"),
  authStatus: document.querySelector("#authStatus"),
  publicBriefGate: document.querySelector("#publicBriefGate"),
  publicBriefPublicMount: document.querySelector("#publicBriefPublicMount"),
  publicBriefAuthenticatedMount: document.querySelector("#publicBriefAuthenticatedMount"),
  programApp: document.querySelector("#programApp"),
  primaryNav: document.querySelector("#primaryNav"),
  staffUtilityNav: document.querySelector("#staffUtilityNav"),
  homeButton: document.querySelector("#homeButton"),
  ecosystemSwitcher: document.querySelector("#ecosystemSwitcher"),
  ecosystemSwitcherMenu: document.querySelector("#ecosystemSwitcherMenu"),
  ecosystemHomeButton: document.querySelector("[data-ecosystem-home]"),
  memberAccessButton: document.querySelector("#memberAccessButton"),
  publicBriefLanguageSwitch: document.querySelector("#publicBriefLanguageSwitch"),
  publicBriefLanguageSelect: document.querySelector("#publicBriefLanguageSelect"),
  memberAccessClose: document.querySelector("#memberAccessClose"),
  refreshButton: document.querySelector("#refreshButton"),
  accountMenu: document.querySelector("#accountMenu"),
  accountInitial: document.querySelector("#accountInitial"),
  accountName: document.querySelector("#accountName"),
  accountRole: document.querySelector("#accountRole"),
  logoutButton: document.querySelector("#logoutButton"),
  cohortBadge: document.querySelector("#cohortBadge"),
  heroTitle: document.querySelector(".program-hero-copy h1"),
  heroDescription: document.querySelector(".program-hero-copy > p"),
  heroActions: document.querySelector(".program-hero-copy .hero-actions"),
  heroTeamCount: document.querySelector("#heroTeamCount"),
  heroSectorCount: document.querySelector("#heroSectorCount"),
  heroBenefitCount: document.querySelector("#heroBenefitCount"),
  heroBenefitLabel: document.querySelector("#heroBenefitLabel"),
  heroLiveTime: document.querySelector("#heroLiveTime"),
  heroCloudTags: [...document.querySelectorAll("[data-hero-cloud-tag]")],
  featuredSpotlight: document.querySelector("#featuredSpotlight"),
  partnerProfileCard: document.querySelector("#partnerProfileCard"),
  agenticDiscoverySection: document.querySelector("#agenticDiscoverySection"),
  metricTeams: document.querySelector("#metricTeams"),
  metricTeamStatus: document.querySelector("#metricTeamStatus"),
  collaborationFitCard: document.querySelector("#collaborationFitCard"),
  metricProfiles: document.querySelector("#metricProfiles"),
  metricProfilesTooltip: document.querySelector("#metricProfilesTooltip"),
  metricBenefits: document.querySelector("#metricBenefits"),
  metricEvents: document.querySelector("#metricEvents"),
  metricUpcoming: document.querySelector("#metricUpcoming"),
  adminBenefitRequestNotice: document.querySelector("#adminBenefitRequestNotice"),
  adminBenefitRequestBadge: document.querySelector("#adminBenefitRequestBadge"),
  adminBenefitRequestCount: document.querySelector("#adminBenefitRequestCount"),
  adminBenefitRequestMeta: document.querySelector("#adminBenefitRequestMeta"),
  weeklyNotice: document.querySelector("#weeklyNotice"),
  noticeUpdated: document.querySelector("#noticeUpdated"),
  sectorChart: document.querySelector("#sectorChart"),
  featuredCompaniesTitle: document.querySelector("#featuredCompaniesTitle"),
  featuredCompaniesUpdated: document.querySelector("#featuredCompaniesUpdated"),
  overviewEvents: document.querySelector("#overviewEvents"),
  overviewBenefits: document.querySelector("#overviewBenefits"),
  featuredCriteriaList: document.querySelector("#featuredCriteriaList"),
  agenticDiscoveryTitle: document.querySelector("#agenticDiscoveryTitle"),
  agenticDiscoveryDescription: document.querySelector("#agenticDiscoveryDescription"),
  agenticDiscoveryQuery: document.querySelector("#agenticDiscoveryQuery"),
  publicBriefSection: document.querySelector("#publicBriefSection"),
  publicBriefForm: document.querySelector("#publicBriefForm"),
  publicBriefKicker: document.querySelector("#publicBriefKicker"),
  publicBriefTitle: document.querySelector("#publicBriefTitle"),
  publicBriefDescription: document.querySelector("#publicBriefDescription"),
  briefAgentStatus: document.querySelector("#briefAgentStatus"),
  publicBriefFormKicker: document.querySelector("#publicBriefFormKicker"),
  publicBriefFormTitle: document.querySelector("#publicBriefFormTitle"),
  publicBriefSecureLabel: document.querySelector("#publicBriefSecureLabel"),
  publicBriefConsentText: document.querySelector("#publicBriefConsentText"),
  publicBriefSubmitButton: document.querySelector("#publicBriefSubmitButton"),
  publicBriefPrivacy: document.querySelector("#publicBriefPrivacy"),
  publicBriefStatus: document.querySelector("#publicBriefStatus"),
  companyDirectoryKicker: document.querySelector("#companyDirectoryKicker"),
  companyDirectoryTitle: document.querySelector("#companyDirectoryTitle"),
  companyDirectoryDescription: document.querySelector("#companyDirectoryDescription"),
  companyDirectoryBadge: document.querySelector("#companyDirectoryBadge"),
  teamSearch: document.querySelector("#teamSearch"),
  sectorFilter: document.querySelector("#sectorFilter"),
  incorporatedFilter: document.querySelector("#incorporatedFilter"),
  teamSort: document.querySelector("#teamSort"),
  resetTeamFilters: document.querySelector("#resetTeamFilters"),
  teamResultCount: document.querySelector("#teamResultCount"),
  teamGrid: document.querySelector("#teamGrid"),
  teamEmpty: document.querySelector("#teamEmpty"),
  calendarPageTitle: document.querySelector("#calendarPageTitle"),
  calendarPageDescription: document.querySelector("#calendarPageDescription"),
  calendarEventTitle: document.querySelector("#calendarEventTitle"),
  eventCount: document.querySelector("#eventCount"),
  eventTimeline: document.querySelector("#eventTimeline"),
  mentorList: document.querySelector("#mentorList"),
  eventPerkTitle: document.querySelector("#eventPerkTitle"),
  eventPerkLink: document.querySelector("#eventPerkLink"),
  eventPerkPreview: document.querySelector("#eventPerkPreview"),
  eventRecommendationPlanner: document.querySelector("#eventRecommendationPlanner"),
  eventRecommendationTitle: document.querySelector("#eventRecommendationTitle"),
  eventRecommendationDescription: document.querySelector("#eventRecommendationDescription"),
  eventRecommendationButton: document.querySelector("#eventRecommendationButton"),
  eventRecommendationStatus: document.querySelector("#eventRecommendationStatus"),
  eventRecommendationResults: document.querySelector("#eventRecommendationResults"),
  benefitPageTitle: document.querySelector("#benefitPageTitle"),
  benefitPageDescription: document.querySelector("#benefitPageDescription"),
  benefitCategoryFilter: document.querySelector("#benefitCategoryFilter"),
  benefitQualificationFilterLabel: document.querySelector("#benefitQualificationFilterLabel"),
  benefitQualificationFilter: document.querySelector("#benefitQualificationFilter"),
  benefitEligibilitySummary: document.querySelector("#benefitEligibilitySummary"),
  benefitGrid: document.querySelector("#benefitGrid"),
  profileHealth: document.querySelector("#profileHealth"),
  tableCounts: document.querySelector("#tableCounts"),
  operationSearch: document.querySelector("#operationSearch"),
  teamActivityBody: document.querySelector("#teamActivityBody"),
  eventRegistrationQueue: document.querySelector("#eventRegistrationQueue"),
  myLogMatches: document.querySelector("#myLogMatches"),
  programWorkspaceDetails: document.querySelector("#programWorkspaceDetails"),
  collaborationReviewWorkspace: document.querySelector("#collaborationReviewWorkspace"),
  collaborationReviewPendingCount: document.querySelector("#collaborationReviewPendingCount"),
  incomingCollaborationReviews: document.querySelector("#incomingCollaborationReviews"),
  outgoingCollaborationReviews: document.querySelector("#outgoingCollaborationReviews"),
  weeklyReportForm: document.querySelector("#weeklyReportForm"),
  weeklyReportStatus: document.querySelector("#weeklyReportStatus"),
  weeklyReportHistory: document.querySelector("#weeklyReportHistory"),
  weeklyReportQueue: document.querySelector("#weeklyReportQueue"),
  mentoringSessionList: document.querySelector("#mentoringSessionList"),
  databaseTableSelect: document.querySelector("#databaseTableSelect"),
  databaseLimitSelect: document.querySelector("#databaseLimitSelect"),
  databaseLoadButton: document.querySelector("#databaseLoadButton"),
  databaseStatus: document.querySelector("#databaseStatus"),
  databaseSummary: document.querySelector("#databaseSummary"),
  databaseTable: document.querySelector("#databaseTable"),
  applicantExportApplicationCount: document.querySelector("#applicantExportApplicationCount"),
  applicantExportUniqueCount: document.querySelector("#applicantExportUniqueCount"),
  applicantExportDuplicateCount: document.querySelector("#applicantExportDuplicateCount"),
  applicantExportStatus: document.querySelector("#applicantExportStatus"),
  dataTimestamp: document.querySelector("#dataTimestamp"),
  arenaMetricOpen: document.querySelector("#arenaMetricOpen"),
  arenaPage: document.querySelector("#arenaPage"),
  arenaReleaseBadge: document.querySelector("#arenaReleaseBadge"),
  bountyPreparingNotice: document.querySelector("#bountyPreparingNotice"),
  arenaMetricSubmissions: document.querySelector("#arenaMetricSubmissions"),
  arenaMetricQueue: document.querySelector("#arenaMetricQueue"),
  arenaMetricPilots: document.querySelector("#arenaMetricPilots"),
  bountyRolePaths: document.querySelector("#bountyRolePaths"),
  bountyRoleSummary: document.querySelector("#bountyRoleSummary"),
  bountyRoleBadge: document.querySelector("#bountyRoleBadge"),
  arenaBountyGrid: document.querySelector("#arenaBountyGrid"),
  arenaBountyDetail: document.querySelector("#arenaBountyDetail"),
  arenaDetailHero: document.querySelector("#arenaDetailHero"),
  arenaDetailTabs: document.querySelector("#arenaDetailTabs"),
  arenaOverviewContent: document.querySelector("#arenaOverviewContent"),
  arenaSubmitContent: document.querySelector("#arenaSubmitContent"),
  arenaLeaderboardContent: document.querySelector("#arenaLeaderboardContent"),
  arenaMyStatus: document.querySelector("#arenaMyStatus"),
  arenaOpportunityList: document.querySelector("#arenaOpportunityList"),
  arenaStaffPanel: document.querySelector("#arenaStaffPanel"),
  arenaValidationQueue: document.querySelector("#arenaValidationQueue"),
  arenaOpportunityQueue: document.querySelector("#arenaOpportunityQueue"),
  teamDialog: document.querySelector("#teamDialog"),
  teamDialogClose: document.querySelector("#teamDialogClose"),
  teamDialogContent: document.querySelector("#teamDialogContent"),
  collaborationReviewDialog: document.querySelector("#collaborationReviewDialog"),
  collaborationReviewDialogClose: document.querySelector("#collaborationReviewDialogClose"),
  collaborationReviewForm: document.querySelector("#collaborationReviewForm"),
  collaborationReviewTargetName: document.querySelector("#collaborationReviewTargetName"),
  collaborationReviewFormStatus: document.querySelector("#collaborationReviewFormStatus"),
  toast: document.querySelector("#toast")
};

const arenaGuide = initArenaGuide({
  getAuthHeaders: () => authHeaders(),
  isAuthenticated: () => Boolean(authSession?.access_token),
  navigate: (page, navigationOptions = {}) => showPage(page, {
    skipScroll: Boolean(navigationOptions.skipScroll)
  })
});

bindEvents();
initialize();

function bindEvents() {
  const renderTeamsAfterInput = debounceMainThreadRender(renderTeams);
  const renderTeamActivityAfterInput = debounceMainThreadRender(renderTeamActivity);
  if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  window.addEventListener("popstate", handleArenaPopState);
  window.addEventListener("spark-arena:team-dialog-opened", recordTeamDialogHistory);
  window.addEventListener("spark-arena:history-overlay-opened", recordArenaOverlayHistory);
  window.addEventListener("spark-arena:history-overlay-close-request", (event) => {
    if (!isCurrentArenaOverlayHistory(event.detail?.type || "")) return;
    event.preventDefault();
    window.history.back();
  });
  window.addEventListener("spark-arena:open-program-team", handleRecommendedCompanyOpen);
  window.addEventListener("spark-arena:announcements-updated", (event) => {
    const announcements = Array.isArray(event.detail?.announcements) ? event.detail.announcements : [];
    latestArenaAnnouncement = announcements[0] || null;
    renderWeeklyNotice();
  });
  els.loginForm.addEventListener("submit", handleLogin);
  els.googleAdminLoginButton?.addEventListener("click", handleGoogleAdminLogin);
  els.logoutButton.addEventListener("click", handleLogout);
  els.refreshButton.addEventListener("click", handleRefresh);
  els.memberAccessButton?.addEventListener("click", openMemberAccess);
  els.memberAccessClose?.addEventListener("click", closeMemberAccess);
  els.publicBriefLanguageSelect?.addEventListener("change", (event) => {
    setPublicBriefLanguage(event.currentTarget.value, { persist: true, syncUrl: true });
  });
  document.querySelectorAll("[data-close-member-access]").forEach((button) => button.addEventListener("click", closeMemberAccess));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.ecosystemSwitcher?.classList.contains("is-open")) {
      event.preventDefault();
      setEcosystemSwitcherOpen(false, { restoreFocus: true });
      return;
    }
    if (event.key === "Escape" && !els.loginGate.hidden) closeMemberAccess();
    if (event.key === "Tab" && !els.loginGate.hidden) trapMemberAccessFocus(event);
  });
  els.ecosystemSwitcher?.addEventListener("pointerenter", () => {
    window.clearTimeout(ecosystemSwitcherCloseTimer);
    if (window.matchMedia("(hover: hover)").matches) setEcosystemSwitcherOpen(true);
  });
  els.ecosystemSwitcher?.addEventListener("pointerleave", () => {
    window.clearTimeout(ecosystemSwitcherCloseTimer);
    ecosystemSwitcherCloseTimer = window.setTimeout(() => {
      if (!els.ecosystemSwitcher?.matches(":hover") && !els.ecosystemSwitcher?.contains(document.activeElement)) {
        setEcosystemSwitcherOpen(false);
      }
    }, 110);
  });
  els.ecosystemSwitcher?.addEventListener("focusin", () => setEcosystemSwitcherOpen(true));
  els.ecosystemSwitcher?.addEventListener("focusout", () => {
    window.requestAnimationFrame(() => {
      if (!els.ecosystemSwitcher?.contains(document.activeElement)) setEcosystemSwitcherOpen(false);
    });
  });
  els.homeButton?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    setEcosystemSwitcherOpen(true, { focusFirst: true });
  });
  els.ecosystemHomeButton?.addEventListener("click", () => {
    reloadArenaLandingPage();
  });
  els.ecosystemSwitcherMenu?.querySelector(".is-welcome")?.addEventListener("click", () => {
    setEcosystemSwitcherOpen(false);
  });
  els.ecosystemSwitcherMenu?.addEventListener("keydown", handleEcosystemSwitcherKeydown);
  els.homeButton.addEventListener("click", reloadArenaLandingPage);
  bindPrimaryNavigation();
  document.querySelectorAll("[data-go-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.goTarget || "";
      showPage(button.dataset.goPage, { navTarget: target });
      if (target) window.requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#ecosystemSwitcher")) setEcosystemSwitcherOpen(false);
    const accessButton = event.target.closest("[data-open-member-access]");
    if (accessButton) openMemberAccess();
    const scrollButton = event.target.closest("[data-scroll-target]");
    if (scrollButton) scrollToTarget(scrollButton.dataset.scrollTarget);
    const briefButton = event.target.closest("[data-brief-company]");
    if (briefButton) prepareBriefForCompany(briefButton.dataset.briefCompany);
    const collaborationReviewButton = event.target.closest("[data-collaboration-review-team]");
    if (collaborationReviewButton) openCollaborationReviewDialog(collaborationReviewButton.dataset.collaborationReviewTeam);
  });
  [els.teamSearch, els.sectorFilter, els.incorporatedFilter, els.teamSort].forEach((control) => {
    control.addEventListener(control.tagName === "INPUT" ? "input" : "change", control.tagName === "INPUT" ? renderTeamsAfterInput : renderTeams);
  });
  els.resetTeamFilters.addEventListener("click", resetTeamFilters);
  els.teamGrid.addEventListener("click", handleTeamGridClick);
  els.teamDialogClose.addEventListener("click", closeTeamDialog);
  els.teamDialog.addEventListener("click", (event) => {
    if (event.target === els.teamDialog) closeTeamDialog();
  });
  els.teamDialog.addEventListener("cancel", (event) => {
    if (!isCurrentTeamDialogHistory()) return;
    event.preventDefault();
    closeTeamDialog();
  });
  els.collaborationReviewDialogClose?.addEventListener("click", closeCollaborationReviewDialog);
  els.collaborationReviewDialog?.addEventListener("click", (event) => {
    if (event.target === els.collaborationReviewDialog) closeCollaborationReviewDialog();
  });
  els.collaborationReviewDialog?.addEventListener("cancel", (event) => {
    if (!isCurrentArenaOverlayHistory("collaboration-review")) return;
    event.preventDefault();
    closeCollaborationReviewDialog();
  });
  els.collaborationReviewForm?.addEventListener("submit", handleCollaborationReviewSubmit);
  document.addEventListener("click", handleCollaborationReviewResponse);
  els.benefitCategoryFilter.addEventListener("change", renderBenefits);
  els.benefitQualificationFilter?.addEventListener("change", renderBenefits);
  els.benefitGrid.addEventListener("click", handleBenefitAction);
  els.eventTimeline.addEventListener("click", handleEventRegistrationAction);
  els.eventRecommendationButton?.addEventListener("click", () => requestEventRecommendations({ force: true }));
  els.collaborationFitCard?.addEventListener("pointerenter", requestCollaborationFitReasons);
  els.collaborationFitCard?.addEventListener("focusin", requestCollaborationFitReasons);
  els.collaborationFitCard?.addEventListener("click", handleCollaborationFitDropdownClick);
  els.collaborationFitCard?.addEventListener("keydown", handleCollaborationFitDropdownKeydown);
  document.addEventListener("click", closeCollaborationFitDropdownFromOutside);
  document.addEventListener("keydown", closeCollaborationFitDropdownOnEscape);
  els.publicBriefForm?.addEventListener("submit", handlePublicBriefSubmit);
  els.eventRegistrationQueue?.addEventListener("click", handleEventQueueAction);
  els.weeklyReportForm?.addEventListener("submit", handleWeeklyReportSubmit);
  els.weeklyReportQueue?.addEventListener("click", handleWeeklyReportQueueAction);
  els.operationSearch.addEventListener("input", renderTeamActivityAfterInput);
  els.databaseLoadButton.addEventListener("click", loadSelectedDatabaseTable);
  document.querySelectorAll("[data-applicant-export-format]").forEach((button) => {
    button.addEventListener("click", handleApplicantExportDownload);
  });
  document.querySelectorAll("[data-arena-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      arenaBountyFilter = button.dataset.arenaFilter;
      document.querySelectorAll("[data-arena-filter]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      renderArenaBounties();
    });
  });
  els.arenaBountyGrid.addEventListener("click", handleArenaBountyClick);
  els.arenaDetailTabs.addEventListener("click", handleArenaDetailTabClick);
  els.arenaSubmitContent.addEventListener("submit", handleArenaSubmitPanel);
  els.arenaSubmitContent.addEventListener("click", handleArenaSubmitClick);
  els.arenaLeaderboardContent.addEventListener("click", handleArenaLeaderboardClick);
  els.arenaOpportunityList.addEventListener("submit", handleArenaOpportunitySubmit);
  els.arenaValidationQueue.addEventListener("click", handleArenaStaffQueueClick);
  els.arenaOpportunityQueue.addEventListener("click", handleArenaStaffQueueClick);
}

function debounceMainThreadRender(callback, delay = 120) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function reloadArenaLandingPage() {
  window.clearTimeout(ecosystemSwitcherCloseTimer);
  setEcosystemSwitcherOpen(false);
  window.location.assign(new URL("/arena/", window.location.origin).href);
}

function setEcosystemSwitcherOpen(open, { focusFirst = false, restoreFocus = false } = {}) {
  const allowed = canUseEcosystemSwitcher();
  const nextOpen = Boolean(open && allowed);
  els.ecosystemSwitcher?.classList.toggle("is-open", nextOpen);
  els.homeButton?.setAttribute("aria-expanded", String(nextOpen));
  els.homeButton?.setAttribute("aria-label", nextOpen ? "SparkClaw 사이트 전환 메뉴 닫기" : "SparkLabs·SparkClaw AI Arena 홈");
  if (els.ecosystemSwitcherMenu) els.ecosystemSwitcherMenu.hidden = !nextOpen;
  if (nextOpen && focusFirst) {
    window.requestAnimationFrame(() => {
      els.ecosystemSwitcherMenu?.querySelector('[role="menuitem"]')?.focus();
    });
  } else if (!nextOpen && restoreFocus) {
    els.homeButton?.focus();
  }
}

function canUseEcosystemSwitcher() {
  return Boolean(els.ecosystemSwitcher?.classList.contains("is-enabled"));
}

function handleEcosystemSwitcherKeydown(event) {
  const items = [...(els.ecosystemSwitcherMenu?.querySelectorAll('[role="menuitem"]') || [])];
  if (!items.length) return;
  const currentIndex = Math.max(0, items.indexOf(document.activeElement));
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[nextIndex]?.focus();
  } else if (event.key === "Escape") {
    event.preventDefault();
    setEcosystemSwitcherOpen(false, { restoreFocus: true });
  }
}

async function initialize() {
  let authConfigError = "";
  try {
    try {
      await loadAuthConfig();
    } catch (error) {
      authConfigError = error.message || "회원 로그인 설정을 확인할 수 없습니다.";
      authConfig = { authConfigured: false, features: {} };
    }
    const oauthResult = await consumeOAuthSessionFromUrl();
    if (oauthResult.error) authConfigError = oauthResult.error;
    const restoredSession = await restoreStoredSession();
    if (restoredSession && authConfig?.authConfigured) {
      try {
        await loadProgramHub({ allowRefresh: true, quiet: true, bootstrap: true });
        return;
      } catch (error) {
        authConfigError = authSession?.access_token
          ? error.message || "저장된 로그인으로 작업 공간을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
          : "회원 세션이 만료되었습니다. 다시 로그인해 주세요.";
      }
    }
    showPublicBriefGate(authConfigError, authConfigError ? "error" : "", { historyMode: "replace" });
  } catch (error) {
    clearStoredSession();
    showPublicBriefGate(error.message || "회원 로그인 설정을 준비하지 못했습니다. 공개 Brief는 계속 제출할 수 있습니다.", "error", { historyMode: "replace" });
  } finally {
    document.body.classList.remove("is-booting");
  }
}

async function loadAuthConfig() {
  const response = await fetch("/api/arena-auth", { headers: { Accept: "application/json" } });
  const payload = await safeJson(response);
  if (!response.ok) throw new Error(payload?.error || "로그인 설정을 불러오지 못했습니다.");
  authConfig = payload;
  if (els.googleAdminLoginGroup) {
    els.googleAdminLoginGroup.hidden = !payload?.googleAdminLoginEnabled;
  }
  if (!publicBriefLanguageWasChosen && payload?.recommendedLanguage) {
    setPublicBriefLanguage(resolvePublicBriefLanguage({
      recommended: payload.recommendedLanguage,
      browserLanguages: navigator.languages || [navigator.language]
    }));
  }
}

function handleGoogleAdminLogin() {
  const loginCopy = publicBriefCopy(publicBriefLanguage).login;
  if (!authConfig?.authConfigured || !authConfig?.googleAdminLoginEnabled) {
    setAuthStatus(loginCopy.googleNotReady || loginCopy.notReady, "error");
    return;
  }
  const redirectUrl = new URL("/arena/", window.location.origin);
  if (publicBriefLanguage && publicBriefLanguage !== "ko") {
    redirectUrl.searchParams.set("lang", publicBriefLanguage);
  }
  const authorizeUrl = new URL(`${authConfig.supabaseUrl}/auth/v1/authorize`);
  authorizeUrl.searchParams.set("provider", "google");
  authorizeUrl.searchParams.set("redirect_to", redirectUrl.toString());
  authorizeUrl.searchParams.set("scopes", "openid email profile");
  setAuthStatus(loginCopy.googleStarting || loginCopy.starting);
  window.location.assign(authorizeUrl.toString());
}

async function consumeOAuthSessionFromUrl() {
  const params = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const oauthError = params.get("error_description") || params.get("error");
  if (!accessToken && !oauthError) return { handled: false, error: "" };

  clearOAuthCallbackUrl();
  if (oauthError) return { handled: true, error: koreanAuthError(oauthError) };
  const expiresIn = Math.max(Number(params.get("expires_in")) || 3600, 60);
  const session = {
    access_token: accessToken,
    refresh_token: refreshToken || "",
    token_type: params.get("token_type") || "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn
  };
  const validationError = await googleAdminOAuthValidationError(session);
  if (validationError) {
    await revokeSupabaseSession(session);
    clearStoredSession();
    return { handled: true, error: validationError };
  }
  saveStoredSession(session);
  return { handled: true, error: "" };
}

async function googleAdminOAuthValidationError(session) {
  const loginCopy = publicBriefCopy(publicBriefLanguage).login;
  const domainError = loginCopy.googleDomainRequired || "sparklabs.co.kr 업무용 Google 계정만 사용할 수 있습니다.";
  if (!session?.access_token || !authConfig?.authConfigured) return domainError;
  try {
    const response = await fetch(`${authConfig.supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: authConfig.supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`
      }
    });
    const user = await safeJson(response);
    if (!response.ok) return domainError;
    const allowedDomains = Array.isArray(authConfig?.adminDomains)
      ? authConfig.adminDomains.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : [];
    return isAllowedGoogleAdminUser(user, allowedDomains) ? "" : domainError;
  } catch {
    return domainError;
  }
}

async function revokeSupabaseSession(session) {
  if (!session?.access_token || !authConfig?.authConfigured) return;
  try {
    await fetch(`${authConfig.supabaseUrl}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: authConfig.supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`
      }
    });
  } catch {
    // The local session is still cleared when the remote logout cannot complete.
  }
}

function clearOAuthCallbackUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(window.history.state, "", url);
}

async function handleLogin(event) {
  event.preventDefault();
  if (els.loginForm.classList.contains("is-loading")) return;
  const loginCopy = publicBriefCopy(publicBriefLanguage).login;
  if (!authConfig?.authConfigured) {
    setAuthStatus(loginCopy.notReady, "error");
    return;
  }

  const form = new FormData(els.loginForm);
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  window.dispatchEvent(new CustomEvent("spark-arena:discovery-reset"));
  setLoginPending(true);
  const progressToken = startProcessStatus(els.authStatus, LOGIN_PROGRESS_STEPS, {
    announcement: loginCopy.starting,
    interval: 1500
  });

  try {
    const response = await fetch(`${authConfig.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: authConfig.supabaseAnonKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });
    const session = await safeJson(response);
    if (!response.ok) {
      throw new Error(session?.error_description || session?.msg || session?.error || loginCopy.failure);
    }
    advanceProcessStatus(els.authStatus, progressToken, 1);
    saveStoredSession(session);
    arenaGuide.reset();
    await loadProgramHub({ allowRefresh: false, bootstrap: true });
    els.loginForm.reset();
    finishProcessStatus(els.authStatus, progressToken);
    closeMemberAccess({ restoreFocus: false });
  } catch (error) {
    finishProcessStatus(
      els.authStatus,
      progressToken,
      publicBriefLanguage === "en" ? loginCopy.failure : koreanAuthError(error.message),
      "error"
    );
  } finally {
    setLoginPending(false);
  }
}

async function loadProgramHub({ allowRefresh = true, quiet = false, bootstrap = false } = {}) {
  const loadGeneration = ++programHubLoadGeneration;
  const response = await fetch(bootstrap ? "/api/program-hub?bootstrap=1" : "/api/program-hub", {
    headers: {
      Accept: "application/json",
      ...authHeaders()
    }
  });

  if (response.status === 401 && allowRefresh && (await refreshSession())) {
    return loadProgramHub({ allowRefresh: false, quiet, bootstrap });
  }

  const payload = await safeJson(response);
  if (!response.ok) {
    if (response.status === 401) {
      clearStoredSession();
    }
    throw new Error(payload?.error || "프로그램 데이터를 불러오지 못했습니다.");
  }

  resetCollaborationFitReasonState();
  hub = payload;
  const programDirectoryViewer = usesProgramDirectoryForViewer();
  if (bootstrap) {
    marketData = programDirectoryViewer ? marketDataFromProgramHub(hub) : emptyMarketData(hub.viewer);
    arenaData = emptyArenaData();
    databaseSchema = null;
    renderHub();
    showApp();
    loadLatestArenaAnnouncement();
    void hydrateProgramHubInBackground(loadGeneration);
    return;
  }
  if (shouldLoadPrototypeData()) {
    try {
      await loadArenaSnapshot({ allowRefresh: false, publish: false });
      if (programDirectoryViewer) marketData = marketDataFromProgramHub(hub, marketData);
    } catch (error) {
      marketData = programDirectoryViewer ? marketDataFromProgramHub(hub) : emptyMarketData(hub.viewer);
      arenaData = emptyArenaData();
      if (!quiet) showToast(`Program Hub는 정상 연결됐지만 프로토타입 데이터는 불러오지 않았습니다. ${error.message}`);
    }
  } else {
    marketData = programDirectoryViewer ? marketDataFromProgramHub(hub) : emptyMarketData(hub.viewer);
    arenaData = emptyArenaData();
  }
  databaseSchema = null;
  renderHub();
  showApp();
  loadLatestArenaAnnouncement();
  if (!quiet) showToast("프로그램 DB의 최신 내용을 반영했습니다.");
}

async function hydrateProgramHubInBackground(loadGeneration) {
  try {
    const arenaPromise = shouldLoadPrototypeData()
      ? fetchArenaSnapshotData({ allowRefresh: false }).catch((error) => ({ error }))
      : Promise.resolve(null);
    const hubResponsePromise = fetch("/api/program-hub", {
      headers: { Accept: "application/json", ...authHeaders() }
    });
    const [hubResponse, arenaSnapshot] = await Promise.all([hubResponsePromise, arenaPromise]);
    const fullHub = await safeJson(hubResponse);
    if (!hubResponse.ok) throw new Error(fullHub?.error || "추가 프로그램 데이터를 불러오지 못했습니다.");
    if (loadGeneration !== programHubLoadGeneration || !authSession?.access_token) return;

    resetCollaborationFitReasonState();
    hub = fullHub;
    const programDirectoryViewer = usesProgramDirectoryForViewer();
    if (arenaSnapshot && !arenaSnapshot.error) {
      marketData = arenaSnapshot.market;
      arenaData = arenaSnapshot.competition;
      if (programDirectoryViewer) marketData = marketDataFromProgramHub(hub, marketData);
    } else {
      marketData = programDirectoryViewer ? marketDataFromProgramHub(hub) : emptyMarketData(hub.viewer);
      arenaData = emptyArenaData();
    }
    databaseSchema = null;
    renderHub();
    loadLatestArenaAnnouncement();
  } catch {
    // Keep the fast authenticated bootstrap usable if secondary data is slow
    // or temporarily unavailable.
  }
}

async function mergeAuthenticatedSafeSnapshot() {
  try {
    const response = await fetch("/api/arena-public", {
      headers: { Accept: "application/json", ...authHeaders() }
    });
    const payload = await safeJson(response);
    if (!response.ok) return;
    const safeHub = normalizePublicHub(payload);
    hub = {
      ...hub,
      metrics: { ...safeHub.metrics, ...(hub.metrics || {}) },
      sectors: hub.sectors?.length ? hub.sectors : safeHub.sectors,
      teams: hub.teams?.length ? hub.teams : safeHub.teams,
      events: hub.events?.length ? hub.events : safeHub.events,
      benefits: hub.benefits?.length ? hub.benefits : safeHub.benefits,
      featuredCriteria: hub.featuredCriteria?.length ? hub.featuredCriteria : safeHub.featuredCriteria,
      weeklyNotice: hub.weeklyNotice || safeHub.weeklyNotice
    };
  } catch {
    // The authenticated Program Hub remains usable if the safe shared snapshot is unavailable.
  }
}

function normalizePublicHub(payload = {}) {
  const teams = (payload.teams || []).filter((team) => team?.publicProfile !== false).map(normalizePublicTeam).filter((team) => team.id && team.name);
  const events = (payload.events || []).filter(
    (event) =>
      event?.isPublic !== false &&
      event?.visibility !== "private" &&
      isCommunityEventFromOrientation(event)
  );
  const benefits = (payload.benefits || []).filter(
    (benefit) =>
      benefit?.isActive !== false &&
      isBenefitReadyForDisplay(benefit) &&
      ["confirmed", "verified"].includes(String(benefit?.verificationStatus || "confirmed").toLowerCase())
  );
  const sectors = payload.sectors?.length ? payload.sectors : summarizePublicSectors(teams);
  const sourceMetrics = payload.metrics || {};
  const metrics = {
    ...sourceMetrics,
    teams: sourceMetrics.curatedCompanies ?? sourceMetrics.teams ?? teams.length,
    profilePopulation: sourceMetrics.curatedCompanies ?? sourceMetrics.profilePopulation ?? teams.length,
    profilesReady: sourceMetrics.publicProfiles ?? sourceMetrics.profilesReady ?? teams.length,
    sectors: sectors.length,
    activeBenefits: sourceMetrics.verifiedBenefits ?? sourceMetrics.activeBenefits ?? benefits.length,
    events: sourceMetrics.publicEvents ?? sourceMetrics.events ?? events.length,
    upcomingEvents: events.filter((event) => !isPastDate(event.date)).length,
  };
  return {
    project: {
      cohort: "AI Arena",
      ...(payload.project || {}),
      generatedAt: payload.project?.generatedAt || payload.generatedAt || new Date().toISOString()
    },
    generatedAt: payload.generatedAt || payload.project?.generatedAt || new Date().toISOString(),
    viewer: { role: "public", roleLabel: "Public visitor", canScore: false },
    viewerTeam: null,
    permissions: {
      canViewOperations: false,
      canViewRawDatabase: false,
      canApplyBenefits: false,
      canRegisterEvents: false,
      canSubmitWeeklyReport: false,
      canManageProgramActions: false
    },
    metrics,
    sectors,
    teams,
    mentors: [],
    events,
    benefits,
    featuredCriteria: payload.featuredCriteria || FEATURED_CRITERIA_DEFAULTS,
    weeklyNotice: payload.weeklyNotice || null,
    weeklyReports: [],
    mentoringSessions: [],
    benefitApplications: [],
    eventRegistrations: [],
    programQueues: {},
    dataHealth: null
  };
}

function normalizePublicTeam(team = {}) {
  const profile = team.publicProfile && typeof team.publicProfile === "object" ? team.publicProfile : team;
  return {
    id: String(profile.id || team.id || profile.slug || team.slug || ""),
    name: profile.name || profile.companyName || team.name || team.companyName || "",
    companyName: profile.companyName || team.companyName || "",
    sector: profile.sector || profile.category || team.sector || team.category || "AI",
    oneLiner: profile.oneLiner || profile.tagline || team.oneLiner || team.tagline || "",
    serviceSummary: profile.serviceSummary || profile.shortDescription || team.serviceSummary || team.shortDescription || "",
    aiIdeaSummary: profile.aiIdeaSummary || team.aiIdeaSummary || "",
    group: profile.group || team.group || "SparkLabs AI Arena",
    websiteUrl: profile.websiteUrl || profile.website || team.websiteUrl || team.website || "",
    evidence: Array.isArray(profile.evidence || team.evidence) ? [...(profile.evidence || team.evidence)].slice(0, 6) : [],
    evidenceLevel: profile.evidenceLevel || team.evidenceLevel || "needs_verification",
    missingInfo: Array.isArray(profile.missingInfo || team.missingInfo) ? [...(profile.missingInfo || team.missingInfo)].slice(0, 4) : [],
    investorProfile: normalizeInvestorProfile(profile.investorProfile || team.investorProfile),
    updatedAt: profile.updatedAt || team.updatedAt || null,
    tags: Array.isArray(profile.tags || team.tags) ? [...(profile.tags || team.tags)].slice(0, 8) : [],
    publicProfile: true,
    privateDetailsVisible: false,
    activity: null
  };
}

function summarizePublicSectors(teams = []) {
  const counts = new Map();
  for (const team of teams) {
    const name = primarySector(team.sector) || "AI";
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ko"));
}

function normalizeInvestorProfile(value = {}) {
  if (!value || typeof value !== "object") return null;
  return {
    teamSummary: String(value.teamSummary || "").slice(0, 1400),
    partneringSummary: String(value.partneringSummary || "").slice(0, 700),
    tractionSummary: String(value.tractionSummary || "").slice(0, 900),
    programProof: String(value.programProof || "").slice(0, 500),
    metrics: Array.isArray(value.metrics) ? value.metrics.filter(Boolean).map((item) => String(item).slice(0, 180)).slice(0, 3) : [],
    specialtyTasks: Array.isArray(value.specialtyTasks)
      ? value.specialtyTasks.filter((item) => item?.label && item?.description).map((item) => ({
          label: String(item.label).slice(0, 180),
          description: String(item.description).slice(0, 500),
          evidence: String(item.evidence || "").slice(0, 220),
          rank: Number(item.rank) || 0,
          tier: String(item.tier || ""),
          basis: Array.isArray(item.basis) ? item.basis.map((entry) => String(entry).slice(0, 80)).slice(0, 5) : []
        }))
      : [],
    proofPoints: Array.isArray(value.proofPoints)
      ? value.proofPoints.filter((item) => item?.label && item?.value).map((item) => ({
          label: String(item.label).slice(0, 80),
          value: String(item.value).slice(0, 900)
        })).slice(0, 4)
      : [],
    strengthTags: Array.isArray(value.strengthTags) ? value.strengthTags.filter(Boolean).map((item) => String(item).slice(0, 50)).slice(0, 6) : [],
    sourceLabel: String(value.sourceLabel || "").slice(0, 200),
    profileUpdatedAt: value.profileUpdatedAt || null,
    requiresVerification: value.requiresVerification !== false
  };
}

async function loadArenaSnapshot({ allowRefresh = true, publish = true } = {}) {
  const snapshot = await fetchArenaSnapshotData({ allowRefresh });
  marketData = snapshot.market;
  arenaData = snapshot.competition;
  if (publish) publishMarketContext();
  return arenaData;
}

async function fetchArenaSnapshotData({ allowRefresh = true } = {}) {
  const response = await fetch("/api/arena", {
    headers: {
      Accept: "application/json",
      ...authHeaders()
    }
  });
  if (response.status === 401 && allowRefresh && (await refreshSession())) {
    return fetchArenaSnapshotData({ allowRefresh: false });
  }
  const payload = await safeJson(response);
  if (!response.ok) throw new Error(payload?.error || "Arena 데이터를 불러오지 못했습니다.");
  const competition = payload.competition;
  const resolvedCompetition = hasCompetitionChallenges(competition)
    ? competition
    : await loadCompetitionSnapshot({ allowRefresh });
  return { market: payload, competition: resolvedCompetition };
}

async function loadCompetitionSnapshot({ allowRefresh = true } = {}) {
  const response = await fetch("/api/arena-competition", {
    headers: {
      Accept: "application/json",
      ...authHeaders()
    }
  });
  if (response.status === 401 && allowRefresh && (await refreshSession())) {
    return loadCompetitionSnapshot({ allowRefresh: false });
  }
  const payload = await safeJson(response);
  if (!response.ok) throw new Error(payload?.error || "Bounty Board 데이터를 불러오지 못했습니다.");
  return payload.competition || emptyArenaData();
}

function hasCompetitionChallenges(competition) {
  return Boolean(competition && Array.isArray(competition.challenges) && competition.challenges.length);
}

async function postArenaAction(action, payload = {}) {
  const progressToken = startProcessStatus(els.globalProcessStatus, PROGRAM_ACTION_PROGRESS_STEPS, {
    announcement: "AI Arena 요청을 처리하고 있습니다."
  });
  try {
    const response = await fetch("/api/arena", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify({ action, payload })
    });
    const result = await safeJson(response);
    if (!response.ok) throw new Error(result?.error || "Arena 요청을 처리하지 못했습니다.");
    marketData = result.snapshot || marketData;
    arenaData = result.snapshot?.competition || arenaData || emptyArenaData();
    publishMarketContext();
    renderArena();
    return result;
  } finally {
    finishProcessStatus(els.globalProcessStatus, progressToken);
  }
}

function emptyArenaData() {
  return {
    challenges: [],
    teams: [],
    submissions: [],
    validationReports: [],
    leaderboards: [],
    validationQueue: [],
    opportunities: [],
    metrics: {}
  };
}

function emptyMarketData(viewer = null) {
  return {
    startups: [],
    submissions: [],
    connectionRequests: [],
    bountyRequests: [],
    reviewQueue: [],
    humanValidationQueue: [],
    metrics: {},
    competition: emptyArenaData(),
    viewer
  };
}

function shouldLoadPrototypeData() {
  if (hub?.viewer?.canScore) return true;
  if (hub?.viewer?.role === "member") return Boolean(authConfig?.features?.b2bPortal);
  if (hub?.viewer?.role === "b2b_partner") return Boolean(authConfig?.features?.b2bPortal);
  return Boolean(authConfig?.features?.arena && authConfig?.features?.publicTechDisclosure);
}

function usesProgramDirectoryForViewer() {
  return ["member", "b2b_partner"].includes(String(hub?.viewer?.role || "").toLowerCase());
}

function renderHub() {
  hubRenderRevision += 1;
  hubPageRenderRevisions.clear();
  renderAccount();
  renderOverview();
  hubPageRenderRevisions.set("overview", hubRenderRevision);
  configurePermissions();
  renderHubPage(activeArenaPage);
  els.dataTimestamp.textContent = `최근 동기화 ${formatDateTime(hub.project?.generatedAt)}`;
  publishMarketContext();
}

function renderHubPage(pageName) {
  if (!hub || hubPageRenderRevisions.get(pageName) === hubRenderRevision) return;
  if (pageName === "teams") {
    populateTeamFilters();
    renderTeams();
  } else if (pageName === "calendar") {
    renderCalendar();
  } else if (pageName === "benefits") {
    populateBenefitFilters();
    renderBenefits();
  } else if (pageName === "operations") {
    renderOperations();
    renderWeeklyReporting();
  } else if (pageName === "arena") {
    renderArena();
  }
  hubPageRenderRevisions.set(pageName, hubRenderRevision);
}

function publishMarketContext() {
  const context = {
    hub,
    market: marketData,
    competition: arenaData,
    viewer: marketData?.viewer || hub?.viewer || null
  };
  window.__sparkArenaContext = context;
  window.dispatchEvent(new CustomEvent("spark-arena:data", { detail: context }));
}

function configurePermissions() {
  const canOperate = Boolean(hub.permissions?.canViewOperations);
  const canReadRaw = Boolean(hub.permissions?.canViewRawDatabase);
  const role = hub.viewer?.role || "public";
  const clawMemberViewer = role === "member";
  const externalPartnerViewer = role === "b2b_partner";
  const adminViewer = Boolean(hub.viewer?.canScore) || ["sparklabs", "admin"].includes(String(role).toLowerCase());
  const canSwitchSparkClawSites = clawMemberViewer || adminViewer;
  const publicViewer = isPublicViewer();
  const communityMember = COMMUNITY_ROLES.has(role);
  document.body.classList.toggle("is-public-viewer", publicViewer);
  document.body.classList.toggle("is-claw-member", clawMemberViewer);
  document.body.classList.toggle("is-admin-viewer", adminViewer);
  els.ecosystemSwitcher?.classList.toggle("is-enabled", canSwitchSparkClawSites);
  els.homeButton?.setAttribute("aria-haspopup", canSwitchSparkClawSites ? "menu" : "false");
  if (!canSwitchSparkClawSites) setEcosystemSwitcherOpen(false);
  document.querySelectorAll("[data-hide-from-admin]").forEach((element) => {
    element.hidden = adminViewer;
  });
  document.querySelectorAll("[data-hide-from-admin-or-partner]").forEach((element) => {
    element.hidden = element.hasAttribute("data-arena-updates-hidden") || adminViewer || externalPartnerViewer;
  });
  document.querySelectorAll("[data-hide-from-admin-or-claw-member]").forEach((element) => {
    element.hidden = adminViewer || clawMemberViewer;
  });
  document.querySelectorAll("[data-hide-from-claw-member]").forEach((element) => {
    element.hidden = clawMemberViewer || (element.hasAttribute("data-hide-from-admin") && adminViewer);
  });
  document.querySelectorAll("[data-show-for-claw-member]").forEach((element) => {
    element.hidden = !clawMemberViewer;
  });
  document.querySelectorAll("[data-show-for-admin]").forEach((element) => {
    element.hidden = !adminViewer;
  });
  const roleAwareCommunityPanels = document.querySelector("#roleAwareCommunityPanels");
  if (roleAwareCommunityPanels) {
    const visiblePanels = [...roleAwareCommunityPanels.children].filter((element) => !element.hidden);
    roleAwareCommunityPanels.hidden = visiblePanels.length === 0;
    roleAwareCommunityPanels.classList.toggle("has-one-visible-panel", visiblePanels.length === 1);
  }
  document.querySelectorAll("[data-nav-roles]").forEach((button) => {
    const roles = String(button.dataset.navRoles || "").split(",").map((item) => item.trim()).filter(Boolean);
    const roleAllowed = roles.includes(role);
    const feature = button.dataset.feature;
    const featureAllowed = !feature || Boolean(authConfig?.features?.[feature]) || Boolean(hub.viewer?.canScore);
    const hiddenForAdmin = button.hasAttribute("data-hide-from-admin") && adminViewer;
    const hiddenForClawMember = button.hasAttribute("data-hide-from-claw-member") && clawMemberViewer;
    button.hidden = !(roleAllowed && featureAllowed) || hiddenForAdmin || hiddenForClawMember;
  });
  document.querySelectorAll("[data-member-only]").forEach((button) => {
    button.classList.toggle("is-locked", publicViewer);
    button.setAttribute("aria-label", publicViewer ? `${button.textContent.trim()} · 회원 로그인 필요` : button.textContent.trim());
  });
  document.querySelectorAll("[data-founder-only]").forEach((button) => {
    button.hidden = !publicViewer && !communityMember;
    button.classList.toggle("is-locked", publicViewer);
    button.setAttribute("aria-label", publicViewer ? `${button.textContent.trim()} · Arena 회원 로그인 필요` : button.textContent.trim());
  });
  document.querySelectorAll("[data-permission]").forEach((button) => {
    button.hidden = !Boolean(hub.permissions?.[button.dataset.permission]);
  });
  document.querySelectorAll("[data-nav-menu]").forEach((menu) => {
    menu.hidden = Boolean(menu.querySelector(":scope > .nav-link")?.hidden);
  });
  if (els.staffUtilityNav) els.staffUtilityNav.hidden = !(canOperate || canReadRaw);
  els.staffUtilityNav?.querySelector('[data-go-page="operations"]')?.toggleAttribute("hidden", !canOperate);
  els.staffUtilityNav?.querySelector('[data-go-page="database"]')?.toggleAttribute("hidden", !canReadRaw);
  document.querySelectorAll("[data-private-filter]").forEach((element) => {
    element.hidden = publicViewer;
  });
  document.querySelectorAll("[data-private-filter-option]").forEach((element) => {
    element.hidden = publicViewer;
  });
  if (publicViewer) {
    let filtersChanged = false;
    if (els.incorporatedFilter.value) {
      els.incorporatedFilter.value = "";
      filtersChanged = true;
    }
    if (els.teamSort.value === "activity") {
      els.teamSort.value = "name";
      filtersChanged = true;
    }
    if (filtersChanged) renderTeams();
  }
  if (!canOperate && document.querySelector('[data-page-panel="operations"]').classList.contains("is-active")) {
    showPage("overview", { historyMode: "replace" });
  }
  if (!canReadRaw && document.querySelector('[data-page-panel="database"]').classList.contains("is-active")) {
    showPage("overview", { historyMode: "replace" });
  }
  if ((clawMemberViewer || adminViewer) && document.querySelector('[data-page-panel="calendar"].is-active, [data-page-panel="benefits"].is-active')) {
    showPage("overview", { historyMode: "replace" });
  }
  if (clawMemberViewer && document.querySelector('[data-page-panel="partnerships"].is-active')) {
    showPage("overview", { historyMode: "replace" });
  }
}

function renderAccount() {
  const viewer = hub.viewer || {};
  const email = viewer.email || authSession?.user?.email || "member";
  const partnerProfile = partnerProfileForViewer();
  const organizationName = partnerOrganizationName(partnerProfile);
  els.accountName.textContent = organizationName || email;
  els.accountName.title = organizationName ? `${organizationName} · ${email}` : email;
  els.accountMenu.setAttribute("aria-label", `로그인 계정 ${email}`);
  els.accountRole.textContent = partnerProfile?.profileLabel || koreanRole(viewer.role);
  const logoUrl = String(partnerProfile?.logoUrl || "").trim();
  els.accountInitial.classList.toggle("has-logo", Boolean(logoUrl));
  els.accountInitial.replaceChildren();
  if (logoUrl) {
    const logo = document.createElement("img");
    logo.src = logoUrl;
    logo.alt = "";
    els.accountInitial.append(logo);
  } else {
    els.accountInitial.textContent = (organizationName || email).charAt(0).toUpperCase();
  }
}

function renderOverview() {
  const metrics = hub.metrics || {};
  const cohort = hub.project?.cohort || "Discoverer";
  const publicViewer = isPublicViewer();
  const clawMemberViewer = isClawMemberViewer();
  const partnerProfile = partnerProfileForViewer() || (isFullPartnerDirectoryViewer() ? {} : null);
  const organizationName = partnerOrganizationName(partnerProfile) || String(hub?.viewer?.organization || "파트너사").trim();
  const collaborationFitCompanies = Array.isArray(metrics.collaborationFitCompanies)
    ? metrics.collaborationFitCompanies
    : [];
  const collaborationFitValue = metrics.collaborationFitStatus === "ready"
    && Number.isFinite(Number(metrics.collaborationFitCount))
    ? formatNumber(metrics.collaborationFitCount)
    : "0";
  const operatorViewer = Boolean(hub?.viewer?.canScore)
    || ["sparklabs", "admin"].includes(String(hub?.viewer?.role || "").toLowerCase());
  const collaborationFitDetail = operatorViewer && metrics.collaborationFitStatus !== "ready"
    ? "관리자 운영 계정 · 회사별 계산 제외"
    : metrics.collaborationFitStatus === "profile_required"
      ? "프로필 보완 필요 · 현재 0개"
      : metrics.collaborationFitStatus === "ready"
        ? collaborationFitCompanies.length
          ? "마우스를 올려 기업·이유·점수 확인"
          : "현재 기준 적합 기업 없음"
        : "회사 프로필 연결 전 · 현재 0개";
  if (els.featuredCompaniesTitle) els.featuredCompaniesTitle.textContent = "Highlighted Companies";
  if (els.featuredCompaniesUpdated) {
    els.featuredCompaniesUpdated.textContent = weeklyFeaturedUpdatedLabel();
  }
  renderPartnerBriefExperience(partnerProfile);
  if (els.companyDirectoryKicker) {
    els.companyDirectoryKicker.textContent = partnerProfile ? "PROGRAM COMPANY DIRECTORY" : "PUBLIC COMPANY DIRECTORY";
    els.companyDirectoryTitle.textContent = partnerProfile ? "AI Arena 전체 참가기업" : "검수된 AI 회사 탐색";
    els.companyDirectoryDescription.textContent = partnerProfile
      ? "현재 참가 중인 모든 기업의 기본 프로필을 표시합니다. 연락처, 내부 평가와 비공개 운영 정보는 노출하지 않습니다."
      : "회사에서 공개에 동의하고 SparkLabs가 안전 필드를 확인한 프로필만 표시합니다. 비공개 연락처와 운영 정보는 노출하지 않습니다.";
    els.companyDirectoryBadge.textContent = partnerProfile ? "PARTNER-SAFE" : "OPT-IN SAFE";
  }
  const activeBenefitCount = (hub.benefits || []).filter(
    (benefit) => benefit.isActive !== false && isBenefitReadyForDisplay(benefit)
  ).length;
  els.heroTitle.innerHTML = partnerProfile
    ? `${escapeHtml(organizationName)}의<br>다음 실증 파트너를 찾습니다.`
    : "Where AI companies<br>meet.";
  els.heroDescription.textContent = partnerProfile
    ? partnerProfile.thesis || `${organizationName}의 우선 과제에 맞는 AI 스타트업을 근거와 함께 탐색합니다.`
    : publicViewer
      ? "해결하려는 문제를 설명하고, 공개에 동의한 AI 기업을 발견한 뒤 SparkLabs의 검토를 거쳐 연결하세요."
      : "현재 필요한 고객, 파트너와 동료의 도움을 찾고 Founder Commons에서 실행 결과까지 이어가세요.";
  els.heroActions.innerHTML = partnerProfile
    ? `<button class="primary-button compact" data-overview-scroll="agenticDiscoverySection" type="button">맞춤 파트너 찾기</button><button class="secondary-button compact" data-overview-page="teams" type="button">전체 참가기업 보기</button><button class="secondary-button compact" data-overview-page="calendar" type="button">일정·혜택 보기</button>`
    : publicViewer
      ? `<button class="primary-button compact" data-overview-page="teams" type="button">공개 기업 탐색</button><button class="secondary-button compact" data-overview-scroll="publicBriefSection" type="button">기업 Brief 제출</button><button class="secondary-button compact" data-overview-access type="button">Member access</button>`
      : clawMemberViewer || operatorViewer
        ? `<button class="primary-button compact" data-overview-page="community" type="button">도움 요청하기</button><button class="secondary-button compact" data-overview-page="teams" type="button">기업 둘러보기</button>`
        : `<button class="primary-button compact" data-overview-page="community" type="button">도움 요청하기</button><button class="secondary-button compact" data-overview-page="teams" type="button">기업 둘러보기</button><button class="secondary-button compact" data-overview-page="benefits" type="button">혜택 확인</button>`;
  els.heroActions.querySelectorAll("[data-overview-page]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.overviewPage)));
  els.heroActions.querySelector("[data-overview-scroll]")?.addEventListener("click", (event) => scrollToTarget(event.currentTarget.dataset.overviewScroll));
  els.heroActions.querySelector("[data-overview-access]")?.addEventListener("click", openMemberAccess);
  els.agenticDiscoveryTitle.textContent = partnerProfile
    ? `${organizationName}이 찾는 기술 파트너`
    : publicViewer
      ? "어떤 AI 회사를 찾고 계신가요?"
      : "현재 어떤 도움이 필요하신가요?";
  els.agenticDiscoveryDescription.textContent = partnerProfile
    ? "공식 공개 자료를 바탕으로 정리한 우선 과제입니다. 조건을 보완하면 전체 참가기업의 안전한 기본 프로필에서 근거 기반 후보를 찾습니다."
    : publicViewer
      ? "해결하려는 비즈니스 문제, 반드시 필요한 조건과 피하고 싶은 조건을 자연어로 설명하세요."
      : "필요한 고객, 파트너, 기술 경험이나 동료의 도움을 구체적으로 설명하세요. 공개 가능한 회사 정보에서 먼저 찾아드립니다.";
  els.agenticDiscoveryQuery.placeholder = partnerProfile?.defaultDiscoveryPrompt
    || (publicViewer
      ? "예: 한국어 고객센터 문의를 자동화하고 엔터프라이즈 보안 요구를 충족할 AI 회사를 찾고 있어요."
      : "예: 제조 고객의 비전 검사 PoC 경험이 있는 창업자와 이야기하고 싶어요.");
  const profileSeedKey = partnerProfile ? String(partnerProfile.id || organizationName) : "";
  if (els.agenticDiscoveryQuery.dataset.profileSeeded && els.agenticDiscoveryQuery.dataset.profileSeeded !== profileSeedKey) {
    els.agenticDiscoveryQuery.value = "";
    delete els.agenticDiscoveryQuery.dataset.profileSeeded;
  }
  if (partnerProfile?.defaultDiscoveryPrompt && !els.agenticDiscoveryQuery.value && !els.agenticDiscoveryQuery.dataset.profileSeeded) {
    els.agenticDiscoveryQuery.value = partnerProfile.defaultDiscoveryPrompt;
    els.agenticDiscoveryQuery.dataset.profileSeeded = profileSeedKey;
  }
  const partnerPrompts = normalizePartnerDiscoveryPrompts(partnerProfile);
  const promptPresets = partnerPrompts.length
    ? partnerPrompts
    : publicViewer
      ? [
          ["제조 비전", "제조 현장의 비전 검사 문제를 해결할 AI 회사를 찾아줘"],
          ["문서 자동화", "한국어 문서 업무를 자동화할 B2B SaaS 파트너를 찾아줘"],
          ["개발자 도구", "개발자 도구와 AI 인프라 분야의 초기 회사를 찾아줘"],
          ["기술 검토", "엔터프라이즈 보안과 데이터 인프라를 함께 검토할 기술 경험이 있는 팀을 찾아줘"],
          ["공동 사업", "고객 제안과 공동 PoC를 함께 추진할 수 있는 AI 팀을 찾아줘"],
          ["운영 경험", "AI 제품을 실제 고객사에 도입하고 운영해 본 팀을 찾아줘"]
        ]
      : [
          ["고객 연결", "제조 대기업 PoC 경험이 있는 동료 창업자와 연결해줘"],
          ["평가 도움", "LLM 에이전트 평가를 제품에 적용한 팀을 찾아줘"],
          ["API 파트너", "우리 제품과 함께 판매할 수 있는 API 파트너를 찾아줘"],
          ["기술 검토", "보안·데이터 인프라 아키텍처를 함께 검토할 기술 경험이 있는 팀을 찾아줘"],
          ["공동 사업", "고객 제안과 공동 PoC를 함께 추진할 수 있는 동료 팀을 찾아줘"],
          ["운영 경험", "AI 제품을 실제 고객사에 도입하고 운영해 본 팀의 경험을 듣고 싶어"]
        ];
  document.querySelectorAll("[data-agent-prompt]").forEach((button, index) => {
    const preset = promptPresets[index];
    button.hidden = !preset;
    if (!preset) return;
    button.textContent = preset[0];
    button.dataset.agentPrompt = preset[1];
  });
  setMetricCardCopy(
    partnerProfile
      ? [
          ["전체 참가기업", "비공개·탈락 기업 제외"],
          ["협업 적합 기업", collaborationFitDetail],
          ["확인된 혜택", "현재 제공 조건 확인"],
          ["커뮤니티 일정", "교육·코칭·네트워킹"]
        ]
      : publicViewer
      ? [
          ["Curated Companies", "SparkLabs 선별 네트워크"],
          ["Public Profiles", "공개 동의·안전 필드"],
          ["Verified Perks", "제공 조건 확인 완료"],
          ["Public Events", "외부 공개 일정"]
        ]
      : [
          ["Curated Companies", "선별된 AI 기업"],
          ["협업 적합 기업", collaborationFitDetail],
          ["Active Perks", "현재 신청 가능"],
          ["Community Events", "교육·코칭·네트워킹"]
        ]
  );
  els.cohortBadge.textContent = partnerProfile ? `${organizationName} 파트너 공간` : publicViewer ? "CURATED AI NETWORK" : `${cohort.toUpperCase()} COHORT`;
  els.heroTeamCount.textContent = formatNumber(metrics.teams);
  els.heroSectorCount.textContent = formatNumber(metrics.sectors);
  els.heroBenefitCount.textContent = clawMemberViewer
    ? formatNumber(Math.max(0, Number(metrics.teams || 0) - 1))
    : formatNumber(activeBenefitCount);
  if (els.heroBenefitLabel) els.heroBenefitLabel.textContent = clawMemberViewer ? "other teams" : "active benefits";
  renderHeroLiveNetwork(partnerProfile);
  els.metricTeams.textContent = formatNumber(metrics.teams);
  els.metricTeamStatus.textContent = partnerProfile
    ? "전체 참가기업 · 기본 프로필"
    : publicViewer
      ? "curated network · opt-in profiles"
      : `${cohort} cohort · curated`;
  els.metricProfiles.textContent = collaborationFitValue;
  renderCollaborationFitTooltip(metrics);
  els.metricBenefits.textContent = formatNumber(activeBenefitCount);
  els.metricEvents.textContent = formatNumber(metrics.events);
  els.metricUpcoming.textContent = "8월 13일 BootCamp Orientation 포함 · 이후 일정";
  renderPartnerProfile();
  renderWeeklyNotice();
  renderSectorChart();
  renderOverviewEvents();
  renderOverviewBenefits();
  renderFeaturedCriteria();
  loadAdminBenefitRequestNotice();
}

async function loadAdminBenefitRequestNotice() {
  if (!els.adminBenefitRequestNotice || !isAdminViewer()) return;
  const requestId = ++adminBenefitNoticeRequestId;
  els.adminBenefitRequestBadge.textContent = "확인 중";
  els.adminBenefitRequestBadge.classList.remove("is-alert");
  els.adminBenefitRequestCount.textContent = "—";
  els.adminBenefitRequestMeta.textContent = "신규 요청 여부를 확인하고 있습니다.";
  try {
    const response = await fetch("/api/benefit-needs-survey", {
      headers: { ...authHeaders(), Accept: "application/json" },
      cache: "no-store"
    });
    const payload = await safeJson(response);
    if (requestId !== adminBenefitNoticeRequestId) return;
    if (!response.ok || payload?.available === false || !payload?.staffSummary) {
      throw new Error(payload?.error || "혜택 요청 현황을 불러오지 못했습니다.");
    }
    const count = Math.max(0, Number(payload.staffSummary.newRequestCount) || 0);
    const latestAt = String(payload.staffSummary.latestSubmittedAt || "").trim();
    els.adminBenefitRequestBadge.textContent = count ? "신규 요청 있음" : "새 요청 없음";
    els.adminBenefitRequestBadge.classList.toggle("is-alert", count > 0);
    els.adminBenefitRequestCount.textContent = `${formatNumber(count)}건`;
    els.adminBenefitRequestMeta.textContent = count
      ? `확인 대기 중인 신규 요청${latestAt ? ` · 최근 접수 ${formatDateTime(latestAt)}` : ""}`
      : "현재 확인 대기 중인 Claw Member 혜택 요청이 없습니다.";
  } catch (error) {
    if (requestId !== adminBenefitNoticeRequestId) return;
    els.adminBenefitRequestBadge.textContent = "확인 필요";
    els.adminBenefitRequestBadge.classList.remove("is-alert");
    els.adminBenefitRequestCount.textContent = "—";
    els.adminBenefitRequestMeta.textContent = error.message || "혜택 요청 현황을 불러오지 못했습니다.";
  }
}

function readStoredPublicBriefLanguage() {
  try {
    return window.localStorage.getItem(PUBLIC_BRIEF_LANGUAGE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function persistPublicBriefLanguage(language) {
  try {
    window.localStorage.setItem(PUBLIC_BRIEF_LANGUAGE_STORAGE_KEY, normalizePublicBriefLanguage(language));
  } catch {
    // Language selection still works when storage is unavailable.
  }
}

function replaceTrailingText(element, value) {
  if (!element) return;
  const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) textNode.nodeValue = value;
  else element.append(document.createTextNode(value));
}

function setPublicBriefFieldLabel(name, label, optional = false) {
  const labelElement = els.publicBriefForm?.elements?.[name]?.closest("label")?.querySelector(":scope > span");
  if (!labelElement) return;
  labelElement.replaceChildren(document.createTextNode(label));
  if (optional) {
    labelElement.append(document.createTextNode(" "));
    const optionalLabel = document.createElement("small");
    optionalLabel.textContent = publicBriefCopy(publicBriefLanguage).optional;
    labelElement.append(optionalLabel);
  }
}

function applyPublicBriefLoginCopy(copy) {
  const login = copy.login;
  els.loginGate?.querySelectorAll("[data-close-member-access]").forEach((button) => button.setAttribute("aria-label", login.close));
  els.memberAccessClose?.setAttribute("aria-label", login.close);
  const networkStatus = els.loginGate?.querySelector(".login-network-status");
  if (networkStatus) networkStatus.innerHTML = `<i aria-hidden="true"></i>${escapeHtml(login.network)}`;
  const storyTitle = els.loginGate?.querySelector("[data-public-brief-login-title]");
  if (storyTitle) storyTitle.innerHTML = login.titleHtml;
  setText(els.loginGate?.querySelector("[data-public-brief-login-description]"), login.description);
  const featureList = [...(els.loginGate?.querySelectorAll(".login-community-preview span") || [])];
  els.loginGate?.querySelector(".login-community-preview")?.setAttribute("aria-label", login.featuresLabel);
  featureList.forEach((element, index) => setText(element, login.features[index] || ""));
  const route = els.loginGate?.querySelector(".login-access-route");
  route?.setAttribute("aria-label", login.routeLabel);
  [...(route?.querySelectorAll(":scope > span") || [])].forEach((element, index) => replaceTrailingText(element, login.route[index] || ""));
  setText(els.loginGate?.querySelector("[data-public-brief-login-eyebrow]"), login.eyebrow);
  setText(document.querySelector("#memberAccessTitle"), login.title);
  setText(document.querySelector("#memberAccessDescription"), login.accessDescription);
  setText(els.loginGate?.querySelector("[data-public-brief-login-email]"), login.email);
  setText(els.loginGate?.querySelector("[data-public-brief-login-password]"), login.password);
  const password = els.loginForm?.elements?.password;
  if (password) password.placeholder = login.passwordPlaceholder;
  setText(els.loginGate?.querySelector("[data-public-brief-login-submit]"), login.submit);
  setText(els.loginGate?.querySelector("[data-public-brief-google-admin-login]"), login.googleAdmin || "SparkLabs Google login");
  setText(els.loginGate?.querySelector("[data-public-brief-google-admin-note]"), login.googleAdminNote || "Only approved SparkLabs work accounts receive staff access.");
  const trust = els.loginGate?.querySelector(".login-card-trust");
  trust?.setAttribute("aria-label", login.trustLabel);
  [...(trust?.querySelectorAll("span") || [])].forEach((element, index) => setText(element, login.trust[index] || ""));
}

function applyPublicBriefLanguage() {
  const copy = publicBriefCopy(publicBriefLanguage);
  LOGIN_PROGRESS_STEPS.splice(0, LOGIN_PROGRESS_STEPS.length, ...copy.login.progress);
  PUBLIC_BRIEF_PROGRESS_STEPS.splice(0, PUBLIC_BRIEF_PROGRESS_STEPS.length, ...copy.progress);
  document.documentElement.lang = copy.htmlLang;
  document.documentElement.dir = copy.direction || (publicBriefLanguage === "ar" ? "rtl" : "ltr");
  els.homeButton?.setAttribute("aria-label", copy.homeLabel);
  els.publicBriefGate?.setAttribute("aria-label", copy.gateLabel);
  els.publicBriefLanguageSwitch?.setAttribute("aria-label", copy.languageLabel);
  els.publicBriefLanguageSelect?.setAttribute("aria-label", copy.languageLabel);
  if (els.publicBriefLanguageSelect) els.publicBriefLanguageSelect.value = publicBriefLanguage;
  setText(els.memberAccessButton, copy.memberLogin);
  if (!els.publicBriefForm || els.publicBriefForm.dataset.mode !== "discovery-brief") {
    applyPublicBriefLoginCopy(copy);
    return;
  }

  if (els.publicBriefKicker) els.publicBriefKicker.innerHTML = `<i aria-hidden="true"></i>${escapeHtml(copy.kicker)}`;
  if (els.publicBriefTitle) els.publicBriefTitle.innerHTML = copy.titleHtml;
  setText(els.publicBriefDescription, copy.description);
  if (els.briefAgentStatus) els.briefAgentStatus.innerHTML = `<i></i>${escapeHtml(copy.agentStatus)}`;
  setText(els.publicBriefSection?.querySelector(".brief-agent-map-head > small"), copy.agentCaption);
  setText(els.publicBriefSection?.querySelector(".brief-agent-core small"), copy.orchestrator);
  [...(els.publicBriefSection?.querySelectorAll(".brief-agent-node") || [])].forEach((node, index) => {
    const label = node.querySelector("span");
    const [prefix = "", emphasis = ""] = copy.nodes[index] || [];
    if (!label) return;
    label.replaceChildren(document.createTextNode(prefix));
    const strong = document.createElement("strong");
    strong.textContent = emphasis;
    label.append(strong);
  });
  [...(els.publicBriefSection?.querySelectorAll(".brief-agent-telemetry span") || [])].forEach((element, index) => setText(element, copy.telemetry[index] || ""));
  const process = els.publicBriefSection?.querySelector(".brief-process");
  process?.setAttribute("aria-label", copy.processLabel);
  process?.querySelectorAll("[data-brief-step-title]").forEach((element, index) => setText(element, copy.steps[index]?.title || ""));
  process?.querySelectorAll("[data-brief-step-description]").forEach((element, index) => setText(element, copy.steps[index]?.description || ""));
  process?.querySelectorAll("[data-brief-step-status]").forEach((element, index) => setText(element, copy.steps[index]?.status || ""));
  const memberPrompt = els.publicBriefSection?.querySelector("[data-public-brief-login]");
  if (memberPrompt) {
    replaceTrailingText(memberPrompt, `${copy.memberPrompt} `);
    setText(memberPrompt.querySelector("button"), `${copy.memberLogin} →`);
  }

  setText(els.publicBriefFormKicker, copy.formKicker);
  setText(els.publicBriefFormTitle, copy.formTitle);
  if (els.publicBriefSecureLabel) els.publicBriefSecureLabel.innerHTML = `<i aria-hidden="true"></i>${escapeHtml(copy.secure)}`;
  Object.entries(copy.fields).forEach(([name, label]) => setPublicBriefFieldLabel(name, label, name === "website"));
  Object.entries(copy.placeholders).forEach(([name, placeholder]) => {
    if (els.publicBriefForm.elements[name]) els.publicBriefForm.elements[name].placeholder = placeholder;
  });
  [...els.publicBriefForm.elements.budgetRange.options].forEach((option) => {
    option.textContent = copy.budgets[option.value] || option.textContent;
  });
  setText(els.publicBriefConsentText, copy.consent);
  setText(els.publicBriefForm.querySelector(".brief-honeypot > span"), copy.honeypot);
  setText(els.publicBriefPrivacy, copy.privacy);
  setText(els.publicBriefSubmitButton, copy.submit);
  applyPublicBriefLoginCopy(copy);
}

function setPublicBriefLanguage(language, { persist = false, syncUrl = false } = {}) {
  publicBriefLanguage = normalizePublicBriefLanguage(language);
  if (persist) {
    publicBriefLanguageWasChosen = true;
    persistPublicBriefLanguage(publicBriefLanguage);
  }
  if (syncUrl) {
    const nextUrl = publicBriefUrl(window.location.href, publicBriefLanguage);
    window.history.replaceState(window.history.state, "", nextUrl);
  }
  applyPublicBriefLanguage();
}

function renderPartnerBriefExperience(partnerProfile) {
  const form = els.publicBriefForm;
  if (!form) return;
  const viewerRole = String(hub?.viewer?.role || "").toLowerCase();
  const isClawMember = viewerRole === "member";
  if (els.publicBriefSection) els.publicBriefSection.hidden = isClawMember;
  if (isClawMember) return;
  const isOperatorProxy = Boolean(hub?.viewer?.canScore) || ["sparklabs", "admin"].includes(viewerRole);
  const isPartnerUpdate = hub?.viewer?.role === "b2b_partner" && Boolean(partnerProfile);
  const previousMode = form.dataset.mode || "";
  const setText = (element, value, html = false) => {
    if (!element) return;
    if (html) element.innerHTML = value;
    else element.textContent = value;
  };
  const setIndicatorText = (element, value) => {
    if (element) element.innerHTML = `<i aria-hidden="true"></i>${escapeHtml(value)}`;
  };
  const setFieldLabel = (name, label, optional = false) => {
    const labelElement = form.elements[name]?.closest("label")?.querySelector(":scope > span");
    if (labelElement) labelElement.innerHTML = `${escapeHtml(label)}${optional ? " <small>선택</small>" : ""}`;
  };
  const setSteps = (steps) => {
    els.publicBriefSection?.querySelectorAll("[data-brief-step-title]").forEach((element, index) => {
      element.textContent = steps[index]?.title || "";
    });
    els.publicBriefSection?.querySelectorAll("[data-brief-step-description]").forEach((element, index) => {
      element.textContent = steps[index]?.description || "";
    });
    els.publicBriefSection?.querySelectorAll("[data-brief-step-status]").forEach((element, index) => {
      element.textContent = steps[index]?.status || "";
    });
  };
  const fields = form.elements;
  const switchMode = (mode) => {
    if (previousMode && previousMode !== mode) {
      form.reset();
      els.publicBriefStatus.hidden = true;
      els.publicBriefStatus.textContent = "";
    }
    form.dataset.mode = mode;
    if (mode !== "partner-profile-update") delete form.dataset.partnerProfileId;
  };

  if (isOperatorProxy) {
    switchMode("operator-proxy-brief");
    setIndicatorText(els.publicBriefKicker, "PARTNER BRIEF · OPERATOR ASSIST");
    setText(els.publicBriefTitle, "파트너사를 대신해<br>탐색 Brief를<br>작성하세요", true);
    setText(els.publicBriefDescription, "SparkLabs 운영진이 파트너사와 확인한 과제와 성공 기준을 대신 구조화해 등록합니다. 등록된 Brief는 후보 탐색, 근거 검증과 소개 준비 기준으로 사용합니다.");
    setIndicatorText(els.briefAgentStatus, "운영진 대리 작성 모드");
    setText(els.publicBriefFormKicker, "운영진 대리 입력");
    setText(els.publicBriefFormTitle, "파트너사 탐색 Brief 등록");
    setIndicatorText(els.publicBriefSecureLabel, "관리자 작성");
    setText(els.publicBriefConsentText, "파트너사와 공유 및 입력 권한을 확인한 정보이며, 후보 탐색과 회신을 위해 SparkLabs가 처리하는 데 동의합니다.");
    setText(els.publicBriefSubmitButton, "파트너사 Brief 등록");
    setText(els.publicBriefPrivacy, "파트너사와 공유 권한이 확인된 정보만 입력하세요. 등록 내용은 후보 탐색과 회신 목적으로 사용하며, 접수일로부터 90일 후 보관 필요성을 재검토합니다. 소스코드, API 키, 고객 원문이나 영업비밀은 입력하지 마세요.");
    setFieldLabel("organization", "파트너사명");
    setFieldLabel("website", "파트너사 웹사이트", true);
    setFieldLabel("contactName", "파트너사 담당자");
    setFieldLabel("email", "파트너사 업무 이메일");
    setFieldLabel("problem", "파트너사가 해결하려는 문제");
    setFieldLabel("successMetric", "파트너사의 성공 기준");
    setFieldLabel("constraints", "데이터·보안·연동 제약");
    setFieldLabel("deadline", "파트너사의 의사결정 시점");
    setFieldLabel("budgetRange", "예산 범위");
    setFieldLabel("procurementPath", "구매·법무 경로");
    fields.organization.readOnly = false;
    fields.organization.removeAttribute("aria-readonly");
    fields.website.placeholder = "예: https://partner.example.com";
    fields.problem.placeholder = "파트너사와 확인한 현재 업무 흐름, 반복되는 병목과 사업 영향을 구체적으로 적어주세요.";
    fields.successMetric.placeholder = "예: 처리시간 50% 단축, 정확도 95% 이상, PoC 완료 시점";
    fields.constraints.placeholder = "예: 온프레미스, 개인정보, SAP 연동, 데이터 반출 제한";
    fields.procurementPath.placeholder = "예: PoC 후 구매위원회 검토, 법무·보안 사전 심사";
    setSteps([
      { title: "파트너 요구사항 대리 작성", description: "확인된 문제·목표·제약을 운영진이 구조화", status: "작성" },
      { title: "SparkLabs 내부 검토", description: "입력 근거와 후보 탐색 범위를 확인", status: "검토" },
      { title: "후보 탐색·소개 준비", description: "대상 스타트업이 요청을 승인하면 연결", status: "연결" }
    ]);
    return;
  }

  if (!isPartnerUpdate) {
    switchMode("discovery-brief");
    setIndicatorText(els.publicBriefKicker, "에이전틱 탐색 · 사람의 최종 검증");
    setText(els.publicBriefTitle, "찾는 기술·<br>해결할 문제부터 알려주세요", true);
    setText(els.publicBriefDescription, "문제 책임자와 성공 기준이 명확할수록 더 나은 후보를 찾을 수 있습니다. SparkLabs가 Brief를 검토한 뒤 적합한 다음 단계를 안내합니다.");
    setIndicatorText(els.briefAgentStatus, "SPARK 에이전트 준비됨");
    setText(els.publicBriefFormKicker, "에이전트 입력");
    setText(els.publicBriefFormTitle, "탐색 Brief 작성");
    setIndicatorText(els.publicBriefSecureLabel, "보안 접수");
    setText(els.publicBriefConsentText, "Brief 검토와 회신을 위해 입력 정보를 SparkLabs가 처리하는 데 동의합니다.");
    setText(els.publicBriefSubmitButton, "SparkLabs 검토 요청");
    setText(els.publicBriefPrivacy, "입력 정보는 후보 탐색과 회신 목적으로만 사용하며, 접수일로부터 90일 후 보관 필요성을 재검토합니다. 소스코드, API 키, 고객 원문이나 영업비밀은 입력하지 마세요.");
    setFieldLabel("organization", "조직명");
    setFieldLabel("website", "웹사이트", true);
    setFieldLabel("contactName", "담당자 이름");
    setFieldLabel("email", "업무 이메일");
    setFieldLabel("problem", "해결하려는 문제");
    setFieldLabel("successMetric", "성공 기준");
    setFieldLabel("constraints", "데이터·보안·연동 제약");
    setFieldLabel("deadline", "의사결정 시점");
    setFieldLabel("budgetRange", "예산 범위");
    setFieldLabel("procurementPath", "구매·법무 경로");
    fields.organization.readOnly = false;
    fields.organization.removeAttribute("aria-readonly");
    fields.website.placeholder = "https://";
    fields.problem.placeholder = "현재 업무 흐름, 반복되는 병목과 영향을 구체적으로 적어주세요.";
    fields.successMetric.placeholder = "예: 처리시간 50% 단축, 정확도 95% 이상";
    fields.constraints.placeholder = "예: 온프레미스, 개인정보, SAP 연동";
    fields.procurementPath.placeholder = "예: PoC 후 구매위원회 검토";
    setSteps([
      { title: "문제와 제약 검토", description: "목표·데이터·보안 조건을 구조화", status: "정의" },
      { title: "근거 기반 후보 선별", description: "역량과 적용 사례를 교차 확인", status: "검증" },
      { title: "대상 스타트업 동의 후 소개", description: "My Log 승인 뒤 SparkLabs가 안전하게 연결", status: "연결" }
    ]);
    return;
  }

  const organizationName = partnerOrganizationName(partnerProfile) || "현재 파트너사";
  switchMode("partner-profile-update");
  setIndicatorText(els.publicBriefKicker, "PARTNER NEEDS · UPDATE REQUEST");
  setText(els.publicBriefTitle, `${escapeHtml(organizationName)}의<br>니즈 업데이트`, true);
  setText(els.publicBriefDescription, `${organizationName}의 현재 과제, 조건 또는 담당자 변경 사항을 알려주세요. SparkLabs가 확인한 뒤 추천·소개 기준에 반영합니다.`);
  setIndicatorText(els.briefAgentStatus, "현재 파트너 프로필 연결됨");
  setText(els.publicBriefFormKicker, "파트너 니즈 업데이트");
  setText(els.publicBriefFormTitle, "니즈 변경 요청");
  setIndicatorText(els.publicBriefSecureLabel, "로그인 계정 연결");
  setText(els.publicBriefConsentText, "현재 파트너 니즈의 업데이트 검토와 회신을 위해 입력 정보를 SparkLabs가 처리하는 데 동의합니다.");
  setText(els.publicBriefSubmitButton, "니즈 업데이트 요청");
  setText(els.publicBriefPrivacy, "입력 정보는 현재 파트너 프로필과 추천 기준을 최신화하는 검토 목적으로만 사용합니다. SparkLabs 확인 전에는 공개 프로필이나 소개 기준에 반영되지 않습니다. 소스코드, API 키, 고객 원문이나 영업비밀은 입력하지 마세요.");
  setFieldLabel("organization", "현재 로그인한 파트너사");
  setFieldLabel("website", "웹사이트 변경", true);
  setFieldLabel("contactName", "변경 사항 담당자");
  setFieldLabel("email", "회신받을 업무 이메일");
  setFieldLabel("problem", "새롭게 반영할 우선 과제");
  setFieldLabel("successMetric", "추가·변경된 협업 조건");
  setFieldLabel("constraints", "변경된 보안·데이터·연동 조건");
  setFieldLabel("deadline", "다음 검토 희망 시점");
  setFieldLabel("budgetRange", "예산 범위 변경");
  setFieldLabel("procurementPath", "구매·법무 절차 변경");
  fields.organization.readOnly = true;
  fields.organization.setAttribute("aria-readonly", "true");
  fields.website.placeholder = "예: https://updated.example.com";
  fields.problem.placeholder = "예: 새로 검토할 업무 과제, 우선순위가 바뀐 이유와 원하는 결과를 알려주세요.";
  fields.successMetric.placeholder = "예: PoC 가능 시점, 필수 적용 사례, 도입 성공 기준";
  fields.constraints.placeholder = "예: 보안 기준 변경, 필수 연동 시스템, 데이터 반출 제한";
  fields.procurementPath.placeholder = "예: 예산 확정 전 사전 검토 필요, 구매위원회 일정 변경";
  setSteps([
    { title: "변경 사항 정리", description: "현재 과제·조건·담당자 변경을 구조화", status: "업데이트" },
    { title: "SparkLabs 확인", description: "프로필 근거와 최신화 범위를 검토", status: "검토" },
    { title: "추천 기준 반영", description: "확인 후 탐색·소개 기준을 최신화", status: "반영" }
  ]);

  const partnerProfileKey = String(partnerProfile.id || organizationName);
  if (form.dataset.partnerProfileId !== partnerProfileKey) {
    if (!fields.organization.value.trim()) fields.organization.value = organizationName;
    if (!fields.website.value.trim() && partnerProfile.websiteUrl) fields.website.value = partnerProfile.websiteUrl;
    if (!fields.email.value.trim() && hub?.viewer?.email) fields.email.value = hub.viewer.email;
    form.dataset.partnerProfileId = partnerProfileKey;
  }
}

function partnerProfileForViewer() {
  const role = hub?.viewer?.role;
  if (!hub?.partnerProfile || !["b2b_partner", "b2b"].includes(role)) return null;
  return hub.partnerProfile;
}

function isFullPartnerDirectoryViewer() {
  return hub?.viewer?.role === "b2b_partner" && hub?.directoryScope === "all_participating_companies";
}

function partnerOrganizationName(profile) {
  return String(profile?.organizationName || profile?.name || "").trim();
}

function normalizePartnerDiscoveryPrompts(profile) {
  if (!Array.isArray(profile?.discoveryPrompts)) return [];
  return profile.discoveryPrompts
    .map((item) => {
      if (Array.isArray(item)) return [String(item[0] || "").trim(), String(item[1] || "").trim()];
      if (item && typeof item === "object") return [String(item.label || "").trim(), String(item.prompt || "").trim()];
      const value = String(item || "").trim();
      return [value, value];
    })
    .filter(([label, prompt]) => label && prompt)
    .slice(0, 3);
}

function renderPartnerProfile() {
  if (!els.partnerProfileCard) return;
  const profile = partnerProfileForViewer();
  if (!profile) {
    els.partnerProfileCard.hidden = true;
    els.partnerProfileCard.replaceChildren();
    return;
  }

  const organizationName = partnerOrganizationName(profile) || "기업 파트너";
  const priorities = (Array.isArray(profile.priorities) ? profile.priorities : [])
    .map((item, index) => typeof item === "string" ? { rank: index + 1, title: item, hypothesis: "" } : item)
    .filter((item) => item?.title)
    .sort((left, right) => Number(left.rank || 999) - Number(right.rank || 999))
    .slice(0, 4);
  const focusCategories = (Array.isArray(profile.focusCategories) ? profile.focusCategories : []).filter(Boolean).slice(0, 8);
  const preferredRegions = (Array.isArray(profile.preferredRegions) ? profile.preferredRegions : []).filter(Boolean);
  const targetStages = (Array.isArray(profile.targetStages) ? profile.targetStages : []).filter(Boolean);
  const researchDate = profile.researchAsOf ? formatDate(profile.researchAsOf) : "기준일 확인 필요";

  els.partnerProfileCard.innerHTML = `
    <div class="partner-profile-summary">
      <div class="partner-profile-heading">
        <div>
          <span class="eyebrow">맞춤 파트너 프로필</span>
          <h2 id="partnerProfileTitle">${escapeHtml(organizationName)}이 현재 찾는 파트너</h2>
        </div>
        <span class="partner-profile-label">${escapeHtml(profile.profileLabel || "전략적 기업 파트너")}</span>
      </div>
      <p class="partner-profile-thesis">${escapeHtml(profile.thesis || "우선 과제에 맞는 AI 스타트업을 발굴하고 실증 가능성을 검토합니다.")}</p>
      <div class="partner-profile-tags" aria-label="관심 분야">
        ${focusCategories.map((category) => `<span>${escapeHtml(category)}</span>`).join("")}
      </div>
      <dl class="partner-profile-facts">
        <div><dt>선호 지역</dt><dd>${escapeHtml(preferredRegions.join(" · ") || "내부 확인 필요")}</dd></div>
        <div><dt>투자 단계</dt><dd>${escapeHtml(targetStages.join(" · ") || "내부 확인 필요")}</dd></div>
        <div><dt>리서치 기준</dt><dd>${escapeHtml(researchDate)}</dd></div>
      </dl>
      <button class="primary-button compact" data-partner-profile-search type="button">이 조건으로 스타트업 찾기 →</button>
    </div>
    <div class="partner-priority-panel">
      <div class="partner-priority-head">
        <div><span class="eyebrow">리서치 가설</span><h3>우선 검토 과제</h3></div>
        <small>영원무역 확인 전</small>
      </div>
      <ol class="partner-priority-list">
        ${priorities.length
          ? priorities.map((priority, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(priority.title)}</strong>${priority.hypothesis ? `<p>${escapeHtml(priority.hypothesis)}</p>` : ""}</div></li>`).join("")
          : `<li class="is-empty"><div><strong>우선 과제를 확인하고 있습니다.</strong></div></li>`}
      </ol>
      <p class="partner-evidence-note">${escapeHtml(profile.evidenceNote || "공식 공개 자료를 바탕으로 한 가설이며, 예산·RFP·투자 조건과 담당자는 내부 확인이 필요합니다.")}</p>
    </div>
  `;
  els.partnerProfileCard.hidden = false;
  els.partnerProfileCard.querySelector("[data-partner-profile-search]")?.addEventListener("click", () => {
    els.agenticDiscoverySection?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => els.agenticDiscoveryQuery?.focus(), 250);
  });
}

function renderFeaturedCriteria() {
  if (!els.featuredCriteriaList) return;
  const source = hub.featuredCriteria;
  const values = Array.isArray(source)
    ? source
    : Array.isArray(source?.criteria)
      ? source.criteria
      : source && typeof source === "object"
        ? Object.values(source)
        : FEATURED_CRITERIA_DEFAULTS;
  const criteria = values
    .map((item) => (typeof item === "string" ? item : item?.label || item?.title || item?.name || ""))
    .filter(Boolean)
    .slice(0, 6);
  els.featuredCriteriaList.innerHTML = (criteria.length ? criteria : FEATURED_CRITERIA_DEFAULTS)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function setMetricCardCopy(items) {
  document.querySelectorAll(".metric-card:not(.admin-benefit-request-notice)").forEach((card, index) => {
    const copy = items[index];
    if (!copy) return;
    const label = card.querySelector(":scope > span");
    const detail = card.querySelector(":scope > small");
    if (label) label.textContent = copy[0];
    if (detail && !detail.id) detail.textContent = copy[1];
  });
}

function renderCollaborationFitTooltip(metrics = {}) {
  if (!els.collaborationFitCard || !els.metricProfilesTooltip) return;
  els.collaborationFitCard.removeAttribute("title");
  const companies = (Array.isArray(metrics.collaborationFitCompanies) ? metrics.collaborationFitCompanies : [])
    .filter((company) => company?.name && Number.isFinite(Number(company.score)));
  const count = Number.isFinite(Number(metrics.collaborationFitCount)) ? Number(metrics.collaborationFitCount) : 0;
  if (!companies.length) {
    const operatorViewer = Boolean(hub?.viewer?.canScore)
      || ["sparklabs", "admin"].includes(String(hub?.viewer?.role || "").toLowerCase());
    const operatorWithoutCompany = operatorViewer && metrics.collaborationFitStatus !== "ready";
    const heading = operatorWithoutCompany
      ? "관리자 계정은 계산 대상이 아닙니다"
      : `협업 적합 기업 ${formatNumber(count)}개`;
    const message = operatorWithoutCompany
      ? "관리자 계정은 특정 회사 프로필에 귀속되지 않아 협업 적합도를 계산하지 않습니다. 회사별 추천 결과는 해당 파트너 또는 참가기업 계정으로 로그인해 확인하세요."
      : metrics.collaborationFitStatus === "profile_required"
        ? "회사·서비스 프로필 키워드를 보완하면 협업 적합 기업을 계산합니다."
        : metrics.collaborationFitStatus === "ready"
          ? "현재 저장된 회사·서비스 키워드 기준으로 적합 기업이 없습니다."
          : "기업 프로필이 연결되지 않은 운영 계정입니다.";
    els.metricProfilesTooltip.innerHTML = `<strong>${escapeHtml(heading)}</strong><p>${escapeHtml(message)}</p>`;
    els.collaborationFitCard.setAttribute("aria-label", `${heading}. ${message}`);
    return;
  }
  const companySummary = companies
    .map((company, index) => `추천 ${index + 1}위 ${company.name} · ${collaborationFitReason(company)}`)
    .join(", ");
  els.metricProfilesTooltip.innerHTML = `
    <strong>협업 적합 기업 ${formatNumber(count)}개</strong>
    <p>기업에 마우스를 올리거나 키보드로 선택하면 일치 근거와 겹치지 않는 협업 활용 제안을 확인할 수 있습니다.</p>
    <ol>
      ${companies.map((company, index) => {
        const companyId = String(company.id || "");
        const reasonId = `fit-selection-reason-${index}`;
        const refinedReason = collaborationFitReasonsById.get(companyId);
        const hoverReason = refinedReason || collaborationFitHoverReason(company);
        const pending = collaborationFitReasonPending && !refinedReason;
        return `<li class="fit-company-item" tabindex="0" data-fit-company-id="${escapeHtml(companyId)}" aria-describedby="${reasonId}">
          <span class="fit-company-copy">
            <strong>${escapeHtml(company.name)}</strong>
            <small>${escapeHtml(collaborationFitReason(company))}</small>
            <span id="${reasonId}" class="fit-company-selection-reason${pending ? " is-loading" : ""}">
              <span class="fit-company-selection-label"><i aria-hidden="true"></i>${pending ? "클로이 협업 제안 정리 중" : "클로이 협업 활용 제안"}</span>
              <span class="fit-company-selection-copy">${escapeHtml(hoverReason)}</span>
            </span>
          </span>
          <b class="fit-company-rank">추천 ${index + 1}위</b>
        </li>`;
      }).join("")}
    </ol>
  `;
  els.collaborationFitCard.setAttribute("aria-label", `협업 적합 기업 ${formatNumber(count)}개. ${companySummary}`.slice(0, 1800));
}

function setCollaborationFitDropdownOpen(open) {
  if (!els.collaborationFitCard) return;
  const nextOpen = Boolean(open);
  els.collaborationFitCard.classList.toggle("is-open", nextOpen);
  els.collaborationFitCard.setAttribute("aria-expanded", String(nextOpen));
}

function handleCollaborationFitDropdownClick(event) {
  if (!els.collaborationFitCard || event.target.closest(".fit-company-item")) return;
  setCollaborationFitDropdownOpen(!els.collaborationFitCard.classList.contains("is-open"));
  if (els.collaborationFitCard.classList.contains("is-open")) requestCollaborationFitReasons();
}

function handleCollaborationFitDropdownKeydown(event) {
  if (event.target !== els.collaborationFitCard || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  handleCollaborationFitDropdownClick(event);
}

function closeCollaborationFitDropdownFromOutside(event) {
  if (!els.collaborationFitCard?.classList.contains("is-open")) return;
  if (els.collaborationFitCard.contains(event.target)) return;
  setCollaborationFitDropdownOpen(false);
}

function closeCollaborationFitDropdownOnEscape(event) {
  if (event.key !== "Escape" || !els.collaborationFitCard?.classList.contains("is-open")) return;
  setCollaborationFitDropdownOpen(false);
  els.collaborationFitCard.focus({ preventScroll: true });
}

function collaborationFitHoverReason(company = {}) {
  return collaborationFitUseSuggestion(company);
}

function collaborationFitUseSuggestion(company = {}) {
  const context = [company.fitReason, ...(Array.isArray(company.evidence) ? company.evidence : [])]
    .map((item) => String(item || "").toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (/health|medical|의료|헬스|건강|바이오/u.test(context)) return "실사용 환경에서 안전성과 운영 적합성을 함께 확인할 실증 후보입니다.";
  if (/advert|adtech|광고|마케팅|캠페인/u.test(context)) return "캠페인 제작·운영의 한 구간부터 효과를 비교할 후보입니다.";
  if (/human resource|hrtech|인사|채용|조직/u.test(context)) return "내부 담당자가 반복하는 절차부터 적용 범위를 좁혀 검토하기 좋습니다.";
  if (/manufactur|factory|제조|공장|생산|설비/u.test(context)) return "현장 한 공정의 기준선과 개선 효과를 비교하는 실증부터 논의하기 좋습니다.";
  if (/document|문서|계약|ocr|지식/u.test(context)) return "대표 문서 유형 하나로 정확도와 처리 시간을 먼저 검증하기 좋습니다.";
  if (/security|보안|위협|탐지|리스크/u.test(context)) return "제한된 환경에서 탐지 기준과 대응 절차를 함께 검증할 후보입니다.";
  if (/saas|api|연동|platform|플랫폼/u.test(context)) return "기존 시스템의 한 업무 흐름에 붙이는 소규모 실증부터 검토하기 좋습니다.";
  if (/agent|에이전트|자동화|workflow|워크플로/u.test(context)) return "반복 작업 한 단계부터 맡겨 결과 품질과 운영 부담을 비교하기 좋습니다.";
  return "현재 과제를 작은 실증으로 구체화할 때 먼저 대화해 볼 후보입니다.";
}

async function requestCollaborationFitReasons() {
  const companies = (Array.isArray(hub?.metrics?.collaborationFitCompanies)
    ? hub.metrics.collaborationFitCompanies
    : [])
    .filter((company) => company?.id && company?.name && Number.isFinite(Number(company.score)));
  if (!authSession?.access_token || !companies.length) return;
  const viewerKey = String(hub?.viewer?.id || hub?.viewer?.role || "viewer");
  const key = `${viewerKey}|${companies.map((company) => `${company.id}:${Math.round(Number(company.score))}`).join("|")}`;
  if (collaborationFitReasonPending || collaborationFitReasonRequestKey === key) return;

  collaborationFitReasonRequestKey = key;
  collaborationFitReasonPending = true;
  const requestId = ++collaborationFitReasonRequestId;
  renderCollaborationFitTooltip(hub.metrics || {});
  try {
    const response = await fetch("/api/collaboration-fit-reasons", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ ids: companies.map((company) => company.id) })
    });
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(payload?.error || "협업 선정 이유를 정리하지 못했습니다.");
    if (requestId !== collaborationFitReasonRequestId || key !== collaborationFitReasonRequestKey) return;
    collaborationFitReasonsById = new Map((payload?.reasons?.items || [])
      .map((item) => [String(item?.id || ""), String(item?.reason || "").trim()])
      .filter(([id, reason]) => id && reason));
  } catch {
    if (requestId === collaborationFitReasonRequestId) collaborationFitReasonRequestKey = "";
  } finally {
    if (requestId === collaborationFitReasonRequestId) {
      collaborationFitReasonPending = false;
      renderCollaborationFitTooltip(hub?.metrics || {});
    }
  }
}

function resetCollaborationFitReasonState() {
  collaborationFitReasonRequestId += 1;
  collaborationFitReasonRequestKey = "";
  collaborationFitReasonPending = false;
  collaborationFitReasonsById = new Map();
}

function collaborationFitReason(company = {}) {
  const fitReason = String(company.fitReason || "").trim();
  if (fitReason) return fitReason.slice(0, 120);
  const evidence = (Array.isArray(company.evidence) ? company.evidence : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const labels = new Map([
    ["프로필에 명시된 역량", "중심"],
    ["일치하는 프로필 용어", "키워드"],
    ["카테고리", "분야"],
    ["기업 단계", "단계"],
    ["지역", "지역"],
    ["프로필에 명시된 성과", "성과 프로필"]
  ]);
  const details = evidence.map((item) => {
    const separator = item.indexOf(":");
    const label = separator >= 0 ? item.slice(0, separator).trim() : "";
    const value = separator >= 0 ? item.slice(separator + 1).trim() : item;
    return value ? `${value} ${labels.get(label) || "근거"}` : "";
  }).filter(Boolean);
  return details.slice(0, 2).join(" · ").slice(0, 120) || "공개 프로필에서 협업 근거 확인";
}

function renderWeeklyNotice() {
  if (!els.weeklyNotice || !els.noticeUpdated) return;
  const notice = latestArenaAnnouncement;
  if (!notice) {
    els.weeklyNotice.innerHTML = `<div><h3>SparkLabs의 최신 AI Arena 공지를 기다리고 있습니다.</h3><p>새 공지가 등록되면 Community와 이 영역에 동시에 표시됩니다.</p></div><button class="text-link" data-go-page="community" type="button">Community 보기 →</button>`;
    els.noticeUpdated.textContent = "COMMUNITY NOTICE";
    els.weeklyNotice.querySelector("[data-go-page]")?.addEventListener("click", () => showPage("community"));
    return;
  }
  els.weeklyNotice.innerHTML = `
    <div class="overview-notice-copy">
      <span>SPARKLABS OFFICIAL</span>
      <h3>${escapeHtml(notice.title || "AI Arena 공지")}</h3>
      <p>${escapeHtml(announcementExcerpt(notice.bodyMarkdown))}</p>
    </div>
    <button class="text-link" data-announcement-id="${escapeHtml(notice.id)}" type="button">Community에서 공지 보기 →</button>
  `;
  els.weeklyNotice.querySelector("[data-announcement-id]")?.addEventListener("click", openLatestArenaAnnouncement);
  els.noticeUpdated.textContent = notice.updatedAt || notice.createdAt ? formatDate(notice.updatedAt || notice.createdAt) : "LATEST";
}

async function loadLatestArenaAnnouncement() {
  if (!authSession?.access_token) return;
  const requestId = ++arenaAnnouncementRequestId;
  try {
    const response = await fetch("/api/arena-announcements", {
      cache: "no-store",
      headers: { Accept: "application/json", ...authHeaders() }
    });
    const payload = await safeJson(response);
    if (!response.ok || requestId !== arenaAnnouncementRequestId) return;
    latestArenaAnnouncement = Array.isArray(payload?.announcements) ? payload.announcements[0] || null : null;
    renderWeeklyNotice();
  } catch {
    // The top notice keeps its calm fallback when Community is temporarily unavailable.
  }
}

function announcementExcerpt(value) {
  const text = String(value || "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/gu, "$1")
    .replace(/[`*_>#~-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return text.length > 210 ? `${text.slice(0, 209).trimEnd()}…` : text || "공지 내용을 Community에서 확인해 주세요.";
}

function openLatestArenaAnnouncement(event) {
  const id = event.currentTarget.dataset.announcementId || "";
  showPage("community");
  window.requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent("spark-arena:restore-history-overlay", { detail: { type: "community-thread", id } }));
  });
}

function renderSectorChart() {
  const tasks = taskMapEntries(hub.teams || [], 12);
  const max = Math.max(1, ...tasks.map((task) => Number(task.count || 0)));
  els.sectorChart.innerHTML = tasks.length
    ? tasks
        .map(
          (task, index) => {
            const companies = task.companies || [];
            const nameId = `task-name-${index}`;
            const countId = `task-count-${index}`;
            const companyChips = companies.map((name) => `<span class="sector-company-chip" role="listitem">${escapeHtml(name)}</span>`).join("");
            const duration = Math.min(34, Math.max(14, companies.length * 1.35));
            return `
            <div class="sector-row" tabindex="0" role="group" aria-labelledby="${nameId}" aria-describedby="${countId}">
              <div class="sector-row-summary">
                <span id="${nameId}" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</span>
                <div class="sector-track"><i style="width:${Math.max(4, (task.count / max) * 100)}%"></i></div>
                <strong id="${countId}">${formatNumber(task.count)}</strong>
              </div>
              <div class="sector-flywheel" aria-label="${escapeHtml(task.name)} Task를 해결하는 기업 목록">
                <div class="sector-flywheel-track" style="--sector-flywheel-duration:${duration}s">
                  <div class="sector-flywheel-set" role="list">${companyChips || `<span class="sector-company-chip is-empty" role="listitem">기업 프로필 준비 중</span>`}</div>
                  <div class="sector-flywheel-set" aria-hidden="true">${companyChips || `<span class="sector-company-chip is-empty">기업 프로필 준비 중</span>`}</div>
                </div>
              </div>
            </div>
          `;
          }
        )
        .join("")
    : `<p class="empty-copy">공개 프로필에서 확인된 해결 Task가 없습니다.</p>`;
}

function renderOverviewEvents() {
  const weeklyEntries = weeklyFeaturedTeams(hub.teams || [], hub.featuredCompanies || []);
  const weeklyTeamIds = new Set(weeklyEntries.map(({ team }) => String(team.id || "")));
  const fallbackEntries = curatedFeaturedTeams(hub.teams || [], 4)
    .filter(({ team }) => !weeklyTeamIds.has(String(team.id || "")));
  const featuredEntries = prioritizeFeaturedSpotlightEntries([...weeklyEntries, ...fallbackEntries]).slice(0, 4);
  featuredSpotlightEntries = featuredEntries.map(({ team, curation }) => ({
    team,
    curation,
    hook: curation.hook,
    keywords: [...curation.appealKeywords]
  }));
  if (els.featuredSpotlight) els.featuredSpotlight.hidden = !featuredSpotlightEntries.length;
  renderFeaturedSpotlightCluster();
  refineFeaturedSpotlight(featuredEntries.filter(({ curation }) => curation.sourceType !== "weekly_program_update"));
}

function prioritizeFeaturedSpotlightEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter(({ team }) => team?.id)
    .sort((left, right) => {
      const sourcePriority = Number(right.curation?.sourceType === "weekly_program_update") - Number(left.curation?.sourceType === "weekly_program_update");
      if (sourcePriority) return sourcePriority;
      const recency = Date.parse(right.curation?.verifiedAt || 0) - Date.parse(left.curation?.verifiedAt || 0);
      if (Number.isFinite(recency) && recency) return recency;
      return Number(left.curation?.rank || 99) - Number(right.curation?.rank || 99);
    });
}

function weeklyFeaturedTeams(teams = [], featured = []) {
  const teamsById = new Map((Array.isArray(teams) ? teams : []).map((team) => [String(team.id || ""), team]));
  return (Array.isArray(featured) ? featured : [])
    .map((item) => {
      const team = teamsById.get(String(item.teamId || ""));
      if (!team) return null;
      const editorialMedia = featuredCurationForTeam(team);
      return {
        team,
        curation: {
          id: `weekly-${String(item.teamId || "")}`,
          displayName: item.companyName || team.name || team.companyName,
          rank: Number(item.rank) || 99,
          achievement: item.achievement || "최근 주간 실행 업데이트를 완료했습니다.",
          hook: item.hook || "최근 실행 성과를 바탕으로 선정",
          appealKeywords: Array.isArray(item.keywords) && item.keywords.length ? item.keywords.slice(0, 3) : ["주간 실행"],
          sourceLabel: "SparkClaw weekly update",
          verifiedAt: hub.featuredCompaniesCycle?.sourceUpdatedAt || hub.featuredCompaniesCycle?.publishedAt || "",
          sourceType: "weekly_program_update",
          spotlightImage: editorialMedia?.spotlightImage || "",
          spotlightImagePosition: editorialMedia?.spotlightImagePosition || "center"
        }
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.curation.rank - right.curation.rank)
    .slice(0, 4);
}

function weeklyFeaturedUpdatedLabel() {
  const cycle = hub.featuredCompaniesCycle;
  if (!cycle?.publishedAt) return featuredCurationUpdatedLabel().replace("SPARKLABS OPERATIONS · ", "");
  const date = String(cycle.sourceUpdatedAt || cycle.publishedAt).slice(0, 10).replaceAll("-", ".");
  return `WEEKLY UPDATE ${date} · MON 09:00 KST`;
}

function renderFeaturedSpotlightCluster({ refined = false } = {}) {
  if (!els.overviewEvents) return;
  const entries = featuredSpotlightEntries.slice(0, 4);
  if (!entries.length) {
    stopFeaturedSpotlightRotation();
    els.overviewEvents.innerHTML = `<p class="featured-spotlight-loading">최근 공개 실적을 확인하고 있습니다.</p>`;
    return;
  }
  featuredSpotlightActiveIndex = Math.min(featuredSpotlightActiveIndex, entries.length - 1);
  const slides = entries.map((item, index) => {
      const { team: company, curation } = item;
      const keywords = (Array.isArray(item.keywords) ? item.keywords : curation.appealKeywords)
        .slice(0, 3)
        .map((keyword) => `<span>${escapeHtml(keyword)}</span>`)
        .join("");
      const displayName = curation.displayName || company.name || company.companyName || "AI Company";
      const achievement = String(curation.achievement || item.hook || curation.hook || "최근 실행 성과를 확인했습니다.").trim();
      const visual = featuredSpotlightVisualMarkup(company, displayName, curation);
      const slideTitleId = `featuredSpotlightTitle${index}`;
      const backgroundStyle = curation.spotlightImage
        ? ` style="--featured-photo:url('${escapeHtml(curation.spotlightImage)}');--featured-photo-position:${escapeHtml(curation.spotlightImagePosition || "center")}"`
        : "";
      return `<article class="featured-spotlight-slide${curation.spotlightImage ? " has-product-image" : ""}${refined ? " is-refined" : ""}" data-featured-slide="${index}" data-featured-team-id="${escapeHtml(company.id)}" role="button" tabindex="0" aria-labelledby="${slideTitleId}"${backgroundStyle} ${index === featuredSpotlightActiveIndex ? "" : "hidden"}>
        <div class="featured-spotlight-content">
          <div class="featured-spotlight-slide-meta"><span>RECENT MILESTONE</span><i>${escapeHtml(primarySector(company.sector) || "AI")}</i></div>
          <h3 id="${slideTitleId}">${escapeHtml(displayName)}</h3>
          <p>${escapeHtml(achievement)}</p>
          <div class="featured-spotlight-keywords">${keywords}</div>
          <span class="featured-spotlight-profile" aria-hidden="true">기업 프로필 보기 →</span>
        </div>
        ${visual}
      </article>`;
    }).join("");
  const navigation = entries.map((item, index) => `<button type="button" data-spotlight-nav="${index}" aria-label="${escapeHtml(item.curation.displayName || item.team.name || `추천 ${index + 1}`)} 보기" aria-current="${index === featuredSpotlightActiveIndex ? "true" : "false"}"><span></span></button>`).join("");
  els.overviewEvents.innerHTML = `<div class="featured-spotlight-stage">${slides}</div><div class="featured-spotlight-navigation"><button type="button" data-spotlight-direction="-1" aria-label="이전 선정 기업">←</button><div>${navigation}</div><span><b data-spotlight-current>${featuredSpotlightActiveIndex + 1}</b> / ${entries.length}</span><button type="button" data-spotlight-direction="1" aria-label="다음 선정 기업">→</button></div><div class="featured-spotlight-progress" aria-hidden="true"><i></i></div>`;
  els.overviewEvents.querySelectorAll("[data-featured-team-id]").forEach((slide) => {
    const openFeaturedTeam = () => {
      const teamId = slide.dataset.featuredTeamId;
      const team = (hub.teams || []).find((candidate) => String(candidate.id) === teamId)
        || featuredSpotlightEntries.find((item) => String(item.team?.id) === teamId)?.team;
      if (team) openTeamDialog(team);
    };
    slide.addEventListener("click", openFeaturedTeam);
    slide.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openFeaturedTeam();
    });
  });
  els.overviewEvents.querySelectorAll("[data-spotlight-nav]").forEach((button) => button.addEventListener("click", () => {
    setFeaturedSpotlightActive(Number(button.dataset.spotlightNav || 0));
  }));
  els.overviewEvents.querySelectorAll("[data-spotlight-direction]").forEach((button) => button.addEventListener("click", () => {
    setFeaturedSpotlightActive(featuredSpotlightActiveIndex + Number(button.dataset.spotlightDirection || 0));
  }));
  els.overviewEvents.removeEventListener("wheel", handleFeaturedSpotlightWheel);
  els.overviewEvents.addEventListener("wheel", handleFeaturedSpotlightWheel, { passive: false });
  setFeaturedSpotlightActive(featuredSpotlightActiveIndex);
  startFeaturedSpotlightRotation();
}

function handleFeaturedSpotlightWheel(event) {
  if (event.ctrlKey || event.metaKey) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (Math.abs(delta) < 8) return;
  event.preventDefault();
  const now = Date.now();
  if (now < featuredSpotlightWheelLockUntil) return;
  featuredSpotlightWheelLockUntil = now + 360;
  setFeaturedSpotlightActive(featuredSpotlightActiveIndex + (delta > 0 ? 1 : -1));
  startFeaturedSpotlightRotation();
}

function featuredSpotlightVisualMarkup(company, displayName, curation = {}) {
  if (curation.spotlightImage) {
    return `<div class="featured-spotlight-visual is-product" aria-hidden="true"><img src="${escapeHtml(curation.spotlightImage)}" alt="" loading="eager" decoding="async"></div>`;
  }
  const logo = companyLogoAsset(company);
  if (logo) {
    return `<div class="featured-spotlight-visual is-${escapeHtml(logo.tone)}" aria-hidden="true"><span><img src="${escapeHtml(logo.src)}" alt="" loading="eager" decoding="async"></span></div>`;
  }
  return `<div class="featured-spotlight-visual is-fallback" aria-hidden="true"><span>${companyIconMarkup(company)}</span><b>${escapeHtml(displayName)}</b></div>`;
}

function setFeaturedSpotlightActive(index) {
  const slides = [...(els.overviewEvents?.querySelectorAll("[data-featured-slide]") || [])];
  if (!slides.length) return;
  featuredSpotlightActiveIndex = ((Number(index) || 0) % slides.length + slides.length) % slides.length;
  slides.forEach((slide, slideIndex) => { slide.hidden = slideIndex !== featuredSpotlightActiveIndex; });
  els.overviewEvents?.querySelectorAll("[data-spotlight-nav]").forEach((button) => button.setAttribute("aria-current", Number(button.dataset.spotlightNav) === featuredSpotlightActiveIndex ? "true" : "false"));
  const current = els.overviewEvents?.querySelector("[data-spotlight-current]");
  if (current) current.textContent = String(featuredSpotlightActiveIndex + 1);
  const progress = els.overviewEvents?.querySelector(".featured-spotlight-progress i");
  if (progress) { progress.classList.remove("is-running"); window.requestAnimationFrame(() => progress.classList.add("is-running")); }
}

function startFeaturedSpotlightRotation() {
  stopFeaturedSpotlightRotation();
  const slides = [...(els.overviewEvents?.querySelectorAll("[data-featured-slide]") || [])];
  if (!slides.length) return;
  setFeaturedSpotlightActive(featuredSpotlightActiveIndex);
  if (slides.length < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  featuredSpotlightRotationTimer = window.setInterval(() => {
    setFeaturedSpotlightActive(featuredSpotlightActiveIndex + 1);
  }, 3800);
}

function stopFeaturedSpotlightRotation() {
  window.clearInterval(featuredSpotlightRotationTimer);
  featuredSpotlightRotationTimer = 0;
}

async function refineFeaturedSpotlight(entries) {
  if (!authSession?.access_token || !Array.isArray(entries) || !entries.length) return;
  const ids = entries.map(({ curation }) => curation.id);
  const key = ids.join("|");
  if (key === featuredSpotlightRequestKey) return;
  featuredSpotlightRequestKey = key;
  const requestId = ++featuredSpotlightRequestId;
  try {
    const response = await fetch("/api/featured-keywords", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ ids })
    });
    const payload = await safeJson(response);
    if (!response.ok || requestId !== featuredSpotlightRequestId || featuredSpotlightRequestKey !== key) return;
    const refinedById = new Map((payload?.spotlight?.items || []).map((item) => [String(item?.id || ""), item]));
    featuredSpotlightEntries = featuredSpotlightEntries.map((item) => {
      const refinedItem = refinedById.get(item.curation.id);
      return refinedItem
        ? { ...item, hook: refinedItem.hook || item.hook, keywords: refinedItem.keywords || item.keywords }
        : item;
    });
    renderFeaturedSpotlightCluster({ refined: payload?.spotlight?.source === "spark_ai" });
  } catch {
    // Verified editorial keywords are already visible as the safe fallback.
  }
}

function featuredCompanySummary(team) {
  const summary = String(team.oneLiner || team.aiIdeaSummary || team.serviceSummary || "").replace(/\s+/g, " ").trim();
  return summary.length > 170 ? `${summary.slice(0, 169).trimEnd()}…` : summary;
}

function featuredCompanyMonogram(team) {
  const name = String(team.name || team.companyName || "AI")
    .replace(/^\s*\(?주\)?\s*/i, "")
    .replace(/\s+/g, "")
    .trim();
  return (name || "AI").slice(0, 2).toUpperCase();
}

function renderHeroLiveNetwork(partnerProfile) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type)?.value || "--";
  if (els.heroLiveTime) {
    els.heroLiveTime.textContent = `${part("month")}.${part("day")} ${part("hour")}:${part("minute")} KST 조회`;
    els.heroLiveTime.setAttribute("datetime", now.toISOString());
  }

  const sectorNames = (hub.sectors || [])
    .map((sector) => String(sector?.name || "").trim())
    .filter(Boolean);
  const organizationName = partnerOrganizationName(partnerProfile);
  const labels = [
    sectorNames[0] || "AI Agents",
    sectorNames[1] || "Data Intelligence",
    "근거 검증",
    organizationName ? `${organizationName} 맞춤 탐색` : "Founder Commons"
  ];
  els.heroCloudTags.forEach((tag, index) => {
    tag.textContent = labels[index] || "AI Arena";
  });
}

function eventRowMarkup(event) {
  const date = dateParts(event.date);
  const past = isPastDate(event.date);
  return `
    <article class="event-row">
      <div class="event-date-box">
        <strong>${escapeHtml(date.day)}</strong>
        <span>${escapeHtml(date.month)}</span>
      </div>
      <div>
        <h3>${escapeHtml(event.title || "제목 없는 일정")}</h3>
        <p>${escapeHtml([event.kind || event.category, event.location, event.time].filter(Boolean).join(" · ") || "세부 정보 미입력")}</p>
      </div>
      <span class="event-status ${past ? "is-past" : ""}">${past ? "지난 일정" : "예정"}</span>
    </article>
  `;
}

function renderOverviewBenefits() {
  const benefits = (hub.benefits || [])
    .filter((benefit) => benefit.isActive !== false && isBenefitReadyForDisplay(benefit))
    .slice(0, 5);
  els.overviewBenefits.innerHTML = benefits.length
    ? benefits
        .map(
          (benefit) => `
            <article class="benefit-mini">
              <div class="benefit-provider">
                ${benefitLogoMarkup(benefit)}
                <strong>${escapeHtml(benefit.provider || benefit.title)}</strong>
              </div>
              <small>${escapeHtml(summarizeBenefit(benefit))}</small>
            </article>
          `
        )
        .join("")
    : `<p class="empty-copy">현재 활성화된 혜택이 없습니다.</p>`;
}

function renderArena() {
  if (!arenaData) return;
  const metrics = arenaData.metrics || {};
  const bountyReleased = arenaData.releaseState === "open";
  const memberPreparing = isClawMemberViewer() && !bountyReleased;
  els.arenaPage?.classList.toggle("is-member-preparing", memberPreparing);
  if (els.bountyPreparingNotice) els.bountyPreparingNotice.hidden = !memberPreparing;
  els.arenaPage?.querySelectorAll(":scope > section").forEach((section) => {
    section.inert = memberPreparing;
  });
  els.arenaMetricOpen.textContent = formatNumber(metrics.openChallenges);
  els.arenaMetricSubmissions.textContent = formatNumber(metrics.validatedSubmissions);
  els.arenaMetricQueue.textContent = formatNumber(metrics.validationQueue);
  els.arenaMetricPilots.textContent = formatNumber(metrics.activePilots);
  if (els.arenaReleaseBadge) {
    els.arenaReleaseBadge.classList.toggle("is-preparing", !bountyReleased);
    els.arenaReleaseBadge.innerHTML = `<i></i> ${bountyReleased ? "BOUNTY BOARD LIVE" : "BOUNTY 준비 중"}`;
  }
  renderBountyRolePaths();
  renderArenaBounties();
  renderArenaMyStatus();
  renderArenaOpportunities();
  renderArenaStaff();
  if (selectedArenaChallengeId) renderArenaDetail(selectedArenaChallengeId);
}

function renderBountyRolePaths() {
  if (!els.bountyRolePaths) return;
  const role = String(hub?.viewer?.role || "").toLowerCase();
  const staff = Boolean(hub?.viewer?.canScore) || ["sparklabs", "admin"].includes(role);
  const sponsor = role === "b2b_partner";
  const validator = role === "human_validator";
  const audience = staff || validator ? "operator" : sponsor ? "sponsor" : "builder";
  const organizationName = String(hub?.viewer?.organization || "").trim();
  const released = arenaData?.releaseState === "open";
  els.bountyRolePaths.querySelectorAll("[data-bounty-audience]").forEach((card) => {
    const current = card.dataset.bountyAudience === audience;
    card.classList.toggle("is-current", current);
    if (current) card.setAttribute("aria-current", "step");
    else card.removeAttribute("aria-current");
  });
  els.bountyRolePaths.querySelectorAll("[data-bounty-partner-action]").forEach((button) => {
    button.hidden = !(sponsor || staff);
  });
  els.bountyRolePaths.querySelectorAll("[data-bounty-staff-action]").forEach((button) => {
    button.hidden = !staff;
  });
  els.bountyRolePaths.querySelectorAll("[data-bounty-builder-action]").forEach((button) => {
    button.disabled = !released;
    button.textContent = released ? "Open Bounty 보기 →" : "실과제 공개 준비 중";
  });
  els.bountyRolePaths.querySelectorAll("[data-bounty-builder-copy]").forEach((copy) => {
    copy.textContent = released
      ? "평가 기준과 데이터 정책을 확인하고 결과를 제출한 뒤, 공개·비공개 검증과 전문가 피드백을 받습니다."
      : "실제 기업 과제, 평가 기준과 데이터 정책을 확정하고 있습니다. 공개 전에는 참가 신청이나 결과 제출을 받지 않습니다.";
  });
  if (els.bountyRoleBadge) {
    els.bountyRoleBadge.textContent = staff
      ? "SPARKLABS OPERATIONS"
      : validator
        ? "HUMAN VALIDATOR"
        : sponsor
          ? `${organizationName || "INDUSTRY PARTNER"} · SPONSOR`
          : "SPARKCLAW TEAM · SOLVER";
  }
  if (els.bountyRoleSummary) {
    els.bountyRoleSummary.textContent = staff
      ? "기업 Brief의 설계 상태, 제출·검증 큐와 Pilot 전환을 한 흐름에서 관리합니다."
      : validator
        ? "배정된 제출물의 근거와 재현성을 검토하고, 운영진의 최종 검증 판단을 지원합니다."
        : sponsor
          ? "기업 문제를 먼저 구조화하고, 공개 과제와 검증 결과를 확인한 뒤 Pilot 단계까지 추적합니다."
          : released
            ? "접수 중인 과제의 평가 기준을 확인하고 결과를 제출한 뒤 검증·피드백·기회 전환을 추적합니다."
            : "현재 Bounty는 실제 기업 과제 확정 전 준비 단계입니다. 공개되면 평가 기준과 데이터 정책을 먼저 확인할 수 있습니다.";
  }
}

function renderArenaBounties() {
  if (!arenaData) return;
  if (arenaData.releaseState !== "open" && !hub?.viewer?.canScore) {
    els.arenaBountyGrid.innerHTML = `
      <div class="arena-empty-card bounty-release-gate">
        <span class="section-kicker">RELEASE GATE</span>
        <h3>실제 기업 Bounty를 준비하고 있습니다.</h3>
        <p>문제 책임자, 성공 기준, 데이터·보안 정책과 후속 Pilot 조건이 확정된 과제만 공개합니다.</p>
        <small>기업 파트너의 Brief 접수와 SparkLabs 운영 검토는 계속 진행됩니다.</small>
      </div>`;
    if (els.arenaBountyDetail) els.arenaBountyDetail.hidden = true;
    selectedArenaChallengeId = "";
    return;
  }
  const challenges = (arenaData.challenges || []).filter(
    (challenge) => arenaBountyFilter === "all" || challenge.status === arenaBountyFilter
  );
  els.arenaBountyGrid.innerHTML = challenges.length
    ? challenges.map(arenaBountyCardMarkup).join("")
    : `<div class="arena-empty-card">선택한 상태의 Bounty가 없습니다.</div>`;
}

function arenaBountyCardMarkup(challenge) {
  const leaderboard = arenaLeaderboardFor(challenge.id);
  const stateClass = challenge.status === "open" ? "" : `is-${escapeHtml(challenge.status)}`;
  const deadline = challenge.endsAt ? `마감 ${formatDate(challenge.endsAt)}` : "일정 확정 전";
  return `
    <article class="bounty-card ${challenge.status === "draft" ? "is-draft" : ""}">
      <div class="bounty-card-top">
        <span class="bounty-state ${stateClass}">${escapeHtml(arenaChallengeStatus(challenge.status))}</span>
        <span class="bounty-sponsor">${escapeHtml(challenge.sponsor || "SparkClaw Program")}</span>
      </div>
      <h3>${escapeHtml(challenge.title)}</h3>
      <p>${escapeHtml(challenge.shortDescription || "Bounty 설명을 준비하고 있습니다.")}</p>
      <div class="bounty-meta">
        <span>${escapeHtml(challenge.metricDisplayName || "Expert review")}</span>
        <span>${escapeHtml(arenaEvaluationMode(challenge.evaluationMode))}</span>
        <span>${formatNumber(leaderboard?.submissionCount || 0)} submissions</span>
      </div>
      <div class="bounty-opportunity">
        <strong>OPPORTUNITY</strong>
        ${escapeHtml(challenge.opportunity || challenge.prize || "평가 결과에 따라 다음 기회를 연결합니다.")}
      </div>
      <div class="bounty-card-footer">
        <span>${escapeHtml(deadline)}</span>
        <button class="bounty-open-button" data-open-bounty="${escapeHtml(challenge.id)}" type="button">Bounty 열기 →</button>
      </div>
    </article>
  `;
}

function handleArenaBountyClick(event) {
  const button = event.target.closest("[data-open-bounty]");
  if (!button) return;
  selectedArenaChallengeId = button.dataset.openBounty;
  renderArenaDetail(selectedArenaChallengeId);
  els.arenaBountyDetail.hidden = false;
  els.arenaBountyDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderArenaDetail(challengeId) {
  const challenge = arenaChallengeFor(challengeId);
  if (!challenge) {
    els.arenaBountyDetail.hidden = true;
    return;
  }
  selectedArenaChallengeId = challenge.id;
  els.arenaBountyDetail.hidden = false;
  els.arenaDetailHero.innerHTML = `
    <span class="bounty-state ${challenge.status === "open" ? "" : `is-${escapeHtml(challenge.status)}`}">${escapeHtml(arenaChallengeStatus(challenge.status))}</span>
    <h2>${escapeHtml(challenge.title)}</h2>
    <p>${escapeHtml(challenge.shortDescription || "")}</p>
  `;
  renderArenaOverviewPanel(challenge);
  renderArenaSubmitPanel(challenge);
  renderArenaLeaderboardPanel(challenge);
}

function renderArenaOverviewPanel(challenge) {
  const criteria = challenge.evaluationCriteria || [];
  const targets = challenge.targetTeams || [];
  els.arenaOverviewContent.innerHTML = `
    <div class="arena-overview-grid">
      <div class="arena-copy-block">
        <section>
          <h3>문제와 목표</h3>
          <p>${escapeHtml(challenge.longDescription || challenge.shortDescription || "상세 설명을 준비하고 있습니다.")}</p>
        </section>
        <section>
          <h3>평가 기준</h3>
          ${
            criteria.length
              ? `<ul>${criteria.map((criterion) => `<li>${escapeHtml(criterion)}</li>`).join("")}</ul>`
              : `<p>평가 기준을 확정하고 있습니다.</p>`
          }
        </section>
        <section>
          <h3>데이터와 보안</h3>
          <p>${escapeHtml(challenge.dataPolicy || "제출물은 평가 목적으로만 사용되며 비공개 점수와 정답 데이터는 서버에서 보호됩니다.")}</p>
        </section>
        <section>
          <h3>Rules</h3>
          <p>${escapeHtml(challenge.rules || "세부 참가 규칙을 준비하고 있습니다.")}</p>
        </section>
      </div>
      <aside class="arena-fact-stack">
        <article><span>SPONSOR</span><strong>${escapeHtml(challenge.sponsor || "SparkClaw Program")}</strong></article>
        <article><span>REWARD</span><strong>${escapeHtml(challenge.prize || "확정 전")}</strong></article>
        <article><span>METRIC</span><strong>${escapeHtml(challenge.metricDisplayName || "Expert review")}</strong></article>
        <article><span>DATASET</span><strong>${challenge.expectedRowCount ? `${formatNumber(challenge.expectedRowCount)} cases · Public ${formatNumber(challenge.publicSplitPercentage || 0)}% / Private ${formatNumber(100 - Number(challenge.publicSplitPercentage || 0))}%` : "파트너 검토 후 공개"}</strong></article>
        <article><span>PILOT SLOTS</span><strong>${challenge.pilotSlots ? `${formatNumber(challenge.pilotSlots)} teams` : "확정 전"}</strong></article>
        <article><span>TARGET TEAMS</span><strong>${escapeHtml(targets.join(" · ") || "모든 프로그램 팀")}</strong></article>
        <article><span>DEADLINE</span><strong>${challenge.endsAt ? escapeHtml(formatDate(challenge.endsAt)) : "일정 확정 전"}</strong></article>
      </aside>
    </div>
  `;
}

function renderArenaSubmitPanel(challenge) {
  const open = challenge.status === "open";
  const submissions = arenaSubmissionsForChallenge(challenge.id);
  const scored = submissions.filter((submission) => ["scored", "selected_for_private"].includes(submission.status));
  const teamName = defaultArenaTeamName();
  const linkedTeam = Boolean(hub.viewerTeam);
  const csvChallenge = challenge.challengeType === "csv_prediction";
  const existingRequestSubmissionIds = new Set((arenaData.opportunities || []).map((item) => item.submissionId));
  const opportunityCandidates = scored.filter((submission) => !existingRequestSubmissionIds.has(submission.id));

  els.arenaSubmitContent.innerHTML = `
    ${
      open
        ? `
          <div class="arena-submit-layout">
            <form class="arena-submit-form" data-arena-submission-form data-challenge-id="${escapeHtml(challenge.id)}">
              <h3>${csvChallenge ? "검증 파일 제출" : "제품·Agent 제출"}</h3>
              <div class="field-row">
                <label>
                  <span>참가 팀</span>
                  <input name="teamName" value="${escapeHtml(teamName)}" maxlength="120" required ${linkedTeam ? "readonly" : ""}>
                </label>
                <label>
                  <span>조직</span>
                  <input name="organization" value="${escapeHtml(hub.viewerTeam?.companyName || hub.viewer?.organization || "")}" maxlength="160">
                </label>
              </div>
              ${
                csvChallenge
                  ? `
                    <label>
                      <span>CSV 결과</span>
                      <textarea name="csvText" spellcheck="false" required>${escapeHtml(challenge.sampleSubmissionCsv || "")}</textarea>
                    </label>
                  `
                  : `
                    <label>
                      <span>제품 또는 데모 URL</span>
                      <input name="modelUrl" type="url" placeholder="https://" required>
                    </label>
                    <label>
                      <span>제출 메모</span>
                      <textarea name="submissionNote" rows="5" placeholder="해결 방식, 현재 검증 수준, 재현 방법을 적어주세요."></textarea>
                    </label>
                  `
              }
              <button class="primary-button compact" type="submit">${csvChallenge ? "검증하고 제출" : "전문가 검토 요청"}</button>
              <p class="form-status" data-arena-submit-status aria-live="polite"></p>
            </form>
            <aside class="arena-submit-help">
              <article><strong>평가 방식</strong><span>${escapeHtml(arenaEvaluationMode(challenge.evaluationMode))} · ${escapeHtml(challenge.metricDisplayName || "Expert review")}</span></article>
              <article><strong>제출 제한</strong><span>하루 ${formatNumber(challenge.submissionLimitPerDay || 0)}회 · 비공개 정답은 서버에서만 사용</span></article>
              ${
                csvChallenge
                  ? `<pre class="sample-code">${escapeHtml(challenge.sampleSubmissionCsv || "Sample 준비 중")}</pre>
                     <div class="arena-download-actions">
                       ${challenge.evaluationDatasetCsv ? `<button class="primary-button compact" data-download-dataset="${escapeHtml(challenge.id)}" type="button">평가 데이터 다운로드</button>` : ""}
                       <button class="secondary-button compact" data-download-sample="${escapeHtml(challenge.id)}" type="button">제출 템플릿 다운로드</button>
                       <button class="secondary-button compact" data-copy-sample="${escapeHtml(challenge.id)}" type="button">템플릿 복사</button>
                     </div>`
                  : `<article><strong>Human validation</strong><span>제출 후 SparkLabs 운영진이 재현 방법과 제품 완성도를 검토합니다.</span></article>`
              }
            </aside>
          </div>
        `
        : `<div class="arena-empty-card">이 Bounty는 아직 준비 중입니다. 평가 데이터와 파트너 조건이 확정되면 제출이 열립니다.</div>`
    }
    <div class="arena-leaderboard-head" style="margin-top:24px">
      <h3>내 제출 기록</h3>
      <span class="subtle-chip">${formatNumber(submissions.length)} submissions</span>
    </div>
    ${arenaSubmissionHistoryMarkup(submissions)}
    ${
      opportunityCandidates.length
        ? `
          <form class="arena-opportunity-form" data-arena-opportunity-form>
            <h3>검증 결과를 다음 기회로 연결</h3>
            <label>
              <span>제출 결과</span>
              <select name="submissionId">
                ${opportunityCandidates
                  .map(
                    (submission) =>
                      `<option value="${escapeHtml(submission.id)}">${escapeHtml(challenge.title)} · ${formatArenaScore(submission.publicScore)}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <label>
              <span>요청할 기회</span>
              <select name="intent">
                <option value="poc_review">PoC 검토</option>
                <option value="pilot">파일럿 연결</option>
                <option value="investment_intro">투자자 소개</option>
                <option value="credits">크레딧·혜택</option>
                <option value="mentor_feedback">멘토 피드백</option>
              </select>
            </label>
            <label><span>요청 메모</span><textarea name="note" maxlength="1200" placeholder="현재 준비 상태와 원하는 다음 단계를 적어주세요."></textarea></label>
            <button class="primary-button compact" type="submit">Opportunity 요청</button>
            <p class="form-status" data-arena-opportunity-status aria-live="polite"></p>
          </form>
        `
        : ""
    }
  `;
}

function arenaSubmissionHistoryMarkup(submissions) {
  if (!submissions.length) return `<div class="arena-empty-card">아직 제출 기록이 없습니다.</div>`;
  const reportsBySubmission = new Map((arenaData.validationReports || []).map((report) => [report.submissionId, report]));
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>제출 시각</th><th>상태</th><th>Public score</th><th>검증</th></tr></thead>
        <tbody>
          ${submissions
            .map((submission) => {
              const report = reportsBySubmission.get(submission.id);
              return `
                <tr>
                  <td>${escapeHtml(formatDateTime(submission.submittedAt))}</td>
                  <td>${escapeHtml(arenaSubmissionStatus(submission.status))}</td>
                  <td class="arena-score">${formatArenaScore(submission.publicScore)}</td>
                  <td>${report ? (report.schemaValid ? "Schema valid" : "Needs changes") : escapeHtml(submission.errorMessagePublic || "검토 대기")}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderArenaLeaderboardPanel(challenge) {
  const leaderboard = arenaLeaderboardFor(challenge.id);
  const rows = leaderboard?.rows || [];
  const staff = Boolean(hub.viewer?.canScore);
  els.arenaLeaderboardContent.innerHTML = `
    <div class="arena-leaderboard-head">
      <div>
        <h3>${escapeHtml(challenge.metricDisplayName || "Leaderboard")}</h3>
        <span class="form-status">비공개 점수는 최종 공개 전까지 참가자에게 표시되지 않습니다.</span>
      </div>
      ${
        staff && challenge.status !== "private_revealed"
          ? `<button class="secondary-button compact" data-reveal-leaderboard="${escapeHtml(challenge.id)}" type="button">Private leaderboard 공개</button>`
          : ""
      }
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Rank</th><th>Team</th><th>Public score</th><th>Pairwise</th><th>Confidence</th><th>Status</th></tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (row) => `
                      <tr>
                        <td>#${formatNumber(row.rank)}</td>
                        <td>${escapeHtml(row.teamName || row.teamId)}</td>
                        <td class="arena-score">${formatArenaScore(row.publicScore)}</td>
                        <td>${formatNumber(row.btRating)}</td>
                        <td>${Math.round(Number(row.confidence || 0) * 100)}%</td>
                        <td>${escapeHtml(arenaSubmissionStatus(row.status))}</td>
                      </tr>
                    `
                  )
                  .join("")
              : `<tr><td colspan="6">아직 유효한 제출이 없습니다.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderArenaMyStatus() {
  const submissions = arenaData.submissions || [];
  const teams = arenaData.teams || [];
  const best = [...submissions]
    .filter((submission) => Number.isFinite(Number(submission.publicScore)))
    .sort((left, right) => Number(right.publicScore) - Number(left.publicScore))[0];
  els.arenaMyStatus.innerHTML = `
    <article class="arena-status-card">
      <strong>${escapeHtml(hub.viewerTeam?.name || teams[0]?.name || defaultArenaTeamName())}</strong>
      <span>${hub.viewerTeam ? "프로그램 DB 연결 팀" : "Arena 참가 팀은 첫 제출 시 생성됩니다."}</span>
      <small>${formatNumber(submissions.length)} submissions</small>
    </article>
    <article class="arena-status-card">
      <strong>${best ? formatArenaScore(best.publicScore) : "—"}</strong>
      <span>Best public score</span>
      <small>${best ? escapeHtml(arenaChallengeFor(best.challengeId)?.title || "") : "유효한 결과를 제출하면 표시됩니다."}</small>
    </article>
  `;
}

function renderArenaOpportunities() {
  const opportunities = arenaData.opportunities || [];
  els.arenaOpportunityList.innerHTML = opportunities.length
    ? opportunities
        .map((opportunity) => {
          const challenge = arenaChallengeFor(opportunity.challengeId);
          return `
            <article class="arena-opportunity-card">
              <strong>${escapeHtml(arenaOpportunityIntent(opportunity.intent))}</strong>
              <span>${escapeHtml(challenge?.title || "Arena opportunity")}</span>
              <small>${escapeHtml(arenaOpportunityStatus(opportunity.status))} · ${escapeHtml(formatDate(opportunity.updatedAt || opportunity.requestedAt))}</small>
              ${opportunity.publicNote ? `<span>${escapeHtml(opportunity.publicNote)}</span>` : ""}
            </article>
          `;
        })
        .join("")
    : `<div class="arena-empty-card">검증된 제출에서 PoC, 투자, 크레딧 또는 멘토 피드백을 요청할 수 있습니다.</div>`;
}

function renderArenaStaff() {
  const staff = Boolean(hub.viewer?.canScore);
  els.arenaStaffPanel.hidden = !staff;
  if (!staff) return;
  const queue = arenaData.validationQueue || [];
  els.arenaValidationQueue.innerHTML = queue.length
    ? queue
        .map((submission) => {
          const challenge = arenaChallengeFor(submission.challengeId);
          return `
            <article class="arena-staff-item">
              <strong>${escapeHtml(challenge?.title || submission.challengeId)}</strong>
              <span>${escapeHtml(submission.submitterEmail || submission.teamId)} · ${escapeHtml(arenaSubmissionStatus(submission.status))} · ${formatArenaScore(submission.publicScore)}</span>
              <div class="arena-staff-actions">
                <button data-review-submission="${escapeHtml(submission.id)}" data-review-status="approved" type="button">Approve</button>
                <button data-review-submission="${escapeHtml(submission.id)}" data-review-status="needs_changes" type="button">Needs changes</button>
                <button data-review-submission="${escapeHtml(submission.id)}" data-review-status="disqualified" type="button">Disqualify</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="arena-empty-card">검토 대기 제출이 없습니다.</div>`;

  const opportunities = arenaData.opportunities || [];
  els.arenaOpportunityQueue.innerHTML = opportunities.length
    ? opportunities
        .map(
          (opportunity) => `
            <article class="arena-staff-item">
              <strong>${escapeHtml(arenaOpportunityIntent(opportunity.intent))}</strong>
              <span>${escapeHtml(opportunity.requesterEmail || opportunity.teamId)} · ${escapeHtml(arenaOpportunityStatus(opportunity.status))}</span>
              <div class="arena-staff-actions">
                <button data-update-opportunity="${escapeHtml(opportunity.id)}" data-opportunity-status="reviewing" type="button">Reviewing</button>
                <button data-update-opportunity="${escapeHtml(opportunity.id)}" data-opportunity-status="matched" type="button">Matched</button>
                <button data-update-opportunity="${escapeHtml(opportunity.id)}" data-opportunity-status="pilot" type="button">Pilot</button>
                <button data-update-opportunity="${escapeHtml(opportunity.id)}" data-opportunity-status="closed" type="button">Close</button>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="arena-empty-card">기회 연결 요청이 없습니다.</div>`;
}

function handleArenaDetailTabClick(event) {
  const button = event.target.closest("[data-arena-tab]");
  if (!button) return;
  const tabName = button.dataset.arenaTab;
  els.arenaDetailTabs.querySelectorAll("[data-arena-tab]").forEach((item) => {
    item.classList.toggle("is-active", item === button);
  });
  document.querySelectorAll("[data-arena-tab-panel]").forEach((panel) => {
    const active = panel.dataset.arenaTabPanel === tabName;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
}

async function handleArenaSubmitPanel(event) {
  event.preventDefault();
  const form = event.target;
  if (form.matches("[data-arena-submission-form]")) {
    const challenge = arenaChallengeFor(form.dataset.challengeId);
    if (!challenge) return;
    const data = new FormData(form);
    const status = form.querySelector("[data-arena-submit-status]");
    setInlineStatus(status, "제출물을 검증하고 있습니다.");
    disableForm(form, true);
    try {
      const csvChallenge = challenge.challengeType === "csv_prediction";
      const payload = {
        challengeId: challenge.id,
        teamName: String(data.get("teamName") || ""),
        organization: String(data.get("organization") || ""),
        submissionType: csvChallenge ? "csv" : "product_profile",
        csvText: csvChallenge ? String(data.get("csvText") || "") : undefined,
        modelUrl: csvChallenge ? undefined : String(data.get("modelUrl") || ""),
        productId: csvChallenge ? undefined : `program-team-${hub.viewerTeam?.id || hub.viewer?.id || "member"}`
      };
      await postArenaAction("submitCompetitionEntry", payload);
      setInlineStatus(status, "제출이 완료되었습니다.", "success");
      showToast("Arena 제출과 1차 검증이 완료되었습니다.");
      renderArenaDetail(challenge.id);
      switchArenaDetailTab("submit");
    } catch (error) {
      setInlineStatus(status, error.message, "error");
    } finally {
      disableForm(form, false);
    }
    return;
  }

  if (form.matches("[data-arena-opportunity-form]")) {
    await submitArenaOpportunity(form);
  }
}

async function handleArenaOpportunitySubmit(event) {
  event.preventDefault();
  await submitArenaOpportunity(event.target);
}

async function submitArenaOpportunity(form) {
  const data = new FormData(form);
  const status = form.querySelector("[data-arena-opportunity-status]");
  setInlineStatus(status, "기회 연결 요청을 저장하고 있습니다.");
  disableForm(form, true);
  try {
    await postArenaAction("requestCompetitionOpportunity", {
      submissionId: String(data.get("submissionId") || ""),
      intent: String(data.get("intent") || "poc_review"),
      note: String(data.get("note") || "")
    });
    setInlineStatus(status, "요청이 운영진에게 전달되었습니다.", "success");
    showToast("Opportunity 요청을 저장했습니다.");
    if (selectedArenaChallengeId) {
      renderArenaDetail(selectedArenaChallengeId);
      switchArenaDetailTab("submit");
    }
  } catch (error) {
    setInlineStatus(status, error.message, "error");
  } finally {
    disableForm(form, false);
  }
}

async function handleArenaStaffQueueClick(event) {
  const reviewButton = event.target.closest("[data-review-submission]");
  const opportunityButton = event.target.closest("[data-update-opportunity]");
  if (!reviewButton && !opportunityButton) return;
  const button = reviewButton || opportunityButton;
  button.disabled = true;
  try {
    if (reviewButton) {
      const status = reviewButton.dataset.reviewStatus;
      await postArenaAction("reviewCompetitionSubmission", {
        submissionId: reviewButton.dataset.reviewSubmission,
        status,
        publicNote:
          status === "approved"
            ? "SparkLabs 운영 검토를 통과했습니다."
            : status === "needs_changes"
              ? "재현 방법과 제출 근거를 보완해 주세요."
              : "제출 규칙과 검증 조건을 충족하지 못했습니다."
      });
      showToast("제출 검토 상태를 저장했습니다.");
    } else {
      const status = opportunityButton.dataset.opportunityStatus;
      await postArenaAction("updateCompetitionOpportunity", {
        opportunityId: opportunityButton.dataset.updateOpportunity,
        status,
        publicNote: arenaOpportunityPublicNote(status)
      });
      showToast("Opportunity 상태를 업데이트했습니다.");
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function handleArenaLeaderboardClick(event) {
  const button = event.target.closest("[data-reveal-leaderboard]");
  if (!button) return;
  button.disabled = true;
  try {
    await postArenaAction("revealCompetitionPrivateLeaderboard", {
      challengeId: button.dataset.revealLeaderboard
    });
    renderArenaDetail(button.dataset.revealLeaderboard);
    switchArenaDetailTab("leaderboard");
    showToast("Private leaderboard를 공개했습니다.");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function handleArenaSubmitClick(event) {
  const button = event.target.closest("[data-copy-sample], [data-download-sample], [data-download-dataset]");
  if (!button) return;
  const challengeId = button.dataset.copySample || button.dataset.downloadSample || button.dataset.downloadDataset;
  const challenge = arenaChallengeFor(challengeId);
  if (!challenge) return;
  if (button.dataset.downloadDataset) {
    if (!challenge.evaluationDatasetCsv) return;
    downloadTextFile(`${challenge.slug || challenge.id}-evaluation-data.csv`, challenge.evaluationDatasetCsv);
    showToast("평가 데이터 CSV를 내려받았습니다.");
    return;
  }
  if (button.dataset.downloadSample) {
    if (!challenge.sampleSubmissionCsv) return;
    downloadTextFile(`${challenge.slug || challenge.id}-submission-template.csv`, challenge.sampleSubmissionCsv);
    showToast("제출 템플릿 CSV를 내려받았습니다.");
    return;
  }
  if (!challenge.sampleSubmissionCsv) return;
  try {
    await navigator.clipboard.writeText(challenge.sampleSubmissionCsv);
    showToast("제출 템플릿을 복사했습니다.");
  } catch {
    showToast("제출 템플릿을 복사하지 못했습니다.");
  }
}

function downloadTextFile(filename, contents) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = String(filename || "arena-data.csv").replace(/[^a-z0-9._-]+/gi, "-");
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function switchArenaDetailTab(tabName) {
  const button = els.arenaDetailTabs.querySelector(`[data-arena-tab="${tabName}"]`);
  if (button) button.click();
}

function arenaChallengeFor(id) {
  return (arenaData?.challenges || []).find((challenge) => String(challenge.id) === String(id));
}

function arenaLeaderboardFor(challengeId) {
  return (arenaData?.leaderboards || []).find(
    (leaderboard) => String(leaderboard.challengeId) === String(challengeId)
  );
}

function arenaSubmissionsForChallenge(challengeId) {
  return (arenaData?.submissions || [])
    .filter((submission) => String(submission.challengeId) === String(challengeId))
    .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt)));
}

function defaultArenaTeamName() {
  return (
    hub?.viewerTeam?.name ||
    hub?.viewer?.organization ||
    String(hub?.viewer?.email || "SparkClaw Team").split("@")[0] ||
    "SparkClaw Team"
  );
}

function arenaChallengeStatus(status) {
  if (status === "open") return "접수 중";
  if (status === "draft") return "준비 중";
  if (status === "paused") return "일시 중지";
  if (status === "locked") return "평가 중";
  if (status === "ended") return "종료";
  if (status === "private_revealed") return "최종 공개";
  return status || "준비 중";
}

function arenaEvaluationMode(mode) {
  if (mode === "automatic") return "Machine validation";
  if (mode === "staff_recorded") return "Expert review";
  return "Machine + Human";
}

function arenaSubmissionStatus(status) {
  if (status === "scored") return "자동 검증 완료";
  if (status === "selected_for_private") return "최종 평가 선택";
  if (status === "schema_failed") return "형식 보완 필요";
  if (status === "queued") return "전문가 검토 대기";
  if (status === "disqualified") return "실격";
  return status || "검토 대기";
}

function arenaOpportunityIntent(intent) {
  if (intent === "pilot") return "파일럿 연결";
  if (intent === "investment_intro") return "투자자 소개";
  if (intent === "credits") return "크레딧·혜택";
  if (intent === "mentor_feedback") return "멘토 피드백";
  return "PoC 검토";
}

function arenaOpportunityStatus(status) {
  if (status === "reviewing") return "운영 검토 중";
  if (status === "matched") return "파트너 매칭";
  if (status === "pilot") return "파일럿 진행";
  if (status === "closed") return "완료";
  if (status === "declined") return "종료";
  return "요청 접수";
}

function arenaOpportunityPublicNote(status) {
  if (status === "reviewing") return "SparkLabs 운영진이 요청을 검토하고 있습니다.";
  if (status === "matched") return "적합한 파트너와 연결을 준비하고 있습니다.";
  if (status === "pilot") return "파일럿 단계로 전환되었습니다.";
  if (status === "closed") return "Opportunity 요청이 완료되었습니다.";
  return "";
}

function formatArenaScore(value) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return numeric <= 1 ? `${(numeric * 100).toFixed(1)}%` : numeric.toFixed(2);
}

function setInlineStatus(element, message, type = "") {
  setProcessStatus(element, message, type);
}

function disableForm(form, disabled) {
  form.setAttribute("aria-busy", String(disabled));
  form.querySelectorAll("input, select, textarea, button").forEach((control) => {
    control.disabled = disabled;
  });
}

function populateTeamFilters() {
  const current = els.sectorFilter.value;
  els.sectorFilter.innerHTML = `
    <option value="">전체 산업</option>
    ${(hub.sectors || [])
      .map((sector) => `<option value="${escapeHtml(sector.name)}">${escapeHtml(sector.name)} (${formatNumber(sector.count)})</option>`)
      .join("")}
  `;
  if ([...els.sectorFilter.options].some((option) => option.value === current)) {
    els.sectorFilter.value = current;
  }
}

function renderTeams() {
  if (!hub) return;
  const query = normalize(els.teamSearch.value);
  const sector = normalize(els.sectorFilter.value);
  const incorporated = els.incorporatedFilter.value;
  const sort = els.teamSort.value;
  const teams = (hub.teams || [])
    .filter((team) => {
      const haystack = normalize(
        [team.name, team.companyName, team.item, team.sector, team.oneLiner, team.serviceSummary, team.aiIdeaSummary, ...(team.matchingKeywords || []), ...taskKeywords(team, 8)]
          .filter(Boolean)
          .join(" ")
      );
      const matchesQuery = !query || haystack.includes(query);
      const matchesSector = !sector || normalize(team.sector).includes(sector);
      const matchesIncorporated =
        !incorporated || (team.privateDetailsVisible && (incorporated === "yes" ? team.isIncorporated : !team.isIncorporated));
      return matchesQuery && matchesSector && matchesIncorporated;
    })
    .sort((left, right) => directoryTeamSortValue(left, right, sort));

  els.teamResultCount.textContent = `${formatNumber(teams.length)}개 회사`;
  els.teamGrid.innerHTML = teams.map(teamCardMarkup).join("");
  els.teamEmpty.hidden = teams.length > 0;
}

function teamCardMarkup(team) {
  const activity = team.activity;
  const progress = team.publicSignals || activity || {};
  const investor = normalizeInvestorProfile(team.investorProfile) || {};
  const publicViewer = isPublicViewer();
  const partnerViewer = hub?.viewer?.role === "b2b_partner";
  const founder = team.founder ? `Founder · ${team.founder}` : team.companyName || team.item || "참가기업";
  const introductionHidden = (team.cardHiddenFields || []).includes("introduction");
  const introduction = investor.partneringSummary || investor.teamSummary || team.serviceSummary || team.oneLiner || team.aiIdeaSummary || (introductionHidden ? "팀이 소개 내용을 비공개로 설정했습니다." : "팀 소개가 아직 입력되지 않았습니다.");
  const investorMetrics = (investor.metrics || []).slice(0, 3);
  const tasks = teamCapabilityTasks(team, investor);
  const progressSignals = teamProgressSignals(progress);
  const stage = teamProgramStage(team);
  const officialLogo = companyLogoAsset(team);
  const logoMarkup = officialLogo
    ? `<span class="team-card-logo is-${officialLogo.tone}" data-official-company-logo="${escapeHtml(team.id)}" title="${escapeHtml(officialLogo.websiteHost)} 공식 사이트 헤더 로고"><img src="${escapeHtml(officialLogo.src)}" alt="${escapeHtml(team.name || team.companyName || "기업")} 공식 로고" loading="lazy" decoding="async"></span>`
    : `<span class="team-card-logo is-fallback" data-company-logo-fallback="${escapeHtml(team.id)}" title="공식 웹사이트 로고 미등록 · 업종 아이콘 표시">${companyIconMarkup(team)}</span>`;
  return `
    <article class="team-card" data-team-card="${escapeHtml(team.id)}">
      <div class="team-card-head">
        <div class="team-card-title">
          <h2>${escapeHtml(team.name || "이름 없는 팀")}</h2>
          <p class="team-company">${escapeHtml(founder)}</p>
        </div>
        <div class="team-card-brand">
          ${logoMarkup}
          <span class="sector-tag" title="${escapeHtml(team.sector || "미분류")}">${escapeHtml(primarySector(team.sector) || "미분류")}</span>
        </div>
      </div>
      <div class="team-introduction-block">
        <span>팀 소개</span>
        <p class="team-one-liner">${escapeHtml(introduction)}</p>
      </div>
      ${investorMetrics.length ? `<div class="team-investor-metrics" aria-label="핵심 정량 근거">${investorMetrics.map((metric) => `<span>${escapeHtml(metric)}</span>`).join("")}</div>` : ""}
      <div class="team-card-tags">
        <span class="stage-tag"><small>현단계</small>${escapeHtml(stage)}</span>
        ${team.isViewerTeam && team.cardVisibility?.canEdit ? `<span class="type-tag is-privacy">내 카드 · 공개범위 설정 가능</span>` : ""}
        ${publicViewer ? `<span class="evidence-tag is-${escapeHtml(team.evidenceLevel || "needs_verification")}">${escapeHtml(evidenceLevelLabel(team.evidenceLevel))}</span>` : ""}
        ${team.privateDetailsVisible && team.isBuilder ? `<span class="type-tag">Builder</span>` : ""}
        ${team.privateDetailsVisible && team.isIncorporated ? `<span class="type-tag">법인</span>` : ""}
      </div>
      ${progressSignals.length ? `<div class="activity-dots evidence-numbers">${progressSignals.map((signal) => `<div><strong>${escapeHtml(signal.value)}</strong><span>${escapeHtml(signal.label)}</span></div>`).join("")}</div>` : ""}
      ${companyOfficialLinksMarkup(team)}
      <div class="team-task-preview">
        <span class="team-task-preview-label">해결 가능한 Task · 근거 순</span>
        <ol class="team-task-ranked-list">${tasks.map((task, index) => `<li><span class="task-rank-badge">${index + 1}</span><div><strong>${escapeHtml(task.label)}</strong><p>${escapeHtml(task.description)}</p>${task.evidence ? `<small>공개 근거 · ${escapeHtml(task.evidence)}</small>` : ""}</div></li>`).join("")}</ol>
      </div>
      <p class="privacy-note">${partnerViewer ? "Program Supabase의 공개 가능한 프로필·집계만 표시합니다. 인터뷰 원문과 연락처는 비공개입니다." : "공개 가능한 팀 정보와 집계값만 표시합니다."}</p>
      <div class="team-card-footer">
        <span>Program DB · ${escapeHtml(stage)}</span>
        <div class="team-card-footer-actions">
          ${partnerViewer ? `<button class="team-compare-button" data-compare-program-team="${escapeHtml(team.id)}" type="button">비교하기</button>` : ""}
          <button class="team-detail-button" data-team-id="${escapeHtml(team.id)}" type="button">${team.isViewerTeam && team.cardVisibility?.canEdit ? "내 카드 공개 설정 →" : "팀 상세보기 →"}</button>
        </div>
      </div>
    </article>
  `;
}

function companyOfficialLinksMarkup(company, { section = false } = {}) {
  const links = companyExternalLinks(company);
  if (!links.length) return "";
  const linkMarkup = links.map((link) => `<a class="company-official-link is-${escapeHtml(link.kind)}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(`${link.label} 공식 링크`)}"><span class="company-official-link-icon" aria-hidden="true">${escapeHtml(companyExternalLinkIcon(link.kind))}</span><span>${escapeHtml(link.label)}</span></a>`).join("");
  if (section) {
    return `<section class="company-official-links-section"><h2>공식 채널·앱</h2><p class="company-official-links-note">회사 공식 사이트와 앱스토어에서 확인된 링크입니다.</p><div class="company-official-links is-detail">${linkMarkup}</div></section>`;
  }
  return `<div class="company-official-links" aria-label="공식 SNS 및 앱스토어 링크">${linkMarkup}</div>`;
}

function teamProgramStage(team = {}) {
  const value = String(team.programStage || team.group || "").trim().toLowerCase();
  if (value.includes("scaler")) return "scaler";
  if (value.includes("validator")) return "validator";
  if (value.includes("discoverer")) return "discoverer";
  return value || "미입력";
}

function teamProgressSignals(progress = {}, limit = 3) {
  const values = [
    { key: "teamSize", label: "팀원", suffix: "명" },
    { key: "customerInterviews", label: "고객 인터뷰", suffix: "회" },
    { key: "payingCustomers", label: "유료 고객", suffix: "곳" },
    { key: "weeklyReports", label: "주간 리포트", suffix: "회" },
    { key: "hypotheses", label: "검증 가설", suffix: "개" },
    { key: "mentoringSessions", label: "멘토링", suffix: "회" },
    { key: "pmfResponses", label: "PMF 응답", suffix: "회" }
  ]
    .map((item) => ({ ...item, numeric: Number(progress?.[item.key] || 0) }))
    .filter((item) => Number.isFinite(item.numeric) && item.numeric > 0)
    .map((item) => ({ label: item.label, value: `${formatNumber(item.numeric)}${item.suffix}` }));
  if (progress?.pmfPhase) values.push({ label: "PMF 단계", value: String(progress.pmfPhase).slice(0, 32) });
  return values.slice(0, Math.max(1, Number(limit) || 3));
}

function handleTeamGridClick(event) {
  const compareButton = event.target.closest("[data-compare-program-team]");
  if (compareButton) {
    window.dispatchEvent(new CustomEvent("spark-arena:compare-program-team", { detail: { id: compareButton.dataset.compareProgramTeam } }));
    return;
  }
  const button = event.target.closest("[data-team-id]");
  if (!button) return;
  const team = (hub.teams || []).find((item) => String(item.id) === String(button.dataset.teamId));
  if (team) openTeamDialog(team);
}

function handleRecommendedCompanyOpen(event) {
  const productId = String(event.detail?.productId || "").trim();
  const teamId = productId.startsWith("program-team-")
    ? productId.slice("program-team-".length)
    : productId;
  const team = (hub.teams || []).find((item) => String(item.id) === teamId);
  if (!team) {
    showToast("기업 소개를 불러오지 못했습니다. 잠시 후 다시 검색해 주세요.");
    return;
  }
  openTeamDialog(team);
}

function openTeamDialog(team, { recordHistory = true } = {}) {
  const activity = team.activity;
  const progress = team.publicSignals || activity || {};
  const investor = normalizeInvestorProfile(team.investorProfile) || {};
  const progressSignals = teamProgressSignals(progress, 6);
  const tasks = teamCapabilityTasks(team, investor);
  const stage = teamProgramStage(team);
  const publicViewer = isPublicViewer();
  const clawMemberViewer = isClawMemberViewer();
  const partnerViewer = hub?.viewer?.role === "b2b_partner";
  const canRequestCollaborationReview = Boolean(hub?.permissions?.canRequestCollaborationReview && !team.isViewerTeam);
  const pendingCollaborationReview = (hub?.collaborationReviews || []).find(
    (item) => String(item.targetTeamId) === String(team.id) && item.direction === "outgoing" && item.status === "pending"
  );
  const collaborationAction = canRequestCollaborationReview
    ? pendingCollaborationReview
      ? `<button class="primary-button compact" type="button" disabled>협업 검토 답변 대기 중</button>`
      : `<button class="primary-button compact" data-collaboration-review-team="${escapeHtml(String(team.id || ""))}" type="button">이 회사에 협업 검토 요청</button>`
    : `<button class="primary-button compact" data-brief-company="${escapeHtml(team.name || team.companyName || "AI company")}" type="button">이 회사와 협업 검토</button>`;
  const visibilityEditor = team.isViewerTeam && hub?.permissions?.canEditTeamCardVisibility
    ? teamCardVisibilityEditorMarkup(team)
    : "";
  const introductionHidden = (team.cardHiddenFields || []).includes("introduction");
  const capabilitiesHidden = (team.cardHiddenFields || []).includes("capabilities");
  els.teamDialogContent.innerHTML = `
    <section class="team-detail-hero">
      <span class="eyebrow">${escapeHtml(stage.toUpperCase())} · ${escapeHtml(primarySector(team.sector) || "TEAM")}</span>
      <h1>${escapeHtml(team.name || "이름 없는 팀")}</h1>
      <p>${escapeHtml(team.oneLiner || team.item || (introductionHidden ? "팀이 소개 내용을 비공개로 설정했습니다." : "팀 소개가 아직 입력되지 않았습니다."))}</p>
    </section>
    <div class="team-detail-body">
      ${visibilityEditor}
      <div class="team-detail-meta">
        <div><span>현단계</span><strong>${escapeHtml(stage)}</strong></div>
        <div><span>산업</span><strong>${escapeHtml(team.sector || "미분류")}</strong></div>
        ${team.privateDetailsVisible ? `<div><span>법인</span><strong>${team.isIncorporated ? "설립" : "미설립·미입력"}</strong></div>` : ""}
        ${team.privateDetailsVisible ? `<div><span>팀 형태</span><strong>${team.isSoloFounder ? "1인 창업" : team.isBuilder ? "Builder" : "팀"}</strong></div>` : ""}
      </div>
      <section class="investor-team-summary"><h2>팀 경쟁력</h2><p>${escapeHtml(investor.teamSummary || team.serviceSummary || team.oneLiner || team.aiIdeaSummary || "팀 소개가 아직 입력되지 않았습니다.")}</p></section>
      ${investor.metrics?.length ? `<section><h2>핵심 정량 하이라이트</h2><div class="investor-metric-grid">${investor.metrics.map((metric) => `<article><span>VERIFIED CLAIM</span><strong>${escapeHtml(metric)}</strong></article>`).join("")}</div></section>` : ""}
      ${investor.proofPoints?.length ? `<section><h2>투자 검토 포인트</h2><div class="investor-proof-grid">${investor.proofPoints.map((point) => `<article><span>${escapeHtml(point.label)}</span><p>${escapeHtml(point.value)}</p></article>`).join("")}</div></section>` : ""}
      ${team.founder ? `<section><h2>창업자</h2><p>${escapeHtml(team.founder)}</p></section>` : ""}
      ${team.item ? `<section><h2>아이템</h2><p>${escapeHtml(team.item)}</p></section>` : ""}
      <section><h2>서비스 설명</h2><p>${escapeHtml(team.oneLiner || team.serviceSummary || "서비스 설명이 아직 입력되지 않았습니다.")}</p></section>
      ${tasks.length ? `<section><h2>해결 가능한 모든 Task</h2><p class="evidence-disclosure">Program Supabase의 지원서·서비스 설명·AI 아이디어·공개 키워드와 운영 집계를 함께 확인해 근거 강도 순으로 정렬했습니다.</p><div class="task-detail-list is-ranked">${tasks.map((task, index) => `<article><span class="task-rank-badge">${index + 1}</span><div><strong>${escapeHtml(task.label)}</strong><p>${escapeHtml(task.description)}</p>${task.evidence ? `<small>공개 근거 · ${escapeHtml(task.evidence)}</small>` : ""}</div></article>`).join("")}</div></section>` : capabilitiesHidden ? `<section class="team-private-field-note"><h2>해결 Task</h2><p>팀이 역량·Task 정보를 비공개로 설정했습니다.</p></section>` : ""}
      ${team.aiIdeaSummary ? `<section><h2>AI 아이디어</h2><p>${escapeHtml(team.aiIdeaSummary)}</p></section>` : ""}
      ${team.expertise && !/^(?:domain|technical)$/i.test(String(team.expertise).trim()) ? `<section><h2>팀 전문성</h2><p>${escapeHtml(team.expertise)}</p></section>` : ""}
      ${publicViewer && team.evidence?.length ? `<section><h2>공개된 근거</h2><ul class="team-evidence-list">${team.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
      ${publicViewer && team.missingInfo?.length ? `<section class="needs-verification-section"><h2>추가 확인할 정보</h2><ul class="team-evidence-list">${team.missingInfo.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
      ${progressSignals.length ? `<section><h2>검증 숫자</h2><p class="evidence-disclosure">Program Supabase의 팀·주간 리포트·가설·멘토링·PMF 테이블에서 공개 가능한 집계만 표시합니다.</p><div class="detail-activity-grid">${progressSignals.map((signal) => `<div><strong>${escapeHtml(signal.value)}</strong><span>${escapeHtml(signal.label)}</span></div>`).join("")}</div></section>` : ""}
      ${
        team.mentor
          ? `<section><h2>담당 멘토</h2><p>${escapeHtml(team.mentor.name)}${team.mentor.affiliation ? ` · ${escapeHtml(team.mentor.affiliation)}` : ""}</p></section>`
          : ""
      }
      ${companyOfficialLinksMarkup(team, { section: true })}
      <div class="team-detail-actions">
        ${team.websiteUrl ? `<a class="detail-link" href="${escapeHtml(team.websiteUrl)}" target="_blank" rel="noopener noreferrer">회사 웹사이트 열기 ↗</a>` : ""}
        ${collaborationAction}
      </div>
      <p class="controlled-intro-note">요청을 보내면 소개 의사가 기록되고 상대 팀 My Log에 전달됩니다. 대상 스타트업이 승인한 뒤에도 연락처는 자동 공개하지 않으며, SparkLabs가 소개 범위와 다음 단계를 확인합니다.</p>
      ${clawMemberViewer ? "" : `<p class="controlled-intro-note is-evidence">경력·학력·성과는 팀 제출 지원자료와 Program Supabase의 공개 가능한 집계에서만 구성했습니다. 내부 심사점수, 고객 인터뷰 원문, 주간 리포트 본문, 이메일, 연락처와 내부 운영 메모는 노출하지 않습니다.${investor.sourceLabel ? ` 근거: ${escapeHtml(investor.sourceLabel)}.` : ""}</p>`}
      ${publicViewer ? `<p class="profile-updated-note">정보 기준 · ${team.updatedAt ? escapeHtml(formatDate(team.updatedAt)) : "최근 업데이트일 확인 필요"}</p>` : ""}
    </div>
  `;
  els.teamDialogContent.querySelector("[data-team-card-visibility-form]")?.addEventListener("submit", handleTeamCardVisibilitySubmit);
  els.teamDialog.showModal();
  if (recordHistory) {
    window.dispatchEvent(new CustomEvent("spark-arena:team-dialog-opened", {
      detail: { id: String(team.id || ""), source: "program" }
    }));
  }
}

function teamCardVisibilityEditorMarkup(team = {}) {
  const fields = team.cardVisibility?.fields || {};
  const options = [
    ["introduction", "팀·서비스 소개", "카드 소개 문장과 상세 서비스 설명"],
    ["achievements", "정량 성과·검증 숫자", "매출·고객·인터뷰 등 공개 가능한 집계"],
    ["capabilities", "해결 Task·역량", "Task 목록, 전문성, 매칭 키워드"],
    ["aiIdea", "AI 적용 아이디어", "AI 활용 방향과 구현 아이디어"],
    ["website", "회사 웹사이트", "카드 및 상세 화면의 외부 링크"]
  ];
  return `<section class="team-card-visibility-panel">
    <div class="team-card-visibility-head">
      <div><span class="eyebrow">MY TEAM CARD</span><h2>내 카드 공개 범위</h2></div>
      <span class="privacy-safety-badge">연락처·내부 원문은 항상 비공개</span>
    </div>
    <p>공개 항목은 승인된 Arena 회원과 산업 파트너에게 표시됩니다. 비공개 항목은 본인 팀과 SparkLabs 운영진만 확인할 수 있습니다.</p>
    <form data-team-card-visibility-form>
      <div class="team-card-visibility-grid">
        ${options.map(([name, label, description]) => `<label>
          <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></span>
          <select name="${escapeHtml(name)}" aria-label="${escapeHtml(label)} 공개 범위">
            <option value="public" ${fields[name] !== "private" ? "selected" : ""}>공개</option>
            <option value="private" ${fields[name] === "private" ? "selected" : ""}>비공개</option>
          </select>
        </label>`).join("")}
      </div>
      <div class="team-card-visibility-actions">
        <small>팀명·산업·현단계는 Directory 식별을 위해 계속 표시됩니다.</small>
        <button class="primary-button compact" type="submit" data-idle-label="공개 범위 저장">공개 범위 저장</button>
      </div>
      <p class="form-status" data-team-card-visibility-status aria-live="polite"></p>
    </form>
  </section>`;
}

async function handleTeamCardVisibilitySubmit(event) {
  event.preventDefault();
  if (programActionPending) return;
  const form = event.currentTarget;
  const status = form.querySelector("[data-team-card-visibility-status]");
  const fields = Object.fromEntries(
    ["introduction", "achievements", "capabilities", "aiIdea", "website"].map((name) => [
      name,
      form.elements[name]?.value === "private" ? "private" : "public"
    ])
  );
  programActionPending = true;
  disableForm(form, true);
  const submitButton = form.querySelector('button[type="submit"]');
  const progressToken = startProcessStatus(status, TEAM_CARD_VISIBILITY_PROGRESS_STEPS, {
    announcement: "Clawee 저장 가이드가 공개 범위 저장 과정을 시작했습니다.",
    interval: 1800,
    showElapsed: true
  });
  if (submitButton) submitButton.textContent = "Clawee 저장 중…";
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30000);
  try {
    const result = await postProgramAction("updateTeamCardVisibility", { fields }, { signal: controller.signal });
    hub = result.snapshot;
    if (usesProgramDirectoryForViewer()) marketData = marketDataFromProgramHub(hub, marketData);
    renderHub();
    finishProcessStatus(status, progressToken, "저장했습니다. 다른 회원과 파트너 화면에도 즉시 반영됩니다.", "success");
    showToast("내 팀 카드 공개 범위를 저장했습니다.");
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "30초 안에 저장 완료를 확인하지 못했습니다. 잠시 후 카드를 다시 열어 반영 여부를 확인해 주세요."
      : error.message;
    finishProcessStatus(status, progressToken, message, "error");
    showToast(message);
  } finally {
    window.clearTimeout(timeoutId);
    programActionPending = false;
    disableForm(form, false);
    if (submitButton) submitButton.textContent = submitButton.dataset.idleLabel || "공개 범위 저장";
  }
}

function teamCapabilityTasks(team, investor = {}) {
  const derived = rankedTaskDetails({
    ...team,
    investorProfile: investor,
    functions: [...(team.functions || []), ...(team.matchingKeywords || []), ...(investor.strengthTags || [])],
    tags: investor.strengthTags || []
  }, 32).filter((task) => task.label !== "해결 Task 확인 필요");
  const combined = [...(investor.specialtyTasks || []), ...derived];
  const seen = new Set();
  return combined.filter((task) => {
    const key = String(task.label || "").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((task, index) => ({ ...task, rank: index + 1 }));
}

function closeTeamDialog(options = {}) {
  const historyMode = options?.historyMode || "back";
  if (!els.teamDialog.open) return;
  if (historyMode === "back" && isCurrentTeamDialogHistory()) {
    window.history.back();
    return;
  }
  els.teamDialog.close();
  if (historyMode === "replace") replaceDialogHistoryWithPage();
}

function openCollaborationReviewDialog(targetTeamId, { recordHistory = true } = {}) {
  if (!hub?.permissions?.canRequestCollaborationReview || !els.collaborationReviewDialog || !els.collaborationReviewForm) {
    showToast("SparkClaw 참가기업 계정만 협업 검토를 요청할 수 있습니다.");
    return;
  }
  const candidates = Array.isArray(hub.memberDirectory) ? hub.memberDirectory : hub.teams || [];
  const target = candidates.find((team) => String(team.id) === String(targetTeamId) && !team.isViewerTeam);
  if (!target) {
    showToast("협업 검토를 요청할 참가기업을 찾을 수 없습니다.");
    return;
  }
  closeTeamDialog({ historyMode: "none" });
  els.collaborationReviewForm.reset();
  els.collaborationReviewForm.elements.targetTeamId.value = String(target.id);
  els.collaborationReviewTargetName.textContent = target.name || target.companyName || "대상 기업";
  els.collaborationReviewFormStatus.hidden = true;
  els.collaborationReviewFormStatus.textContent = "";
  els.collaborationReviewDialog.showModal();
  if (recordHistory) {
    window.dispatchEvent(new CustomEvent("spark-arena:history-overlay-opened", {
      detail: { type: "collaboration-review", id: String(target.id) }
    }));
  }
  window.requestAnimationFrame(() => els.collaborationReviewForm.elements.purpose.focus());
}

function closeCollaborationReviewDialog(options = {}) {
  const historyMode = options?.historyMode || "back";
  if (!els.collaborationReviewDialog?.open) return;
  if (historyMode === "back" && isCurrentArenaOverlayHistory("collaboration-review")) {
    window.history.back();
    return;
  }
  els.collaborationReviewDialog.close();
  if (historyMode === "replace") replaceOverlayHistoryWithPage();
}

async function handleCollaborationReviewSubmit(event) {
  event.preventDefault();
  if (programActionPending || !hub?.permissions?.canRequestCollaborationReview) return;
  const payload = Object.fromEntries(new FormData(els.collaborationReviewForm).entries());
  setInlineStatus(els.collaborationReviewFormStatus, "상대 팀 My Log로 협업 검토 요청을 보내는 중입니다.");
  const saved = await runProgramAction(
    "createCollaborationReview",
    payload,
    "협업 검토 요청을 상대 팀 My Log에 보냈습니다.",
    "",
    els.collaborationReviewFormStatus
  );
  if (!saved) return;
  els.collaborationReviewForm.reset();
  closeCollaborationReviewDialog({ historyMode: "replace" });
  showPage("workspace");
  window.requestAnimationFrame(() => els.myLogMatches?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

async function handleCollaborationReviewResponse(event) {
  const button = event.target.closest("[data-collaboration-review-status]");
  if (!button || programActionPending) return;
  const approved = button.dataset.collaborationReviewStatus === "approved";
  await runProgramAction(
    "respondCollaborationReview",
    { reviewId: button.dataset.collaborationReviewId, status: button.dataset.collaborationReviewStatus },
    approved
      ? "협업 검토 요청을 승인했습니다. SparkLabs가 다음 단계를 확인합니다."
      : "협업 검토 요청을 정중히 거절했습니다.",
    "workspace"
  );
}

function resetTeamFilters() {
  els.teamSearch.value = "";
  els.sectorFilter.value = "";
  els.incorporatedFilter.value = "";
  els.teamSort.value = "name";
  renderTeams();
}

function renderCalendar() {
  const events = sortEventsChronologically(hub.events || []);
  const partnerCatalogView = isPartnerBenefitCatalogViewer();
  if (els.calendarPageTitle) {
    els.calendarPageTitle.textContent = partnerCatalogView ? "프로그램의 주요 만남과 파트너 혜택" : "만나고, 배우고, 바로 활용하세요.";
  }
  if (els.calendarPageDescription) {
    els.calendarPageDescription.textContent = partnerCatalogView
      ? "8월 13일 OT부터 이후 공개 주요 일정과 프로그램 파트너의 Verified Perks 제공 사례를 확인합니다."
      : "공개 행사와 제공 조건이 확인된 파트너 혜택을 한곳에서 확인합니다.";
  }
  if (els.calendarEventTitle) els.calendarEventTitle.textContent = partnerCatalogView ? "공개 주요 일정" : "전체 일정";
  if (els.eventPerkTitle) els.eventPerkTitle.textContent = partnerCatalogView ? "프로그램 파트너 제공 혜택" : "지금 활용할 수 있는 혜택";
  if (els.eventPerkLink) els.eventPerkLink.textContent = partnerCatalogView ? "제공 사례 살펴보기 →" : "자격과 신청 조건 확인 →";
  els.eventCount.textContent = `${formatNumber(events.length)}건`;
  els.eventTimeline.innerHTML = events.length
    ? events.map(eventTimelineMarkup).join("")
    : `<p class="empty-copy">${partnerCatalogView ? "8월 13일 OT 이후 공개되는 주요 일정이 여기에 추가됩니다." : "등록된 일정이 없습니다."}</p>`;
  if (els.mentorList) {
    els.mentorList.innerHTML = (hub.mentors || []).length
      ? hub.mentors.map(mentorMarkup).join("")
      : "";
  }
  renderEventPerkPreview();
  renderEventRecommendationIntro();
}

function renderEventRecommendationIntro() {
  if (!els.eventRecommendationTitle || !els.eventRecommendationDescription) return;
  const staffOperations = isEventOperationsViewer();
  const organizationName = partnerOrganizationName(hub?.partnerProfile) || hub?.viewerTeam?.name || hub?.viewer?.organization || "현재 계정";
  els.eventRecommendationTitle.textContent = staffOperations
    ? "SparkLabs 운영 우선 이벤트를 계산합니다."
    : hub?.viewer?.role === "b2b_partner"
      ? `${organizationName} 파트너가 확인할 공개 일정을 정리합니다.`
    : `${organizationName}에 지금 맞는 이벤트를 계산합니다.`;
  els.eventRecommendationDescription.textContent = staffOperations
    ? "시작 임박도·운영 정보 누락·행사 중요도를 교차해 먼저 확인할 순서를 정리합니다. 같은 우선도에서는 빠른 일정부터 보여줍니다."
    : hub?.viewer?.role === "b2b_partner"
      ? "8월 13일 OT 이후 공개 주요 일정과 다른 파트너사의 Verified Perks 제공 사례를 함께 정리합니다."
      : "현재 계정의 역할과 공개 프로필, 예정 일정, 검증된 혜택을 교차해 활용 순서를 정리합니다.";
  const buttonTitle = els.eventRecommendationButton?.querySelector("strong");
  const buttonDescription = els.eventRecommendationButton?.querySelector("small");
  if (buttonTitle) buttonTitle.textContent = staffOperations ? "운영 우선순위 계산" : "Agentic 추천 계산";
  if (buttonDescription) buttonDescription.textContent = staffOperations ? "현재 공개 일정 기준으로 재계산" : "누를 때마다 현재 데이터로 재계산";
}

function isEventOperationsViewer() {
  return Boolean(hub?.viewer?.canScore)
    || ["sparklabs", "admin"].includes(String(hub?.viewer?.role || "").toLowerCase());
}

async function requestEventRecommendations({ force = false, allowRefresh = true } = {}) {
  if (!isAuthenticatedViewer() || !els.eventRecommendationButton || !els.eventRecommendationStatus || !els.eventRecommendationResults) return;
  const contextKey = currentEventRecommendationContext();
  if (!force && contextKey && contextKey === eventRecommendationContextKey && !els.eventRecommendationResults.hidden) return;
  if (eventRecommendationPending && !force) return;

  const requestId = ++eventRecommendationRequestId;
  eventRecommendationPending = true;
  els.eventRecommendationPlanner?.classList.add("is-loading");
  els.eventRecommendationPlanner?.setAttribute("aria-busy", "true");
  els.eventRecommendationButton.disabled = true;
  els.eventRecommendationResults.hidden = true;
  const staffOperations = isEventOperationsViewer();
  const progressToken = startProcessStatus(els.eventRecommendationStatus, EVENT_RECOMMENDATION_PROGRESS_STEPS, {
    announcement: staffOperations
      ? "Arena 일정의 시작 임박도, 운영 정보 누락, 행사 중요도를 분석해 확인 순서를 계산하고 있습니다."
      : "현재 파트너 프로필과 Arena 일정·혜택을 바탕으로 맞춤 활용 순서를 계산하고 있습니다.",
    interval: 1150
  });

  try {
    const response = await fetch("/api/event-recommendations", {
      method: "POST",
      headers: { Accept: "application/json", "content-type": "application/json", ...authHeaders() },
      body: "{}"
    });
    if (response.status === 401 && allowRefresh && (await refreshSession())) {
      if (requestId === eventRecommendationRequestId) {
        eventRecommendationPending = false;
        finishProcessStatus(els.eventRecommendationStatus, progressToken);
      }
      return requestEventRecommendations({ force: true, allowRefresh: false });
    }
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(payload?.error || "맞춤 이벤트 추천을 계산하지 못했습니다.");
    if (requestId !== eventRecommendationRequestId) return;
    renderEventRecommendations(payload.recommendation || {});
    eventRecommendationContextKey = contextKey;
    finishProcessStatus(
      els.eventRecommendationStatus,
      progressToken,
      payload.recommendation?.mode === "staff_operations"
        ? "현재 공개 일정의 긴급도·운영 리스크·중요도 기준으로 우선순위를 정리했습니다."
        : payload.recommendation?.source === "spark_ai"
          ? "클로이가 현재 프로필과 공개 일정을 기준으로 추천을 완료했습니다."
          : "현재 공개 데이터 기준으로 추천을 정리했습니다.",
      "success"
    );
  } catch (error) {
    if (requestId !== eventRecommendationRequestId) return;
    finishProcessStatus(els.eventRecommendationStatus, progressToken, error.message || "맞춤 이벤트 추천을 계산하지 못했습니다.", "error");
  } finally {
    if (requestId === eventRecommendationRequestId) {
      eventRecommendationPending = false;
      els.eventRecommendationPlanner?.classList.remove("is-loading");
      els.eventRecommendationPlanner?.setAttribute("aria-busy", "false");
      els.eventRecommendationButton.disabled = false;
    }
  }
}

function renderEventRecommendations(recommendation = {}) {
  const items = Array.isArray(recommendation.recommendations) ? recommendation.recommendations : [];
  const staffOperations = recommendation.mode === "staff_operations" || isEventOperationsViewer();
  const sourceLabel = staffOperations
    ? recommendation.source === "spark_ai" ? "클로이 운영 분석 완료" : "운영 데이터 기반 정렬"
    : recommendation.source === "spark_ai" ? "클로이 분석 완료" : "현재 데이터 기반 추천";
  const cards = items.map((item, index) => {
    const typeLabel = item.itemType === "perk" ? "VERIFIED PERK" : "EVENT";
    const timing = item.timing || (item.date ? formatDate(item.date) : "현재 조건 확인");
    const priorityLabel = staffOperations && item.itemType === "event" ? String(item.priorityLabel || "예정") : "";
    const priorityClass = priorityLabel === "긴급"
      ? "is-urgent"
      : priorityLabel === "운영 리스크"
        ? "is-risk"
        : priorityLabel === "중요"
          ? "is-important"
          : "is-scheduled";
    return `<article class="event-agent-result-card">
      <div class="event-agent-result-head">
        <span class="event-agent-rank">0${index + 1}</span>
        <span class="event-agent-type">${escapeHtml(typeLabel)}</span>
        ${priorityLabel ? `<span class="event-agent-priority ${priorityClass}">${escapeHtml(priorityLabel)}</span>` : ""}
        <span class="event-agent-timing">${escapeHtml(timing)}</span>
      </div>
      <h3>${escapeHtml(item.title || "추천 항목")}</h3>
      <p><strong>${staffOperations ? "우선 확인 이유" : "추천 이유"}</strong>${escapeHtml(item.priorityReason || item.reason || "현재 프로필과의 연결 가능성을 확인할 가치가 있습니다.")}</p>
      <p><strong>${staffOperations ? "권장 조치" : "활용 액션"}</strong>${escapeHtml(item.suggestedUse || "세부 조건을 확인하고 담당자와 활용 목적을 정하세요.")}</p>
    </article>`;
  }).join("");
  els.eventRecommendationResults.innerHTML = `
    <div class="event-agent-summary-head">
      <div>
        <span class="event-agent-source"><i aria-hidden="true"></i>${escapeHtml(sourceLabel)}</span>
        <h3>${staffOperations ? "운영 우선순위" : "지금의 활용 우선순위"}</h3>
      </div>
      <p>${escapeHtml(recommendation.overview || "현재 공개 일정과 검증된 혜택을 기준으로 정리했습니다.")}</p>
    </div>
    ${cards ? `<div class="event-agent-result-grid">${cards}</div>` : `<p class="event-agent-empty">현재 추천할 수 있는 공개 일정이나 확정 혜택이 없습니다. 새 항목이 확정되면 다시 계산해 주세요.</p>`}
    <div class="event-agent-next-action"><span>NEXT BEST ACTION</span><strong>${escapeHtml(recommendation.nextBestAction || "새 일정과 혜택이 확정되면 다시 계산해 주세요.")}</strong></div>
  `;
  els.eventRecommendationResults.hidden = false;
}

function currentEventRecommendationContext() {
  return JSON.stringify({
    viewer: hub?.viewer?.id || hub?.viewer?.role || "viewer",
    profile: hub?.partnerProfile?.updatedAt || hub?.partnerProfile?.id || hub?.viewerTeam?.id || "",
    events: (hub?.events || []).map((event) => [event.id, event.date, event.time]),
    benefits: (hub?.benefits || []).map((benefit) => [benefit.id, benefit.verificationStatus, benefit.isActive])
  });
}

function resetEventRecommendationState() {
  eventRecommendationRequestId += 1;
  eventRecommendationContextKey = "";
  eventRecommendationPending = false;
  if (els.eventRecommendationResults) {
    els.eventRecommendationResults.hidden = true;
    els.eventRecommendationResults.replaceChildren();
  }
  if (els.eventRecommendationStatus) setProcessStatus(els.eventRecommendationStatus);
  if (els.eventRecommendationButton) els.eventRecommendationButton.disabled = false;
  els.eventRecommendationPlanner?.classList.remove("is-loading");
  els.eventRecommendationPlanner?.setAttribute("aria-busy", "false");
}

function renderEventPerkPreview() {
  if (!els.eventPerkPreview) return;
  const benefits = (hub.benefits || [])
    .filter(
      (benefit) =>
        benefit.isActive !== false &&
        benefit.verificationStatus !== "pending" &&
        isBenefitReadyForDisplay(benefit)
    )
    .slice(0, 4);
  els.eventPerkPreview.innerHTML = benefits.length
    ? benefits
        .map(
          (benefit) => `<article class="event-perk-item">
            ${benefitLogoMarkup(benefit)}
            <div><strong>${escapeHtml(benefit.provider || benefit.title || "파트너")}</strong><span>${escapeHtml(summarizeBenefit(benefit))}</span></div>
            <span class="status-tag">확인 완료</span>
          </article>`
        )
        .join("")
    : `<p class="empty-copy">${isPartnerBenefitCatalogViewer() ? "확인된 프로그램 파트너 제공 혜택이 등록되면 여기에 표시됩니다." : "제공 조건을 확인 중입니다. 확인이 끝난 혜택만 공개합니다."}</p>`;
}

function eventTimelineMarkup(event) {
  const date = dateParts(event.date);
  const detail = [event.kind || event.category, formatEventTime(event.time), event.location].filter(Boolean).join(" · ");
  const registration = event.viewerRegistration;
  const rsvpAction = hub.permissions?.canRegisterEvents
    ? registration && registration.status !== "cancelled"
      ? `<div class="program-card-action"><span class="application-status">${escapeHtml(eventRegistrationStatusLabel(registration.status))}</span><button class="secondary-button compact" data-cancel-event-registration="${escapeHtml(registration.id)}" type="button">RSVP 취소</button></div>`
      : event.canRegister
        ? `<div class="program-card-action"><button class="primary-button compact" data-register-event="${escapeHtml(event.id)}" type="button">RSVP 신청</button></div>`
        : ""
    : !isPastDate(event.date) && isPublicViewer()
      ? `<div class="program-card-action"><button class="secondary-button compact" data-open-member-access type="button">Member RSVP</button></div>`
      : "";
  return `
    <article class="timeline-item">
      <time class="timeline-date" datetime="${escapeHtml(event.date || "")}" aria-label="${escapeHtml(`${date.monthYear} ${date.day}일 ${date.weekday}`.trim())}">
        <strong>${escapeHtml(date.day)}</strong>
        <span>${escapeHtml(date.monthYear)}</span>
        ${date.weekday ? `<em>${escapeHtml(date.weekday)}</em>` : ""}
      </time>
      <div class="timeline-content">
        <div class="team-card-tags">
          <span class="status-tag">${isPastDate(event.date) ? "지난 일정" : "예정"}</span>
          ${event.isOnline ? `<span class="type-tag">온라인</span>` : ""}
        </div>
        <h3>${escapeHtml(event.title || "제목 없는 일정")}</h3>
        <div class="timeline-meta">
          <span>${escapeHtml(detail || "세부 정보 미입력")}</span>
          ${event.speaker ? `<span>Speaker · ${escapeHtml(event.speaker)}</span>` : ""}
          ${event.registrations ? `<span>등록 ${formatNumber(event.registrations)}명</span>` : ""}
        </div>
        ${eventDescriptionMarkup(event.description)}
        ${rsvpAction}
      </div>
    </article>
  `;
}

function eventDescriptionMarkup(value) {
  const description = plainEventDescription(value);
  if (!description) return "";
  if (!shouldCollapseEventDescription(description)) {
    return `<p class="timeline-description">${escapeHtml(description)}</p>`;
  }
  return `
    <details class="timeline-description-disclosure">
      <summary>
        <span class="timeline-description-preview">${escapeHtml(eventDescriptionPreview(description))}</span>
        <span class="timeline-description-toggle">
          <span class="timeline-description-more">내용 더 보기</span>
          <span class="timeline-description-less">내용 접기</span>
        </span>
      </summary>
      <p>${escapeHtml(description)}</p>
    </details>
  `;
}

function mentorMarkup(mentor) {
  const style = mentor.color ? ` style="background:${escapeHtml(mentor.color)}"` : "";
  return `
    <article class="mentor-card">
      <span class="mentor-avatar"${style}>${escapeHtml((mentor.name || "M").charAt(0))}</span>
      <div>
        <strong>${escapeHtml(mentor.name || "이름 미입력")}</strong>
        <span>${escapeHtml(mentor.affiliation || "소속 미입력")}</span>
      </div>
      ${mentor.bookingUrl ? `<a href="${escapeHtml(mentor.bookingUrl)}" target="_blank" rel="noopener noreferrer">예약 ↗</a>` : ""}
    </article>
  `;
}

function populateBenefitFilters() {
  const categories = [
    ...new Set(
      (hub.benefits || [])
        .filter(isBenefitReadyForDisplay)
        .map((benefit) => benefit.category)
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b, "ko"));
  const current = els.benefitCategoryFilter.value;
  els.benefitCategoryFilter.innerHTML = `
    <option value="">전체 카테고리</option>
    ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}
  `;
  if (categories.includes(current)) els.benefitCategoryFilter.value = current;
  const operatorView = isBenefitQualificationOperator();
  if (els.benefitQualificationFilterLabel) els.benefitQualificationFilterLabel.hidden = !operatorView;
  if (els.benefitQualificationFilter) {
    const selectedQualification = els.benefitQualificationFilter.value;
    els.benefitQualificationFilter.innerHTML = `
      <option value="">전체 자격</option>
      ${BENEFIT_QUALIFICATIONS.map((qualification) => `<option value="${qualification}">${benefitQualificationLabel(qualification)}</option>`).join("")}
    `;
    if (BENEFIT_QUALIFICATIONS.includes(selectedQualification)) els.benefitQualificationFilter.value = selectedQualification;
  }
}

function renderBenefits() {
  if (!hub) return;
  const category = els.benefitCategoryFilter.value;
  const operatorView = isBenefitQualificationOperator();
  const partnerCatalogView = isPartnerBenefitCatalogViewer();
  const viewerQualification = viewerBenefitQualification(hub.viewerTeam || {});
  const qualification = operatorView ? String(els.benefitQualificationFilter?.value || "") : "";
  const benefits = (hub.benefits || []).filter(
    (benefit) =>
      isBenefitReadyForDisplay(benefit) &&
      (!isPublicViewer() || (benefit.isActive !== false && ["confirmed", "verified"].includes(String(benefit.verificationStatus || "confirmed").toLowerCase()))) &&
      (!category || benefit.category === category) &&
      (!operatorView || benefitMatchesQualification(benefit, qualification))
  );
  renderBenefitPageContext({ operatorView, partnerCatalogView, viewerQualification, qualification, benefits });
  els.benefitGrid.classList.toggle("is-grouped", Boolean(benefits.length));
  els.benefitGrid.innerHTML = benefits.length
    ? partnerCatalogView
      ? partnerBenefitCatalogMarkup(benefits)
      : operatorView
      ? operatorBenefitGroupsMarkup(benefits, qualification)
      : memberBenefitGroupsMarkup(benefits, viewerQualification)
    : `<div class="empty-state"><strong>선택한 카테고리와 자격에 해당하는 혜택이 없습니다.</strong></div>`;
}

function renderBenefitPageContext({ operatorView, partnerCatalogView, viewerQualification, qualification, benefits }) {
  if (els.benefitPageTitle) {
    els.benefitPageTitle.textContent = partnerCatalogView
      ? "프로그램 파트너 혜택 카탈로그"
      : operatorView
        ? "자격별 팀 성장 혜택"
        : `${benefitQualificationLabel(viewerQualification)} 팀 성장 혜택`;
  }
  if (els.benefitPageDescription) {
    els.benefitPageDescription.textContent = partnerCatalogView
      ? "파트너 신청 화면이 아닙니다. 다른 프로그램 파트너가 Claw Member에게 제공하는 혜택과 제공 방식을 살펴봅니다."
      : operatorView
        ? "관리자 검토 화면입니다. 대상 자격을 선택해 제공 범위와 조건을 비교할 수 있습니다."
        : "로그인한 팀의 프로그램 상태와 제공 조건을 비교해 신청 가능 여부를 분류했습니다.";
  }
  if (!els.benefitEligibilitySummary) return;
  if (partnerCatalogView) {
    const providers = new Set(benefits.map((benefit) => benefit.provider).filter(Boolean));
    const categories = [...new Set(benefits.map((benefit) => benefit.category).filter(Boolean))].slice(0, 5);
    els.benefitEligibilitySummary.innerHTML = `
      <div><span class="section-kicker">PARTNER CATALOG</span><strong>${formatNumber(providers.size)}개 파트너 · ${formatNumber(benefits.length)}개 혜택</strong></div>
      <div class="benefit-summary-chips">${categories.map((item) => `<span><b>${escapeHtml(item)}</b></span>`).join("")}</div>`;
    return;
  }
  if (operatorView) {
    const counts = Object.fromEntries(BENEFIT_QUALIFICATIONS.map((item) => [item, benefits.filter((benefit) => benefitMatchesQualification(benefit, item)).length]));
    els.benefitEligibilitySummary.innerHTML = `
      <div><span class="section-kicker">QUALIFICATION VIEW</span><strong>${qualification ? `${benefitQualificationLabel(qualification)} 대상` : "전체 자격 검토"}</strong></div>
      <div class="benefit-summary-chips">
        ${BENEFIT_QUALIFICATIONS.map((item) => `<span><b>${benefitQualificationLabel(item)}</b> ${formatNumber(counts[item])}</span>`).join("")}
      </div>`;
    return;
  }
  const counts = benefits.reduce((result, benefit) => {
    const status = classifyBenefitForViewer(benefit, viewerQualification).key;
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  els.benefitEligibilitySummary.innerHTML = `
    <div><span class="section-kicker">MY TEAM STATUS</span><strong>${benefitQualificationLabel(viewerQualification)}</strong></div>
    <div class="benefit-summary-chips">
      <span class="is-eligible"><b>신청 가능</b> ${formatNumber(counts.eligible || 0)}</span>
      <span class="is-progress"><b>진행 중</b> ${formatNumber(counts.progress || 0)}</span>
      <span class="is-review"><b>확인 필요</b> ${formatNumber(counts.review || 0)}</span>
      <span class="is-muted"><b>대상 외</b> ${formatNumber(counts.ineligible || 0)}</span>
    </div>`;
}

function isBenefitQualificationOperator() {
  return Boolean(hub?.permissions?.canManageProgramActions);
}

function isPartnerBenefitCatalogViewer() {
  return hub?.viewer?.role === "b2b_partner";
}

function memberBenefitGroupsMarkup(benefits, viewerQualification) {
  const groups = [
    ["eligible", "지금 신청 가능", "현재 팀 상태와 확인된 제공 조건에 맞는 혜택입니다."],
    ["progress", "신청·활성화 진행", "이미 신청했거나 활성화가 완료된 혜택입니다."],
    ["review", "조건 확인 필요", "추가 정보 입력 또는 운영진·제공사 확인이 필요합니다."],
    ["ineligible", "현재 대상 외", "현재 팀 자격이나 확인된 조건에는 해당하지 않습니다."]
  ];
  return groups.map(([key, title, description]) => {
    const entries = benefits
      .map((benefit) => ({ benefit, status: classifyBenefitForViewer(benefit, viewerQualification) }))
      .filter((entry) => entry.status.key === key);
    if (!entries.length) return "";
    return benefitGroupMarkup(title, description, entries.map(({ benefit, status }) => benefitCardMarkup(benefit, { status })));
  }).join("");
}

function operatorBenefitGroupsMarkup(benefits, qualification) {
  if (qualification) {
    const title = `${benefitQualificationLabel(qualification)} 대상 혜택`;
    return benefitGroupMarkup(title, "해당 자격과 전체 팀 공통 혜택을 함께 표시합니다.", benefits.map((benefit) => benefitCardMarkup(benefit, { qualification: benefitTargetQualifications(benefit)[0] })));
  }
  const groups = [...BENEFIT_QUALIFICATIONS, "all"];
  return groups.map((target) => {
    const entries = benefits.filter((benefit) => benefitTargetQualifications(benefit)[0] === target);
    if (!entries.length) return "";
    return benefitGroupMarkup(`${benefitQualificationLabel(target)} 대상`, target === "all" ? "모든 프로그램 팀이 검토할 수 있는 공통 혜택입니다." : `${benefitQualificationLabel(target)} 단계에 맞춘 혜택입니다.`, entries.map((benefit) => benefitCardMarkup(benefit, { qualification: target })));
  }).join("");
}

function partnerBenefitCatalogMarkup(benefits) {
  return benefitGroupMarkup(
    "파트너 제공 사례",
    "Claw Member 대상 프로그램 혜택을 제공사와 제공 조건 중심으로 확인합니다.",
    benefits.map((benefit) => benefitCardMarkup(benefit, {
      qualification: benefitTargetQualifications(benefit)[0],
      catalogView: true
    }))
  );
}

function benefitGroupMarkup(title, description, cards) {
  return `<section class="benefit-qualification-group">
    <div class="benefit-qualification-head"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><span>${formatNumber(cards.length)}개</span></div>
    <div class="benefit-group-grid">${cards.join("")}</div>
  </section>`;
}

function benefitCardMarkup(benefit, { status = null, qualification = "", catalogView = false } = {}) {
  const application = benefit.viewerApplication;
  const verificationConfirmed = ["confirmed", "verified"].includes(String(benefit.verificationStatus || "confirmed").toLowerCase());
  const verification = verificationConfirmed ? "확인 완료" : benefit.verificationStatus === "pending" ? "제공 확인 중" : "신청 중지";
  const memberAction = hub.permissions?.canApplyBenefits
    ? benefitActionMarkup(benefit, application)
    : isPublicViewer()
      ? `<div class="program-card-action public-perk-action"><button class="secondary-button compact" data-open-member-access type="button">회원으로 신청·활성화</button></div>`
      : "";
  const count = hub.permissions?.canManageProgramActions
    ? `<span class="subtle-chip">신청 ${formatNumber(benefit.applications)}</span>`
    : application
      ? `<span class="subtle-chip">${escapeHtml(benefitApplicationStatusLabel(application.status))}</span>`
      : "";
  const targetLabel = qualification
    ? `${benefitQualificationLabel(qualification)} 대상`
    : benefitTargetQualifications(benefit).map(benefitQualificationLabel).join(" · ");
  const classification = status || { label: targetLabel, tone: qualification || "all" };
  return `
    <article class="benefit-card ${benefit.isActive ? "" : "is-inactive"}">
      <div class="benefit-card-head">
        ${benefitLogoMarkup(benefit)}
        <div class="benefit-card-badges">
          <span class="benefit-fit-tag is-${escapeHtml(classification.tone)}">${escapeHtml(classification.label)}</span>
          <span class="${benefit.isActive !== false && verificationConfirmed ? "status-tag" : "subtle-chip"}">${escapeHtml(verification)}</span>
        </div>
      </div>
      <div>
        <h2>${escapeHtml(benefit.title || "이름 없는 혜택")}</h2>
        <p class="benefit-provider-name">${escapeHtml(benefit.provider || "제공사 미입력")} · ${escapeHtml(benefit.category || "미분류")}</p>
      </div>
      <p class="benefit-summary">${escapeHtml(summarizeBenefit(benefit))}</p>
      ${catalogView
        ? `<p class="benefit-catalog-context">프로그램 제공 사례 · 신청은 Claw Member 대상</p>`
        : benefitEligibilityAssessmentMarkup(benefit)}
      <div class="benefit-card-footer">
        <span class="type-tag">${escapeHtml(benefit.tier || "Program benefit")}</span>
        ${count}
      </div>
      ${memberAction}
    </article>
  `;
}

function benefitActionMarkup(benefit, application) {
  if (!application) {
    return benefit.canApply && benefit.eligibilityRule === "google_cloud_2500_v1"
      ? `<div class="program-card-action google-benefit-action"><label><span>기존 Google Cloud 크레딧 수령액 (USD)</span><input data-prior-google-credits type="number" min="0" step="0.01" inputmode="decimal" required></label><label class="attestation-check"><input data-google-eligibility-attested type="checkbox"> 세 자격 조건과 입력 내용이 정확함을 확인합니다.</label><button class="primary-button compact" data-apply-benefit="${escapeHtml(benefit.id)}" type="button">자격 확인 후 신청</button></div>`
      : benefit.canApply
        ? `<div class="program-card-action"><button class="primary-button compact" data-apply-benefit="${escapeHtml(benefit.id)}" type="button">신청 의사 남기기</button><small>클릭 기록 후 제공사별 신청 경로를 안내합니다.</small></div>`
      : `<div class="program-card-action"><button class="secondary-button compact" type="button" disabled>현재 신청 불가</button></div>`;
  }
  const terminal = ["rejected", "cancelled", "fulfilled"].includes(application.status);
  const externalLink = benefit.applicationUrl && !terminal
    ? `<a class="primary-button compact" href="${escapeHtml(benefit.applicationUrl)}" target="_blank" rel="noopener noreferrer">제공사 신청 계속 ↗</a>`
    : "";
  const cancel = terminal
    ? ""
    : `<button class="secondary-button compact" data-cancel-benefit-application="${escapeHtml(application.id)}" type="button">신청 취소</button>`;
  return `<div class="program-card-action"><strong>${escapeHtml(benefitApplicationStatusLabel(application.status))}</strong><div>${externalLink}${cancel}</div></div>`;
}

function benefitEligibilityAssessmentMarkup(benefit) {
  if (benefit.eligibilityRule !== "google_cloud_2500_v1") return "";
  const assessment = benefit.eligibilityAssessment || {};
  if (assessment.status === "eligible") {
    return `<p class="eligibility-assessment is-ready">자격 조건 확인 완료 · 기존 크레딧 USD ${escapeHtml(formatNumber(assessment.inputs?.priorGoogleCreditsUsd || 0))}</p>`;
  }
  if (assessment.status === "attestation_required") {
    return `<p class="eligibility-assessment is-ready">법인 설립일과 웹사이트 확인 완료 · 기존 크레딧 수령액 확인이 필요합니다.</p>`;
  }
  const reasons = assessment.reasons || [];
  return `<p class="eligibility-assessment is-blocked">${escapeHtml(reasons.join(" ") || "Google Cloud 자격 정보를 운영진이 확인해야 합니다.")}</p>`;
}

const BENEFIT_BRAND_LOGOS = new Map([
  ["스파크플러스", "/arena/assets/benefit-logos/sparkplus.png"],
  ["sparkplus", "/arena/assets/benefit-logos/sparkplus.png"],
  ["spark plus", "/arena/assets/benefit-logos/sparkplus.png"],
  ["원티드랩", "/arena/assets/benefit-logos/wantedlab.png"],
  ["wantedlab", "/arena/assets/benefit-logos/wantedlab.png"],
  ["wanted lab", "/arena/assets/benefit-logos/wantedlab.png"],
  ["wanted", "/arena/assets/benefit-logos/wantedlab.png"],
  ["ab180", "/arena/assets/benefit-logos/ab180.png"],
  ["에이비180", "/arena/assets/benefit-logos/ab180.png"],
  ["에이비일팔공", "/arena/assets/benefit-logos/ab180.png"],
  ["flitto", "/arena/assets/benefit-logos/flitto.png"],
  ["플리토", "/arena/assets/benefit-logos/flitto.png"],
  ["github", "/arena/assets/benefit-logos/github.png"],
  ["github for startups", "/arena/assets/benefit-logos/github.png"]
]);

function benefitBrandLogoUrl(benefit) {
  const names = [benefit.provider, benefit.title];
  for (const name of names) {
    const normalized = String(name || "")
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("en-US")
      .replace(/\s+/g, " ");
    const logoUrl = BENEFIT_BRAND_LOGOS.get(normalized);
    if (logoUrl) return logoUrl;
  }
  return "";
}

function benefitLogoMarkup(benefit) {
  const logoUrl = benefitBrandLogoUrl(benefit) || benefit.logoUrl;
  if (logoUrl) {
    return `<img class="benefit-logo" src="${escapeHtml(logoUrl)}" alt="" loading="lazy">`;
  }
  return `<span class="benefit-logo-fallback">${escapeHtml((benefit.provider || benefit.title || "B").charAt(0).toUpperCase())}</span>`;
}

async function handleBenefitAction(event) {
  const applyButton = event.target.closest("[data-apply-benefit]");
  const cancelButton = event.target.closest("[data-cancel-benefit-application]");
  if ((!applyButton && !cancelButton) || programActionPending) return;
  const action = applyButton ? "applyBenefit" : "cancelBenefitApplication";
  const actionContainer = applyButton?.closest(".program-card-action");
  const payload = applyButton
    ? {
        benefitId: applyButton.dataset.applyBenefit,
        priorGoogleCreditsUsd: actionContainer?.querySelector("[data-prior-google-credits]")?.value,
        eligibilityAttested: Boolean(actionContainer?.querySelector("[data-google-eligibility-attested]")?.checked)
      }
    : { applicationId: cancelButton.dataset.cancelBenefitApplication };
  await runProgramAction(action, payload, "베네핏 신청 상태를 업데이트했습니다.", "benefits");
}

async function handleEventRegistrationAction(event) {
  const registerButton = event.target.closest("[data-register-event]");
  const cancelButton = event.target.closest("[data-cancel-event-registration]");
  if ((!registerButton && !cancelButton) || programActionPending) return;
  const action = registerButton ? "registerEvent" : "cancelEventRegistration";
  const payload = registerButton
    ? { eventId: registerButton.dataset.registerEvent }
    : { registrationId: cancelButton.dataset.cancelEventRegistration };
  await runProgramAction(action, payload, "RSVP 상태를 업데이트했습니다.", "calendar");
}

async function handleEventQueueAction(event) {
  const button = event.target.closest("[data-event-registration-status]");
  if (!button || programActionPending) return;
  await runProgramAction(
    "updateEventRegistration",
    { registrationId: button.dataset.registrationId, status: button.dataset.eventRegistrationStatus },
    "RSVP 상태를 업데이트했습니다.",
    "operations"
  );
}

async function handleWeeklyReportSubmit(event) {
  event.preventDefault();
  if (programActionPending || !hub?.permissions?.canSubmitWeeklyReport) return;
  const payload = Object.fromEntries(new FormData(els.weeklyReportForm).entries());
  setInlineStatus(els.weeklyReportStatus, "주간 리포트를 제출하는 중입니다.");
  const saved = await runProgramAction(
    "submitWeeklyReport",
    payload,
    "주간 리포트를 제출했습니다.",
    "workspace",
    els.weeklyReportStatus
  );
  if (saved) {
    els.weeklyReportForm.reset();
    hydrateWeeklyReportPeriod();
  }
}

async function handleWeeklyReportQueueAction(event) {
  const button = event.target.closest("[data-weekly-report-status]");
  if (!button || programActionPending) return;
  await runProgramAction(
    "updateWeeklyReportStatus",
    { reportId: button.dataset.reportId, status: button.dataset.weeklyReportStatus },
    "주간 리포트 상태를 업데이트했습니다.",
    "operations"
  );
}

function renderEventRegistrationQueue() {
  if (!els.eventRegistrationQueue || !hub?.permissions?.canManageProgramActions) return;
  const registrations = hub.programQueues?.eventRegistrations || hub.eventRegistrations || [];
  els.eventRegistrationQueue.innerHTML = registrations.length
    ? registrations.map((registration) => `<article class="program-queue-item">
        <div><strong>${escapeHtml(registration.teamName || "Team")} · ${escapeHtml(registration.eventTitle || "Event")}</strong><span>${escapeHtml(eventRegistrationStatusLabel(registration.status))} · ${escapeHtml(formatDate(registration.registeredAt || registration.updatedAt))}</span></div>
        <div class="queue-actions">
          <button data-registration-id="${escapeHtml(registration.id)}" data-event-registration-status="attended" type="button">참석</button>
          <button data-registration-id="${escapeHtml(registration.id)}" data-event-registration-status="no_show" type="button">불참</button>
          <button data-registration-id="${escapeHtml(registration.id)}" data-event-registration-status="cancelled" type="button">취소</button>
        </div>
      </article>`).join("")
    : `<p class="empty-copy">접수된 RSVP가 없습니다.</p>`;
}

function renderWeeklyReporting() {
  if (els.programWorkspaceDetails) els.programWorkspaceDetails.hidden = true;
  const staff = Boolean(hub?.permissions?.canManageProgramActions);

  if (els.weeklyReportQueue) {
    const reports = hub.programQueues?.weeklyReports || [];
    els.weeklyReportQueue.innerHTML = staff
      ? reports.length
        ? reports.map(weeklyReportQueueMarkup).join("")
        : `<p class="empty-copy">접수된 주간 리포트가 없습니다.</p>`
      : "";
  }
}

function renderCollaborationReviews() {
  if (!els.incomingCollaborationReviews || !els.outgoingCollaborationReviews) return;
  const reviews = Array.isArray(hub?.collaborationReviews) ? hub.collaborationReviews : [];
  const incoming = reviews.filter((item) => item.direction === "incoming");
  const outgoing = reviews.filter((item) => item.direction === "outgoing");
  const pending = incoming.filter((item) => item.status === "pending").length;
  if (els.collaborationReviewPendingCount) {
    els.collaborationReviewPendingCount.textContent = `답변 대기 ${formatNumber(pending)}`;
    els.collaborationReviewPendingCount.classList.toggle("has-pending", pending > 0);
  }
  els.incomingCollaborationReviews.innerHTML = incoming.length
    ? incoming.map((review) => collaborationReviewMarkup(review, true)).join("")
    : `<p class="empty-copy">아직 받은 협업 검토 요청이 없습니다.</p>`;
  els.outgoingCollaborationReviews.innerHTML = outgoing.length
    ? outgoing.map((review) => collaborationReviewMarkup(review, false)).join("")
    : `<p class="empty-copy">아직 보낸 협업 검토 요청이 없습니다.</p>`;
}

function collaborationReviewMarkup(review, incoming) {
  const counterpart = incoming ? review.requesterTeamName : review.targetTeamName;
  const counterpartLabel = incoming ? "요청한 팀" : "검토받을 팀";
  const responseCopy = review.status === "approved"
    ? "대상 스타트업의 동의가 확인되었습니다. SparkLabs가 소개 범위와 다음 단계를 확인합니다."
    : review.status === "declined"
      ? "이번 요청은 종료되었습니다. 거절 사유와 연락처는 공개하지 않습니다."
      : incoming
        ? "내 팀의 답변을 기다리고 있습니다."
        : "상대 팀 My Log에서 답변을 기다리고 있습니다.";
  return `<article class="program-queue-item collaboration-review-item is-${escapeHtml(review.status || "pending")}">
    <div>
      <strong>${escapeHtml(counterpartLabel)} · ${escapeHtml(counterpart || "Team")}</strong>
      <span>${escapeHtml(collaborationReviewStatusLabel(review.status))} · ${escapeHtml(formatDate(review.updatedAt || review.createdAt))}</span>
      <p>${escapeHtml(review.purpose || "협업 가능성 검토 요청")}</p>
      <small>${escapeHtml(responseCopy)}</small>
    </div>
    ${review.canRespond ? `<div class="queue-actions collaboration-review-actions">
      <button data-collaboration-review-id="${escapeHtml(review.id)}" data-collaboration-review-status="approved" type="button">협업 검토 승인</button>
      <button data-collaboration-review-id="${escapeHtml(review.id)}" data-collaboration-review-status="declined" type="button">정중히 거절</button>
    </div>` : ""}
  </article>`;
}

function collaborationReviewStatusLabel(status) {
  return ({ pending: "상대 팀 답변 대기", approved: "협업 검토 승인", declined: "협업 검토 거절" })[status] || status || "답변 대기";
}

function weeklyReportQueueMarkup(report) {
  const details = [report.progress, report.nextSteps, report.blockers].filter(Boolean).join(" · ");
  return `<article class="program-queue-item">
    <div><strong>${escapeHtml(report.teamName || "Team")} · ${escapeHtml(report.weekLabel || "주간 리포트")}</strong><span>${escapeHtml(weeklyReportStatusLabel(report.status))} · ${escapeHtml(formatDate(report.updatedAt || report.submittedAt))}</span>${details ? `<p>${escapeHtml(details)}</p>` : ""}</div>
    <div class="queue-actions">
      <button data-report-id="${escapeHtml(report.id)}" data-weekly-report-status="reviewed" type="button">검토 완료</button>
      <button data-report-id="${escapeHtml(report.id)}" data-weekly-report-status="needs_update" type="button">보완 요청</button>
    </div>
  </article>`;
}

function hydrateWeeklyReportPeriod() {
  if (!els.weeklyReportForm) return;
  const input = els.weeklyReportForm.elements.weekLabel;
  if (input && !input.value) input.value = currentIsoWeekLabel();
}

function currentIsoWeekLabel() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}년 ${week}주차`;
}

async function runProgramAction(action, payload, successMessage, page, statusElement = null) {
  programActionPending = true;
  const progressHost = statusElement || els.globalProcessStatus;
  const progressToken = startProcessStatus(progressHost, PROGRAM_ACTION_PROGRESS_STEPS, {
    announcement: "요청 처리를 시작했습니다."
  });
  try {
    const result = await postProgramAction(action, payload);
    hub = result.snapshot;
    renderHub();
    if (page) showPage(page);
    finishProcessStatus(progressHost, progressToken, statusElement ? successMessage : "", "success");
    showToast(successMessage);
    return true;
  } catch (error) {
    finishProcessStatus(progressHost, progressToken, statusElement ? error.message : "", "error");
    showToast(error.message);
    return false;
  } finally {
    programActionPending = false;
  }
}

async function postProgramAction(action, payload = {}, options = {}) {
  const response = await fetch("/api/program-hub", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ action, payload }),
    signal: options.signal
  });
  const result = await safeJson(response);
  if (!response.ok) throw new Error(result?.error || "프로그램 요청을 처리하지 못했습니다.");
  return result;
}

function benefitApplicationStatusLabel(status) {
  return ({ interest: "신청 의사 접수", link_sent: "신청 링크 안내", submitted: "제공사 신청 완료", approved: "승인", rejected: "반려", fulfilled: "혜택 지급 완료", cancelled: "취소" })[status] || status || "접수";
}

function eventRegistrationStatusLabel(status) {
  return ({ registered: "RSVP 신청 완료", attended: "참석", no_show: "불참", cancelled: "RSVP 취소" })[status] || status || "신청";
}

function weeklyReportStatusLabel(status) {
  return ({ submitted: "검토 대기", needs_update: "보완 요청", reviewed: "검토 완료" })[status] || status || "제출";
}

function renderOperations() {
  if (!hub.permissions?.canViewOperations || !hub.dataHealth) return;
  els.profileHealth.innerHTML = (hub.dataHealth.profileCompleteness || [])
    .map(
      (item, index) => {
        const missingTeams = (Array.isArray(item.missingTeams) ? item.missingTeams : [])
          .map((teamName) => String(teamName || "").trim())
          .filter(Boolean);
        const tooltipId = `profile-health-missing-${index}`;
        const tooltip = missingTeams.length
          ? `<div id="${tooltipId}" class="health-missing-tooltip" role="tooltip">
              <strong>아직 입력하지 않은 팀 ${formatNumber(missingTeams.length)}개</strong>
              <ul>${missingTeams.map((teamName) => `<li>${escapeHtml(teamName)}</li>`).join("")}</ul>
            </div>`
          : "";
        return `
        <div class="health-row${missingTeams.length ? " has-missing" : " is-complete"}"${missingTeams.length ? ` tabindex="0" aria-describedby="${tooltipId}"` : ""}>
          <span>${escapeHtml(item.label)}</span>
          <div class="health-track"><i style="width:${Math.max(0, Math.min(100, item.percent))}%"></i></div>
          <strong>${formatNumber(item.complete)}/${formatNumber(item.total)}</strong>
          ${tooltip}
        </div>
      `;
      }
    )
    .join("");
  els.tableCounts.innerHTML = Object.entries(hub.dataHealth.tableCounts || {})
    .map(
      ([table, count]) => `
        <div class="table-count-card">
          <strong>${formatNumber(count)}</strong>
          <span title="${escapeHtml(table)}">${escapeHtml(TABLE_LABELS[table] || table)}</span>
        </div>
      `
    )
    .join("");
  renderTeamActivity();
  renderEventRegistrationQueue();
}

function renderTeamActivity() {
  if (!hub?.permissions?.canViewOperations) return;
  const query = normalize(els.operationSearch.value);
  const teams = (hub.teams || []).filter((team) =>
    !query ? true : normalize([team.name, team.companyName, team.sector, team.founder].join(" ")).includes(query)
  );
  els.teamActivityBody.innerHTML = teams.length
    ? teams
        .map((team) => {
          const activity = team.activity || {};
          return `
            <tr>
              <td title="${escapeHtml(team.name)}">${escapeHtml(team.name)}</td>
              <td>${formatNumber(activity.mentoringSessions)}</td>
              <td>${formatNumber(activity.hypotheses)}</td>
              <td>${formatNumber(Math.max(activity.interviews || 0, activity.reportedInterviews || 0))}</td>
              <td>${formatNumber(activity.pmfResponses)}</td>
              <td>${formatNumber(activity.eventRegistrations)}</td>
              <td>${formatNumber(activity.benefitApplications)}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="7">조건에 맞는 팀이 없습니다.</td></tr>`;
}

async function loadDatabaseSchema() {
  if (!hub?.permissions?.canViewRawDatabase) return;
  const progressToken = startProcessStatus(els.databaseStatus, DATABASE_PROGRESS_STEPS, {
    announcement: "원본 데이터베이스 구조를 조회하고 있습니다."
  });
  try {
    const response = await fetch("/api/program-database", { headers: authHeaders() });
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(payload?.error || "DB 스키마를 불러오지 못했습니다.");
    databaseSchema = payload;
    els.databaseTableSelect.innerHTML = `
      <option value="">테이블 선택</option>
      ${(payload.tables || [])
        .map((table) => `<option value="${escapeHtml(table.name)}">${escapeHtml(TABLE_LABELS[table.name] || table.name)}</option>`)
        .join("")}
    `;
    finishProcessStatus(
      els.databaseStatus,
      progressToken,
      `${formatNumber(payload.tables?.length || 0)}개 테이블 · 읽기 전용`,
      "success"
    );
  } catch (error) {
    finishProcessStatus(els.databaseStatus, progressToken, error.message, "error");
  }
}

async function loadApplicantExportMetadata() {
  if (!hub?.permissions?.canViewRawDatabase) return;
  const progressToken = startProcessStatus(els.applicantExportStatus, DATABASE_PROGRESS_STEPS, {
    announcement: "전체 지원자 파일 정보를 조회하고 있습니다."
  });
  try {
    const response = await fetch("/api/sparkclaw-applicants-export?format=metadata", {
      headers: { ...authHeaders(), Accept: "application/json" }
    });
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(payload?.error || "지원자 파일 정보를 불러오지 못했습니다.");
    applicantExportMetadata = payload;
    setText(els.applicantExportApplicationCount, formatNumber(payload.applicationCount || 0));
    setText(els.applicantExportUniqueCount, formatNumber(payload.uniqueTeamCount || 0));
    setText(els.applicantExportDuplicateCount, formatNumber(payload.duplicateApplicationCount || 0));
    finishProcessStatus(
      els.applicantExportStatus,
      progressToken,
      `${formatNumber(payload.applicationCount || 0)}건 · ${formatNumber(payload.uniqueTeamCount || 0)}개 유니크 팀`,
      "success"
    );
  } catch (error) {
    finishProcessStatus(els.applicantExportStatus, progressToken, error.message, "error");
  }
}

async function handleApplicantExportDownload(event) {
  const button = event.currentTarget;
  const format = button.dataset.applicantExportFormat;
  const buttons = document.querySelectorAll("[data-applicant-export-format]");
  buttons.forEach((control) => {
    control.disabled = true;
  });
  const progressToken = startProcessStatus(
    els.applicantExportStatus,
    [
      `${format.toUpperCase()} 내보내기 권한을 확인하고 있습니다.`,
      "지원자 레코드를 안전하게 파일로 구성하고 있습니다.",
      "다운로드를 준비하고 있습니다."
    ],
    { announcement: `${format.toUpperCase()} 지원자 파일을 준비하고 있습니다.` }
  );
  try {
    const response = await fetch(`/api/sparkclaw-applicants-export?format=${encodeURIComponent(format)}`, {
      headers: authHeaders()
    });
    if (!response.ok) {
      const payload = await safeJson(response);
      throw new Error(payload?.error || "지원자 목록을 다운로드하지 못했습니다.");
    }
    const blob = await response.blob();
    const fileName =
      response.headers.get("content-disposition")?.match(/filename="([^"]+)"/i)?.[1] ||
      `SparkClaw_full_applicant_list.${format}`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    finishProcessStatus(els.applicantExportStatus, progressToken, `${fileName} 다운로드를 시작했습니다.`, "success");
  } catch (error) {
    finishProcessStatus(els.applicantExportStatus, progressToken, error.message, "error");
  } finally {
    buttons.forEach((control) => {
      control.disabled = false;
    });
  }
}

async function loadSelectedDatabaseTable() {
  const table = els.databaseTableSelect.value;
  const limit = els.databaseLimitSelect.value;
  if (!table) {
    setDatabaseStatus("조회할 테이블을 선택하세요.", "error");
    return;
  }
  const progressToken = startProcessStatus(
    els.databaseStatus,
    [
      `${TABLE_LABELS[table] || table} 테이블의 접근 권한을 확인하고 있습니다.`,
      `최대 ${limit}개 행을 안전하게 조회하고 있습니다.`,
      "열 구조와 조회 결과를 정리하고 있습니다."
    ],
    { announcement: `${TABLE_LABELS[table] || table} 데이터를 조회하고 있습니다.` }
  );
  els.databaseLoadButton.disabled = true;
  try {
    const url = `/api/program-database?table=${encodeURIComponent(table)}&limit=${encodeURIComponent(limit)}`;
    const response = await fetch(url, { headers: authHeaders() });
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(payload?.error || "테이블을 읽지 못했습니다.");
    renderRawDatabaseTable(payload);
    finishProcessStatus(
      els.databaseStatus,
      progressToken,
      `${formatNumber(payload.rows?.length || 0)}행 표시 · 전체 ${formatNumber(payload.totalCount ?? payload.rows?.length ?? 0)}행`,
      "success"
    );
  } catch (error) {
    els.databaseTable.innerHTML = "";
    els.databaseSummary.innerHTML = "";
    finishProcessStatus(els.databaseStatus, progressToken, error.message, "error");
  } finally {
    els.databaseLoadButton.disabled = false;
  }
}

function renderRawDatabaseTable(payload) {
  const columns = payload.selectedTable?.columns || [];
  const rows = payload.rows || [];
  els.databaseSummary.innerHTML = columns
    .map((column) => `<span>${escapeHtml(column.name)} · ${escapeHtml(column.type)}</span>`)
    .join("");
  els.databaseTable.innerHTML = `
    <thead><tr>${columns.map((column) => `<th>${escapeHtml(column.name)}</th>`).join("")}</tr></thead>
    <tbody>
      ${
        rows.length
          ? rows
              .map(
                (row) =>
                  `<tr>${columns.map((column) => `<td>${escapeHtml(prettyValue(row[column.name]))}</td>`).join("")}</tr>`
              )
              .join("")
          : `<tr><td colspan="${Math.max(1, columns.length)}">등록된 데이터가 없습니다.</td></tr>`
      }
    </tbody>
  `;
}

async function handlePublicBriefSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const isPartnerProfileUpdate = form.dataset.mode === "partner-profile-update";
  const discoveryCopy = publicBriefCopy(publicBriefLanguage);
  if (form.getAttribute("aria-busy") === "true") return;
  const fields = new FormData(form);
  const payload = {
    organization: String(fields.get("organization") || "").trim(),
    website: String(fields.get("website") || "").trim(),
    contactName: String(fields.get("contactName") || "").trim(),
    email: String(fields.get("email") || "").trim(),
    problem: String(fields.get("problem") || "").trim(),
    successMetric: String(fields.get("successMetric") || "").trim(),
    constraints: String(fields.get("constraints") || "").trim(),
    deadline: String(fields.get("deadline") || "").trim(),
    budgetRange: String(fields.get("budgetRange") || "").trim(),
    procurementPath: String(fields.get("procurementPath") || "").trim(),
    requestType: isPartnerProfileUpdate ? "partner_profile_update" : "public_discovery_brief",
    consent: fields.get("consent") === "on",
    companyUrl: String(fields.get("companyUrl") || "").trim()
  };
  if (!payload.consent) {
    setInlineStatus(
      els.publicBriefStatus,
      isPartnerProfileUpdate ? "Brief 검토를 위한 정보 처리 동의가 필요합니다." : discoveryCopy.messages.consentRequired,
      "error"
    );
    return;
  }

  const progressToken = startProcessStatus(els.publicBriefStatus, isPartnerProfileUpdate ? PARTNER_PROFILE_UPDATE_PROGRESS_STEPS : PUBLIC_BRIEF_PROGRESS_STEPS, {
    announcement: isPartnerProfileUpdate ? "니즈 업데이트 요청을 안전하게 접수하기 시작했습니다." : discoveryCopy.messages.submitting,
    interval: 1600
  });
  form.setAttribute("aria-busy", "true");
  disableForm(form, true);
  try {
    const response = await fetch("/api/arena-public", {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json", ...authHeaders() },
      body: JSON.stringify(payload)
    });
    const result = await safeJson(response);
    if (!response.ok || result?.ok === false) {
      throw new Error(publicBriefLanguage === "en" && !isPartnerProfileUpdate ? discoveryCopy.messages.failure : (result?.error || "Brief를 접수하지 못했습니다."));
    }
    form.reset();
    if (isPartnerProfileUpdate) renderPartnerBriefExperience(partnerProfileForViewer());
    finishProcessStatus(
      els.publicBriefStatus,
      progressToken,
      isPartnerProfileUpdate
        ? "니즈 업데이트 요청을 접수했습니다. SparkLabs가 현재 프로필과 함께 확인한 뒤 추천·소개 기준에 반영합니다."
        : discoveryCopy.messages.success,
      "success"
    );
  } catch (error) {
    finishProcessStatus(
      els.publicBriefStatus,
      progressToken,
      error.message || (isPartnerProfileUpdate ? "니즈 업데이트 요청을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요." : discoveryCopy.messages.failure),
      "error"
    );
  } finally {
    disableForm(form, false);
    form.setAttribute("aria-busy", "false");
  }
}

function scrollToTarget(id) {
  const target = id ? document.getElementById(id) : null;
  if (!target) return;
  if (!document.querySelector('[data-page-panel="overview"]')?.classList.contains("is-active")) showPage("overview");
  window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function prepareBriefForCompany(companyName) {
  closeTeamDialog({ historyMode: "none" });
  showPage("overview");
  const problem = els.publicBriefForm?.elements?.problem;
  if (problem && !problem.value.trim()) {
    problem.value = `${companyName || "선택한 AI 회사"}와의 협업 가능성을 검토하고 싶습니다. 해결하려는 업무 문제는 다음과 같습니다: `;
  }
  window.requestAnimationFrame(() => {
    els.publicBriefSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    problem?.focus({ preventScroll: true });
  });
}

async function handleRefresh() {
  els.refreshButton.classList.add("is-spinning");
  els.refreshButton.disabled = true;
  const progressToken = startProcessStatus(els.globalProcessStatus, REFRESH_PROGRESS_STEPS, {
    announcement: "AI Arena의 최신 데이터를 불러오고 있습니다.",
    interval: 1500
  });
  try {
    if (isAuthenticatedViewer()) await loadProgramHub({ allowRefresh: true });
    else showLogin("세션이 만료되었습니다. 다시 로그인해 주세요.");
    if (isAuthenticatedViewer() && document.querySelector('[data-page-panel="database"]').classList.contains("is-active")) {
      await Promise.all([loadDatabaseSchema(), loadApplicantExportMetadata()]);
    }
  } catch (error) {
    showToast(error.message || "새로고침에 실패했습니다.");
  } finally {
    finishProcessStatus(els.globalProcessStatus, progressToken);
    els.refreshButton.classList.remove("is-spinning");
    els.refreshButton.disabled = false;
  }
}

async function handleLogout() {
  programHubLoadGeneration += 1;
  window.dispatchEvent(new CustomEvent("spark-arena:discovery-reset"));
  if (authSession?.access_token && authConfig?.authConfigured) {
    fetch(`${authConfig.supabaseUrl}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: authConfig.supabaseAnonKey,
        Authorization: `Bearer ${authSession.access_token}`
      }
    }).catch(() => {});
  }
  clearStoredSession();
  hub = null;
  arenaData = null;
  marketData = null;
  selectedArenaChallengeId = "";
  databaseSchema = null;
  applicantExportMetadata = null;
  resetEventRecommendationState();
  featuredSpotlightEntries = [];
  featuredSpotlightRequestKey = "";
  featuredSpotlightActiveIndex = 0;
  latestArenaAnnouncement = null;
  arenaAnnouncementRequestId += 1;
  stopFeaturedSpotlightRotation();
  resetCollaborationFitReasonState();
  arenaGuide.reset();
  closeTeamDialog({ historyMode: "none" });
  closeAllHistoryOverlays();
  showPublicBriefGate("로그아웃되었습니다. 회원 기능을 다시 이용하려면 로그인해 주세요.", "success", { historyMode: "replace" });
}

function showApp() {
  mountPublicBrief("authenticated");
  closeMemberAccess({ restoreFocus: false });
  document.body.classList.remove("is-public-brief-view");
  document.documentElement.lang = "ko";
  document.documentElement.dir = "ltr";
  els.homeButton?.setAttribute("aria-label", publicBriefCopy("ko").homeLabel);
  if (els.publicBriefLanguageSwitch) els.publicBriefLanguageSwitch.hidden = true;
  els.publicBriefGate.hidden = true;
  els.programApp.hidden = false;
  els.primaryNav.hidden = false;
  els.refreshButton.hidden = false;
  els.accountMenu.hidden = false;
  els.memberAccessButton.hidden = true;
  arenaGuide.setVisible(true);
  const historyState = window.history.state;
  if (isArenaHistoryForViewer(historyState)) {
    if (historyState.kind === "team-dialog") closeTeamDialog({ historyMode: "none" });
    if (historyState.kind === "overlay") closeAllHistoryOverlays();
    showPage(historyState.page || "overview", {
      navTarget: historyState.navTarget || "",
      historyMode: "none",
      restoreScrollY: historyState.scrollY
    });
    if (historyState.kind === "team-dialog") restoreTeamDialogFromHistory(historyState);
    if (historyState.kind === "overlay") restoreArenaOverlayFromHistory(historyState);
  } else {
    showPage("overview", { historyMode: "replace", restoreScrollY: 0 });
  }
}

function showPublicBriefGate(message = "", tone = "", { historyMode = "none" } = {}) {
  renderPartnerBriefExperience(null);
  mountPublicBrief("public");
  closeMemberAccess({ restoreFocus: false });
  setEcosystemSwitcherOpen(false);
  els.ecosystemSwitcher?.classList.remove("is-enabled");
  els.homeButton?.setAttribute("aria-haspopup", "false");
  document.body.classList.add("is-public-brief-view");
  els.publicBriefGate.hidden = false;
  els.programApp.hidden = true;
  els.primaryNav.hidden = true;
  els.refreshButton.hidden = true;
  els.accountMenu.hidden = true;
  if (els.publicBriefLanguageSwitch) els.publicBriefLanguageSwitch.hidden = false;
  els.memberAccessButton.hidden = false;
  arenaGuide.setVisible(false);
  applyPublicBriefLanguage();
  document.querySelector("[data-public-brief-login]")?.removeAttribute("hidden");
  if (message) setAuthStatus(message, tone);
  if (historyMode === "replace") replacePublicArenaHistory();
}

function mountPublicBrief(target) {
  const mount = target === "public" ? els.publicBriefPublicMount : els.publicBriefAuthenticatedMount;
  if (!mount || !els.publicBriefSection || els.publicBriefSection.parentElement === mount) return;
  mount.append(els.publicBriefSection);
  const loginPrompt = els.publicBriefSection.querySelector("[data-public-brief-login]");
  if (loginPrompt) loginPrompt.hidden = target !== "public";
}

function showLogin(message = "", tone = "") {
  showPublicBriefGate();
  openMemberAccess();
  if (message) setAuthStatus(message, tone);
}

function bindPrimaryNavigation() {
  const menus = [...document.querySelectorAll("[data-nav-menu]")];
  const compactNavigation = () => window.matchMedia("(hover: none), (pointer: coarse), (max-width: 900px)").matches;

  const setMenuOpen = (menu, open) => {
    if (!menu) return;
    menu.classList.toggle("is-open", open);
    menu.querySelector(":scope > .nav-link")?.setAttribute("aria-expanded", String(open));
  };

  const closeMenus = (except = null) => {
    menus.forEach((menu) => {
      if (menu !== except) setMenuOpen(menu, false);
    });
  };

  menus.forEach((menu) => {
    const trigger = menu.querySelector(":scope > .nav-link");
    const links = [...menu.querySelectorAll(".nav-dropdown-link")];
    if (!trigger || !links.length) return;

    trigger.addEventListener("click", (event) => {
      if (compactNavigation() && !menu.classList.contains("is-open")) {
        event.preventDefault();
        closeMenus(menu);
        setMenuOpen(menu, true);
        return;
      }
      closeMenus();
      showPage(trigger.dataset.page);
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        closeMenus(menu);
        setMenuOpen(menu, true);
        links.find((link) => !link.hidden)?.focus();
      } else if (event.key === "Escape") {
        closeMenus();
      }
    });

    menu.addEventListener("mouseenter", () => {
      if (!compactNavigation()) {
        closeMenus(menu);
        setMenuOpen(menu, true);
      }
    });
    menu.addEventListener("mouseleave", () => {
      if (!compactNavigation()) setMenuOpen(menu, false);
    });
    menu.addEventListener("focusin", (event) => {
      if (compactNavigation() && event.target === trigger && !menu.classList.contains("is-open")) return;
      closeMenus(menu);
      setMenuOpen(menu, true);
    });
    menu.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (!menu.contains(document.activeElement)) setMenuOpen(menu, false);
      }, 0);
    });

    links.forEach((link) => {
      link.addEventListener("click", () => {
        const page = link.dataset.navPage;
        const target = link.dataset.navTarget;
        closeMenus();
        showPage(page, { navTarget: target || "" });
        if (target) {
          window.requestAnimationFrame(() => {
            document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      });
      link.addEventListener("keydown", (event) => {
        const visibleLinks = links.filter((item) => !item.hidden);
        const currentIndex = visibleLinks.indexOf(link);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const nextIndex = event.key === "Home"
            ? 0
            : event.key === "End"
              ? visibleLinks.length - 1
              : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + visibleLinks.length) % visibleLinks.length;
          visibleLinks[nextIndex]?.focus();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setMenuOpen(menu, false);
          trigger.focus();
        }
      });
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-nav-menu]")) closeMenus();
  });
  window.addEventListener("resize", () => closeMenus());
  window.__closePrimaryNavigationMenus = closeMenus;
}

function closePrimaryNavigationMenus() {
  if (typeof window.__closePrimaryNavigationMenus === "function") window.__closePrimaryNavigationMenus();
}

function openMemberAccess() {
  if (isAuthenticatedViewer()) return;
  if (!authConfig?.authConfigured) {
    setAuthStatus(
      publicBriefLanguage === "en"
        ? "Member login is unavailable. Please contact the SparkLabs team."
        : "회원 로그인 설정을 확인할 수 없습니다. 운영진에게 문의해 주세요.",
      "error"
    );
  }
  if (!els.loginGate.hidden) return;
  memberAccessReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  els.loginGate.hidden = false;
  document.body.classList.add("member-access-open");
  window.requestAnimationFrame(() => els.loginForm.querySelector('input[name="email"]')?.focus({ preventScroll: true }));
}

function closeMemberAccess({ restoreFocus = true } = {}) {
  if (els.loginGate.hidden) return;
  els.loginGate.hidden = true;
  document.body.classList.remove("member-access-open");
  if (restoreFocus && memberAccessReturnFocus?.isConnected) memberAccessReturnFocus.focus();
  memberAccessReturnFocus = null;
}

function trapMemberAccessFocus(event) {
  const focusable = [...els.loginGate.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')].filter(
    (element) => !element.hidden && element.tabIndex >= 0 && element.getAttribute("aria-hidden") !== "true"
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setCurrentNavigationItem(pageName, target = "") {
  document.querySelectorAll("[data-nav-page]").forEach((button) => {
    const current = button.dataset.navPage === pageName && (button.dataset.navTarget || "") === target;
    button.classList.toggle("is-current", current);
    if (current) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function showPage(pageName, { navTarget = "", historyMode = "push", restoreScrollY = null, skipScroll = false } = {}) {
  if (!hub || !isAuthenticatedViewer()) {
    showLogin("AI Arena 콘텐츠를 보려면 로그인해 주세요.");
    return;
  }
  if (pageName === "community" && !COMMUNITY_ROLES.has(hub.viewer?.role || "public")) {
    if (isPublicViewer()) openMemberAccess();
    else showToast("Community는 승인된 Arena 회원과 기업 파트너가 이용할 수 있습니다.");
    return;
  }
  if ((isClawMemberViewer() || isAdminViewer()) && ["calendar", "benefits"].includes(pageName)) {
    pageName = "overview";
    navTarget = "";
    showToast(
      isAdminViewer()
        ? "SparkLabs 관리자 화면에서는 Events & Perks를 표시하지 않습니다."
        : "Events & Perks는 기존 SparkClaw 프로그램 사이트에서 확인해 주세요."
    );
  }
  if (isClawMemberViewer() && pageName === "partnerships") {
    pageName = "overview";
    navTarget = "";
    showToast("Claw Member의 기업 간 협업은 기업 상세의 협업 검토 요청과 My Log에서 진행해 주세요.");
  }
  if (isAdminViewer() && ["discover", "passports"].includes(pageName)) {
    pageName = "overview";
    navTarget = "";
  }
  if (pageName === "operations") {
    pageName = "workspace";
    navTarget = "";
  }
  if (pageName === "database" && !hub.permissions?.canViewRawDatabase) pageName = "overview";
  const navigationButton = document.querySelector(`[data-page="${CSS.escape(pageName)}"]`);
  if (navigationButton?.hidden) pageName = "overview";
  renderHubPage(pageName);
  document.querySelectorAll("[data-page-panel]").forEach((panel) => {
    const active = panel.dataset.pagePanel === pageName;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  const bountyNavigation = ["bountyBriefPanel", "partnershipPipelinePanel", "arenaBountyBoard", "arenaMyStatusPanel", "arenaStaffPanel"].includes(navTarget);
  const primaryPage = bountyNavigation ? "arena" : primaryPageFor(pageName);
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.page === primaryPage);
  });
  setCurrentNavigationItem(pageName, navTarget);
  closePrimaryNavigationMenus();
  activeArenaPage = pageName;
  activeArenaNavTarget = navTarget;
  if (pageName === "overview") loadLatestArenaAnnouncement();
  if (pageName === "database") {
    if (!databaseSchema) loadDatabaseSchema();
    if (!applicantExportMetadata) loadApplicantExportMetadata();
  }
  if (pageName === "calendar") queueMicrotask(() => requestEventRecommendations());
  window.dispatchEvent(new CustomEvent("spark-arena:page", { detail: { page: pageName } }));
  syncArenaPageHistory(pageName, navTarget, historyMode);
  if (!skipScroll) {
    const nextScrollY = Number.isFinite(Number(restoreScrollY)) ? Math.max(0, Number(restoreScrollY)) : 0;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: nextScrollY, behavior: historyMode === "none" ? "auto" : "smooth" });
    });
  }
}

function arenaViewerKey() {
  return String(authSession?.user?.id || hub?.viewer?.teamId || hub?.viewer?.id || hub?.viewer?.role || "");
}

function arenaPageUrl(pageName) {
  const url = new URL(window.location.href);
  url.hash = ARENA_PAGE_HASHES[pageName] || ARENA_PAGE_HASHES.overview;
  return `${url.pathname}${url.search}${url.hash}`;
}

function isArenaHistoryForViewer(state) {
  return Boolean(
    state
    && state.marker === ARENA_HISTORY_MARKER
    && state.viewerKey
    && state.viewerKey === arenaViewerKey()
    && ARENA_PAGE_HASHES[state.page]
  );
}

function preserveCurrentArenaScroll() {
  const state = window.history.state;
  if (!isArenaHistoryForViewer(state)) return;
  window.history.replaceState(
    { ...state, scrollY: Math.max(0, Math.round(window.scrollY || 0)) },
    "",
    window.location.href
  );
}

function arenaPageHistoryState(pageName, navTarget = "", scrollY = 0) {
  return {
    marker: ARENA_HISTORY_MARKER,
    kind: "page",
    viewerKey: arenaViewerKey(),
    page: pageName,
    navTarget,
    scrollY: Math.max(0, Math.round(Number(scrollY) || 0))
  };
}

function syncArenaPageHistory(pageName, navTarget, historyMode) {
  if (historyMode === "none" || restoringArenaHistory || !arenaViewerKey()) return;
  const nextState = arenaPageHistoryState(pageName, navTarget, 0);
  const current = window.history.state;
  const samePage = isArenaHistoryForViewer(current)
    && current.kind === "page"
    && current.page === pageName
    && (current.navTarget || "") === (navTarget || "");
  if (historyMode === "replace" || samePage) {
    window.history.replaceState(nextState, "", arenaPageUrl(pageName));
    return;
  }
  preserveCurrentArenaScroll();
  window.history.pushState(nextState, "", arenaPageUrl(pageName));
}

function recordTeamDialogHistory(event) {
  if (restoringArenaHistory || !isAuthenticatedViewer() || !event.detail?.id) return;
  const current = window.history.state;
  if (isArenaHistoryForViewer(current)
      && current.kind === "team-dialog"
      && current.dialogId === String(event.detail.id)
      && current.dialogSource === String(event.detail.source || "market")) return;
  preserveCurrentArenaScroll();
  const scrollY = Math.max(0, Math.round(window.scrollY || 0));
  window.history.pushState({
    ...arenaPageHistoryState(activeArenaPage, activeArenaNavTarget, scrollY),
    kind: "team-dialog",
    dialogId: String(event.detail.id),
    dialogSource: String(event.detail.source || "market")
  }, "", arenaPageUrl(activeArenaPage));
}

function recordArenaOverlayHistory(event) {
  if (restoringArenaHistory || !isAuthenticatedViewer() || !event.detail?.type || !event.detail?.id) return;
  const current = window.history.state;
  if (isArenaHistoryForViewer(current)
      && current.kind === "overlay"
      && current.overlayType === String(event.detail.type)
      && current.overlayId === String(event.detail.id)) return;
  preserveCurrentArenaScroll();
  const scrollY = Math.max(0, Math.round(window.scrollY || 0));
  window.history.pushState({
    ...arenaPageHistoryState(activeArenaPage, activeArenaNavTarget, scrollY),
    kind: "overlay",
    overlayType: String(event.detail.type),
    overlayId: String(event.detail.id)
  }, "", arenaPageUrl(activeArenaPage));
}

function isCurrentTeamDialogHistory() {
  const state = window.history.state;
  return isArenaHistoryForViewer(state) && state.kind === "team-dialog";
}

function isCurrentArenaOverlayHistory(type = "") {
  const state = window.history.state;
  return isArenaHistoryForViewer(state)
    && state.kind === "overlay"
    && (!type || state.overlayType === type);
}

function replaceOverlayHistoryWithPage() {
  const state = window.history.state;
  if (!isArenaHistoryForViewer(state) || state.kind !== "overlay") return;
  window.history.replaceState(
    arenaPageHistoryState(state.page || activeArenaPage, state.navTarget || activeArenaNavTarget, state.scrollY),
    "",
    arenaPageUrl(state.page || activeArenaPage)
  );
}

function replaceDialogHistoryWithPage() {
  const state = window.history.state;
  if (!isArenaHistoryForViewer(state) || state.kind !== "team-dialog") return;
  window.history.replaceState(
    arenaPageHistoryState(state.page || activeArenaPage, state.navTarget || activeArenaNavTarget, state.scrollY),
    "",
    arenaPageUrl(state.page || activeArenaPage)
  );
}

function restoreTeamDialogFromHistory(state) {
  if (!state?.dialogId) return;
  restoringArenaHistory = true;
  try {
    if (state.dialogSource === "program") {
      const team = (hub?.teams || []).find((item) => String(item.id) === String(state.dialogId));
      if (team) openTeamDialog(team, { recordHistory: false });
    } else {
      window.dispatchEvent(new CustomEvent("spark-arena:restore-team-dialog", {
        detail: { id: String(state.dialogId), source: state.dialogSource || "market" }
      }));
    }
  } finally {
    restoringArenaHistory = false;
  }
}

function closeAllHistoryOverlays() {
  closeCollaborationReviewDialog({ historyMode: "none" });
  window.dispatchEvent(new CustomEvent("spark-arena:close-history-overlays"));
}

function restoreArenaOverlayFromHistory(state) {
  if (!state?.overlayType || !state?.overlayId) return;
  restoringArenaHistory = true;
  try {
    if (state.overlayType === "collaboration-review") {
      openCollaborationReviewDialog(state.overlayId, { recordHistory: false });
    } else {
      window.dispatchEvent(new CustomEvent("spark-arena:restore-history-overlay", {
        detail: { type: state.overlayType, id: state.overlayId }
      }));
    }
  } finally {
    restoringArenaHistory = false;
  }
}

function handleArenaPopState(event) {
  if (!hub || !isAuthenticatedViewer()) return;
  const state = event.state;
  if (isArenaHistoryForViewer(state)) {
    restoringArenaHistory = true;
    try {
      closeTeamDialog({ historyMode: "none" });
      closeAllHistoryOverlays();
      showPage(state.page || "overview", {
        navTarget: state.navTarget || "",
        historyMode: "none",
        restoreScrollY: state.scrollY
      });
    } finally {
      restoringArenaHistory = false;
    }
    if (state.kind === "team-dialog") restoreTeamDialogFromHistory(state);
    if (state.kind === "overlay") restoreArenaOverlayFromHistory(state);
    return;
  }
  const pageFromHash = ARENA_HASH_PAGES[String(window.location.hash || "").replace(/^#/, "")];
  if (pageFromHash) {
    closeTeamDialog({ historyMode: "none" });
    closeAllHistoryOverlays();
    showPage(pageFromHash, { historyMode: "none", restoreScrollY: 0 });
  }
}

function replacePublicArenaHistory() {
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(
    { marker: ARENA_HISTORY_MARKER, kind: "public", page: "public", scrollY: 0 },
    "",
    `${url.pathname}${url.search}`
  );
}

function primaryPageFor(pageName) {
  if (["advisors", "teams", "discover", "passports", "compare", "partnerships"].includes(pageName)) return "overview";
  if (pageName === "benefits") return "calendar";
  if (["operations", "database"].includes(pageName)) return "workspace";
  return pageName;
}

function isClawMemberViewer() {
  return String(hub?.viewer?.role || "").toLowerCase() === "member";
}

function isAdminViewer() {
  const role = String(hub?.viewer?.role || "").toLowerCase();
  return Boolean(hub?.viewer?.canScore) || ["sparklabs", "admin"].includes(role);
}

function isPublicViewer() {
  return !isAuthenticatedViewer() || (hub?.viewer?.role || "public") === "public";
}

function isAuthenticatedViewer() {
  return Boolean(authSession?.access_token && hub?.viewer && hub.viewer.role !== "public");
}

async function refreshSession() {
  if (!authSession?.refresh_token || !authConfig?.authConfigured) return false;
  try {
    const response = await fetch(`${authConfig.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: authConfig.supabaseAnonKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({ refresh_token: authSession.refresh_token })
    });
    const session = await safeJson(response);
    if (!response.ok) return false;
    saveStoredSession(session);
    return true;
  } catch {
    return false;
  }
}

async function restoreStoredSession() {
  authSession = readStoredSession();
  if (!authConfig?.authConfigured || (!authSession?.access_token && !authSession?.refresh_token)) return false;

  const expiresAt = Number(authSession?.expires_at || 0);
  const expiresSoon = expiresAt > 0 && expiresAt <= Math.floor(Date.now() / 1000) + 60;
  if ((!authSession?.access_token || expiresSoon) && authSession?.refresh_token) {
    await refreshSession();
  }

  return Boolean(authSession?.access_token);
}

function saveStoredSession(session) {
  authSession = session;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // The current tab can keep the session when browser storage is unavailable.
  }
}

function readStoredSession() {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function clearStoredSession() {
  authSession = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // The in-memory session is already cleared.
  }
}

function authHeaders() {
  return authSession?.access_token ? { Authorization: `Bearer ${authSession.access_token}` } : {};
}

function setLoginPending(pending) {
  els.loginForm.classList.toggle("is-loading", pending);
  els.loginForm.setAttribute("aria-busy", String(pending));
  els.loginForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = pending;
  });
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function setAuthStatus(message, type = "") {
  setProcessStatus(els.authStatus, message, type);
}

function setDatabaseStatus(message, type = "") {
  setProcessStatus(els.databaseStatus, message, type);
}

function setApplicantExportStatus(message, type = "") {
  setProcessStatus(els.applicantExportStatus, message, type);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2600);
}

function teamSortValue(left, right, sort) {
  if (sort === "sector") {
    return String(left.sector || "").localeCompare(String(right.sector || ""), "ko") || left.name.localeCompare(right.name, "ko");
  }
  if (sort === "activity") {
    return activityScore(right.activity) - activityScore(left.activity) || left.name.localeCompare(right.name, "ko");
  }
  return left.name.localeCompare(right.name, "ko");
}

function isViewerDirectoryTeam(team) {
  const viewerTeamId = String(hub?.viewerTeam?.id || "");
  return Boolean(team?.isViewerTeam || (viewerTeamId && String(team?.id || "") === viewerTeamId));
}

function directoryTeamSortValue(left, right, sort) {
  if (isClawMemberViewer()) {
    const leftIsViewerTeam = isViewerDirectoryTeam(left);
    const rightIsViewerTeam = isViewerDirectoryTeam(right);
    if (leftIsViewerTeam !== rightIsViewerTeam) {
      return leftIsViewerTeam ? -1 : 1;
    }
  }
  return teamSortValue(left, right, sort);
}

function activityScore(activity = {}) {
  return (
    Number(activity.mentoringSessions || 0) * 5 +
    Number(activity.hypotheses || 0) * 4 +
    Math.max(Number(activity.interviews || 0), Number(activity.reportedInterviews || 0)) * 3 +
    Number(activity.pmfResponses || 0) * 4 +
    Number(activity.eventRegistrations || 0) +
    Number(activity.benefitApplications || 0)
  );
}

function dominantTeamStatus() {
  const counts = new Map();
  for (const team of hub.teams || []) {
    if (!team.status) continue;
    counts.set(team.status, (counts.get(team.status) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "팀 현황";
}

function koreanRole(role) {
  if (role === "admin") return "SparkLabs 관리자";
  if (role === "sparklabs") return "SparkLabs 운영진";
  if (role === "human_validator") return "멘토·검증자";
  if (role === "b2b_partner") return "B2B 파트너";
  return "Claw Member ★";
}

function koreanAuthError(message) {
  if (/invalid login credentials/i.test(message || "")) return "이메일 또는 비밀번호가 맞지 않습니다.";
  if (/email not confirmed/i.test(message || "")) return "이메일 인증이 완료되지 않았습니다.";
  if (/failed to fetch/i.test(message || "")) return "로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  return message || "로그인에 실패했습니다.";
}

function evidenceLevelLabel(level) {
  if (level === "strong") return "강한 공개 근거";
  if (level === "partial") return "부분 공개 근거";
  return "추가 확인 필요";
}

function primarySector(value) {
  return String(value || "").split(/[,/]+/)[0].trim();
}

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("ko");
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(Number(value || 0));
}

function formatDate(value) {
  const date = parseDate(value);
  return date
    ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(date)
    : "날짜 미입력";
}

function formatDateTime(value) {
  const date = parseDate(value);
  return date
    ? new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date)
    : "시간 미확인";
}

function dateParts(value) {
  const date = parseDate(value);
  if (!date) return { day: "—", month: "DATE", monthYear: "DATE", weekday: "" };
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase(),
    monthYear: new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short" }).format(date),
    weekday: koreanWeekday(value)
  };
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value);
  const date = new Date(text.length === 10 ? `${text}T00:00:00` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPastDate(value) {
  const date = parseDate(value);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function prettyValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
