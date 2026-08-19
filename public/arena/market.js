import { escapeHtml } from "./sanitize.js";
import { finishProcessStatus, startProcessStatus } from "./progress-status.js";
import { companyIconMarkup } from "./company-icon.js";
import { companyExternalLinkIcon, companyExternalLinks } from "./company-external-links.js";
import { rankedTaskDetails, searchableTaskKeywords, taskKeywords, TASK_KEYWORD_PENDING } from "./task-keywords.js";

const SESSION_KEY = "sparkclaw-program-hub-session-gfmummaahlrnmrgnirxu-v1";
const COMPARE_KEY_PREFIX = "sparklabs-ai-arena-compare-v2";
const LEGACY_COMPARE_KEY = "sparklabs-ai-arena-compare-v1";
const PIPELINE_LABELS = {
  interest: "Interest",
  qualified: "SparkLabs qualified",
  founder_review: "Founder review",
  mutually_accepted: "Mutual consent",
  intro_scheduled: "Introduction scheduled",
  declined: "Declined privately",
  matched: "Matched",
  nda: "NDA",
  discovery: "Discovery",
  proposal: "Pilot proposal",
  pilot: "Pilot",
  production: "Production",
  expansion: "Expansion",
  closed: "Closed",
  intake: "Intake",
  qualified: "Qualified",
  design: "Bounty design",
  published: "Published",
  evaluating: "Evaluating"
};

let context = window.__sparkArenaContext || {};
let selectedTeamIds = [];
let compareViewerIdentity = "";
let bountyEditingRequestId = "";
let filtersPopulated = false;
let passportFormTouched = false;
let compareSummaryState = { key: "", status: "idle", summary: null, error: "" };
let compareSummaryRequestId = 0;
let similarTeamState = emptySimilarTeamState();
let similarTeamRequestId = 0;
let communityActivity = window.__sparkArenaCommunityActivity || emptyCommunityActivity();
let myLogTimelineFilter = "all";
let myLogTimelineItems = [];
let myLogCanonicalState = emptyCanonicalMyLogState();
let myLogCanonicalRequestId = 0;
let adminActivityState = emptyAdminActivityState();
let adminActivityRequestId = 0;
let staffBenefitQueueState = emptyStaffBenefitQueueState();
let staffBenefitQueueRequestId = 0;
let curatedCompanyPreviewCandidates = [];
let curatedCompanyPreviewStack = [];
let curatedCompanyPreviewTimer = 0;
let curatedCompanySwapTimer = 0;
let curatedCompanyCloseTimer = 0;
let curatedCompanyPreviewActive = false;
const MARKET_ACTION_PROGRESS_STEPS = [
  "요청 내용과 회원 권한을 확인하고 있습니다.",
  "프로필·연결 데이터를 안전하게 처리하고 있습니다.",
  "최신 결과를 작업 공간에 반영하고 있습니다."
];
const COMPARE_SUMMARY_PROGRESS_STEPS = [
  "선택한 기업의 공개 프로필을 확인하고 있습니다.",
  "클로이가 서비스와 AI 적용 방식의 차이를 비교하고 있습니다.",
  "프로필 근거에 맞게 요약을 정리하고 있습니다."
];
const ADMIN_ACTIVITY_ACTIONS = [
  ["system", "system.auth_login", "인증 로그인"],
  ["system", "system.auth_logout", "인증 로그아웃"],
  ["system", "system.session_started", "Arena 세션 시작"],
  ["system", "system.page_viewed", "페이지 열람"],
  ["discover", "discover.connection_requested", "기업 연결 요청"],
  ["discover", "discover.connection_status_changed", "기업 연결 상태 변경"],
  ["discover", "discover.collaboration_review_requested", "협업 검토 요청"],
  ["discover", "discover.collaboration_review_responded", "협업 검토 응답"],
  ["discover", "discover.tech_passport_updated", "Tech Passport 업데이트"],
  ["community", "community.category_created", "Community 채널 생성"],
  ["community", "community.post_created", "Community 글 작성"],
  ["community", "community.post_updated", "Community 글 수정·삭제"],
  ["community", "community.comment_created", "댓글 작성"],
  ["community", "community.comment_updated", "댓글 수정·삭제"],
  ["community", "community.reaction_added", "반응 남김"],
  ["community", "community.thread_bookmarked", "Community 글 저장"],
  ["bounty", "bounty.brief_created", "Bounty Brief 등록"],
  ["bounty", "bounty.brief_status_changed", "Bounty Brief 상태 변경"],
  ["bounty", "bounty.application_submitted", "Bounty 결과 제출"],
  ["bounty", "bounty.application_status_changed", "Bounty 제출 상태 변경"],
  ["bounty", "bounty.opportunity_created", "Bounty 기회 요청·생성"],
  ["bounty", "bounty.opportunity_status_changed", "Bounty 기회 상태 변경"]
];

const els = {
  globalProcessStatus: document.querySelector("#globalProcessStatus"),
  heroTitle: document.querySelector(".program-hero-copy h1"),
  heroDescription: document.querySelector(".program-hero-copy > p"),
  heroActions: document.querySelector(".program-hero-copy .hero-actions"),
  heroTeamCount: document.querySelector("#heroTeamCount"),
  heroSectorCount: document.querySelector("#heroSectorCount"),
  heroBenefitCount: document.querySelector("#heroBenefitCount"),
  metricTeams: document.querySelector("#metricTeams"),
  metricTeamStatus: document.querySelector("#metricTeamStatus"),
  curatedCompaniesCard: document.querySelector("#curatedCompaniesCard"),
  curatedCompanyStack: document.querySelector("#curatedCompanyStack"),
  metricProfiles: document.querySelector("#metricProfiles"),
  metricBenefits: document.querySelector("#metricBenefits"),
  metricEvents: document.querySelector("#metricEvents"),
  metricUpcoming: document.querySelector("#metricUpcoming"),
  weeklyNotice: document.querySelector("#weeklyNotice"),
  noticeUpdated: document.querySelector("#noticeUpdated"),
  sectorChart: document.querySelector("#sectorChart"),
  overviewEvents: document.querySelector("#overviewEvents"),
  overviewBenefits: document.querySelector("#overviewBenefits"),
  discoveryKicker: document.querySelector("#marketDiscoveryKicker"),
  discoveryTitle: document.querySelector("#marketDiscoveryTitle"),
  discoveryDescription: document.querySelector("#marketDiscoveryDescription"),
  search: document.querySelector("#marketTeamSearch"),
  categoryFilter: document.querySelector("#marketCategoryFilter"),
  stageFilter: document.querySelector("#marketStageFilter"),
  stackFilter: document.querySelector("#marketStackFilter"),
  evidenceFilter: document.querySelector("#marketEvidenceFilter"),
  stageFilterField: document.querySelector("#marketStageFilterField"),
  stackFilterField: document.querySelector("#marketStackFilterField"),
  evidenceFilterField: document.querySelector("#marketEvidenceFilterField"),
  teamGrid: document.querySelector("#marketTeamGrid"),
  teamEmpty: document.querySelector("#marketTeamEmpty"),
  compareTray: document.querySelector("#compareTray"),
  compareTrayCopy: document.querySelector("#compareTrayCopy"),
  compareTrayTeams: document.querySelector("#compareTrayTeams"),
  passportCount: document.querySelector("#passportCount"),
  passportGrid: document.querySelector("#passportGrid"),
  passportEditorPanel: document.querySelector("#passportEditorPanel"),
  passportEditorIntro: document.querySelector("#passportEditorIntro"),
  passportForm: document.querySelector("#passportForm"),
  passportReadiness: document.querySelector("#passportReadiness"),
  passportSaveButton: document.querySelector("#passportSaveButton"),
  passportSubmitButton: document.querySelector("#passportSubmitButton"),
  passportFormStatus: document.querySelector("#passportFormStatus"),
  compareTeamA: document.querySelector("#compareTeamA"),
  compareTeamB: document.querySelector("#compareTeamB"),
  compareTeamC: document.querySelector("#compareTeamC"),
  runCompareButton: document.querySelector("#runCompareButton"),
  similarTeamPanel: document.querySelector("#similarTeamPanel"),
  similarTeamDescription: document.querySelector("#similarTeamDescription"),
  similarTeamList: document.querySelector("#similarTeamList"),
  similarTeamStatus: document.querySelector("#similarTeamStatus"),
  similarTeamRefreshButton: document.querySelector("#similarTeamRefreshButton"),
  comparisonResult: document.querySelector("#comparisonResult"),
  bountyBriefPanel: document.querySelector("#bountyBriefPanel"),
  bountyBriefForm: document.querySelector("#bountyBriefForm"),
  bountyBriefFormTitle: document.querySelector("#bountyBriefFormTitle"),
  bountyBriefFormDescription: document.querySelector("#bountyBriefFormDescription"),
  bountyBriefRoleBadge: document.querySelector("#bountyBriefRoleBadge"),
  bountyBriefSubmit: document.querySelector("#bountyBriefSubmit"),
  bountyBriefCancelEdit: document.querySelector("#bountyBriefCancelEdit"),
  bountyBriefStatus: document.querySelector("#bountyBriefStatus"),
  connectionPanel: document.querySelector("#connectionPanel"),
  connectionForm: document.querySelector("#connectionForm"),
  connectionTeamSelect: document.querySelector("#connectionTeamSelect"),
  connectionStatus: document.querySelector("#connectionStatus"),
  pipelineCount: document.querySelector("#pipelineCount"),
  partnershipPipeline: document.querySelector("#partnershipPipeline"),
  workspaceTitle: document.querySelector("#workspaceTitle"),
  workspaceSubtitle: document.querySelector("#workspaceSubtitle"),
  workspaceRoleBadge: document.querySelector("#workspaceRoleBadge"),
  workspaceMetrics: document.querySelector("#workspaceMetrics"),
  workspaceActions: document.querySelector("#workspaceActions"),
  workspaceActivity: document.querySelector("#workspaceActivity"),
  myLogTimelineCount: document.querySelector("#myLogTimelineCount"),
  myLogTimelineFilters: document.querySelector("#myLogTimelineFilters"),
  myLogTimelineList: document.querySelector("#myLogTimelineList"),
  myLogLoadMoreButton: document.querySelector("#myLogLoadMoreButton"),
  myLogLoadMoreStatus: document.querySelector("#myLogLoadMoreStatus"),
  myLogBriefs: document.querySelector("#myLogBriefs"),
  myLogBriefList: document.querySelector("#myLogBriefList"),
  myLogMatchList: document.querySelector("#myLogMatchList"),
  myLogCommunityList: document.querySelector("#myLogCommunityList"),
  myLogBountyList: document.querySelector("#myLogBountyList"),
  staffMarketQueue: document.querySelector("#staffMarketQueue"),
  staffMarketQueueContent: document.querySelector("#staffMarketQueueContent"),
  adminActivityExplorer: document.querySelector("#adminActivityExplorer"),
  adminActivityUserFilter: document.querySelector("#adminActivityUserFilter"),
  adminActivityDomainFilter: document.querySelector("#adminActivityDomainFilter"),
  adminActivityActionFilter: document.querySelector("#adminActivityActionFilter"),
  adminActivityFromFilter: document.querySelector("#adminActivityFromFilter"),
  adminActivityToFilter: document.querySelector("#adminActivityToFilter"),
  adminActivityResetButton: document.querySelector("#adminActivityResetButton"),
  adminActivityRefreshButton: document.querySelector("#adminActivityRefreshButton"),
  adminActivitySummary: document.querySelector("#adminActivitySummary"),
  adminActivityTableBody: document.querySelector("#adminActivityTableBody"),
  adminActivityLoadMoreButton: document.querySelector("#adminActivityLoadMoreButton"),
  adminActivityStatus: document.querySelector("#adminActivityStatus"),
  teamDialog: document.querySelector("#teamDialog"),
  teamDialogContent: document.querySelector("#teamDialogContent"),
  toast: document.querySelector("#toast")
};

bindEvents();
clearStoredCompareSelections();
syncCompareSelectionScope();
if (context?.market) renderAll();

window.addEventListener("spark-arena:data", (event) => {
  const nextContext = event.detail || {};
  const previousViewerIdentity = viewerIdentity(context?.viewer || context?.market?.viewer);
  const nextViewerIdentity = viewerIdentity(nextContext?.viewer || nextContext?.market?.viewer);
  const viewerChanged = previousViewerIdentity !== nextViewerIdentity;
  if (viewerChanged) {
    bountyEditingRequestId = "";
    communityActivity = emptyCommunityActivity();
    myLogTimelineFilter = "all";
    myLogTimelineItems = [];
    resetCanonicalMyLog(nextViewerIdentity);
    resetAdminActivity(nextViewerIdentity);
    resetStaffBenefitQueue(nextViewerIdentity);
    similarTeamRequestId += 1;
    similarTeamState = emptySimilarTeamState();
    resetCompareSelection();
  }
  context = nextContext;
  filtersPopulated = false;
  syncCompareSelectionScope();
  renderAll();
  if (isComparePageActive() && isClawMemberViewer()) void loadSimilarTeamRecommendations();
  if (viewerChanged && nextViewerIdentity && document.querySelector('[data-page-panel="workspace"].is-active')) {
    void loadCanonicalMyLog();
    if (isStaffViewer()) {
      void loadAdminActivity({ reset: true });
      void loadStaffBenefitQueue();
    }
  }
});

window.addEventListener("spark-arena:page", (event) => {
  const page = event.detail?.page;
  if (page !== "overview") stopCuratedCompanyPreview();
  renderMarketPage(page);
  if (page === "compare") {
    void loadSimilarTeamRecommendations();
  }
  if (page === "workspace") {
    window.dispatchEvent(new CustomEvent("spark-arena:load-community-activity"));
    void loadCanonicalMyLog();
    if (isStaffViewer()) {
      void loadAdminActivity({ reset: adminActivityState.identity !== viewerIdentity(viewer()) });
      void loadStaffBenefitQueue();
    }
  }
});

window.addEventListener("spark-arena:community-activity", (event) => {
  communityActivity = event.detail || emptyCommunityActivity();
  renderWorkspace();
});

window.addEventListener("spark-arena:compare-program-team", (event) => {
  const id = String(event.detail?.id || "");
  if (!id || !startupById(id)) return;
  if (!selectedTeamIds.includes(id)) {
    if (selectedTeamIds.length >= 3) {
      showToast("이미 3개 기업을 선택했습니다. 비교 화면에서 한 곳을 제외해 주세요.");
      goPage("compare");
      return;
    }
    selectedTeamIds.push(id);
  }
  renderDiscover();
  renderCompare();
  goPage("compare");
});

window.addEventListener("spark-arena:restore-team-dialog", (event) => {
  const startup = startupById(String(event.detail?.id || ""));
  if (startup) openMarketTeam(startup, { recordHistory: false });
});

function bindEvents() {
  const renderDiscoverAfterInput = debounceMainThreadRender(renderDiscover);
  [els.search, els.categoryFilter, els.stageFilter, els.stackFilter, els.evidenceFilter].forEach((control) => {
    control?.addEventListener(control.tagName === "INPUT" ? "input" : "change", control.tagName === "INPUT" ? renderDiscoverAfterInput : renderDiscover);
  });
  els.teamGrid?.addEventListener("click", handleTeamGridClick);
  els.compareTrayTeams?.addEventListener("click", handleCompareTrayClick);
  els.overviewEvents?.addEventListener("click", handleMarketTeamOpen);
  els.passportGrid?.addEventListener("click", handleMarketTeamOpen);
  els.passportForm?.addEventListener("input", () => {
    passportFormTouched = true;
    updatePassportDraftReadiness();
  });
  els.passportSaveButton?.addEventListener("click", () => savePassport(false));
  els.passportForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    savePassport(true);
  });
  els.runCompareButton?.addEventListener("click", () => syncCompareFromSelects(true));
  els.similarTeamRefreshButton?.addEventListener("click", () => loadSimilarTeamRecommendations({ refresh: true }));
  els.similarTeamList?.addEventListener("click", handleSimilarTeamAction);
  [els.compareTeamA, els.compareTeamB, els.compareTeamC].forEach((control) => {
    control?.addEventListener("change", () => syncCompareFromSelects(false));
  });
  els.bountyBriefForm?.addEventListener("submit", submitBountyBrief);
  els.bountyBriefCancelEdit?.addEventListener("click", resetBountyBriefEditor);
  els.connectionForm?.addEventListener("submit", submitConnectionRequest);
  els.partnershipPipeline?.addEventListener("click", handlePipelineAction);
  els.staffMarketQueueContent?.addEventListener("click", handleStaffQueueAction);
  els.myLogTimelineFilters?.addEventListener("click", handleMyLogTimelineFilter);
  els.myLogTimelineList?.addEventListener("click", handleMyLogTimelineOpen);
  els.myLogLoadMoreButton?.addEventListener("click", handleMyLogLoadMore);
  els.adminActivityUserFilter?.addEventListener("change", handleAdminActivityFilterChange);
  els.adminActivityDomainFilter?.addEventListener("change", () => {
    syncAdminActivityActionOptions();
    handleAdminActivityFilterChange();
  });
  els.adminActivityActionFilter?.addEventListener("change", handleAdminActivityFilterChange);
  els.adminActivityFromFilter?.addEventListener("change", handleAdminActivityFilterChange);
  els.adminActivityToFilter?.addEventListener("change", handleAdminActivityFilterChange);
  els.adminActivityRefreshButton?.addEventListener("click", () => loadAdminActivity({ reset: true, force: true }));
  els.adminActivityResetButton?.addEventListener("click", resetAdminActivityFilters);
  els.adminActivityLoadMoreButton?.addEventListener("click", () => loadAdminActivity({ append: true }));
  els.curatedCompaniesCard?.addEventListener("pointerenter", startCuratedCompanyPreview);
  els.curatedCompaniesCard?.addEventListener("pointerleave", stopCuratedCompanyPreview);
  els.curatedCompaniesCard?.addEventListener("focus", startCuratedCompanyPreview);
  els.curatedCompaniesCard?.addEventListener("blur", stopCuratedCompanyPreview);
  els.curatedCompaniesCard?.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    stopCuratedCompanyPreview();
    goPage("teams");
  });
  document.addEventListener("click", (event) => {
    const pageButton = event.target.closest("[data-market-page]");
    if (pageButton) {
      goPage(pageButton.dataset.marketPage);
      const targetId = pageButton.dataset.myLogTarget;
      if (targetId) {
        window.requestAnimationFrame(() => {
          const target = document.getElementById(targetId);
          if (!target || target.hidden) return;
          target.classList.add("is-targeted");
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          window.setTimeout(() => target.classList.remove("is-targeted"), 1200);
        });
      }
    }
  });
}

function debounceMainThreadRender(callback, delay = 120) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function renderAll() {
  if (!market()) return;
  curatedCompanyPreviewCandidates = (market().startups || []).filter(isCuratedCompanyPreviewCandidate);
  const activePage = document.querySelector("[data-page-panel].is-active")?.dataset.pagePanel || "overview";
  renderMarketPage(activePage);
}

function renderMarketPage(pageName) {
  if (!market()) return;
  if (pageName === "discover") {
    if (!filtersPopulated) populateFilters();
    renderDiscover();
  } else if (pageName === "passports") {
    renderPassports();
  } else if (pageName === "compare") {
    renderCompare();
  } else if (pageName === "partnerships") {
    renderPartnerships();
  } else if (pageName === "workspace") {
    renderWorkspace();
  }
}

function renderHome() {
  const startups = market().startups || [];
  const clawMember = isClawMemberViewer();
  const taskAreaCount = new Set(startups.flatMap((startup) => searchableTaskKeywords(startup))).size;
  const openBounties = (competition().challenges || []).filter((item) => item.status === "open").length;
  const collaborationFit = context.hub?.metrics || {};
  const activePilots = competition().metrics?.activePilots || 0;
  const topTasks = countValues(startups.flatMap((startup) => searchableTaskKeywords(startup))).slice(0, 8);
  const featured = [...startups].sort((a, b) => evidenceScore(b) - evidenceScore(a)).slice(0, 4);
  const openChallenge = (competition().challenges || []).find((item) => item.status === "open");

  if (els.heroTitle) els.heroTitle.innerHTML = "Where AI companies<br>meet.";
  setText(els.heroDescription, "해결할 Task를 자연어로 설명하고, SparkLabs가 선별한 AI 기업의 근거와 실행 역량을 비교하세요.");
  if (els.heroActions) {
    els.heroActions.innerHTML = `<button class="primary-button compact" data-market-page="discover" type="button">Task로 기업 찾기</button><button class="secondary-button compact" data-market-page="community" type="button">커뮤니티 보기</button>${clawMember ? "" : `<button class="secondary-button compact" data-market-page="partnerships" type="button">연결 요청</button>`}`;
  }
  setMetricCardCopy([
    ["Curated Companies", "SparkLabs network"],
    ["협업 적합 기업", "현재 계정 프로필 기준"],
    ["Active Perks", "멤버 전용 혜택"],
    ["Community Events", "교육·코칭·네트워킹"]
  ]);

  setText(els.heroTeamCount, formatNumber(startups.length));
  setText(els.heroSectorCount, formatNumber(taskAreaCount));
  setText(els.heroBenefitCount, formatNumber(openBounties));
  setText(els.metricTeams, formatNumber(startups.length));
  setText(els.metricTeamStatus, `${formatNumber(market().metrics?.sparkAffiliated || startups.length)} SparkLabs network`);
  setText(
    els.metricProfiles,
    collaborationFit.collaborationFitStatus === "ready"
      ? formatNumber(collaborationFit.collaborationFitCount)
      : "0"
  );
  setText(els.metricBenefits, formatNumber(openBounties));
  setText(els.metricEvents, formatNumber(activePilots));
  setText(els.metricUpcoming, "Online community + offline events");
  setText(els.noticeUpdated, openChallenge ? "COMING SOON" : "PARTNER INTAKE");

  if (els.weeklyNotice) {
    els.weeklyNotice.innerHTML = openChallenge
      ? `<span class="demand-type">COMING SOON · BOUNTY</span>
         <h3>${escapeHtml(openChallenge.title)}</h3>
         <p>${escapeHtml(openChallenge.shortDescription || openChallenge.longDescription || "기업 문제와 검증된 AI 회사를 연결합니다.")}</p>
         <button class="text-link" data-market-page="${clawMember ? "arena" : "partnerships"}" type="button">${clawMember ? "Bounty 확인 →" : "파트너십 문의 →"}</button>`
      : `<span class="demand-type">PARTNER ACCESS</span>
         <h3>어떤 AI 회사를 찾고 계신가요?</h3>
         <p>계약서 검토, 품질 검사, 고객 상담처럼 해결할 Task를 설명하면 관련 기업을 찾을 수 있습니다.</p>
         <button class="text-link" data-market-page="discover" type="button">Task로 기업 찾기 →</button>`;
  }
  if (els.sectorChart) {
    els.sectorChart.innerHTML = topTasks
      .map(
        ([name, count], index) => `<div class="sector-row">
          <span title="${escapeHtml(name)}">${escapeHtml(name)}</span>
          <div class="sector-track"><i style="width:${Math.max(8, 100 - index * 10)}%"></i></div>
          <strong>${formatNumber(count)}</strong>
        </div>`
      )
      .join("");
  }
  if (els.overviewEvents) {
    els.overviewEvents.innerHTML = featured.map(homeTeamMarkup).join("");
  }
  // Perks and partner benefits are rendered by the shared community home.
}

function isCuratedCompanyPreviewCandidate(startup) {
  const name = String(startup?.name || "").trim();
  const category = String(startup?.category || "").trim();
  return Boolean(
    name
    && name !== "-"
    && !/^test(?:\s|$)/i.test(name)
    && !["미분류", "unclassified"].includes(category.toLocaleLowerCase())
  );
}

function startCuratedCompanyPreview() {
  if (!els.curatedCompanyStack || !curatedCompanyPreviewCandidates.length || curatedCompanyPreviewActive) return;
  window.clearTimeout(curatedCompanyCloseTimer);
  curatedCompanyCloseTimer = 0;
  curatedCompanyPreviewActive = true;
  els.curatedCompanyStack.classList.remove("is-leaving");
  showRandomCuratedCompany();
  if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    curatedCompanyPreviewTimer = window.setInterval(showRandomCuratedCompany, 1600);
  }
}

function stopCuratedCompanyPreview() {
  curatedCompanyPreviewActive = false;
  window.clearInterval(curatedCompanyPreviewTimer);
  window.clearTimeout(curatedCompanySwapTimer);
  window.clearTimeout(curatedCompanyCloseTimer);
  curatedCompanyPreviewTimer = 0;
  curatedCompanySwapTimer = 0;
  els.curatedCompanyStack?.classList.remove("is-revealing", "is-settling");
  els.curatedCompanyStack?.classList.add("is-leaving");
  curatedCompanyCloseTimer = window.setTimeout(() => {
    if (curatedCompanyPreviewActive) return;
    curatedCompanyPreviewStack = [];
    els.curatedCompanyStack?.classList.remove("is-visible", "is-leaving");
    if (els.curatedCompanyStack) els.curatedCompanyStack.innerHTML = "";
    curatedCompanyCloseTimer = 0;
  }, 240);
}

function showRandomCuratedCompany() {
  if (!curatedCompanyPreviewActive || !curatedCompanyPreviewCandidates.length) return;

  if (!curatedCompanyPreviewStack.length) {
    curatedCompanyPreviewStack = pickCuratedCompanyPreviewCards(5);
    renderCuratedCompanyPreviewStack();
    window.requestAnimationFrame(() => els.curatedCompanyStack?.classList.add("is-visible"));
    return;
  }

  els.curatedCompanyStack?.classList.add("is-revealing");
  window.clearTimeout(curatedCompanySwapTimer);
  curatedCompanySwapTimer = window.setTimeout(() => {
    if (!curatedCompanyPreviewActive) return;
    const remaining = curatedCompanyPreviewStack.slice(1);
    const remainingKeys = new Set(remaining.map(curatedCompanyPreviewKey));
    const available = curatedCompanyPreviewCandidates.filter((startup) => !remainingKeys.has(curatedCompanyPreviewKey(startup)));
    const next = available[Math.floor(Math.random() * available.length)] || curatedCompanyPreviewCandidates[0];
    curatedCompanyPreviewStack = [...remaining, next].filter(Boolean);
    renderCuratedCompanyPreviewStack();
    els.curatedCompanyStack?.classList.remove("is-revealing");
    els.curatedCompanyStack?.classList.add("is-settling");
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (curatedCompanyPreviewActive) els.curatedCompanyStack?.classList.remove("is-settling");
    }));
  }, 300);
}

function pickCuratedCompanyPreviewCards(limit) {
  const pool = [...curatedCompanyPreviewCandidates];
  const selected = [];
  while (pool.length && selected.length < limit) {
    const index = Math.floor(Math.random() * pool.length);
    selected.push(pool.splice(index, 1)[0]);
  }
  return selected;
}

function curatedCompanyPreviewKey(startup) {
  return String(startup?.id || startup?.name || "").trim().toLocaleLowerCase();
}

function renderCuratedCompanyPreviewStack() {
  if (!els.curatedCompanyStack) return;
  els.curatedCompanyStack.innerHTML = curatedCompanyPreviewStack
    .map((startup, index) => `<div class="curated-company-stack-card" data-stack-position="${index}">
      <i aria-hidden="true"></i>
      <span>
        <strong>${escapeHtml(startup.name)}</strong>
        <small>${escapeHtml(startup.category || startup.programGroup || "AI Company")}</small>
      </span>
      <b aria-hidden="true">→</b>
    </div>`)
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

function homeTeamMarkup(startup) {
  const badges = verificationBadges(startup).slice(0, 2);
  return `<article class="event-row market-home-team">
    ${companyIconMarkup(startup)}
    <div>
      <h3>${escapeHtml(startup.name)}</h3>
      <p>${escapeHtml(taskKeywords(startup, 3).join(" · "))}</p>
      <div class="inline-badges">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}</div>
    </div>
    <button class="text-link" data-market-team="${escapeHtml(startup.id)}" type="button">Passport →</button>
  </article>`;
}

function taskKeywordMarkup(profile, limit = 4) {
  const tasks = taskKeywords(profile, limit);
  const pending = tasks.length === 1 && tasks[0] === TASK_KEYWORD_PENDING;
  return `<div class="task-keyword-block${pending ? " is-pending" : ""}">
    <strong class="task-keyword-label">해결 Task</strong>
    <div class="task-keywords">${tasks.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
  </div>`;
}

function populateFilters() {
  if (filtersPopulated || !market()) return;
  const startups = market().startups || [];
  const programDirectory = isProgramDirectoryMarket();
  const peerDirectory = programDirectory && market()?.metrics?.directoryScope === "other_participating_companies";
  fillSelect(els.categoryFilter, unique(startups.map((item) => item.category)), "모든 산업");
  fillSelect(els.stageFilter, unique(startups.map((item) => programDirectory ? item.programGroup : item.stage)), programDirectory ? "모든 프로그램 그룹" : "모든 단계");
  fillSelect(els.stackFilter, unique(startups.flatMap((item) => searchableTaskKeywords(item))).sort((left, right) => left.localeCompare(right, "ko")), "모든 해결 Task");
  if (els.stageFilterField) els.stageFilterField.hidden = programDirectory && !startups.some((item) => item.programGroup);
  if (els.evidenceFilterField) els.evidenceFilterField.hidden = programDirectory;
  if (programDirectory && els.evidenceFilter) els.evidenceFilter.value = "";
  if (els.discoveryKicker) els.discoveryKicker.textContent = "TASK-DRIVEN COMPANY SEARCH";
  if (els.discoveryTitle) {
    els.discoveryTitle.textContent = peerDirectory
      ? "다른 참가팀이 해결하는 Task를 찾으세요."
      : programDirectory
        ? "해결할 Task로 참가기업을 찾으세요."
        : "해결할 Task에서 기업을 찾으세요.";
  }
  if (els.discoveryDescription) {
    els.discoveryDescription.textContent = peerDirectory
      ? `본인 팀을 제외한 ${formatNumber(startups.length)}개 참가팀이 해결하는 업무를 검색하고, 관련 근거와 최대 3개 팀을 비교할 수 있습니다.`
      : programDirectory
      ? `Program DB의 ${formatNumber(startups.length)}개 참가기업을 해결 Task로 검색하고, 기술·도메인 근거와 함께 비교합니다.`
      : "회사명보다 먼저 해결할 업무를 입력하고, Task 근거와 기술·검증 정보를 함께 비교합니다.";
  }
  if (els.search) els.search.placeholder = "예: 계약서 검토, 품질 검사, 고객 상담, 수요 예측";
  fillTeamSelect(els.connectionTeamSelect, startups, "연결할 팀 선택");
  filtersPopulated = true;
}

function renderDiscover() {
  if (!els.teamGrid || !market()) return;
  const programDirectory = isProgramDirectoryMarket();
  const query = normalize(els.search?.value);
  const category = els.categoryFilter?.value || "";
  const stage = els.stageFilter?.value || "";
  const stack = els.stackFilter?.value || "";
  const evidence = els.evidenceFilter?.value || "";
  const startups = (market().startups || [])
    .filter((startup) => {
      const searchText = normalize([
        startup.name,
        startup.tagline,
        startup.description,
        startup.category,
        ...(startup.functions || []),
        ...(startup.tags || []),
        ...taskKeywords(startup, 8)
      ].join(" "));
      if (query && !searchText.includes(query)) return false;
      if (category && startup.category !== category) return false;
      if (stage && (programDirectory ? startup.programGroup !== stage : startup.stage !== stage)) return false;
      if (stack && !searchableTaskKeywords(startup).includes(stack)) return false;
      if (evidence === "verified" && evidenceScore(startup) < 55) return false;
      if (evidence === "passport" && !passportForStartup(startup)) return false;
      if (evidence === "repository" && !repositoryUrl(startup)) return false;
      return true;
    })
    .sort((a, b) => programDirectory ? a.name.localeCompare(b.name, "ko") : evidenceScore(b) - evidenceScore(a) || a.name.localeCompare(b.name, "ko"));

  els.teamGrid.innerHTML = startups.map(marketTeamCardMarkup).join("");
  if (els.teamEmpty) els.teamEmpty.hidden = startups.length > 0;
  renderCompareTray();
}

function marketTeamCardMarkup(startup) {
  if (startup.source === "program_directory") return programDirectoryTeamCardMarkup(startup);
  const badges = verificationBadges(startup);
  const techStack = techStackFor(startup);
  const selected = selectedTeamIds.includes(startup.id);
  return `<article class="market-team-card ${selected ? "is-selected" : ""}">
    <div class="market-team-card-top">
      ${companyIconMarkup(startup)}
      <div class="market-team-actions">
        <button class="compare-toggle ${selected ? "is-active" : ""}" data-compare-team="${escapeHtml(startup.id)}" type="button" aria-pressed="${selected}">
          ${selected ? "선택됨" : "+ 비교"}
        </button>
      </div>
    </div>
    <div>
      <span class="market-category">${escapeHtml(startup.category || "AI Product")}</span>
      <h2>${escapeHtml(startup.name)}</h2>
      <p>${escapeHtml(startup.tagline || startup.description || "팀 소개 준비 중")}</p>
    </div>
    ${taskKeywordMarkup(startup, 4)}
    <div class="tech-stack-preview">
      <div class="tech-stack-preview-head"><strong>Tech Stack</strong><span>${escapeHtml(stackSourceShort(techStack))}</span></div>
      ${techStack.hasDisclosure ? compactStackMarkup(techStack, 6) : `<p>공개된 Stack 없음 · 팀 확인 필요</p>`}
    </div>
    <div class="evidence-strip">
      <div><span>Evidence</span><strong>${evidenceScore(startup)}</strong></div>
      <div><span>Benchmark</span><strong>${formatScore(startup.benchmarkScore)}</strong></div>
      <div><span>Stage</span><strong>${escapeHtml(startup.stage || "—")}</strong></div>
    </div>
    <div class="verification-row">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}</div>
    <div class="market-team-card-footer">
      <span>${repositoryUrl(startup) ? "Repository linked · scan pending" : "Repository not disclosed"}</span>
      <button class="text-link" data-market-team="${escapeHtml(startup.id)}" type="button">Tech Passport →</button>
    </div>
  </article>`;
}

function programDirectoryTeamCardMarkup(startup) {
  const selected = selectedTeamIds.includes(startup.id);
  const investorMetrics = Array.isArray(startup.investorMetrics) ? startup.investorMetrics.slice(0, 3) : [];
  const specialtyTasks = programCapabilityTasks(startup);
  return `<article class="market-team-card program-directory-market-card ${selected ? "is-selected" : ""}">
    <div class="market-team-card-top">
      ${companyIconMarkup(startup)}
      <button class="compare-toggle ${selected ? "is-active" : ""}" data-compare-team="${escapeHtml(startup.id)}" type="button" aria-pressed="${selected}">${selected ? "선택됨" : "+ 비교"}</button>
    </div>
    <div>
      <span class="market-category">${escapeHtml(startup.category || "AI")}</span>
      <h2>${escapeHtml(startup.name)}</h2>
      <p class="program-partnering-summary">${escapeHtml(startup.partneringSummary || startup.tagline || startup.description || "기본 프로필 준비 중")}</p>
    </div>
    ${investorMetrics.length ? `<div class="program-investor-metrics" aria-label="공개 정량 근거">${investorMetrics.map((metric) => `<span>${escapeHtml(metric)}</span>`).join("")}</div>` : ""}
    ${companyOfficialLinksMarkup(startup)}
    <div class="program-specialty-preview">
      <strong>해결 가능한 Task · 근거 순</strong>
      <ol class="program-specialty-ranked-list">${specialtyTasks.map((task, index) => `<li><span class="task-rank-badge">${index + 1}</span><article><b>${escapeHtml(task.label)}</b><p>${escapeHtml(task.description)}</p>${task.evidence ? `<small>공개 근거 · ${escapeHtml(task.evidence)}</small>` : ""}</article></li>`).join("")}</ol>
    </div>
    <div class="evidence-strip program-profile-strip">
      <div><span>산업</span><strong>${escapeHtml(startup.category || "AI")}</strong></div>
      <div><span>프로그램</span><strong>${escapeHtml(startup.programGroup || "참가기업")}</strong></div>
      <div><span>웹사이트</span><strong>${startup.products?.[0]?.url ? "공개" : "미공개"}</strong></div>
    </div>
    <div class="verification-row"><span>참가기업</span><span>기본 프로필</span><span>상세 검토 전</span></div>
    <div class="market-team-card-footer">
      <span>Program DB의 안전한 공개 필드만 표시</span>
      <button class="text-link" data-market-team="${escapeHtml(startup.id)}" type="button">기업 상세 →</button>
    </div>
  </article>`;
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

function handleTeamGridClick(event) {
  const compare = event.target.closest("[data-compare-team]");
  if (compare) {
    toggleCompareTeam(compare.dataset.compareTeam);
    return;
  }
  handleMarketTeamOpen(event);
}

function handleMarketTeamOpen(event) {
  const button = event.target.closest("[data-market-team]");
  if (!button) return;
  const startup = startupById(button.dataset.marketTeam);
  if (startup) openMarketTeam(startup);
}

function openMarketTeam(startup, { recordHistory = true } = {}) {
  if (!els.teamDialog || !els.teamDialogContent) return;
  if (startup.source === "program_directory") {
    openProgramDirectoryTeam(startup, { recordHistory });
    return;
  }
  const passport = passportForStartup(startup);
  const technical = passport?.technicalProfile || {};
  const badges = verificationBadges(startup);
  const architecture = passport?.longDescriptionMarkdown || "상세 아키텍처는 아직 공개되지 않았습니다. 승인된 B2B 파트너는 Diligence 요청을 보낼 수 있습니다.";
  const techStack = techStackFor(startup);
  const repo = repositoryUrl(startup);
  els.teamDialogContent.innerHTML = `
    <section class="team-detail-hero market-detail-hero">
      <span class="eyebrow">${escapeHtml(startup.category || "AI PRODUCT")} · ${escapeHtml(startup.stage || "STAGE N/A")}</span>
      <h1>${escapeHtml(startup.name)}</h1>
      <p>${escapeHtml(startup.tagline || "")}</p>
      <div class="market-detail-badges">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}</div>
    </section>
    <div class="team-detail-body market-detail-body">
      <div class="market-detail-scorecard">
        <article><span>Benchmark</span><strong>${formatScore(startup.benchmarkScore)}</strong><small>조건별 평가 신호</small></article>
        <article><span>Tech evidence</span><strong>${evidenceScore(startup)}</strong><small>100점 순위가 아닌 완성도</small></article>
        <article><span>Repository</span><strong>${repo ? "Linked" : "Private"}</strong><small>${repo ? "Scan pending" : "Not disclosed"}</small></article>
        <article><span>Active LOC</span><strong>—</strong><small>연결된 Scan에서만 표시</small></article>
      </div>
      <section>
        <h2>Product & validated use case</h2>
        <p>${escapeHtml(startup.description || "상세 설명이 아직 공개되지 않았습니다.")}</p>
      </section>
      <section>
        <div class="tech-stack-section-head">
          <div><h2>Tech Stack</h2><p>${escapeHtml(techStack.sourceLabel || "Disclosure pending")}</p></div>
          <span class="stack-verification ${techStack.verification === "sparklabs_reviewed" ? "is-reviewed" : ""}">${escapeHtml(stackVerificationLabel(techStack.verification))}</span>
        </div>
        ${techStack.hasDisclosure ? fullStackMarkup(techStack) : `<div class="market-empty compact">공개 가능한 기술 스택이 아직 등록되지 않았습니다.</div>`}
      </section>
      <section>
        <h2>해결하는 Task</h2>
        <div class="task-keywords large">${taskKeywords(startup, 8).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      </section>
      <section>
        <h2>AI capability signals</h2>
        <div class="capability-tags large">${(startup.functions || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      </section>
      <section>
        <h2>Architecture disclosure</h2>
        <p>${escapeHtml(architecture)}</p>
        <div class="architecture-mini">
          <span>Context</span><i>→</i><span>Services</span><i>→</i><span>Data & Models</span><i>→</i><span>Human handoff</span>
        </div>
      </section>
      <section>
        <h2>Deployment, privacy & limitations</h2>
        <div class="detail-two-column">
          <p><strong>Deployment</strong>${escapeHtml(technical.deployment || "Approved partner disclosure pending.")}</p>
          <p><strong>Privacy</strong>${escapeHtml(technical.privacy || "Team confirmation required before diligence.")}</p>
          <p><strong>API / Integration</strong>${escapeHtml(technical.apiDetails || "Not disclosed.")}</p>
          <p><strong>Known limitations</strong>${escapeHtml(technical.limitations || "Not disclosed.")}</p>
        </div>
      </section>
      <section class="loc-policy-note">
        <strong>Code metrics policy</strong>
        <p>코드 줄 수는 생성 코드, vendor, build 결과를 제외한 Commit 기준 참고 정보로만 표시하며 팀 평가 점수에는 반영하지 않습니다.</p>
      </section>
      ${companyOfficialLinksMarkup(startup, { section: true })}
      <div class="market-detail-actions">
        ${startup.products?.[0]?.url ? `<a class="secondary-button compact" href="${escapeHtml(startup.products[0].url)}" target="_blank" rel="noopener noreferrer">제품 사이트 ↗</a>` : ""}
        ${companyReviewActionMarkup(startup, "Partner access 요청")}
      </div>
    </div>`;
  els.teamDialogContent.querySelector("[data-market-connect]")?.addEventListener("click", () => {
    els.teamDialog.close();
    if (els.connectionTeamSelect) els.connectionTeamSelect.value = startup.id;
    goPage("partnerships");
  });
  els.teamDialog.showModal();
  if (recordHistory) {
    window.dispatchEvent(new CustomEvent("spark-arena:team-dialog-opened", {
      detail: { id: String(startup.id || ""), source: "market" }
    }));
  }
}

function openProgramDirectoryTeam(startup, { recordHistory = true } = {}) {
  const website = startup.products?.[0]?.url || "";
  const specialtyTasks = programCapabilityTasks(startup);
  const investorMetrics = Array.isArray(startup.investorMetrics) ? startup.investorMetrics : [];
  els.teamDialogContent.innerHTML = `
    <section class="team-detail-hero market-detail-hero">
      <span class="eyebrow">${escapeHtml(startup.category || "AI")} · ${escapeHtml(startup.programGroup || "SPARKCLAW PARTICIPANT")}</span>
      <h1>${escapeHtml(startup.name)}</h1>
      <p>${escapeHtml(startup.partneringSummary || startup.tagline || "기본 프로필 준비 중")}</p>
      <div class="market-detail-badges"><span>Program DB 참가기업</span><span>연락처 비공개</span><span>상세 검토 전</span></div>
    </section>
    <div class="team-detail-body market-detail-body">
      <section><h2>파트너링·투자 검토 포인트</h2><p>${escapeHtml(startup.partneringSummary || startup.serviceSummary || startup.description || "서비스 요약을 확인하고 있습니다.")}</p></section>
      ${investorMetrics.length ? `<section><h2>공개 정량 근거</h2><div class="investor-metric-grid">${investorMetrics.map((metric) => `<article><span>PUBLIC EVIDENCE</span><strong>${escapeHtml(metric)}</strong></article>`).join("")}</div></section>` : ""}
      <section><h2>AI 적용 아이디어</h2><p>${escapeHtml(startup.aiIdeaSummary || "공개된 AI 적용 아이디어가 없습니다.")}</p></section>
      <section><h2>해결 가능한 모든 Task</h2><p class="evidence-disclosure">Program Supabase의 공개 프로필·지원서·서비스 설명과 키워드를 함께 확인해 근거 강도 순으로 정렬했습니다.</p><div class="task-detail-list is-ranked">${specialtyTasks.map((task, index) => `<article><span class="task-rank-badge">${index + 1}</span><div><strong>${escapeHtml(task.label)}</strong><p>${escapeHtml(task.description)}</p>${task.evidence ? `<small>공개 근거 · ${escapeHtml(task.evidence)}</small>` : ""}</div></article>`).join("")}</div></section>
      <section><h2>기술·도메인 근거 키워드</h2><div class="capability-tags large">${(startup.functions || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("") || "<span>프로필 보완 필요</span>"}</div></section>
      <section class="loc-policy-note"><strong>정보 범위</strong><p>이 화면은 Program DB의 안전한 기본 프로필만 표시합니다. 상세 기술 스택, 고객 근거와 연락처는 대상 스타트업이 요청을 승인한 뒤 SparkLabs 확인을 거쳐 공개됩니다.</p></section>
      ${companyOfficialLinksMarkup(startup, { section: true })}
      <div class="market-detail-actions">
        ${website ? `<a class="secondary-button compact" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">회사 사이트 ↗</a>` : ""}
        ${companyReviewActionMarkup(startup, "파트너 연결 검토 요청")}
      </div>
    </div>`;
  els.teamDialogContent.querySelector("[data-market-connect]")?.addEventListener("click", () => {
    els.teamDialog.close();
    if (els.connectionTeamSelect) els.connectionTeamSelect.value = startup.id;
    goPage("partnerships");
  });
  els.teamDialog.showModal();
  if (recordHistory) {
    window.dispatchEvent(new CustomEvent("spark-arena:team-dialog-opened", {
      detail: { id: String(startup.id || ""), source: "market" }
    }));
  }
}

function programCapabilityTasks(startup = {}) {
  const derived = rankedTaskDetails({
    ...startup,
    investorProfile: startup.investorProfile || {},
    functions: [...(startup.functions || []), ...(startup.tags || [])]
  }, 32).filter((task) => task.label !== TASK_KEYWORD_PENDING);
  const seen = new Set();
  return [...(startup.specialtyTasks || []), ...derived].filter((task) => {
    const key = String(task.label || "").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((task, index) => ({ ...task, rank: index + 1 }));
}

function toggleCompareTeam(id) {
  if (!id) return;
  if (selectedTeamIds.includes(id)) selectedTeamIds = selectedTeamIds.filter((item) => item !== id);
  else if (selectedTeamIds.length < 3) selectedTeamIds.push(id);
  else {
    showToast("비교는 최대 3개 팀까지 가능합니다.");
    return;
  }
  renderDiscover();
  renderCompare();
}

function handleCompareTrayClick(event) {
  const remove = event.target.closest("[data-remove-compare]");
  if (remove) toggleCompareTeam(remove.dataset.removeCompare);
}

function renderCompareTray() {
  if (!els.compareTray || !els.compareTrayTeams) return;
  const teams = selectedTeamIds.map(startupById).filter(Boolean);
  els.compareTray.hidden = teams.length === 0;
  setText(els.compareTrayCopy, `${teams.length}/3개 선택`);
  els.compareTrayTeams.innerHTML = teams
    .map((team) => `<button data-remove-compare="${escapeHtml(team.id)}" type="button">${escapeHtml(team.name)} <span>×</span></button>`)
    .join("");
}

function renderPassports() {
  if (!els.passportGrid || !market()) return;
  if (isProgramDirectoryMarket()) {
    setText(els.passportCount, "공개 Passport 0개");
    els.passportGrid.innerHTML = `<div class="market-empty">Program DB 참가기업의 기본 프로필만 연결되어 있습니다. 상세 Tech Passport는 기업 확인과 SparkLabs 검토 후 공개됩니다.</div>`;
    if (els.passportEditorPanel) els.passportEditorPanel.hidden = true;
    return;
  }
  const submitted = (market().submissions || []).filter((item) => item.type === "Tech Passport");
  const submittedIds = new Set(submitted.map((item) => item.id));
  const evidenceProfiles = (market().startups || [])
    .filter((startup) => !submittedIds.has(startup.id))
    .sort((a, b) => evidenceScore(b) - evidenceScore(a))
    .slice(0, 12);
  const cards = [
    ...submitted.map((passport) => ({ startup: startupById(passport.id) || submissionAsStartup(passport), passport, source: "Team submitted" })),
    ...evidenceProfiles.map((startup) => ({ startup, passport: passportForStartup(startup), source: "SparkLabs source evidence" }))
  ];
  setText(els.passportCount, `${formatNumber(cards.length)} profiles`);
  els.passportGrid.innerHTML = cards.map(passportCardMarkup).join("");
  configurePassportEditor();
}

function passportCardMarkup({ startup, passport, source }) {
  const techStack = techStackFor(startup);
  const status = passport?.status || "evidence_profile";
  return `<article class="passport-card">
    <div class="passport-card-top">
      ${companyIconMarkup(startup)}
      <span class="passport-status ${status === "published" ? "is-verified" : ""}">${escapeHtml(passportStatus(status))}</span>
    </div>
    <span class="market-category">${escapeHtml(startup.category || passport?.category || "AI Product")}</span>
    <h3>${escapeHtml(startup.name)}</h3>
    <p>${escapeHtml(startup.tagline || passport?.tagline || "")}</p>
    ${taskKeywordMarkup(startup, 3)}
    <div class="passport-proof-grid">
      <span><b>${techStack.itemCount || 0}</b> stack items</span>
      <span><b>${repositoryUrl(startup) ? "Linked" : "Private"}</b> repository</span>
      <span><b>—</b> active LOC</span>
      <span><b>${formatScore(startup.benchmarkScore)}</b> benchmark</span>
    </div>
    <div class="tech-stack-preview passport-stack-preview">
      <div class="tech-stack-preview-head"><strong>Tech Stack</strong><span>${escapeHtml(stackSourceShort(techStack))}</span></div>
      ${techStack.hasDisclosure ? compactStackMarkup(techStack, 7) : `<p>Stack disclosure pending</p>`}
    </div>
    <div class="passport-card-footer"><span>${escapeHtml(source)}</span><button class="text-link" data-market-team="${escapeHtml(startup.id)}" type="button">열기 →</button></div>
  </article>`;
}

function configurePassportEditor() {
  if (!els.passportForm || !viewer()) return;
  const canEdit = Boolean(viewer().canSubmitProducts);
  els.passportForm.querySelectorAll("input, textarea, select, button").forEach((control) => {
    control.disabled = !canEdit;
  });
  if (!canEdit) {
    els.passportEditorPanel?.classList.add("is-locked");
    setText(els.passportEditorIntro, viewer().role === "b2b_partner"
      ? "B2B 파트너는 공개된 Tech Passport를 검토하고 승인된 상세 자료를 요청할 수 있습니다."
      : "Tech Passport 편집은 승인된 포트폴리오 팀 계정에서 사용할 수 있습니다.");
    setText(els.passportReadiness, "VIEW ONLY");
    return;
  }
  els.passportEditorPanel?.classList.remove("is-locked");
  const existing = myPassport();
  if (!passportFormTouched) fillPassportForm(existing);
  const readiness = existing?.readiness?.score || estimatePassportReadiness(readPassportForm());
  setText(els.passportReadiness, `${readiness}% ready`);
  setText(
    els.passportEditorIntro,
    existing
      ? `현재 상태: ${passportStatus(existing.status)} · 저장된 기술 증거를 업데이트할 수 있습니다.`
      : "민감한 원천코드는 저장하지 않습니다. 공개 가능한 기술 정보부터 Draft로 저장하세요."
  );
}

function fillPassportForm(passport) {
  const form = els.passportForm;
  if (!form) return;
  const technical = passport?.technicalProfile || {};
  const team = passport?.teamMembers?.[0] || {};
  const defaults = {
    id: passport?.id || "",
    name: passport?.name || context.hub?.viewerTeam?.name || "",
    category: passport?.category || context.hub?.viewerTeam?.sector || "",
    tagline: passport?.tagline || "",
    shortDescription: passport?.shortDescription || "",
    website: linkUrl(passport, "website"),
    github: linkUrl(passport, "github"),
    stack: (technical.stack || []).join(", "),
    frameworks: (technical.frameworks || []).join(", "),
    modalities: (technical.modalities || []).join(", "),
    dataSources: (technical.dataSources || []).join(", "),
    providers: (technical.providers || []).join(", "),
    stackVisibility: technical.stackVisibility || "arena_members",
    architecture: passport?.longDescriptionMarkdown || "",
    deployment: technical.deployment || "",
    apiDetails: technical.apiDetails || "",
    privacy: technical.privacy || "",
    limitations: technical.limitations || "",
    evaluationClaims: technical.evaluationClaims || "",
    memberName: team.name || "",
    memberRole: team.role || ""
  };
  for (const [name, value] of Object.entries(defaults)) {
    const field = form.elements.namedItem(name);
    if (field) field.value = value;
  }
  setText(els.passportReadiness, `${passport?.readiness?.score || estimatePassportReadiness(defaults)}% ready`);
}

function readPassportForm() {
  if (!els.passportForm) return {};
  return Object.fromEntries(new FormData(els.passportForm).entries());
}

function buildPassportSubmission() {
  const values = readPassportForm();
  const email = viewer()?.email || "";
  const links = [
    values.website ? { type: "website", url: values.website, label: "Website" } : null,
    values.github ? { type: "github", url: values.github, label: "GitHub" } : null
  ].filter(Boolean);
  return {
    id: values.id || undefined,
    type: "Tech Passport",
    status: myPassport()?.status || "draft",
    visibility: "private",
    name: values.name,
    slug: slugify(values.name),
    tagline: values.tagline,
    shortDescription: values.shortDescription,
    longDescriptionMarkdown: values.architecture,
    makerNote: "Technical evidence supplied by the team for governed Arena review.",
    category: values.category,
    stage: myPassport()?.stage || "Pre-Seed",
    region: myPassport()?.region || "Korea",
    affiliation: "SparkLabs AI Arena",
    launchTags: ["Tech Passport"],
    technicalTags: splitList(`${values.stack},${values.modalities}`),
    links,
    teamMembers: [{ name: values.memberName, role: values.memberRole, email }],
    technicalProfile: {
      productType: "AI Product",
      modalities: splitList(values.modalities),
      stack: splitList(values.stack),
      frameworks: splitList(values.frameworks),
      providers: splitList(values.providers),
      dataSources: splitList(values.dataSources),
      stackVisibility: values.stackVisibility,
      deployment: values.deployment,
      apiDetails: values.apiDetails,
      privacy: values.privacy,
      limitations: values.limitations,
      evaluationClaims: values.evaluationClaims
    },
    helpRequests: ["B2B pilot", "Technical validation"]
  };
}

async function savePassport(submitForReview) {
  if (!viewer()?.canSubmitProducts) {
    setStatus(els.passportFormStatus, "승인된 팀 계정에서만 저장할 수 있습니다.", "error");
    return;
  }
  const submission = buildPassportSubmission();
  if (!submission.name || !submission.tagline || !submission.shortDescription || !submission.category) {
    setStatus(els.passportFormStatus, "이름, 분야, 한 줄 설명과 제품 설명을 먼저 입력해 주세요.", "error");
    return;
  }
  setPassportPending(true);
  try {
    const saved = await postMarketAction("saveSubmissionDraft", { submission });
    const savedSubmission = saved.event?.submission;
    if (savedSubmission?.id) els.passportForm.elements.namedItem("id").value = savedSubmission.id;
    passportFormTouched = false;
    if (submitForReview) {
      if (!savedSubmission?.readiness?.canSubmit) {
        throw new Error(`검토 요청 전 보완: ${(savedSubmission?.readiness?.missingItems || []).join(", ")}`);
      }
      await postMarketAction("submitSubmissionForReview", { id: savedSubmission.id, submission: savedSubmission });
      setStatus(els.passportFormStatus, "SparkLabs 검토 Queue에 제출했습니다.", "success");
    } else {
      setStatus(els.passportFormStatus, "Tech Passport Draft를 저장했습니다.", "success");
    }
  } catch (error) {
    setStatus(els.passportFormStatus, error.message || "Tech Passport를 저장하지 못했습니다.", "error");
  } finally {
    setPassportPending(false);
  }
}

function setPassportPending(pending) {
  if (els.passportSaveButton) els.passportSaveButton.disabled = pending;
  if (els.passportSubmitButton) els.passportSubmitButton.disabled = pending;
}

function updatePassportDraftReadiness() {
  setText(els.passportReadiness, `${estimatePassportReadiness(readPassportForm())}% ready`);
}

function estimatePassportReadiness(values) {
  const checks = [
    values.name && values.tagline && values.shortDescription && values.category,
    values.website || values.github,
    values.architecture,
    values.memberName && values.memberRole,
    values.stack && (values.frameworks || values.modalities || values.dataSources),
    values.deployment && values.apiDetails,
    values.limitations && values.privacy,
    values.evaluationClaims
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function renderSimilarTeamRecommendations() {
  if (!els.similarTeamPanel) return;
  const subjectTeam = context?.hub?.viewerTeam || market()?.viewerTeam || null;
  const visible = isClawMemberViewer() && Boolean(subjectTeam);
  els.similarTeamPanel.hidden = !visible;
  if (!visible) return;

  if (els.similarTeamDescription) {
    els.similarTeamDescription.textContent = `${subjectTeam.name || "내 팀"}의 공개 프로필에서 공통 산업·문제·AI 역량을 찾아 추천 순서와 관점별 근거로 보여드립니다. 협업 적합도와는 별개의 프로필 유사도입니다.`;
  }
  if (els.similarTeamRefreshButton) {
    els.similarTeamRefreshButton.disabled = similarTeamState.status === "loading";
    els.similarTeamRefreshButton.setAttribute("aria-busy", similarTeamState.status === "loading" ? "true" : "false");
  }

  if (similarTeamState.status === "loading" || similarTeamState.status === "idle") {
    els.similarTeamList.innerHTML = [0, 1, 2].map(() => `<article class="similar-team-card is-loading" aria-hidden="true"><i></i><span></span><small></small></article>`).join("");
    setText(els.similarTeamStatus, "클로이가 다른 팀의 공개 프로필과 공통 근거를 비교하고 있습니다.");
    return;
  }
  if (similarTeamState.status === "error") {
    els.similarTeamList.innerHTML = `<div class="market-empty compact">${escapeHtml(similarTeamState.error || "유사 팀 추천을 불러오지 못했습니다.")}</div>`;
    setText(els.similarTeamStatus, "잠시 후 다시 계산해 주세요.");
    return;
  }
  if (similarTeamState.status === "profile_required") {
    els.similarTeamList.innerHTML = `<div class="market-empty compact">본인 팀의 산업·서비스 설명·AI 역량 프로필을 보완하면 유사 팀을 추천할 수 있습니다.</div>`;
    setText(els.similarTeamStatus, "프로필 근거가 충분해지면 자동으로 다시 계산됩니다.");
    return;
  }

  const recommendations = similarTeamState.recommendations || [];
  els.similarTeamList.innerHTML = recommendations.length
    ? recommendations.map(similarTeamCardMarkup).join("")
    : `<div class="market-empty compact">공개 프로필에서 충분한 공통 근거를 가진 팀을 찾지 못했습니다.</div>`;
  const generated = similarTeamState.generatedAt ? formatDateTime(similarTeamState.generatedAt) : "현재";
  setText(els.similarTeamStatus, `${formatNumber(similarTeamState.population)}개 팀의 공개 프로필 기준 · ${generated} 계산 · 비교 슬롯은 직접 선택`);
}

function similarTeamCardMarkup(item) {
  const startup = startupById(item.teamId);
  const selected = selectedTeamIds.includes(String(item.teamId));
  const signals = (item.sharedSignals || []).slice(0, 3);
  const basisLabel = similarTeamBasisLabel(item);
  return `<article class="similar-team-card">
    <button class="similar-team-card-main" data-similar-team-open="${escapeHtml(item.teamId)}" type="button">
      ${startup ? companyIconMarkup(startup) : `<span class="company-icon company-icon-fallback">AI</span>`}
      <span class="similar-team-card-copy">
        <span class="similar-team-rank">유사 팀 ${String(item.rank).padStart(2, "0")}</span>
        <strong>${escapeHtml(item.teamName)}</strong>
        <small>${escapeHtml(item.reason)}</small>
      </span>
      <span class="similar-team-basis"><small>유사 관점</small><b>${escapeHtml(basisLabel)}</b></span>
    </button>
    <div class="similar-team-card-foot">
      <span>${signals.map((signal) => `<i>${escapeHtml(signal)}</i>`).join("")}</span>
      <button class="secondary-button compact" data-similar-team-compare="${escapeHtml(item.teamId)}" type="button" ${selected ? "disabled" : ""}>${selected ? "비교 선택됨" : "비교에 추가"}</button>
    </div>
  </article>`;
}

function similarTeamBasisLabel(item) {
  const evidence = [
    ...(Array.isArray(item?.sharedSignals) ? item.sharedSignals : []),
    ...(Array.isArray(item?.evidence) ? item.evidence : []),
    item?.reason
  ].join(" ").normalize("NFKC").toLocaleLowerCase("ko-KR");
  const hasTechnology = /(ai|인공지능|에이전트|llm|생성형|자동화|api|데이터|비전|로보틱|모델|플랫폼|saas)/u.test(evidence);
  const hasIndustry = /(헬스|의료|제조|패션|광고|교육|금융|커머스|리테일|게임|모빌리티|보안|푸드|adtech|health|medical|manufactur|fashion|education|fintech|commerce|retail|gaming)/u.test(evidence);
  const hasTask = /(문제|업무|운영|워크플로|고객|마케팅|품질|검사|관리|개선|예측|분석|workflow|operation|quality|customer|task)/u.test(evidence);

  if (hasTechnology && hasTask) return "문제·기술 유사";
  if (hasIndustry && hasTechnology) return "산업·기술 유사";
  if (hasIndustry && hasTask) return "시장·문제 유사";
  if (hasTechnology) return "기술 접근 유사";
  if (hasIndustry) return "산업 맥락 유사";
  if (hasTask) return "해결 과제 유사";
  return "프로필 관점 유사";
}

async function loadSimilarTeamRecommendations({ refresh = false } = {}) {
  if (!isClawMemberViewer() || !els.similarTeamPanel) return;
  const currentViewerKey = viewerIdentity(viewer());
  if (!currentViewerKey) return;
  if (!refresh && similarTeamState.viewerKey === currentViewerKey && ["loading", "ready", "profile_required"].includes(similarTeamState.status)) return;
  const session = readSession();
  if (!session?.access_token) return;

  const requestId = ++similarTeamRequestId;
  similarTeamState = { ...emptySimilarTeamState(), viewerKey: currentViewerKey, status: "loading" };
  renderSimilarTeamRecommendations();
  const progressToken = startProcessStatus(els.globalProcessStatus, [
    "내 팀의 공개 프로필 근거를 정리하고 있습니다.",
    "다른 Claw Member 팀과 공통 산업·문제·AI 역량을 비교하고 있습니다.",
    "추천 순서와 공통 근거를 저장하고 있습니다."
  ], { announcement: "나와 비슷한 팀을 계산하고 있습니다." });
  try {
    const response = await fetch("/api/similar-team-recommendations", {
      method: refresh ? "POST" : "GET",
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const result = await safeJson(response);
    if (!response.ok) throw new Error(result?.error || "유사 팀 추천을 불러오지 못했습니다.");
    if (requestId !== similarTeamRequestId || currentViewerKey !== viewerIdentity(viewer())) return;
    similarTeamState = {
      viewerKey: currentViewerKey,
      status: result.status === "profile_required" ? "profile_required" : "ready",
      recommendations: (result.recommendations || []).filter((item) => startupById(item.teamId)),
      population: Number(result.population || 0),
      generatedAt: result.generatedAt || null,
      stored: Boolean(result.stored),
      error: ""
    };
  } catch (error) {
    if (requestId !== similarTeamRequestId || currentViewerKey !== viewerIdentity(viewer())) return;
    similarTeamState = { ...emptySimilarTeamState(), viewerKey: currentViewerKey, status: "error", error: error.message || "유사 팀 추천을 불러오지 못했습니다." };
  } finally {
    finishProcessStatus(els.globalProcessStatus, progressToken);
    if (requestId === similarTeamRequestId) renderSimilarTeamRecommendations();
  }
}

function handleSimilarTeamAction(event) {
  const compareButton = event.target.closest("[data-similar-team-compare]");
  if (compareButton) {
    const id = String(compareButton.dataset.similarTeamCompare || "");
    if (!id || !startupById(id) || selectedTeamIds.includes(id)) return;
    if (selectedTeamIds.length >= 3) {
      showToast("비교 슬롯 3개가 모두 찼습니다. 한 팀을 제외한 뒤 추가해 주세요.");
      return;
    }
    selectedTeamIds.push(id);
    renderCompare();
    renderCompareTray();
    return;
  }
  const openButton = event.target.closest("[data-similar-team-open]");
  if (!openButton) return;
  const startup = startupById(String(openButton.dataset.similarTeamOpen || ""));
  if (startup) openMarketTeam(startup);
}

function emptySimilarTeamState() {
  return { viewerKey: "", status: "idle", recommendations: [], population: 0, generatedAt: null, stored: false, error: "" };
}

function isComparePageActive() {
  return Boolean(document.querySelector('[data-page-panel="compare"].is-active'));
}

function renderCompare() {
  if (!els.comparisonResult || !market()) return;
  renderSimilarTeamRecommendations();
  const backButton = document.querySelector("#comparePage [data-go-page]");
  if (backButton) {
    backButton.dataset.goPage = viewer()?.role === "b2b_partner" ? "teams" : "discover";
    backButton.textContent = viewer()?.role === "b2b_partner" ? "전체 참가기업 보기" : "팀 다시 선택";
  }
  const startups = market().startups || [];
  const validIds = new Set(startups.map((item) => String(item.id)));
  const reconciledSelection = selectedTeamIds.filter((id) => validIds.has(String(id))).slice(0, 3);
  if (reconciledSelection.join("|") !== selectedTeamIds.join("|")) {
    selectedTeamIds = reconciledSelection;
  }
  fillCompareSelect(els.compareTeamA, startups, selectedTeamIds[0] || "");
  fillCompareSelect(els.compareTeamB, startups, selectedTeamIds[1] || "");
  fillCompareSelect(els.compareTeamC, startups, selectedTeamIds[2] || "", true);
  const teams = selectedTeamIds.map(startupById).filter(Boolean);
  if (teams.length < 2) {
    els.comparisonResult.innerHTML = `<div class="market-empty">비교할 기업을 두 곳 이상 직접 선택하세요. 임의의 기본 기업은 자동으로 선택하지 않습니다.</div>`;
    return;
  }
  const programDirectory = teams.every((team) => team.source === "program_directory");
  const selectionKey = comparisonSelectionKey();
  const headers = teams.map((team) => `<th>${companyIconMarkup(team)}<strong>${escapeHtml(team.name)}</strong><small>${escapeHtml(team.category || "")}</small></th>`).join("");
  const companyColumns = teams.map(() => `<col class="comparison-company-column">`).join("");
  const rows = programDirectory
    ? [
        ["산업 분야", (team) => team.category || "미확인"],
        ["한 줄 소개", (team) => team.tagline || "프로필 보완 필요"],
        ["서비스와 해결 문제", (team) => team.serviceSummary || team.description || "프로필 보완 필요"],
        ["AI 적용 아이디어", (team) => team.aiIdeaSummary || "공개 정보 없음"],
        ["해결 Task", (team) => taskKeywords(team, 6).join(", ")],
        ["기술·도메인 근거", (team) => (team.functions || []).slice(0, 8).join(", ") || "프로필 보완 필요"],
        ["프로그램 그룹", (team) => team.programGroup || "미확인"],
        ["회사 웹사이트", (team) => team.products?.[0]?.url ? "공개됨" : "미공개"],
        ["상세 기술·고객 근거", () => "대상 스타트업 승인과 SparkLabs 확인 후 공개"]
      ]
    : [
        ["해결 Task", (team) => taskKeywords(team, 6).join(", ")],
        ["Validated use case", (team) => (team.functions || []).slice(0, 4).join(", ") || "Not disclosed"],
        ["Stage / region", (team) => `${team.stage || "—"} · ${team.region || "—"}`],
        ["Technical evidence", (team) => `${evidenceScore(team)}/100 evidence completeness`],
        ["Languages & runtimes", (team) => stackGroupItems(team, "languages").join(", ") || "Not disclosed"],
        ["Frameworks", (team) => stackGroupItems(team, "frameworks").join(", ") || "Not disclosed"],
        ["AI & models", (team) => stackGroupItems(team, "ai").join(", ") || "Not disclosed"],
        ["Data & storage", (team) => stackGroupItems(team, "data").join(", ") || "Not disclosed"],
        ["Cloud & infrastructure", (team) => stackGroupItems(team, "infra").join(", ") || "Not disclosed"],
        ["Stack evidence source", (team) => techStackFor(team).sourceLabel || "Not disclosed"],
        ["Repository", (team) => repositoryUrl(team) ? "Linked · scan pending" : "Private / not disclosed"],
        ["Active LOC", () => "Not scored · verified scan required"],
        ["Architecture", (team) => passportForStartup(team)?.longDescriptionMarkdown ? "Team-submitted context available" : "Partner access required"],
        ["Deployment & security", (team) => passportForStartup(team)?.technicalProfile?.deployment || "Not disclosed"],
        ["Benchmark signal", (team) => formatScore(team.benchmarkScore)],
        ["Commercial evidence", (team) => team.traction || "Not disclosed"],
        ["Verification", (team) => verificationBadges(team).join(", ")]
      ];
  els.comparisonResult.innerHTML = `
    ${compareSummaryMarkup(teams, selectionKey)}
    <div class="compare-policy-note"><strong>${programDirectory ? "Program DB 기본 프로필 비교" : "No single Arena score"}</strong><span>${programDirectory ? "공개 가능한 동일 항목만 나란히 표시하며, 미확인 정보를 추정하거나 점수화하지 않습니다." : "각 증거를 독립적으로 비교합니다. 규모나 코드 줄 수가 크다고 높은 평가를 받지 않습니다."}</span></div>
    <div class="comparison-table-wrap"><table class="comparison-table"><colgroup><col class="comparison-dimension-column">${companyColumns}</colgroup><thead><tr><th>Evidence dimension</th>${headers}</tr></thead>
    <tbody>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th>${teams.map((team) => `<td>${escapeHtml(value(team))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    <div class="compare-cta"><div><strong>더 깊은 기술 검토가 필요하신가요?</strong><span>${programDirectory ? "대상 스타트업이 My Log에서 요청을 승인한 뒤 SparkLabs가 상세 확인과 소개를 진행합니다." : "NDA 이후 상세 Architecture, SBOM, Test report와 기간 제한 Repository 접근을 요청할 수 있습니다."}</span></div><button class="primary-button compact" data-market-page="${isClawMemberViewer() ? "discover" : "partnerships"}" type="button">${isClawMemberViewer() ? "기업 상세에서 협업 검토" : programDirectory ? "파트너 연결 검토 요청" : "Diligence 요청"}</button></div>`;
}

function syncCompareFromSelects(requestSummary = false) {
  selectedTeamIds = unique([els.compareTeamA?.value, els.compareTeamB?.value, els.compareTeamC?.value].filter(Boolean)).slice(0, 3);
  compareSummaryRequestId += 1;
  compareSummaryState = { key: "", status: "idle", summary: null, error: "" };
  renderCompare();
  renderCompareTray();
  if (requestSummary && selectedTeamIds.length >= 2) requestCompareSummary();
}

async function requestCompareSummary() {
  const session = readSession();
  if (!session?.access_token) {
    compareSummaryState = { key: comparisonSelectionKey(), status: "error", summary: null, error: "로그인 후 비교 요약을 이용할 수 있습니다." };
    renderCompare();
    return;
  }
  const key = comparisonSelectionKey();
  const requestId = ++compareSummaryRequestId;
  compareSummaryState = { key, status: "loading", summary: null, error: "" };
  renderCompare();
  if (els.runCompareButton) {
    els.runCompareButton.disabled = true;
    els.runCompareButton.setAttribute("aria-busy", "true");
  }
  const progressToken = startProcessStatus(els.globalProcessStatus, COMPARE_SUMMARY_PROGRESS_STEPS, {
    announcement: "선택한 기업의 차이점을 요약하고 있습니다."
  });
  try {
    const response = await fetch("/api/compare-summary", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ teamIds: [...selectedTeamIds] })
    });
    const result = await safeJson(response);
    if (!response.ok) throw new Error(result?.error || "기업 비교 요약을 생성하지 못했습니다.");
    if (requestId !== compareSummaryRequestId || key !== comparisonSelectionKey()) return;
    compareSummaryState = { key, status: "ready", summary: result.summary, error: "" };
    renderCompare();
  } catch (error) {
    if (requestId !== compareSummaryRequestId || key !== comparisonSelectionKey()) return;
    compareSummaryState = { key, status: "error", summary: null, error: error.message || "기업 비교 요약을 생성하지 못했습니다." };
    renderCompare();
  } finally {
    if (els.runCompareButton && (requestId === compareSummaryRequestId || compareSummaryState.status !== "loading")) {
      els.runCompareButton.disabled = false;
      els.runCompareButton.removeAttribute("aria-busy");
    }
    finishProcessStatus(els.globalProcessStatus, progressToken);
  }
}

function compareSummaryMarkup(teams, selectionKey) {
  const current = compareSummaryState.key === selectionKey ? compareSummaryState : { status: "idle" };
  if (current.status === "loading") {
    return `<section class="compare-summary-card is-loading" aria-live="polite" aria-busy="true">
      <div class="compare-summary-head"><div><span class="section-kicker">AGENTIC COMPARISON</span><h2>핵심 차이를 정리하고 있습니다</h2></div><span class="compare-summary-agent"><i></i>에이전트 분석 중</span></div>
      <p class="compare-summary-overview">공개 프로필의 서비스, AI 적용 아이디어와 역량 키워드를 같은 기준으로 비교합니다.</p>
    </section>`;
  }
  if (current.status === "error") {
    return `<section class="compare-summary-card is-error" aria-live="polite">
      <div class="compare-summary-head"><div><span class="section-kicker">COMPARISON SUMMARY</span><h2>요약을 표시하지 못했습니다</h2></div></div>
      <p class="compare-summary-overview">${escapeHtml(current.error || "아래 비교 표에서 기업별 차이를 확인해 주세요.")}</p>
    </section>`;
  }
  if (current.status !== "ready" || !current.summary) {
    return `<section class="compare-summary-card is-idle">
      <div class="compare-summary-head"><div><span class="section-kicker">AGENTIC COMPARISON</span><h2>핵심 차이 요약</h2></div><span class="compare-summary-agent">클로이 분석 실행 시 생성</span></div>
      <p class="compare-summary-overview">클로이 비교 분석을 실행하면 선택한 ${teams.length}개 기업이 무엇을 해결하고 AI를 어떻게 적용하는지 공개 근거를 바탕으로 정리합니다.</p>
    </section>`;
  }
  const summary = current.summary;
  const highlights = (summary.teamHighlights || []).map((item) => `
    <article><strong>${escapeHtml(item.teamName || teams.find((team) => String(team.id) === String(item.teamId))?.name || "기업")}</strong><p>${escapeHtml(item.differentiator || "공개 프로필을 확인해 주세요.")}</p></article>`).join("");
  const differences = (summary.keyDifferences || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<section class="compare-summary-card is-ready" aria-live="polite">
    <div class="compare-summary-head"><div><span class="section-kicker">AGENTIC COMPARISON</span><h2>핵심 차이 요약</h2></div><span class="compare-summary-agent"><i></i>${summary.source === "spark_ai" ? "클로이 분석 완료" : "근거 기반 분석 완료"}</span></div>
    <p class="compare-summary-overview">${escapeHtml(summary.overview || "선택한 기업의 공개 프로필을 비교했습니다.")}</p>
    <div class="compare-summary-teams">${highlights}</div>
    ${differences ? `<ul class="compare-summary-differences">${differences}</ul>` : ""}
    <small class="compare-summary-note">공개 프로필에 적힌 내용만 요약하며, 순위나 종합 점수를 생성하지 않습니다.${summary.warning ? ` ${escapeHtml(summary.warning)}` : ""}</small>
  </section>`;
}

function comparisonSelectionKey() {
  return selectedTeamIds.map(String).join("|");
}

function renderPartnerships() {
  if (!market()) return;
  const staff = Boolean(viewer()?.canScore);
  const canRequest = Boolean(viewer()?.canRequestConnections || viewer()?.canScore);
  [els.bountyBriefForm, els.connectionForm].forEach((form) => {
    form?.querySelectorAll("input, textarea, select, button").forEach((control) => {
      control.disabled = !canRequest;
    });
  });
  els.bountyBriefForm?.querySelectorAll("[data-bounty-staff-only]").forEach((field) => {
    field.hidden = !staff;
    field.querySelectorAll("input, textarea, select, button").forEach((control) => {
      control.disabled = !staff;
    });
  });
  configureBountyBriefEditor({ staff });
  if (!canRequest) {
    setStatus(els.bountyBriefStatus, "기업 문제 등록은 승인된 B2B 파트너 계정에서 사용할 수 있습니다.");
    setStatus(els.connectionStatus, "팀 연결 요청은 승인된 B2B 파트너 계정에서 사용할 수 있습니다.");
  } else {
    setStatus(els.bountyBriefStatus, "");
    setStatus(els.connectionStatus, "");
  }
  const connectionRequests = market().connectionRequests || [];
  const bountyRequests = market().bountyRequests || [];
  const items = [
    ...bountyRequests.map((item) => ({ ...item, pipelineType: "bounty", title: item.problemTitle, subtitle: item.organization })),
    ...connectionRequests.map((item) => ({
      ...item,
      pipelineType: "connection",
      title: startupById(item.startupId)?.name || "Team connection",
      subtitle: `${item.organization || "B2B partner"} · ${item.intent || "Connection"}`
    }))
  ].sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));
  setText(els.pipelineCount, formatNumber(items.length));
  if (els.partnershipPipeline) {
    if (staff) {
      const bountyItems = items.filter((item) => item.pipelineType === "bounty");
      const connectionItems = items.filter((item) => item.pipelineType === "connection");
      els.partnershipPipeline.innerHTML = `
        <section class="pipeline-group" aria-labelledby="managedBountyBriefsTitle">
          <div class="pipeline-group-head"><div><span>BOUNTY BRIEF MANAGEMENT</span><h3 id="managedBountyBriefsTitle">설계된 Bounty Brief</h3></div><strong>${formatNumber(bountyItems.length)}</strong></div>
          <p class="pipeline-group-copy">수정할 Brief를 불러오면 파트너가 등록한 설계와 운영 설정이 편집 화면에 채워집니다.</p>
          <div class="pipeline-group-list">${bountyItems.length ? bountyItems.map(pipelineCardMarkup).join("") : `<div class="market-empty">아직 관리할 Bounty Brief가 없습니다. 파트너 접수 후 이 목록에서 불러올 수 있습니다.</div>`}</div>
        </section>
        <section class="pipeline-group is-secondary" aria-labelledby="managedConnectionsTitle">
          <div class="pipeline-group-head"><div><span>INTRODUCTION REQUESTS</span><h3 id="managedConnectionsTitle">팀 연결 요청</h3></div><strong>${formatNumber(connectionItems.length)}</strong></div>
          <div class="pipeline-group-list">${connectionItems.length ? connectionItems.map(pipelineCardMarkup).join("") : `<div class="market-empty">진행 중인 팀 연결 요청이 없습니다.</div>`}</div>
        </section>`;
    } else {
      els.partnershipPipeline.innerHTML = items.length
        ? items.map(pipelineCardMarkup).join("")
        : `<div class="market-empty">아직 진행 중인 요청이 없습니다. Bounty Brief 또는 팀 연결 요청을 시작하세요.</div>`;
    }
  }
}

function configureBountyBriefEditor({ staff = Boolean(viewer()?.canScore) } = {}) {
  if (!els.bountyBriefForm) return;
  const editing = staff && Boolean(bountyEditingRequestId);
  if (els.bountyBriefFormTitle) {
    els.bountyBriefFormTitle.textContent = editing ? "Bounty Brief 수정" : staff ? "Bounty Brief Studio" : "기업 Bounty 등록";
  }
  if (els.bountyBriefFormDescription) {
    els.bountyBriefFormDescription.textContent = editing
      ? "파트너가 제출한 원본과 운영 설정을 검토해 수정합니다. 공개 단계로 저장하면 Bounty Board 과제가 같은 내용으로 동기화됩니다."
      : staff
        ? "파트너사를 대신해 Brief를 등록하거나 제출된 Brief를 수정하고 공개 단계까지 한 화면에서 관리합니다."
        : "문제와 성공 기준뿐 아니라 평가 방식·기준·공개 범위까지 한 번에 설정합니다. 제출 후 SparkLabs가 같은 Brief에서 검토와 공개 전환을 이어갑니다.";
  }
  if (els.bountyBriefRoleBadge) els.bountyBriefRoleBadge.textContent = staff ? "SPARKLABS MANAGED" : "PARTNER SUBMISSION";
  if (els.bountyBriefSubmit) els.bountyBriefSubmit.textContent = editing ? "수정 내용과 운영 설정 저장" : staff ? "파트너 대신 Brief 등록" : "Brief와 운영 설정 제출";
  if (els.bountyBriefCancelEdit) els.bountyBriefCancelEdit.hidden = !editing;
}

function pipelineCardMarkup(item) {
  const staff = Boolean(viewer()?.canScore);
  const memberCanRespond = viewer()?.role === "member" && item.pipelineType === "connection" && ["qualified", "founder_review"].includes(item.status);
  const stages = item.pipelineType === "bounty"
    ? ["intake", "qualified", "design", "published", "evaluating", "pilot", "production"]
    : ["interest", "qualified", "founder_review", "mutually_accepted", "intro_scheduled", "discovery", "pilot", "production"];
  const current = Math.max(0, stages.indexOf(item.status));
  return `<article class="pipeline-card">
    <div class="pipeline-card-head">
      <div><span>${item.pipelineType === "bounty" ? "BOUNTY BRIEF" : "PARTNERSHIP"}</span><h3>${escapeHtml(item.title || "Untitled")}</h3><p>${escapeHtml(item.subtitle || "")}</p></div>
      <strong>${escapeHtml(PIPELINE_LABELS[item.status] || item.status || "Intake")}</strong>
    </div>
    <div class="pipeline-progress">${stages.map((stage, index) => `<span class="${index <= current ? "is-complete" : ""}" title="${escapeHtml(PIPELINE_LABELS[stage] || stage)}"></span>`).join("")}</div>
    <div class="pipeline-card-footer"><span>다음 단계: ${escapeHtml(item.nextStep || "SparkLabs 확인")}</span><small>${formatDate(item.updatedAt || item.createdAt)}</small></div>
    ${memberCanRespond ? `<div class="pipeline-consent-actions"><p>소개를 요청한 기업의 의사는 접수되었습니다. 대상 스타트업인 우리 팀이 승인한 뒤에만 SparkLabs가 연락처를 연결합니다.</p><button class="primary-button compact" data-connection-response="accepted" data-pipeline-id="${escapeHtml(item.id)}" type="button">소개 동의</button><button class="secondary-button compact" data-connection-response="declined" data-pipeline-id="${escapeHtml(item.id)}" type="button">정중히 거절</button></div>` : ""}
    ${staff ? `<div class="pipeline-staff-actions">${item.pipelineType === "bounty" ? `<button class="is-primary-action" data-bounty-edit="${escapeHtml(item.id)}" data-pipeline-id="${escapeHtml(item.id)}" type="button">Brief 불러와 수정</button>` : ""}${stages.map((stage) => `<button data-pipeline-type="${item.pipelineType}" data-pipeline-id="${escapeHtml(item.id)}" data-pipeline-status="${stage}" type="button">${escapeHtml(PIPELINE_LABELS[stage] || stage)}</button>`).join("")}</div>` : ""}
  </article>`;
}

async function submitBountyBrief(event) {
  event.preventDefault();
  if (!viewer()?.canRequestConnections && !viewer()?.canScore) return;
  const form = event.currentTarget;
  const staff = Boolean(viewer()?.canScore);
  const editing = staff && Boolean(bountyEditingRequestId);
  const payload = Object.fromEntries(new FormData(form).entries());
  if (staff) {
    payload.organization = String(payload.organization || viewer()?.organization || "SparkLabs").trim();
    payload.requesterEmail = String(payload.requesterEmail || viewer()?.email || "").trim();
  } else {
    payload.organization = viewer()?.organization || "";
    delete payload.requesterEmail;
    delete payload.status;
  }
  const desiredStatus = staff ? String(payload.status || "intake") : "intake";
  setStatus(els.bountyBriefStatus, editing ? "Bounty Brief와 운영 설정을 수정하고 있습니다." : "Bounty Brief와 운영 설정을 등록하는 중입니다.");
  try {
    if (editing) {
      payload.requestId = bountyEditingRequestId;
      payload.status = desiredStatus;
      payload.nextStep = nextStepFor(desiredStatus);
      await postMarketAction("updateBountyRequest", payload);
      resetBountyBriefEditor({ preserveStatus: true });
      setStatus(els.bountyBriefStatus, "수정 내용이 저장됐습니다. 공개 단계라면 Bounty Board 과제에도 동기화됐습니다.", "success");
      showToast("Bounty Brief와 운영 설정을 수정했습니다.");
      return;
    }

    delete payload.requestId;
    delete payload.status;
    const result = await postMarketAction("requestBounty", payload);
    const requestId = result?.event?.request?.id;
    if (staff && requestId && desiredStatus !== "intake") {
      await postMarketAction("updateBountyRequest", {
        ...payload,
        requestId,
        status: desiredStatus,
        nextStep: nextStepFor(desiredStatus)
      });
    }
    resetBountyBriefEditor({ preserveStatus: true });
    setStatus(
      els.bountyBriefStatus,
      staff ? "파트너 대리 Brief가 등록되고 운영 설정이 연결됐습니다." : "등록되었습니다. SparkLabs가 같은 Brief에서 검토와 공개 준비를 이어갑니다.",
      "success"
    );
  } catch (error) {
    setStatus(els.bountyBriefStatus, error.message || "Bounty Brief를 등록하지 못했습니다.", "error");
  }
}

function beginBountyBriefEdit(requestId) {
  if (!viewer()?.canScore || !els.bountyBriefForm) return;
  const request = (market().bountyRequests || []).find((item) => item.id === requestId);
  if (!request) {
    showToast("수정할 Bounty Brief를 찾지 못했습니다.");
    return;
  }
  bountyEditingRequestId = request.id;
  els.bountyBriefForm.reset();
  const values = {
    ...request,
    requestId: request.id,
    evaluationCriteria: Array.isArray(request.evaluationCriteria) ? request.evaluationCriteria.join(", ") : request.evaluationCriteria || "",
    status: request.status || "intake"
  };
  for (const [name, value] of Object.entries(values)) {
    const control = els.bountyBriefForm.elements.namedItem(name);
    if (!control || value === null || value === undefined) continue;
    control.value = String(value);
  }
  configureBountyBriefEditor({ staff: true });
  setStatus(els.bountyBriefStatus, "파트너 제출 원본을 불러왔습니다. 수정 후 저장하면 같은 Brief에 반영됩니다.");
  els.bountyBriefPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => els.bountyBriefForm?.elements?.problemTitle?.focus(), 280);
}

function resetBountyBriefEditor({ preserveStatus = false } = {}) {
  bountyEditingRequestId = "";
  els.bountyBriefForm?.reset();
  configureBountyBriefEditor();
  if (!preserveStatus) setStatus(els.bountyBriefStatus, "");
}

async function submitConnectionRequest(event) {
  event.preventDefault();
  if (!viewer()?.canRequestConnections && !viewer()?.canScore) return;
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  payload.organization = viewer()?.organization || "";
  setStatus(els.connectionStatus, "연결 요청을 등록하는 중입니다.");
  try {
    await postMarketAction("requestConnection", payload);
    event.currentTarget.reset();
    fillTeamSelect(els.connectionTeamSelect, market().startups || [], "연결할 팀 선택");
    setStatus(els.connectionStatus, "요청을 등록했습니다. 상대 팀의 연락처는 수락 후 공유됩니다.", "success");
  } catch (error) {
    setStatus(els.connectionStatus, error.message || "연결 요청을 등록하지 못했습니다.", "error");
  }
}

async function handlePipelineAction(event) {
  const button = event.target.closest("[data-pipeline-id]");
  if (!button) return;
  if (button.dataset.bountyEdit) {
    beginBountyBriefEdit(button.dataset.bountyEdit);
    return;
  }
  if (button.dataset.connectionResponse) {
    if (viewer()?.role !== "member" && !viewer()?.canScore) return;
    try {
      await postMarketAction("respondToConnectionRequest", {
        requestId: button.dataset.pipelineId,
        decision: button.dataset.connectionResponse
      });
      showToast(button.dataset.connectionResponse === "accepted" ? "소개를 수락했습니다. SparkLabs가 양측 일정을 조율합니다." : "요청을 비공개로 거절했습니다. 연락처는 공유되지 않습니다.");
    } catch (error) {
      showToast(error.message || "응답을 저장하지 못했습니다.");
    }
    return;
  }
  if (!viewer()?.canScore) return;
  const action = button.dataset.pipelineType === "bounty" ? "updateBountyRequest" : "updateConnectionRequest";
  try {
    await postMarketAction(action, {
      requestId: button.dataset.pipelineId,
      status: button.dataset.pipelineStatus,
      nextStep: nextStepFor(button.dataset.pipelineStatus)
    });
    showToast("파트너십 단계를 업데이트했습니다.");
  } catch (error) {
    showToast(error.message || "단계를 업데이트하지 못했습니다.");
  }
}

function renderWorkspace() {
  if (!els.workspaceMetrics || !viewer()) return;
  renderAdminActivityExplorer();
  const role = viewer().role || "member";
  if (["member", "sparklabs", "admin"].includes(role)) {
    renderProgramWorkspace(role);
    return;
  }
  const passport = myPassport();
  const myCompetitionSubmissions = competition().submissions || [];
  const myCompetitionOpportunities = competition().opportunities || [];
  const connections = market().connectionRequests || [];
  const bountyRequests = market().bountyRequests || [];
  setText(els.workspaceRoleBadge, roleLabel(role).toUpperCase());
  setText(els.workspaceTitle, "My Log");
  setText(
    els.workspaceSubtitle,
    role === "b2b_partner"
      ? "내가 등록한 Bounty Brief, 스타트업 연결 요청과 Pilot 전환 기록을 확인합니다."
      : role === "sparklabs" || role === "admin"
        ? "내 활동 기록과 함께 Tech Passport 심사, Bounty Intake와 운영 로그를 확인합니다."
        : role === "human_validator"
          ? "내 검증 활동, Community 참여와 받은 반응을 확인합니다."
          : "내가 보낸 매치 요청, Community 활동과 Bounty 진행 상태를 확인합니다."
  );
  const communitySummary = communityActivity.summary || emptyCommunityActivity().summary;
  const metrics = role === "b2b_partner"
    ? [["Match requests", connections.length, "보낸 팀 연결 요청"], ["Community posts", communitySummary.posts, "내가 작성한 글"], ["Comments written", communitySummary.comments, "내가 작성한 댓글"], ["Reactions", communitySummary.commentsReceived + communitySummary.likesReceived, "내 글에 받은 반응"], ["Bounty briefs", bountyRequests.length, "내가 등록한 문제"]]
    : role === "sparklabs" || role === "admin"
      ? [["My posts", communitySummary.posts, "내 Community 글"], ["My comments", communitySummary.comments, "내가 남긴 댓글"], ["Reactions", communitySummary.commentsReceived + communitySummary.likesReceived, "내 글에 받은 반응"], ["Bounty activity", bountyRequests.length + myCompetitionSubmissions.length, "내 신청·제출 기록"]]
      : [["Community posts", communitySummary.posts, "내가 작성한 글"], ["Comments", communitySummary.comments, "내가 남긴 댓글"], ["Reactions", communitySummary.commentsReceived + communitySummary.likesReceived, "내 글에 받은 반응"], ["Bounty runs", myCompetitionSubmissions.length + myCompetitionOpportunities.length, "신청·제출 기록"]];
  renderWorkspaceMetrics(metrics);

  const actions = role === "b2b_partner"
    ? [["보낸 매치 요청 확인", `${connections.length}건의 현재 답변 상태를 확인합니다.`, "workspace"], ["Community 기록 확인", `내 글 ${communitySummary.posts}건 · 댓글 ${communitySummary.comments}건`, "community"], ["Bounty 진행 확인", `${bountyRequests.length}건의 Brief 상태를 확인합니다.`, "arena"], ["Diligence 요청", "전체 참가기업의 공개 프로필을 검토합니다.", "teams"]]
    : role === "sparklabs" || role === "admin"
      ? [["내 Community 기록", `내 글 ${communitySummary.posts}건 · 댓글 ${communitySummary.comments}건`, "community"], ["Tech Passport 검토", `${market().reviewQueue?.length || 0}건이 검토를 기다리고 있습니다.`, "passports"], ["Bounty Intake 정리", `${bountyRequests.length}건의 기업 수요가 있습니다.`, "arena"]]
      : [["Community 활동 이어가기", `내 글 ${communitySummary.posts}건 · 받은 반응 ${communitySummary.commentsReceived + communitySummary.likesReceived}건`, "community"], ["Open Bounty 참가", `${competition().metrics?.openChallenges || 0}개의 Bounty가 열려 있습니다.`, "arena"], ["다른 팀 기술 탐색", "보완 기술과 공동 참여 팀을 찾습니다.", "discover"]];
  els.workspaceActions.innerHTML = actions.map(workspaceActionMarkup).join("");

  const activity = [
    ...bountyRequests.map((item) => ({ source: "BOUNTY", title: item.problemTitle, status: item.status, at: item.updatedAt || item.createdAt })),
    ...connections.map((item) => ({ source: "DISCOVER", title: startupById(item.startupId)?.name || "Team connection", status: item.status, at: item.updatedAt || item.createdAt })),
    ...(passport ? [{ source: "PASSPORT", title: passport.name, status: passport.status, at: passport.updatedAt }] : []),
    ...communityRecentActivity()
  ].sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0)).slice(0, 8);
  renderWorkspaceActivity(activity);

  renderMyLogTimeline({ connections, bountyRequests, submissions: myCompetitionSubmissions, opportunities: myCompetitionOpportunities });
  renderMyLogDetails({ role, connections, bountyRequests, submissions: myCompetitionSubmissions, opportunities: myCompetitionOpportunities });
  renderStaffQueue();
}

function renderProgramWorkspace(role) {
  const staff = role === "sparklabs" || role === "admin";
  const publicBriefMonitor = staff ? myLogCanonicalState.publicBriefMonitor : emptyPublicBriefMonitor();
  const publicBriefs = publicBriefMonitor.items || [];
  const publicBriefCount = Number(publicBriefMonitor.totalCount) || 0;
  const publicBriefLoading = staff && !publicBriefMonitor.available && ["idle", "loading"].includes(myLogCanonicalState.status);
  const hub = context.hub || {};
  const team = hub.viewerTeam || {};
  const activity = team.activity || {};
  const connections = market()?.connectionRequests || [];
  const bountyRequests = market()?.bountyRequests || [];
  const collaborationReviews = hub.collaborationReviews || [];
  const collaborationQueue = hub.programQueues?.collaborationReviews || [];
  const collaborationSummary = hub.collaborationReviewSummary || {};
  const submissions = competition().submissions || [];
  const opportunities = competition().opportunities || [];
  const communitySummary = communityActivity.summary || emptyCommunityActivity().summary;
  setText(els.workspaceRoleBadge, staff ? "STAFF" : "TEAM");
  setText(els.workspaceTitle, staff ? "SparkLabs My Log" : `${team.name || "내 팀"} My Log`);
  setText(
    els.workspaceSubtitle,
    staff
      ? "공개 탐색 Brief 접수와 내 계정 활동, 팀 간 협업 검토 요청·승인 로그를 확인합니다."
      : "내가 보낸 매치 요청, Community 글·댓글·받은 반응과 Bounty 진행 상태를 확인합니다."
  );
  const metrics = staff
    ? [
        ["My posts", communitySummary.posts, "내 Community 글"],
        ["My comments", communitySummary.comments, "내가 남긴 댓글"],
        ["Reactions", communitySummary.commentsReceived + communitySummary.likesReceived, "내 글에 받은 반응"],
        ["Ops reviews", collaborationQueue.length, "전체 협업 검토"],
        ["Discovery briefs", publicBriefLoading ? "…" : publicBriefCount, publicBriefLoading ? "공개 탐색 Brief 확인 중" : "공개 탐색 Brief 누적 접수"]
      ]
    : [
        ["Match requests", collaborationSummary.outgoing || 0, "내가 보낸 협업 검토"],
        ["Community posts", communitySummary.posts, "내가 작성한 글"],
        ["Comments written", communitySummary.comments, "내가 작성한 댓글"],
        ["Reactions", communitySummary.commentsReceived + communitySummary.likesReceived, "내 글에 받은 반응"],
        ["Bounty runs", submissions.length + opportunities.length, "신청·제출 기록"]
      ];
  renderWorkspaceMetrics(metrics);
  const actions = staff
    ? [
        ["탐색 Brief 접수 확인", publicBriefLoading
          ? "첫 화면에서 제출된 탐색 Brief를 확인하고 있습니다."
          : publicBriefCount
            ? `${publicBriefCount}건이 접수되었습니다. 최근 요청 요약을 확인합니다.`
            : "아직 접수된 Brief가 없습니다. 새 요청 여부를 확인합니다.", "workspace", "myLogBriefs"],
        ["협업 검토 감사 로그", `${collaborationQueue.length}건의 요청·승인·거절 이력을 확인합니다.`, "workspace"]
      ]
    : [
        ...(collaborationSummary.incomingPending ? [["받은 매치 요청 답변", `${collaborationSummary.incomingPending}건이 내 답변을 기다리고 있습니다.`, "workspace"]] : []),
        ...(collaborationSummary.outgoing ? [["보낸 매치 요청 확인", `${collaborationSummary.outgoing}건의 상대 팀 답변 상태를 확인합니다.`, "workspace"]] : []),
        ["Community 활동 이어가기", `내 글 ${communitySummary.posts}건 · 작성 댓글 ${communitySummary.comments}건 · 받은 반응 ${communitySummary.commentsReceived + communitySummary.likesReceived}건`, "community"],
        ["Bounty 진행 확인", `${submissions.length + opportunities.length}건의 신청·제출 기록이 있습니다.`, "arena"],
        ["다른 팀 탐색", "다른 Claw Member의 공개 역량을 확인합니다.", "discover"]
      ];
  els.workspaceActions.innerHTML = actions
    .map(workspaceActionMarkup)
    .join("");
  const challengeById = new Map((competition().challenges || []).map((item) => [item.id, item]));
  const recent = [
    ...(!staff ? collaborationReviews.map((item) => ({
      source: "DISCOVER",
      title: `${item.requesterTeamName || "요청 팀"} → ${item.targetTeamName || "대상 팀"}`,
      status: item.status,
      at: item.updatedAt || item.createdAt
    })) : []),
    ...(!staff ? connections.map((item) => ({ source: "DISCOVER", title: `${item.organization || "기업 파트너"} 소개 요청`, status: item.status, at: item.updatedAt || item.createdAt })) : []),
    ...(!staff ? bountyRequests.map((item) => ({ source: "BOUNTY", title: item.problemTitle || "Bounty Brief", status: item.status, at: item.updatedAt || item.createdAt })) : []),
    ...(!staff ? submissions.map((item) => ({ source: "BOUNTY", title: challengeById.get(item.challengeId)?.title || "Bounty 제출", status: item.status, at: item.scoredAt || item.submittedAt })) : []),
    ...(!staff ? opportunities.map((item) => ({ source: "BOUNTY", title: challengeById.get(item.challengeId)?.title || "Bounty 기회 연결", status: item.status, at: item.updatedAt || item.requestedAt })) : []),
    ...communityRecentActivity()
  ].sort((left, right) => Date.parse(right.at || 0) - Date.parse(left.at || 0));
  renderWorkspaceActivity(recent);
  renderMyLogTimeline({
    collaborationReviews: staff ? [] : collaborationReviews,
    connections: staff ? [] : connections,
    bountyRequests: staff ? [] : bountyRequests,
    submissions: staff ? [] : submissions,
    opportunities: staff ? [] : opportunities
  });
  renderMyLogDetails({
    role,
    collaborationReviews: staff ? collaborationQueue : collaborationReviews,
    connections,
    bountyRequests,
    submissions,
    opportunities,
    publicBriefMonitor
  });
  if (staff) renderStaffQueue();
  else if (els.staffMarketQueue) els.staffMarketQueue.hidden = true;
}

function workspaceActionMarkup([title, copy, page, target = ""]) {
  return `<button data-market-page="${escapeHtml(page)}"${target ? ` data-my-log-target="${escapeHtml(target)}"` : ""} type="button"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></span><i>→</i></button>`;
}

function renderWorkspaceMetrics(metrics) {
  if (!els.workspaceMetrics) return;
  els.workspaceMetrics.style.setProperty("--workspace-metric-count", String(Math.max(1, metrics.length)));
  els.workspaceMetrics.innerHTML = metrics
    .map(([label, value, copy]) => `<article><span>${escapeHtml(label)}</span><strong>${typeof value === "number" ? formatNumber(value) : escapeHtml(value)}</strong><small>${escapeHtml(copy)}</small></article>`)
    .join("");
}

function programActivityStatus(status) {
  return ({ pending: "상대 팀 답변 대기", interest: "신청 의사 접수", link_sent: "신청 링크 안내", submitted: "제출·검토 대기", needs_update: "보완 요청", reviewed: "검토 완료", approved: "협업 검토 승인", declined: "협업 검토 거절", rejected: "반려", fulfilled: "지급 완료", registered: "RSVP 신청", attended: "참석", no_show: "불참", cancelled: "취소" })[status] || status || "진행 중";
}

function workspaceActivityLogMarkup(item, index) {
  const parsedTime = Date.parse(item.at || "");
  const dateTime = Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : "";
  const timestamp = rawLogTimestamp(item.at);
  const source = String(item.source || "ACTIVITY").trim().toUpperCase().slice(0, 12) || "ACTIVITY";
  const status = PIPELINE_LABELS[item.status] || passportStatus(item.status) || programActivityStatus(item.status);
  return `<article class="workspace-log-line">
    <span class="workspace-log-sequence" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
    <time${dateTime ? ` datetime="${escapeHtml(dateTime)}"` : ""}>${escapeHtml(timestamp)}</time>
    <span class="workspace-log-source">[${escapeHtml(source)}]</span>
    <strong>${escapeHtml(item.title || "Activity")}</strong>
    <small>${escapeHtml(status)}</small>
  </article>`;
}

function renderWorkspaceActivity(fallbackItems = [], supplementalItems = []) {
  if (!els.workspaceActivity) return;
  if (["idle", "loading"].includes(myLogCanonicalState.status) && !myLogCanonicalState.available) {
    els.workspaceActivity.innerHTML = `<div class="market-empty">SparkClaw AI Arena 전용 활동 원장을 불러오고 있습니다.</div>`;
    return;
  }
  const canonicalItems = myLogCanonicalState.available
    ? myLogCanonicalState.events.map(canonicalMyLogRawActivity).filter(Boolean)
    : [];
  const seen = new Set();
  const activity = [...canonicalItems, ...fallbackItems, ...supplementalItems]
    .filter((item) => item?.title)
    .filter((item) => {
      const parsedTime = Date.parse(item.at || "");
      const timeKey = Number.isFinite(parsedTime) ? Math.floor(parsedTime / 1000) : String(item.at || "");
      const key = `${String(item.source || "ACTIVITY").toUpperCase()}\u0000${String(item.title).trim()}\u0000${timeKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => Date.parse(right.at || 0) - Date.parse(left.at || 0));
  els.workspaceActivity.innerHTML = activity.length
    ? activity.map(workspaceActivityLogMarkup).join("")
    : `<div class="market-empty">아직 AI Arena 활동 기록이 없습니다. Discover, Community 또는 Bounty에서 첫 활동을 시작해 보세요.</div>`;
}

function canonicalMyLogRawActivity(event) {
  const category = canonicalMyLogCategory(event?.category, event?.eventType);
  if (!category) return null;
  return {
    source: category.toUpperCase(),
    title: String(event?.title || "AI Arena 활동").trim(),
    status: String(event?.metadata?.status || event?.detail || event?.eventType || "기록됨").trim(),
    at: event?.occurredAt || event?.recordedAt
  };
}

function rawLogTimestamp(value) {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) return "time_unknown";
  return `${new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(parsed)).replace(" ", "T")}+09:00`;
}

function renderMyLogTimeline({ collaborationReviews = [], connections = [], bountyRequests = [], submissions = [], opportunities = [] }) {
  if (!els.myLogTimelineList || !els.myLogTimelineFilters) return;
  const challengeById = new Map((competition().challenges || []).map((item) => [item.id, item]));
  const discoverItems = [
    ...collaborationReviews.map((item) => ({
      sourceSystem: "program_actions",
      sourceEventId: item.id,
      category: "discover",
      title: item.direction === "incoming"
        ? `${item.requesterTeamName || "다른 팀"}의 협업 검토 요청`
        : item.direction === "outgoing"
          ? `${item.targetTeamName || "대상 팀"}에 보낸 협업 검토`
          : `${item.requesterTeamName || "요청 팀"} → ${item.targetTeamName || "대상 팀"}`,
      detail: programActivityStatus(item.status),
      at: item.updatedAt || item.createdAt,
      target: "myLogMatches"
    })),
    ...connections.map((item) => ({
      sourceSystem: "arena",
      sourceEventId: item.id,
      category: "discover",
      title: `${startupById(item.startupId)?.name || item.startupName || "대상 기업"} 연결 요청`,
      detail: PIPELINE_LABELS[item.status] || programActivityStatus(item.status),
      at: item.updatedAt || item.createdAt,
      target: "myLogMatches"
    }))
  ];
  const communityItems = (communityActivity.recent || []).map((item) => {
    const presentation = communityActivityPresentation(item);
    return {
      sourceSystem: "forum",
      sourceEventId: item.id,
      category: "community",
      title: presentation.title,
      detail: `${presentation.badge} · ${presentation.meta}`,
      at: item.at || item.updatedAt || item.createdAt,
      target: "myLogCommunity"
    };
  });
  const bountyItems = [
    ...bountyRequests.map((item) => ({
      sourceSystem: "arena",
      sourceEventId: item.id,
      category: "bounty",
      title: item.problemTitle || "Bounty Brief",
      detail: `Brief · ${bountyProgressLabel(item.status || "intake")}`,
      at: item.updatedAt || item.createdAt,
      target: "myLogBounties"
    })),
    ...submissions.map((item) => ({
      sourceSystem: "competition",
      sourceEventId: item.id,
      category: "bounty",
      title: challengeById.get(item.challengeId)?.title || "Bounty 제출",
      detail: `제출 · ${bountyProgressLabel(item.status || "submitted")}`,
      at: item.scoredAt || item.submittedAt,
      target: "myLogBounties"
    })),
    ...opportunities.map((item) => ({
      sourceSystem: "competition",
      sourceEventId: item.id,
      category: "bounty",
      title: challengeById.get(item.challengeId)?.title || "Bounty 기회 연결",
      detail: `기회 요청 · ${bountyProgressLabel(item.status || "requested")}`,
      at: item.updatedAt || item.requestedAt,
      target: "myLogBounties"
    }))
  ];
  const canonicalItems = myLogCanonicalState.available
    ? myLogCanonicalState.events.map(canonicalMyLogTimelineItem).filter(Boolean)
    : [];
  myLogTimelineItems = mergeMyLogTimelineItems(canonicalItems, [...discoverItems, ...communityItems, ...bountyItems])
    .filter((item) => item.title)
    .sort((left, right) => {
      const timeDifference = myLogActivityTime(right.at) - myLogActivityTime(left.at);
      return timeDifference || String(left.title).localeCompare(String(right.title), "ko");
    });
  renderMyLogTimelineItems();
}

async function loadCanonicalMyLog({ append = false } = {}) {
  const identity = viewerIdentity(viewer());
  const session = readSession();
  if (!identity || !session?.access_token) {
    resetCanonicalMyLog(identity);
    return;
  }
  if (myLogCanonicalState.identity === identity && (myLogCanonicalState.status === "loading" || myLogCanonicalState.loadingMore)) return;
  if (append && (
    myLogCanonicalState.identity !== identity ||
    !myLogCanonicalState.available ||
    !myLogCanonicalState.nextCursor
  )) return;

  const requestId = ++myLogCanonicalRequestId;
  const existingState = myLogCanonicalState;
  const requestUrl = append
    ? `/api/my-log?limit=100&cursor=${encodeURIComponent(existingState.nextCursor)}`
    : "/api/my-log?limit=100";
  myLogCanonicalState = append
    ? { ...existingState, identity, loadingMore: true, error: "" }
    : { ...emptyCanonicalMyLogState(identity), status: "loading" };
  renderMyLogPaginationControls();
  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session.access_token}`
      }
    });
    const result = await safeJson(response);
    if (!response.ok) throw new Error(result?.error || "My Log를 불러오지 못했습니다.");
    if (requestId !== myLogCanonicalRequestId || identity !== viewerIdentity(viewer())) return;
    const available = result?.available === true;
    if (append && !available) {
      myLogCanonicalState = {
        ...existingState,
        identity,
        status: "ready",
        loadingMore: false,
        error: "이전 기록을 불러오지 못했습니다. 다시 시도해 주세요."
      };
      renderWorkspace();
      return;
    }
    const incomingEvents = available && Array.isArray(result.events) ? result.events : [];
    const publicBriefMonitor = append
      ? existingState.publicBriefMonitor
      : normalizePublicBriefMonitor(result?.publicBriefMonitor);
    myLogCanonicalState = {
      identity,
      status: "ready",
      available,
      events: append
        ? mergeCanonicalMyLogEvents(existingState.events, incomingEvents)
        : mergeCanonicalMyLogEvents([], incomingEvents),
      nextCursor: available ? result?.nextCursor || null : null,
      publicBriefMonitor,
      loadingMore: false,
      error: ""
    };
  } catch (error) {
    if (requestId !== myLogCanonicalRequestId || identity !== viewerIdentity(viewer())) return;
    myLogCanonicalState = append
      ? {
          ...existingState,
          identity,
          status: "ready",
          loadingMore: false,
          error: error?.message || "이전 기록을 불러오지 못했습니다."
        }
      : {
          ...emptyCanonicalMyLogState(identity),
          status: "error",
          error: error?.message || "My Log를 불러오지 못했습니다."
        };
  }
  renderWorkspace();
}

function canonicalMyLogTimelineItem(event) {
  if (!event || typeof event !== "object") return null;
  const category = canonicalMyLogCategory(event.category, event.eventType);
  if (!category) return null;
  const targetByCategory = {
    discover: "myLogMatches",
    community: "myLogCommunity",
    bounty: "myLogBounties"
  };
  const declaredTarget = String(event.target || "").trim();
  const target = ["myLogMatches", "myLogCommunity", "myLogBounties"].includes(declaredTarget)
    ? declaredTarget
    : targetByCategory[category];
  return {
    sourceSystem: String(event.sourceSystem || "").trim(),
    sourceEventId: String(event.sourceEventId || "").trim(),
    category,
    title: String(event.title || "활동 기록").trim(),
    detail: String(event.detail || event.eventType || "진행 상태 확인").trim(),
    at: event.occurredAt || event.recordedAt,
    target
  };
}

function canonicalMyLogCategory(category, eventType) {
  const declared = String(category || "").trim().toLowerCase();
  const prefix = String(eventType || "").split(".")[0].trim().toLowerCase();
  const allowed = ["discover", "community", "bounty"];
  if (!allowed.includes(prefix)) return "";
  return !declared || declared === prefix ? prefix : "";
}

function mergeMyLogTimelineItems(canonicalItems, legacyItems) {
  const seenSourceKeys = new Set();
  return [...canonicalItems, ...legacyItems].filter((item) => {
    const sourceKey = myLogSourceKey(item);
    if (!sourceKey) return true;
    if (seenSourceKeys.has(sourceKey)) return false;
    seenSourceKeys.add(sourceKey);
    return true;
  });
}

function mergeCanonicalMyLogEvents(currentEvents, incomingEvents) {
  const seenSourceKeys = new Set();
  return [...(currentEvents || []), ...(incomingEvents || [])].filter((event) => {
    const sourceKey = myLogSourceKey(event);
    if (!sourceKey) return true;
    if (seenSourceKeys.has(sourceKey)) return false;
    seenSourceKeys.add(sourceKey);
    return true;
  });
}

function myLogSourceKey(item) {
  const sourceSystem = String(item?.sourceSystem || "").trim();
  const sourceEventId = String(item?.sourceEventId || "").trim();
  return sourceSystem && sourceEventId ? JSON.stringify([sourceSystem, sourceEventId]) : "";
}

function emptyCanonicalMyLogState(identity = "") {
  return {
    identity,
    status: "idle",
    available: false,
    events: [],
    nextCursor: null,
    publicBriefMonitor: emptyPublicBriefMonitor(),
    loadingMore: false,
    error: ""
  };
}

function emptyPublicBriefMonitor() {
  return { available: false, totalCount: 0, latestAt: null, items: [] };
}

function normalizePublicBriefMonitor(value) {
  const items = (Array.isArray(value?.items) ? value.items : [])
    .map((item) => ({
      id: String(item?.id || "").trim(),
      organization: String(item?.organization || "").trim(),
      problemSummary: String(item?.problemSummary || "").trim(),
      status: String(item?.status || "received").trim(),
      createdAt: item?.createdAt || "",
      updatedAt: item?.updatedAt || item?.createdAt || "",
      deadline: String(item?.deadline || "").trim()
    }))
    .filter((item) => item.id && item.organization)
    .slice(0, 100);
  return {
    available: value?.available === true,
    totalCount: Number.isFinite(Number(value?.totalCount)) && Number(value.totalCount) >= 0
      ? Math.min(Math.floor(Number(value.totalCount)), 500)
      : items.length,
    latestAt: items[0]?.createdAt || null,
    items
  };
}

function resetCanonicalMyLog(identity = "") {
  myLogCanonicalRequestId += 1;
  myLogCanonicalState = emptyCanonicalMyLogState(identity);
}

function emptyAdminActivityState(identity = "") {
  return {
    identity,
    status: "idle",
    available: false,
    loading: false,
    loadingMore: false,
    users: [],
    events: [],
    totalCount: 0,
    nextCursor: null,
    error: "",
    loadedFilterKey: ""
  };
}

function resetAdminActivity(identity = "") {
  adminActivityRequestId += 1;
  adminActivityState = emptyAdminActivityState(identity);
  renderAdminActivityExplorer();
}

function isStaffViewer() {
  const role = String(viewer()?.role || "").toLowerCase();
  return Boolean(viewer()?.canScore || role === "sparklabs" || role === "admin");
}

function adminActivityFilters() {
  return {
    user: String(els.adminActivityUserFilter?.value || "").trim(),
    domain: String(els.adminActivityDomainFilter?.value || "").trim(),
    action: String(els.adminActivityActionFilter?.value || "").trim(),
    from: localDateBoundary(els.adminActivityFromFilter?.value, false),
    to: localDateBoundary(els.adminActivityToFilter?.value, true)
  };
}

function adminActivityFilterKey(filters = adminActivityFilters()) {
  return JSON.stringify(filters);
}

function localDateBoundary(value, endOfRange) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  if (endOfRange) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function syncAdminActivityActionOptions() {
  if (!els.adminActivityActionFilter) return;
  const current = els.adminActivityActionFilter.value;
  const domain = String(els.adminActivityDomainFilter?.value || "");
  const options = ADMIN_ACTIVITY_ACTIONS.filter(([actionDomain]) => !domain || actionDomain === domain);
  els.adminActivityActionFilter.innerHTML = `<option value="">전체 행위</option>${options
    .map(([, value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("")}`;
  if (options.some(([, value]) => value === current)) els.adminActivityActionFilter.value = current;
}

function syncAdminActivityUserOptions() {
  if (!els.adminActivityUserFilter) return;
  const current = els.adminActivityUserFilter.value;
  const options = adminActivityState.users.map((user) => {
    const primary = user.email || user.label || "Arena 사용자";
    const organization = user.organizationName && user.organizationName !== primary ? ` · ${user.organizationName}` : "";
    return `<option value="${escapeHtml(user.userId)}">${escapeHtml(`${primary}${organization}`)}</option>`;
  });
  els.adminActivityUserFilter.innerHTML = `<option value="">전체 사용자</option>${options.join("")}`;
  if (adminActivityState.users.some((user) => user.userId === current)) els.adminActivityUserFilter.value = current;
}

function handleAdminActivityFilterChange() {
  if (!isStaffViewer()) return;
  void loadAdminActivity({ reset: true });
}

function resetAdminActivityFilters() {
  [els.adminActivityUserFilter, els.adminActivityDomainFilter, els.adminActivityActionFilter, els.adminActivityFromFilter, els.adminActivityToFilter]
    .forEach((control) => {
      if (control) control.value = "";
    });
  syncAdminActivityActionOptions();
  void loadAdminActivity({ reset: true, force: true });
}

async function loadAdminActivity({ reset = false, append = false, force = false } = {}) {
  const identity = viewerIdentity(viewer());
  const session = readSession();
  if (!isStaffViewer() || !identity || !session?.access_token) {
    resetAdminActivity(identity);
    return;
  }
  const filters = adminActivityFilters();
  const filterKey = adminActivityFilterKey(filters);
  if (append && (!adminActivityState.nextCursor || adminActivityState.loadingMore)) return;
  if (!append && !force && adminActivityState.identity === identity && adminActivityState.loadedFilterKey === filterKey && adminActivityState.status === "ready") {
    renderAdminActivityExplorer();
    return;
  }
  if (append && adminActivityState.loadingMore) return;
  if (!append && adminActivityState.loading && adminActivityState.loadedFilterKey === filterKey) return;

  const requestId = ++adminActivityRequestId;
  const existing = adminActivityState;
  const params = new URLSearchParams({ limit: "100", includeUsers: append ? "0" : "1" });
  if (filters.user) params.set("user", filters.user);
  if (filters.domain) params.set("domain", filters.domain);
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (append && existing.nextCursor) params.set("cursor", existing.nextCursor);
  adminActivityState = append
    ? { ...existing, loadingMore: true, error: "" }
    : {
        ...emptyAdminActivityState(identity),
        status: "loading",
        loading: true,
        users: reset ? existing.users : [],
        loadedFilterKey: filterKey
      };
  renderAdminActivityExplorer();
  try {
    const response = await fetch(`/api/arena-activity?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${session.access_token}` }
    });
    const result = await safeJson(response);
    if (!response.ok) throw new Error(result?.error || "전체 사용자 활동을 불러오지 못했습니다.");
    if (requestId !== adminActivityRequestId || identity !== viewerIdentity(viewer())) return;
    const available = result?.available === true;
    const incomingEvents = available && Array.isArray(result.events) ? result.events : [];
    const incomingUsers = available && Array.isArray(result.users) ? result.users : [];
    const incomingTotalCount = Number.isSafeInteger(Number(result?.totalCount)) && Number(result.totalCount) >= 0
      ? Number(result.totalCount)
      : incomingEvents.length;
    adminActivityState = {
      identity,
      status: "ready",
      available,
      loading: false,
      loadingMore: false,
      users: append ? existing.users : incomingUsers,
      events: append ? mergeAdminActivityEvents(existing.events, incomingEvents) : mergeAdminActivityEvents([], incomingEvents),
      totalCount: append ? existing.totalCount : incomingTotalCount,
      nextCursor: available ? result.nextCursor || null : null,
      error: available ? "" : "활동 데이터베이스 연결을 확인해 주세요.",
      loadedFilterKey: filterKey
    };
  } catch (error) {
    if (requestId !== adminActivityRequestId || identity !== viewerIdentity(viewer())) return;
    adminActivityState = {
      ...(append ? existing : emptyAdminActivityState(identity)),
      identity,
      status: "error",
      loading: false,
      loadingMore: false,
      error: error?.message || "전체 사용자 활동을 불러오지 못했습니다.",
      loadedFilterKey: filterKey
    };
  }
  renderAdminActivityExplorer();
}

function mergeAdminActivityEvents(current, incoming) {
  const seen = new Set();
  return [...(current || []), ...(incoming || [])].filter((event) => {
    const key = String(event?.id || event?.eventUid || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderAdminActivityExplorer() {
  if (!els.adminActivityExplorer) return;
  const staff = isStaffViewer();
  els.adminActivityExplorer.hidden = !staff;
  if (!staff) return;
  syncAdminActivityUserOptions();
  if ((els.adminActivityActionFilter?.options.length || 0) <= 1) syncAdminActivityActionOptions();
  const state = adminActivityState;
  const latest = state.events[0]?.occurredAt || state.users[0]?.lastActivityAt;
  if (els.adminActivitySummary) {
    const displayedCount = state.events.length;
    const totalCount = Math.max(state.totalCount, displayedCount);
    const representativeCount = state.users.filter((user) =>
      ["claw_member", "member"].includes(String(user?.role || "").toLowerCase())
    ).length;
    const expectedRepresentativeCount = 75;
    const representativeCopy = representativeCount < expectedRepresentativeCount
      ? `${formatNumber(expectedRepresentativeCount - representativeCount)}개사 최초 로그인 대기 · 운영진 제외`
      : "1개사 1계정 · 운영진 제외";
    els.adminActivitySummary.innerHTML = [
      ["전체 활동", `${formatNumber(totalCount)}건`, totalCount > displayedCount ? `${formatNumber(displayedCount)}건 표시 · 아래에서 계속 불러오기` : "현재 필터의 전체 Arena 활동"],
      ["참여사 대표 계정", `${formatNumber(representativeCount)} / ${formatNumber(expectedRepresentativeCount)}개사`, representativeCopy],
      ["최근 기록", latest ? formatDateTime(latest) : "—", "인증 로그인·로그아웃과 주요 실행 기록"]
    ].map(([label, value, copy]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(copy)}</small></article>`).join("");
  }
  if (els.adminActivityTableBody) {
    els.adminActivityTableBody.innerHTML = state.events.length
      ? state.events.map(adminActivityRowMarkup).join("")
      : `<tr><td class="admin-activity-empty" colspan="5">${state.status === "loading" ? "전체 사용자 활동을 불러오는 중입니다…" : "선택한 조건에 해당하는 AI Arena 활동이 없습니다."}</td></tr>`;
  }
  if (els.adminActivityLoadMoreButton) {
    els.adminActivityLoadMoreButton.hidden = !state.nextCursor;
    els.adminActivityLoadMoreButton.disabled = state.loadingMore;
    els.adminActivityLoadMoreButton.textContent = state.loadingMore ? "불러오는 중…" : "이전 활동 더 보기";
  }
  setText(
    els.adminActivityStatus,
    state.error || (state.status === "loading"
      ? "Arena 전용 활동 원장을 조회하고 있습니다."
      : state.events.length
        ? `${formatNumber(state.events.length)} / ${formatNumber(Math.max(state.totalCount, state.events.length))}건 표시 중`
        : "")
  );
}

function adminActivityRowMarkup(event) {
  const actor = event.actorEmail || event.actorLabel || "Arena 사용자";
  const organization = event.organizationName && event.organizationName !== actor ? event.organizationName : "";
  const category = String(event.category || "system").toLowerCase();
  const label = event.eventLabel || adminActivityActionLabel(event.eventType);
  return `<tr>
    <td><time datetime="${escapeHtml(event.occurredAt || "")}">${escapeHtml(formatDateTime(event.occurredAt))}</time></td>
    <td><strong>${escapeHtml(actor)}</strong>${organization ? `<small>${escapeHtml(organization)}</small>` : ""}</td>
    <td><span class="admin-activity-domain is-${escapeHtml(category)}">${escapeHtml(adminActivityDomainLabel(category))}</span></td>
    <td><strong>${escapeHtml(label)}</strong><small>${escapeHtml(event.eventType || "")}</small></td>
    <td><strong>${escapeHtml(event.title || "활동 기록")}</strong><small>${escapeHtml(event.detail || "AI Arena 활동")}</small></td>
  </tr>`;
}

function adminActivityActionLabel(eventType) {
  return ADMIN_ACTIVITY_ACTIONS.find(([, value]) => value === eventType)?.[2] || eventType || "활동";
}

function adminActivityDomainLabel(domain) {
  return ({ system: "인증·시스템", discover: "Discover", community: "Community", bounty: "Bounty" })[domain] || "System";
}

function renderMyLogTimelineItems() {
  const activeFilter = ["all", "discover", "community", "bounty"].includes(myLogTimelineFilter) ? myLogTimelineFilter : "all";
  const visibleItems = activeFilter === "all"
    ? myLogTimelineItems
    : myLogTimelineItems.filter((item) => item.category === activeFilter);
  els.myLogTimelineFilters?.querySelectorAll("[data-my-log-timeline-filter]").forEach((button) => {
    const active = button.dataset.myLogTimelineFilter === activeFilter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  setText(els.myLogTimelineCount, `${formatNumber(visibleItems.length)}건`);
  els.myLogTimelineList.innerHTML = visibleItems.length
    ? visibleItems.map(myLogTimelineItemMarkup).join("")
    : `<div class="my-log-timeline-empty"><strong>이 범위에 기록된 활동이 없습니다.</strong><span>Discover, Community 또는 Bounty에서 활동하면 시간순으로 여기에 쌓입니다.</span></div>`;
  renderMyLogPaginationControls();
}

function renderMyLogPaginationControls() {
  if (!els.myLogLoadMoreButton || !els.myLogLoadMoreStatus) return;
  const state = myLogCanonicalState;
  const canLoadMore = Boolean(state.available && state.nextCursor);
  els.myLogLoadMoreButton.hidden = !canLoadMore;
  els.myLogLoadMoreButton.disabled = Boolean(state.loadingMore);
  els.myLogLoadMoreButton.textContent = state.loadingMore ? "이전 기록 불러오는 중…" : "이전 기록 더 불러오기";
  if (state.loadingMore) setText(els.myLogLoadMoreStatus, "저장된 이전 활동을 시간순으로 불러오고 있습니다.");
  else if (state.error && state.available) setText(els.myLogLoadMoreStatus, state.error);
  else if (state.available && !state.nextCursor && state.events.length) setText(els.myLogLoadMoreStatus, "가장 오래된 기록까지 모두 확인했습니다.");
  else setText(els.myLogLoadMoreStatus, "");
}

function myLogTimelineItemMarkup(item) {
  const categoryLabel = ({ discover: "Discover", community: "Community", bounty: "Bounty" })[item.category] || "Activity";
  const dateTime = myLogActivityTime(item.at) ? new Date(item.at).toISOString() : "";
  const dateLabel = dateTime ? formatDate(item.at) : "시간 정보 없음";
  return `<button class="my-log-timeline-item is-${escapeHtml(item.category)}" data-my-log-target="${escapeHtml(item.target)}" type="button">
    <span class="my-log-timeline-marker" aria-hidden="true"></span>
    <span class="my-log-timeline-content">
      <span class="my-log-timeline-meta"><em>${escapeHtml(categoryLabel)}</em><time${dateTime ? ` datetime="${escapeHtml(dateTime)}"` : ""}>${escapeHtml(dateLabel)}</time></span>
      <strong>${escapeHtml(item.title || "활동")}</strong>
      <small>${escapeHtml(item.detail || "진행 상태 확인")}</small>
    </span>
    <i aria-hidden="true">보기 →</i>
  </button>`;
}

function myLogActivityTime(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function handleMyLogTimelineFilter(event) {
  const button = event.target.closest("[data-my-log-timeline-filter]");
  if (!button) return;
  myLogTimelineFilter = button.dataset.myLogTimelineFilter || "all";
  renderMyLogTimelineItems();
}

function handleMyLogTimelineOpen(event) {
  const button = event.target.closest("[data-my-log-target]");
  const target = button ? document.getElementById(button.dataset.myLogTarget || "") : null;
  if (!target) return;
  target.classList.add("is-targeted");
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => target.classList.remove("is-targeted"), 1200);
}

function handleMyLogLoadMore() {
  void loadCanonicalMyLog({ append: true });
}

function renderMyLogDetails({ role, collaborationReviews = [], connections = [], bountyRequests = [], submissions = [], opportunities = [], publicBriefMonitor = emptyPublicBriefMonitor() }) {
  renderMyLogPublicBriefs(role, publicBriefMonitor);
  renderMyLogMatches(role, collaborationReviews, connections);
  renderMyLogCommunity();
  renderMyLogBounties(bountyRequests, submissions, opportunities);
}

function renderMyLogPublicBriefs(role, monitor) {
  if (!els.myLogBriefs || !els.myLogBriefList) return;
  const staff = ["sparklabs", "admin"].includes(role);
  els.myLogBriefs.hidden = !staff;
  if (!staff) {
    els.myLogBriefList.innerHTML = "";
    return;
  }
  if (["idle", "loading"].includes(myLogCanonicalState.status) && !monitor?.available) {
    els.myLogBriefList.innerHTML = `<div class="my-log-loading"><span class="activity-dot" aria-hidden="true"></span><div><strong>공개 탐색 Brief를 불러오는 중입니다.</strong><span>운영자 전용 접수 기록을 안전하게 확인하고 있습니다.</span></div></div>`;
    return;
  }
  if (!monitor?.available) {
    els.myLogBriefList.innerHTML = `<div class="my-log-empty"><strong>탐색 Brief 모니터를 불러오지 못했습니다.</strong><span>잠시 후 My Log를 다시 열어 확인해 주세요.</span></div>`;
    return;
  }
  const items = monitor.items || [];
  els.myLogBriefList.innerHTML = items.length
    ? items.map((item) => myLogItemMarkup(
        `${item.organization} 탐색 Brief`,
        `${item.problemSummary || "문제 요약 확인 필요"} · ${formatDate(item.createdAt)}`,
        publicBriefStatusLabel(item.status)
      )).join("")
    : `<div class="my-log-empty"><strong>아직 공개 탐색 Brief 접수가 없습니다.</strong><span>첫 화면에서 새 Brief가 제출되면 누적 접수 건수와 접수 시간이 여기에 표시됩니다.</span></div>`;
}

function publicBriefStatusLabel(status) {
  return status === "received" ? "접수됨" : "상태 확인";
}

function renderMyLogMatches(role, collaborationReviews, connections) {
  if (!els.myLogMatchList) return;
  const reviewItems = collaborationReviews.map((item) => ({
    kind: "collaboration_review",
    id: item.id,
    canRespond: Boolean(item.canRespond && item.direction === "incoming" && item.status === "pending"),
    title:
      item.direction === "incoming"
        ? `${item.requesterTeamName || "다른 팀"}의 협업 검토 요청`
        : item.direction === "outgoing"
          ? `${item.targetTeamName || "대상 팀"}에 보낸 협업 검토`
          : `${item.requesterTeamName || "요청 팀"} → ${item.targetTeamName || "대상 팀"}`,
    meta: `${programActivityStatus(item.status)} · ${formatDate(item.updatedAt || item.createdAt)}`,
    status: item.status || "pending"
  }));
  const connectionItems = connections.map((item) => ({
    kind: "connection",
    title: `${startupById(item.startupId)?.name || item.startupName || "대상 기업"} 연결 요청`,
    meta: `${PIPELINE_LABELS[item.status] || programActivityStatus(item.status)} · ${formatDate(item.updatedAt || item.createdAt)}`,
    status: item.status || "interest"
  }));
  const items = [...reviewItems, ...connectionItems].slice(0, 12);
  els.myLogMatchList.innerHTML = items.length
    ? items.map((item) => myLogMatchItemMarkup(item)).join("")
    : `<div class="my-log-empty"><strong>아직 매치 요청 기록이 없습니다.</strong><span>${role === "member" ? "Discover에서 다른 팀의 기업 소개를 열고 협업 검토를 요청해 보세요." : "Discover에서 기업을 검토한 뒤 연결 요청을 보내면 여기에 기록됩니다."}</span></div>`;
}

function myLogMatchItemMarkup(item) {
  const actions = item.canRespond
    ? `<div class="my-log-item-actions">
        <button data-collaboration-review-id="${escapeHtml(item.id)}" data-collaboration-review-status="approved" type="button">승인</button>
        <button data-collaboration-review-id="${escapeHtml(item.id)}" data-collaboration-review-status="declined" type="button">거절</button>
      </div>`
    : "";
  return `<article class="my-log-item${actions ? " has-actions" : ""}">
    <div><strong>${escapeHtml(item.title || "매치 요청")}</strong><span>${escapeHtml(item.meta || "최근 활동")}</span></div>
    <div class="my-log-item-state"><em>${escapeHtml(matchStatusLabel(item.status))}</em>${actions}</div>
  </article>`;
}

function renderMyLogCommunity() {
  if (!els.myLogCommunityList) return;
  const activity = Array.isArray(communityActivity.recent) ? communityActivity.recent.slice(0, 12) : [];
  if (!communityActivity.loaded) {
    els.myLogCommunityList.innerHTML = `<div class="my-log-loading"><span class="activity-dot" aria-hidden="true"></span><div><strong>Community 기록을 불러오는 중입니다.</strong><span>내 글·댓글과 받은 반응만 안전하게 정리합니다.</span></div></div>`;
    return;
  }
  els.myLogCommunityList.innerHTML = activity.length
    ? activity.map((item) => {
        const presentation = communityActivityPresentation(item);
        return myLogItemMarkup(presentation.title, `${presentation.meta} · ${formatDate(item.at || item.updatedAt || item.createdAt)}`, presentation.badge);
      }).join("")
    : `<div class="my-log-empty"><strong>아직 Community 활동이 없습니다.</strong><span>질문이나 경험을 공유하고 댓글을 남기면 내 기록과 받은 반응이 여기에 모입니다.</span></div>`;
}

function renderMyLogBounties(bountyRequests, submissions, opportunities) {
  if (!els.myLogBountyList) return;
  const challengeById = new Map((competition().challenges || []).map((item) => [item.id, item]));
  const items = [
    ...bountyRequests.map((item) => ({
      title: item.problemTitle || "Bounty Brief",
      status: item.status || "intake",
      meta: `Brief · ${formatDate(item.updatedAt || item.createdAt)}`,
      at: item.updatedAt || item.createdAt
    })),
    ...submissions.map((item) => ({
      title: challengeById.get(item.challengeId)?.title || "Bounty 제출",
      status: item.status || "submitted",
      meta: `제출 · ${formatDate(item.scoredAt || item.submittedAt)}`,
      at: item.scoredAt || item.submittedAt
    })),
    ...opportunities.map((item) => ({
      title: challengeById.get(item.challengeId)?.title || "Bounty 기회 연결",
      status: item.status || "requested",
      meta: `기회 요청 · ${formatDate(item.updatedAt || item.requestedAt)}`,
      at: item.updatedAt || item.requestedAt
    }))
  ].sort((left, right) => Date.parse(right.at || 0) - Date.parse(left.at || 0)).slice(0, 12);
  els.myLogBountyList.innerHTML = items.length
    ? items.map((item) => myLogItemMarkup(item.title, item.meta, bountyProgressLabel(item.status))).join("")
    : `<div class="my-log-empty"><strong>아직 Bounty 신청 기록이 없습니다.</strong><span>Open Bounty에 참가하거나 기업 문제를 등록하면 접수부터 검증·기회 연결까지 추적됩니다.</span></div>`;
}

function myLogItemMarkup(title, meta, badge) {
  return `<article class="my-log-item"><div><strong>${escapeHtml(title || "활동")}</strong><span>${escapeHtml(meta || "최근 활동")}</span></div><em>${escapeHtml(badge || "진행 중")}</em></article>`;
}

function matchStatusLabel(status) {
  return ({ pending: "답변 대기", founder_review: "팀 검토 중", mutually_accepted: "상호 승인 확인", intro_scheduled: "소개 조율", approved: "승인", declined: "종료", pilot: "Pilot", production: "Production" })[status] || PIPELINE_LABELS[status] || programActivityStatus(status);
}

function bountyProgressLabel(status) {
  return ({
    intake: "Brief 접수",
    qualified: "요건 확인",
    design: "과제 설계",
    published: "공개",
    uploaded: "제출 완료",
    queued: "검증 대기",
    validating: "자동 검증 중",
    schema_failed: "보완 필요",
    scored: "검증 완료",
    selected_for_private: "최종 평가",
    requested: "기회 요청",
    review: "검토 중",
    pilot: "Pilot 논의",
    production: "실행 연결",
    closed: "종료"
  })[status] || PIPELINE_LABELS[status] || programActivityStatus(status);
}

function communityActivityPresentation(item) {
  if (item.kind === "post") {
    return { title: item.title || "Community 글", meta: `글 작성 · 댓글 ${item.commentCount || 0} · 좋아요 ${item.likeCount || 0}`, badge: "내 글" };
  }
  if (item.kind === "comment") {
    return { title: item.threadTitle || "Community 글", meta: item.bodyPreview || "댓글 작성", badge: "내 댓글" };
  }
  if (item.kind === "comment_received") {
    return { title: item.threadTitle || "내 Community 글", meta: `${item.actorDisplayName || "Arena member"} · ${item.bodyPreview || "새 댓글"}`, badge: "댓글 받음" };
  }
  return { title: item.threadTitle || "내 Community 글", meta: item.targetType === "comment" ? "내 댓글에 좋아요를 받았습니다." : "내 글에 좋아요를 받았습니다.", badge: "좋아요" };
}

function communityRecentActivity() {
  return (communityActivity.recent || []).map((item) => {
    const presentation = communityActivityPresentation(item);
    return { source: "COMMUNITY", title: presentation.title, status: presentation.badge, at: item.at || item.updatedAt || item.createdAt };
  });
}

function emptyCommunityActivity() {
  return { loaded: false, summary: { posts: 0, comments: 0, commentsReceived: 0, likesReceived: 0 }, posts: [], comments: [], reactions: [], recent: [] };
}

function viewerIdentity(value) {
  return String(value?.id || value?.email || "").trim().toLowerCase();
}

function renderStaffQueue() {
  const staff = Boolean(viewer()?.canScore);
  if (!els.staffMarketQueue || !els.staffMarketQueueContent) return;
  els.staffMarketQueue.hidden = !staff;
  if (!staff) return;
  const connections = market().connectionRequests || [];
  const collaborationReviews = context.hub?.programQueues?.collaborationReviews || [];
  const collaborationAuditLogs = context.hub?.programAuditLogs || [];
  els.staffMarketQueueContent.innerHTML = `
    <div class="staff-queue-columns">
      <section><div class="staff-queue-section-head"><h3>혜택 문의</h3>${staffBenefitQueueBadge()}</div>${staffBenefitQueueMarkup()}</section>
      <section><h3>Partnerships</h3>${connections.length ? connections.slice(0, 8).map((item) => `<article class="staff-queue-item"><div><strong>${escapeHtml(startupById(item.startupId)?.name || "Team")}</strong><span>${escapeHtml(item.organization || "")} · ${escapeHtml(PIPELINE_LABELS[item.status] || item.status)}</span></div><button data-market-page="partnerships" type="button">Pipeline →</button></article>`).join("") : `<div class="market-empty">연결 요청 없음</div>`}</section>
    </div>
    <div class="staff-collaboration-grid">
      <section>
        <div class="staff-collaboration-head"><div><span class="section-kicker">COLLABORATION REVIEW</span><h3>팀 간 협업 검토 Queue</h3></div><span class="trust-badge small">${formatNumber(collaborationReviews.length)}건</span></div>
        <div class="staff-collaboration-list">${collaborationReviews.length
          ? collaborationReviews.slice(0, 20).map((item) => `<article><div><strong>${escapeHtml(item.requesterTeamName || "요청 팀")} → ${escapeHtml(item.targetTeamName || "대상 팀")}</strong><span>${escapeHtml(programActivityStatus(item.status))} · ${escapeHtml(formatDate(item.updatedAt || item.createdAt))}</span><p>${escapeHtml(item.purpose || "협업 가능성 검토")}</p></div><span class="review-status is-${escapeHtml(item.status || "pending")}">${escapeHtml(programActivityStatus(item.status))}</span></article>`).join("")
          : `<div class="market-empty">협업 검토 요청이 없습니다.</div>`}</div>
      </section>
      <section>
        <div class="staff-collaboration-head"><div><span class="section-kicker">AUDIT LOG</span><h3>요청·승인 활동 로그</h3></div><span class="trust-badge small">STAFF ONLY</span></div>
        <div class="collaboration-audit-log">${collaborationAuditLogs.length
          ? collaborationAuditLogs.slice(0, 30).map((item) => `<article><span class="activity-dot"></span><div><strong>${escapeHtml(collaborationAuditActionLabel(item.action))} · ${escapeHtml(item.requesterTeamName || "요청 팀")} → ${escapeHtml(item.targetTeamName || "대상 팀")}</strong><small>${escapeHtml(item.actorTeamName || "Team")} · ${escapeHtml(item.actorEmail || "계정 미표시")} · ${escapeHtml(formatDate(item.createdAt))}</small></div></article>`).join("")
          : `<div class="market-empty">아직 협업 검토 활동 로그가 없습니다.</div>`}</div>
      </section>
    </div>`;
}

function emptyStaffBenefitQueueState(identity = "") {
  return { identity, status: "idle", summary: null, requests: [], error: "" };
}

function resetStaffBenefitQueue(identity = "") {
  staffBenefitQueueRequestId += 1;
  staffBenefitQueueState = emptyStaffBenefitQueueState(identity);
}

async function loadStaffBenefitQueue({ force = false } = {}) {
  if (!isStaffViewer()) return;
  const identity = viewerIdentity(viewer());
  if (!identity) return;
  if (!force && staffBenefitQueueState.identity === identity && ["loading", "loaded"].includes(staffBenefitQueueState.status)) return;
  const requestId = ++staffBenefitQueueRequestId;
  staffBenefitQueueState = { ...emptyStaffBenefitQueueState(identity), status: "loading" };
  renderStaffQueue();
  try {
    const session = readSession();
    const response = await fetch("/api/benefit-needs-survey", {
      headers: { ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}), Accept: "application/json" },
      cache: "no-store"
    });
    const payload = await safeJson(response);
    if (requestId !== staffBenefitQueueRequestId) return;
    if (!response.ok || payload?.available === false || !payload?.staffSummary) {
      throw new Error(payload?.error || "혜택 문의를 불러오지 못했습니다.");
    }
    staffBenefitQueueState = {
      identity,
      status: "loaded",
      summary: payload.staffSummary,
      requests: Array.isArray(payload.staffSummary.requests) ? payload.staffSummary.requests.slice(0, 12) : [],
      error: ""
    };
  } catch (error) {
    if (requestId !== staffBenefitQueueRequestId) return;
    staffBenefitQueueState = { ...emptyStaffBenefitQueueState(identity), status: "error", error: error.message || "혜택 문의를 불러오지 못했습니다." };
  }
  renderStaffQueue();
}

function staffBenefitQueueBadge() {
  if (["idle", "loading"].includes(staffBenefitQueueState.status)) return `<span class="trust-badge small">확인 중</span>`;
  const count = Math.max(0, Number(staffBenefitQueueState.summary?.newRequestCount) || 0);
  return `<span class="trust-badge small${count ? " is-alert" : ""}">${formatNumber(count)}건</span>`;
}

function staffBenefitQueueMarkup() {
  if (["idle", "loading"].includes(staffBenefitQueueState.status)) {
    return `<div class="market-empty">Claw Member 혜택 문의를 확인하고 있습니다.</div>`;
  }
  if (staffBenefitQueueState.status === "error") {
    return `<div class="market-empty">${escapeHtml(staffBenefitQueueState.error)}</div>`;
  }
  if (staffBenefitQueueState.requests.length) {
    return staffBenefitQueueState.requests.map((item) => `<article class="staff-queue-item staff-benefit-request">
      <div class="staff-benefit-request-head"><div><strong>${escapeHtml(item.solutionName || "혜택 요청")}</strong><span>${escapeHtml(item.organizationName || "Claw Member 팀")} · ${escapeHtml(formatDate(item.submittedAt))}</span></div><em>${escapeHtml(programActivityStatus(item.status))}</em></div>
      ${item.solutionDetails ? `<p>${escapeHtml(item.solutionDetails)}</p>` : ""}
      ${item.solutionReason ? `<small><b>필요한 이유</b> ${escapeHtml(item.solutionReason)}</small>` : ""}
    </article>`).join("");
  }
  const count = Math.max(0, Number(staffBenefitQueueState.summary?.newRequestCount) || 0);
  return count
    ? `<div class="market-empty"><strong>${formatNumber(count)}건의 신규 신청이 있습니다.</strong><span>최근 신청 상세를 준비하고 있습니다.</span></div>`
    : `<div class="market-empty">새로운 혜택 문의가 없습니다.</div>`;
}

function collaborationAuditActionLabel(action) {
  return ({ requested: "검토 요청", approved: "요청 승인", declined: "요청 거절" })[action] || action || "상태 변경";
}

async function handleStaffQueueAction(event) {
  const button = event.target.closest("[data-submission-action]");
  if (!button || !viewer()?.canScore) return;
  const action = button.dataset.submissionAction;
  const payload = { id: button.dataset.submissionId, note: action === "requestSubmissionChanges" ? "기술 증거와 공개 범위를 보완해 주세요." : "SparkLabs Arena review." };
  try {
    await postMarketAction(action, payload);
    showToast("Tech Passport 상태를 업데이트했습니다.");
  } catch (error) {
    showToast(error.message || "상태를 업데이트하지 못했습니다.");
  }
}

async function postMarketAction(action, payload) {
  const session = readSession();
  if (!session?.access_token) throw new Error("로그인이 필요합니다.");
  const progressToken = startProcessStatus(els.globalProcessStatus, MARKET_ACTION_PROGRESS_STEPS, {
    announcement: "AI Arena 요청을 처리하고 있습니다."
  });
  try {
    const response = await fetch("/api/arena", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ action, payload })
    });
    const result = await safeJson(response);
    if (!response.ok) throw new Error(result?.error || "요청을 처리하지 못했습니다.");
    const preserveProgramDirectory = isProgramDirectoryMarket();
    const nextMarket = preserveProgramDirectory && result.snapshot
      ? {
          ...context.market,
          connectionRequests: result.snapshot.connectionRequests || [],
          bountyRequests: result.snapshot.bountyRequests || [],
          competition: result.snapshot.competition || context.market?.competition,
          metrics: { ...(result.snapshot.metrics || {}), ...(context.market?.metrics || {}), source: "program_directory" },
          viewer: result.snapshot.viewer || context.market?.viewer
        }
      : result.snapshot || context.market;
    context = {
      ...context,
      market: nextMarket,
      competition: result.snapshot?.competition || context.competition,
      viewer: result.snapshot?.viewer || context.viewer
    };
    window.__sparkArenaContext = context;
    renderAll();
    return result;
  } finally {
    finishProcessStatus(els.globalProcessStatus, progressToken);
  }
}

function market() {
  return context?.market || null;
}

function isProgramDirectoryMarket() {
  return market()?.metrics?.source === "program_directory";
}

function competition() {
  return context?.competition || market()?.competition || { challenges: [], submissions: [], metrics: {} };
}

function viewer() {
  return context?.viewer || market()?.viewer || context?.hub?.viewer || null;
}

function isClawMemberViewer() {
  return String(viewer()?.role || "").toLowerCase() === "member";
}

function companyReviewActionMarkup(startup, partnerLabel) {
  if (isClawMemberViewer()) {
    return `<button class="primary-button compact" data-collaboration-review-team="${escapeHtml(startup.id)}" type="button">이 회사에 협업 검토 요청</button>`;
  }
  return `<button class="primary-button compact" data-market-connect="${escapeHtml(startup.id)}" type="button">${escapeHtml(partnerLabel)}</button>`;
}

function startupById(id) {
  return (market()?.startups || []).find((item) => String(item.id) === String(id)) || null;
}

function passportForStartup(startup) {
  if (!startup) return null;
  return (market()?.submissions || []).find((item) => item.id === startup.id || item.slug === startup.slug || normalize(item.name) === normalize(startup.name)) || null;
}

function myPassport() {
  const currentViewer = viewer();
  return (market()?.submissions || []).find(
    (item) =>
      item.type === "Tech Passport" &&
      (item.ownerId === currentViewer?.id || item.ownerEmail === currentViewer?.email)
  ) || null;
}

function repositoryUrl(startup) {
  const passport = passportForStartup(startup);
  return linkUrl(passport, "github");
}

function linkUrl(submission, type) {
  return submission?.links?.find((link) => link.type === type)?.url || "";
}

function techStackFor(startup) {
  if (startup?.techStack) return startup.techStack;
  const passport = passportForStartup(startup);
  const technical = passport?.technicalProfile || {};
  const groups = [
    { key: "languages", label: "Languages & runtimes", items: technical.stack || [] },
    { key: "frameworks", label: "Frameworks", items: technical.frameworks || [] },
    { key: "ai", label: "AI & models", items: technical.modalities || [] },
    { key: "data", label: "Data & storage", items: technical.dataSources || [] },
    { key: "infra", label: "Cloud & infrastructure", items: technical.providers || [] }
  ].filter((group) => group.items.length);
  return {
    source: passport ? "team_submitted" : "evidence_extracted",
    sourceLabel: passport ? "Team-submitted Tech Passport" : "Extracted from SparkLabs review materials",
    verification: passport?.review?.staffVerified ? "sparklabs_reviewed" : passport ? "team_supplied" : "evidence_only",
    groups,
    itemCount: groups.reduce((total, group) => total + group.items.length, 0),
    hasDisclosure: groups.some((group) => group.items.length),
    restricted: Boolean(technical.stackRestricted)
  };
}

function stackItems(startup) {
  return unique((techStackFor(startup).groups || []).flatMap((group) => group.items || []));
}

function stackGroupItems(startup, key) {
  return techStackFor(startup).groups?.find((group) => group.key === key)?.items || [];
}

function compactStackMarkup(techStack, limit = 6) {
  const items = (techStack.groups || [])
    .flatMap((group) => (group.items || []).map((item) => ({ item, group: group.key })))
    .slice(0, limit);
  return `<div class="stack-chip-row">${items
    .map(({ item, group }) => `<span data-stack-group="${escapeHtml(group)}">${escapeHtml(item)}</span>`)
    .join("")}${techStack.itemCount > limit ? `<small>+${techStack.itemCount - limit}</small>` : ""}</div>`;
}

function fullStackMarkup(techStack) {
  return `<div class="tech-stack-groups">${(techStack.groups || [])
    .map(
      (group) => `<article>
        <span>${escapeHtml(group.label)}</span>
        <div>${(group.items || []).map((item) => `<b>${escapeHtml(item)}</b>`).join("")}</div>
      </article>`
    )
    .join("")}</div>`;
}

function stackSourceShort(techStack) {
  if (techStack.restricted) return "Partner access";
  if (techStack.verification === "sparklabs_reviewed") return "Reviewed";
  if (techStack.source === "team_submitted") return "Team supplied";
  return "Evidence extracted";
}

function stackVerificationLabel(status) {
  if (status === "sparklabs_reviewed") return "SparkLabs reviewed";
  if (status === "team_supplied") return "Team supplied";
  return "Evidence extracted";
}

function submissionAsStartup(submission) {
  return {
    id: submission.id,
    name: submission.name,
    category: submission.category,
    stage: submission.stage,
    region: submission.region,
    tagline: submission.tagline,
    description: submission.shortDescription,
    functions: submission.technicalProfile?.modalities || submission.technicalProfile?.stack || [],
    tags: submission.technicalTags || [],
    products: [{ id: `${submission.id}-product`, name: submission.name, url: linkUrl(submission, "website") }],
    benchmarkScore: submission.arenaScore || 0,
    affiliation: submission.affiliation,
    traction: submission.traction?.customers || ""
  };
}

function verificationBadges(startup) {
  const badges = [];
  const passport = passportForStartup(startup);
  if (techStackFor(startup).hasDisclosure) badges.push("Tech stack disclosed");
  if (passport?.status === "published") badges.push("Tech Passport");
  if (passport?.review?.staffVerified) badges.push("Architecture reviewed");
  if (passport?.humanValidation?.verificationStatus === "human_validated") badges.push("Human validated");
  if (Number(startup.benchmarkScore || 0) >= 70) badges.push("Benchmark evidence");
  if (startup.products?.some((product) => product.url)) badges.push("Product live");
  if (repositoryUrl(startup)) badges.push("Repo linked");
  return badges.length ? badges : ["Evidence pending"];
}

function evidenceScore(startup) {
  let score = 10;
  if (startup.tagline) score += 8;
  if (startup.description) score += 12;
  if ((startup.functions || []).length >= 3) score += 12;
  if (startup.traction) score += 12;
  if (startup.products?.some((product) => product.url)) score += 8;
  if (Number(startup.benchmarkScore || 0) > 0) score += 18;
  if (techStackFor(startup).hasDisclosure) score += 5;
  const passport = passportForStartup(startup);
  if (passport) score += 10;
  if (passport?.technicalProfile?.deployment) score += 5;
  if (passport?.technicalProfile?.privacy) score += 5;
  return Math.min(100, score);
}

function nextStepFor(status) {
  const next = {
    interest: "SparkLabs qualification",
    qualified: "Founder review",
    founder_review: "Founder consent decision",
    mutually_accepted: "Schedule the consented introduction",
    intro_scheduled: "Run discovery meeting",
    declined: "Close without sharing contact details",
    matched: "Mutual interest confirmation",
    nda: "NDA completion",
    discovery: "Technical discovery",
    proposal: "Pilot acceptance criteria",
    pilot: "Pilot execution and KPI review",
    production: "Production rollout",
    expansion: "Expansion planning",
    closed: "Archive outcome",
    intake: "Scope workshop",
    qualified: "Evaluation design",
    design: "Rules and dataset approval",
    published: "Team Q&A and submissions",
    evaluating: "Private evaluation",
  };
  return next[status] || "SparkLabs follow-up";
}

function goPage(page) {
  document.querySelector(`[data-page="${CSS.escape(page)}"], [data-go-page="${CSS.escape(page)}"]`)?.click();
}

function setText(element, value) {
  if (element) element.textContent = String(value ?? "");
}

function setStatus(element, message, type = "") {
  if (!element) return;
  element.textContent = message || "";
  element.className = `form-status${type ? ` is-${type}` : ""}`;
}

function showToast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 3600);
}

function fillSelect(select, values, allLabel) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  if (values.includes(current)) select.value = current;
}

function fillTeamSelect(select, startups, label) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(label)}</option>${startups.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.category || "")}</option>`).join("")}`;
  if (startups.some((item) => item.id === current)) select.value = current;
}

function fillCompareSelect(select, startups, value, optional = false) {
  if (!select) return;
  select.innerHTML = `<option value="">${optional ? "선택 안 함" : "기업 선택"}</option>${startups.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}`;
  if (value && startups.some((item) => item.id === value)) select.value = value;
}

function countValues(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function countStatus(items, status) {
  return items.filter((item) => item.status === status).length;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function splitList(value) {
  return unique(String(value || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean)).slice(0, 20);
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? new Intl.NumberFormat("ko-KR").format(number) : "0";
}

function formatScore(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toFixed(1) : "—";
}

function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "일정 확인 중";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "현재";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function slugify(value) {
  return String(value || "tech-passport")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function passportStatus(status) {
  const labels = {
    draft: "Draft",
    submitted: "Review requested",
    needs_changes: "Needs changes",
    approved: "Approved",
    published: "Published",
    archived: "Archived",
    evidence_profile: "Evidence profile"
  };
  return labels[status] || status || "Evidence profile";
}

function roleLabel(role) {
  if (role === "b2b_partner") return "B2B Partner";
  if (role === "sparklabs" || role === "admin") return "SparkLabs Ops";
  if (role === "human_validator") return "Human Validator";
  return "Claw Member ★";
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function syncCompareSelectionScope() {
  const currentViewer = viewer();
  const nextIdentity = viewerIdentity(currentViewer);
  if (nextIdentity !== compareViewerIdentity) {
    compareViewerIdentity = nextIdentity;
    resetCompareSelection();
  }
  const validIds = new Set((market()?.startups || []).map((item) => String(item.id)));
  const reconciled = selectedTeamIds.filter((id) => validIds.has(String(id))).slice(0, 3);
  if (reconciled.join("|") !== selectedTeamIds.join("|")) {
    selectedTeamIds = reconciled;
  }
}

function resetCompareSelection() {
  selectedTeamIds = [];
  compareSummaryRequestId += 1;
  compareSummaryState = { key: "", status: "idle", summary: null, error: "" };
}

function clearStoredCompareSelections() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index) || "";
      if (key === LEGACY_COMPARE_KEY || key === COMPARE_KEY_PREFIX || key.startsWith(`${COMPARE_KEY_PREFIX}:`)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Old device-local comparison selections are optional cleanup data.
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
