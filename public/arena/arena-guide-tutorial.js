const ARENA_GUIDE_TUTORIAL_CATALOG = Object.freeze([
  Object.freeze({
    key: "discover-overview",
    number: "01",
    label: "DISCOVER",
    title: "먼저 Discover 전체 화면을 둘러보세요",
    description: "최신 성과, 기업 탐색, 협업 추천과 다음 행동이 Discover에서 어떻게 이어지는지 확인합니다.",
    page: "overview",
    target: "#overviewPage",
    pageOverview: true,
    targetLabel: "Discover 전체 화면",
    actionLabel: "Discover 전체 보기"
  }),
  Object.freeze({
    key: "discover-spotlight",
    number: "02",
    label: "DISCOVER",
    title: "최근 성과가 확인된 4개 팀부터 살펴보세요",
    description: "4 PICKS Editorial Spotlight는 Weekly Report와 공개 근거에서 확인된 최신 실행 성과를 보여줍니다. 좌우 버튼이나 가로 스크롤로 카드를 넘기고 기업 프로필을 열어보세요.",
    page: "overview",
    target: "#featuredSpotlight",
    targetLabel: "최신 성과가 확인된 Editorial Spotlight",
    actionLabel: "Spotlight 다시 보기"
  }),
  Object.freeze({
    key: "discover-spark-ai",
    number: "03",
    label: "DISCOVER",
    title: "Clawee 클로이에게 필요한 기업을 자연어로 물어보세요",
    description: "해결할 문제와 필요한 역량을 적으면 클로이가 공개 프로필 근거로 후보를 정리합니다.",
    page: "overview",
    target: "#agenticDiscoverySection",
    targetLabel: "여기에 해결할 문제와 필요한 역량을 입력하세요",
    actionLabel: "클로이 기업 탐색 보기"
  }),
  Object.freeze({
    key: "discover-curated",
    number: "04",
    label: "DISCOVER",
    title: "Curated Companies에서 전체 참여기업을 탐색하세요",
    description: "검수된 공개 프로필 전체를 둘러보는 시작점입니다. 기업 카드를 열면 팀 경쟁력, 정량 하이라이트, 근거 순으로 정리한 모든 해결 가능 Task를 확인할 수 있습니다.",
    page: "overview",
    target: "#curatedCompaniesCard",
    targetLabel: "전체 참여기업을 여는 Curated Companies",
    actionLabel: "Curated Companies 보기"
  }),
  Object.freeze({
    key: "discover-fit",
    number: "05",
    label: "DISCOVER",
    title: "현재 프로필과 협업 가능성이 높은 팀을 확인하세요",
    description: "협업 적합 기업은 현재 로그인한 기업의 공개 키워드와 역량을 기준으로 추천 순위를 보여줍니다. 카드 안의 목록에서 기업별 서로 다른 일치 근거와 활용 제안을 확인하세요.",
    page: "overview",
    target: "#collaborationFitCard",
    includeTargets: ["#metricProfilesTooltip"],
    expandTarget: true,
    targetLabel: "로그인 기업 기준 협업 추천 순위",
    actionLabel: "협업 적합 기업 보기"
  }),
  Object.freeze({
    key: "discover-task-map",
    number: "06",
    label: "DISCOVER",
    title: "Community Map에서 해결 가능한 Task를 읽으세요",
    description: "산업명이 아니라 참여기업들이 실제로 해결하는 세부 업무 상황을 묶은 지도입니다. 막대를 선택하면 해당 Task를 다루는 팀 탐색으로 이어집니다.",
    page: "overview",
    target: "#taskMapPanel",
    fallbackTarget: "#sectorChart",
    targetLabel: "참여기업의 실제 해결 Task Map",
    actionLabel: "Community Map 보기"
  }),
  Object.freeze({
    key: "discover-benefit",
    number: "07",
    label: "DISCOVER",
    title: "우리 팀에 필요한 혜택을 알려주세요",
    description: "필요한 혜택의 솔루션 명, 세부 내용과 이유를 남기면 운영진이 파트너 발굴에 활용합니다.",
    page: "overview",
    target: "#memberBenefitSurveyForm",
    targetLabel: "Claw Member 혜택 수요 입력",
    actionLabel: "혜택 요청 보기"
  }),
  Object.freeze({
    key: "discover-company-directory",
    number: "08",
    label: "DISCOVER",
    title: "Company Directory에서 전체 참가기업을 둘러보세요",
    description: "회사명과 산업으로 참가기업을 찾고, 카드를 열어 역량과 공개 근거를 확인합니다.",
    page: "teams",
    target: "#teamsPage",
    pageOverview: true,
    targetLabel: "전체 참가기업을 탐색하는 Company Directory",
    actionLabel: "Company Directory 보기"
  }),
  Object.freeze({
    key: "discover-task-driven-search",
    number: "09",
    label: "DISCOVER",
    title: "Task-driven Search에서 해결할 업무로 기업을 찾으세요",
    description: "회사명을 몰라도 해결할 업무를 입력해 공개 근거가 있는 후보를 좁힐 수 있습니다.",
    page: "discover",
    target: "#discoverPage",
    pageOverview: true,
    targetLabel: "업무·문제에서 후보를 찾는 Task-driven Search",
    actionLabel: "Task-driven Search 보기"
  }),
  Object.freeze({
    key: "discover-compare",
    number: "10",
    label: "DISCOVER",
    title: "Compare에서 선택한 기업의 차이를 같은 기준으로 확인하세요",
    description: "최대 3개 기업을 같은 기준으로 비교하고 각 기업의 강점과 공개 근거 차이를 확인합니다.",
    page: "compare",
    target: "#comparePage",
    pageOverview: true,
    targetLabel: "선택 기업을 같은 질문으로 비교하는 Compare",
    actionLabel: "Compare 보기"
  }),
  Object.freeze({
    key: "community-overview",
    number: "11",
    label: "COMMUNITY",
    title: "Community 전체 화면에서 대화의 흐름을 확인하세요",
    description: "질문과 경험을 공유하고, 다른 팀의 글에 댓글과 반응을 남기는 흐름을 확인합니다.",
    page: "community",
    target: "#communityPage",
    pageOverview: true,
    targetLabel: "Community 전체 화면",
    actionLabel: "Community 전체 보기"
  }),
  Object.freeze({
    key: "community-compose",
    number: "12",
    label: "COMMUNITY",
    title: "Start a Conversation에서 내용부터 작성하세요",
    description: "채널이나 제목보다 먼저 실제 질문과 경험을 본문에 적습니다. 고객 정보, API 키, 비공개 계약 내용은 제외하고 다른 팀이 답할 수 있도록 배경과 원하는 도움을 구체적으로 써주세요.",
    page: "community",
    target: "#communityComposer",
    targetLabel: "내용부터 시작하는 Start a Conversation",
    actionLabel: "글쓰기 영역 보기"
  }),
  Object.freeze({
    key: "community-preot",
    number: "13",
    label: "COMMUNITY",
    title: "막힐 때 맞춤 작성 힌트를 활용하세요",
    description: "왼쪽 본문 작성이 막히면 오른쪽 추천 질문을 확인하세요. 질문 옆의 왼쪽 화살표를 누르면 현재 팀에 맞춘 작성 틀이 본문에 들어갑니다.",
    page: "community",
    target: "#communityPromptList",
    targetLabel: "왼쪽 작성창으로 이어지는 맞춤 질문",
    actionLabel: "작성 힌트 보기"
  }),
  Object.freeze({
    key: "community-ai-settings",
    number: "14",
    label: "COMMUNITY",
    title: "Clawee 클로이로 게시 설정 예시를 만들어보세요",
    description: "본문을 쓴 뒤 이 버튼을 누르면 내용은 바꾸지 않고 제목·채널·공개 범위를 제안합니다. 예: 고객 획득 경험 글은 관련 채널과 Public 범위를 제안하며, 게시 전 모두 직접 수정할 수 있습니다.",
    page: "community",
    target: "#communityAnalyzeDraft",
    fallbackTarget: "#communityDraftMetadata",
    includeTargets: ["#communityDraftMetadata"],
    resultTarget: "#communityDraftMetadata",
    targetLabel: "제목·채널·공개 범위를 제안하는 클로이",
    actionLabel: "게시 설정 버튼 보기"
  }),
  Object.freeze({
    key: "community-feed",
    number: "15",
    label: "COMMUNITY",
    title: "Community Feed에서 반응하고 대화를 이어가세요",
    description: "↑ 버튼으로 유용한 글을 upvote하고, 글을 열어 기존 댓글을 확인하거나 새 댓글을 작성하세요. 본인이 작성한 글과 댓글은 직접 수정할 수 있으며 ‘댓글 필요’에서는 아직 답이 없는 글만 모아봅니다.",
    page: "community",
    target: "#communityFeedSection",
    fallbackTarget: "#communityThreadList",
    includeTargets: ["#communityThreadList"],
    targetLabel: "게시글 전체에서 Upvote·댓글 확인·댓글 작성을 하는 Community Feed",
    actionLabel: "Community Feed 보기"
  }),
  Object.freeze({
    key: "bounty-overview",
    number: "16",
    label: "BOUNTY",
    title: "Bounty 전체 화면과 공개 준비 상태를 확인하세요",
    description: "승인된 기업 과제를 결과로 검증해 Pilot으로 연결합니다. 현재는 공개 준비 중입니다.",
    page: "arena",
    target: "#arenaPage",
    pageOverview: true,
    targetLabel: "Bounty 전체 화면",
    actionLabel: "Bounty 전체 보기"
  }),
  Object.freeze({
    key: "bounty-preview",
    number: "17",
    label: "BOUNTY",
    title: "실제 문제를 결과로 검증하는 Bounty가 열릴 예정입니다",
    description: "기업의 실제 문제와 성공 기준을 과제로 만들고, 재현 가능한 결과를 Machine·Human 평가로 검증해 PoC 기회로 연결합니다. 현재는 Release 준비 중이며 실제 Sponsor Brief가 승인된 Bounty만 추후 참가자에게 공개됩니다.",
    page: "arena",
    target: "#arenaHowItWorks",
    fallbackTarget: "#arenaBountyBoard",
    targetLabel: "승인된 실제 문제만 공개될 Bounty 흐름",
    actionLabel: "Bounty 준비 화면 보기"
  }),
  Object.freeze({
    key: "my-log-overview",
    number: "18",
    label: "MY LOG",
    title: "My Log 전체 화면에서 내 활동 흐름을 확인하세요",
    description: "매치 요청, Community 활동, Bounty 진행과 최신 기록을 내 계정 기준으로 확인합니다.",
    page: "workspace",
    target: "#workspacePage",
    pageOverview: true,
    targetLabel: "My Log 전체 화면",
    actionLabel: "My Log 전체 보기"
  }),
  Object.freeze({
    key: "my-log-metrics",
    number: "19",
    label: "MY LOG",
    title: "상단 지표에서 내 활동을 빠르게 요약하세요",
    description: "보낸 매치 요청, 작성한 Community 글과 댓글, 받은 반응, Bounty 진행 건수를 현재 계정 기준으로 집계합니다. 다른 계정으로 바꾸면 기록도 함께 안전하게 전환됩니다.",
    page: "workspace",
    target: "#workspaceMetrics",
    targetLabel: "현재 계정의 활동 요약 지표",
    actionLabel: "My Log 지표 보기"
  }),
  Object.freeze({
    key: "my-log-actions",
    number: "20",
    label: "MY LOG",
    title: "지금 할 일에서 다음 행동을 놓치지 마세요",
    description: "답변을 기다리는 요청과 이어갈 대화 등 지금 처리할 항목에서 다음 화면으로 바로 이동합니다.",
    page: "workspace",
    target: "#workspaceActions",
    targetLabel: "내 다음 행동을 모은 Next Actions",
    actionLabel: "지금 할 일 보기"
  }),
  Object.freeze({
    key: "my-log-activity",
    number: "21",
    label: "MY LOG",
    title: "Recent Activity에서 최신 기록을 역시간순으로 확인하세요",
    description: "내가 보낸 협업 요청과 상대 팀의 응답, 글·댓글·반응, Bounty 신청과 상태 변경을 최신순 raw log로 확인합니다. 이 기록은 현재 로그인한 본인에게만 보입니다.",
    page: "workspace",
    target: "#workspaceActivity",
    fallbackTarget: "#myLogTimeline",
    targetLabel: "가장 최근 활동부터 보여주는 개인 기록",
    actionLabel: "Recent Activity 보기"
  }),
  Object.freeze({
    key: "discover-advisors",
    label: "DISCOVER",
    title: "Global Advisors & Faculty를 확인하세요",
    description: "글로벌 기술·산업·투자 리더의 전문 분야를 보고 필요한 관점을 빠르게 찾습니다.",
    page: "advisors",
    target: "#advisorsPage",
    pageOverview: true,
    targetLabel: "Global Advisors & Faculty",
    actionLabel: "Advisors 보기"
  }),
  Object.freeze({
    key: "admin-bounty-operations",
    label: "BOUNTY",
    title: "Bounty 운영 상태를 관리하세요",
    description: "승인된 Brief의 설계, 평가와 Pilot 전환 상태를 운영 화면에서 확인합니다.",
    page: "arena",
    target: "#arenaStaffPanel",
    fallbackTarget: "#arenaHowItWorks",
    targetLabel: "SparkLabs Bounty 운영 화면",
    actionLabel: "Bounty 운영 보기"
  }),
  Object.freeze({
    key: "admin-discovery-intake",
    label: "MY LOG",
    title: "새 탐색 Brief를 놓치지 마세요",
    description: "첫 화면에서 접수된 탐색 Brief와 확인할 다음 행동을 My Log에서 모니터링합니다.",
    page: "workspace",
    target: "#myLogBriefs",
    fallbackTarget: "#workspaceActions",
    targetLabel: "관리자 탐색 Brief 접수",
    actionLabel: "탐색 Brief 보기"
  }),
  Object.freeze({
    key: "admin-benefit-queue",
    label: "MY LOG",
    title: "멤버 혜택 수요를 확인하세요",
    description: "Claw Member가 새로 요청한 혜택을 운영 Queue에서 확인하고 파트너 발굴에 활용합니다.",
    page: "workspace",
    target: "#staffMarketQueue",
    fallbackTarget: "#workspaceActions",
    targetLabel: "혜택·파트너십 Queue",
    actionLabel: "혜택 Queue 보기"
  }),
  Object.freeze({
    key: "admin-activity",
    label: "MY LOG",
    title: "전체 사용자 활동을 점검하세요",
    description: "Activity Explorer에서 사용자, 영역, 행위와 기간별 운영 로그를 확인합니다.",
    page: "workspace",
    target: "#adminActivityExplorer",
    targetLabel: "전체 사용자 Activity Explorer",
    actionLabel: "Activity Explorer 보기"
  }),
  Object.freeze({
    key: "partner-events-perks",
    label: "EVENTS & PERKS",
    title: "공개 일정과 파트너 혜택 사례를 확인하세요",
    description: "8월 13일 OT 이후의 공개 일정과 다른 파트너사가 제공하는 Verified Perks를 확인합니다.",
    page: "calendar",
    target: "#calendarPage",
    pageOverview: true,
    targetLabel: "외부 파트너 Events & Perks",
    actionLabel: "Events & Perks 보기"
  }),
  Object.freeze({
    key: "partner-bounty-studio",
    label: "BOUNTY",
    title: "기업 문제를 Bounty Brief로 등록하세요",
    description: "문제, 성공 기준, 평가 방식과 공개 범위를 한 번에 설정해 제출합니다.",
    page: "partnerships",
    target: "#bountyBriefPanel",
    targetLabel: "파트너 Bounty Brief Studio",
    actionLabel: "Bounty Brief 등록"
  }),
  Object.freeze({
    key: "partner-bounty-pipeline",
    label: "BOUNTY",
    title: "Brief에서 Pilot까지 추적하세요",
    description: "제출한 Brief의 검토, 공개, 평가와 Pilot 전환 상태를 한 흐름에서 확인합니다.",
    page: "partnerships",
    target: "#partnershipPipelinePanel",
    targetLabel: "파트너 Bounty Pipeline",
    actionLabel: "Bounty Pipeline 보기"
  })
]);

const ARENA_GUIDE_TUTORIAL_KEYS_BY_ROLE = Object.freeze({
  member: Object.freeze([
    "discover-overview",
    "discover-spark-ai",
    "discover-company-directory",
    "discover-advisors",
    "discover-benefit",
    "community-overview",
    "bounty-overview",
    "my-log-overview",
    "my-log-actions"
  ]),
  staff: Object.freeze([
    "discover-overview",
    "discover-company-directory",
    "discover-advisors",
    "community-overview",
    "admin-bounty-operations",
    "admin-discovery-intake",
    "admin-benefit-queue",
    "admin-activity"
  ]),
  partner: Object.freeze([
    "discover-overview",
    "discover-company-directory",
    "discover-task-driven-search",
    "discover-compare",
    "community-overview",
    "partner-events-perks",
    "partner-bounty-studio",
    "partner-bounty-pipeline",
    "my-log-overview"
  ])
});

const ARENA_GUIDE_TUTORIAL_ROLE_COPY = Object.freeze({
  member: Object.freeze({ label: "SparkClaw 멤버", title: "SparkClaw 멤버 빠른 시작" }),
  staff: Object.freeze({ label: "SparkLabs 관리자", title: "SparkLabs 관리자 빠른 시작" }),
  partner: Object.freeze({ label: "외부 파트너", title: "외부 파트너 빠른 시작" })
});

const ARENA_GUIDE_TUTORIAL_CATALOG_BY_KEY = new Map(ARENA_GUIDE_TUTORIAL_CATALOG.map((step) => [step.key, step]));

export function normalizeArenaGuideTutorialRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (["sparklabs", "admin"].includes(normalized)) return "staff";
  if (normalized === "b2b_partner") return "partner";
  return "member";
}

export function getArenaGuideTutorialSteps(role) {
  const normalizedRole = normalizeArenaGuideTutorialRole(role);
  return Object.freeze(ARENA_GUIDE_TUTORIAL_KEYS_BY_ROLE[normalizedRole].map((key, index) => Object.freeze({
    ...ARENA_GUIDE_TUTORIAL_CATALOG_BY_KEY.get(key),
    number: String(index + 1).padStart(2, "0")
  })));
}

export const ARENA_GUIDE_TUTORIAL_STEPS_BY_ROLE = Object.freeze({
  member: getArenaGuideTutorialSteps("member"),
  staff: getArenaGuideTutorialSteps("sparklabs"),
  partner: getArenaGuideTutorialSteps("b2b_partner")
});

export const ARENA_GUIDE_TUTORIAL_STEPS = ARENA_GUIDE_TUTORIAL_STEPS_BY_ROLE.member;

const ARENA_GUIDE_TUTORIAL_CHAPTERS = Object.freeze([
  Object.freeze({ key: "discover", label: "DISCOVER" }),
  Object.freeze({ key: "community", label: "COMMUNITY" }),
  Object.freeze({ key: "bounty", label: "BOUNTY" }),
  Object.freeze({ key: "events-perks", label: "EVENTS & PERKS" }),
  Object.freeze({ key: "my-log", label: "MY LOG" })
]);

export function initArenaGuideTutorial(options = {}) {
  const root = options.root;
  const panel = options.panel;
  const doc = options.document || root?.ownerDocument || globalThis.document;
  const win = doc?.defaultView || globalThis.window;
  const startButton = root?.querySelector("[data-guide-tutorial-start]");
  const tutorial = root?.querySelector("#arenaGuideTutorial");
  const closeButton = tutorial?.querySelector("[data-guide-tutorial-close]");
  const previousButton = tutorial?.querySelector("[data-guide-tutorial-previous]");
  const nextButton = tutorial?.querySelector("[data-guide-tutorial-next]");
  const pageButton = tutorial?.querySelector("[data-guide-tutorial-page]");
  const number = tutorial?.querySelector("[data-guide-tutorial-number]");
  const label = tutorial?.querySelector("[data-guide-tutorial-label]");
  const title = tutorial?.querySelector("[data-guide-tutorial-title]");
  const description = tutorial?.querySelector("[data-guide-tutorial-description]");
  const progress = tutorial?.querySelector("[data-guide-tutorial-progress]");
  const nav = tutorial?.querySelector("[data-guide-tutorial-nav]") || tutorial?.querySelector("nav");
  const startSummary = root?.querySelector("[data-guide-tutorial-summary]");
  const roleTitle = tutorial?.querySelector("[data-guide-tutorial-role-title]");
  const spotlight = createSpotlight(doc);
  let dots = [];
  let tutorialSteps = ARENA_GUIDE_TUTORIAL_STEPS;
  let tutorialRole = "";
  let activeIndex = 0;
  let activeTarget = null;
  let activeIncludedTargets = [];
  let activeChapter = "";
  let revealTimer = 0;
  let chapterAnimationTimer = 0;

  if (!root || !panel || !startButton || !tutorial) {
    return { start() {}, reset() {}, close() {}, refreshRole() {}, isOpen: () => false };
  }

  refreshRole();
  startButton.addEventListener("click", start);
  closeButton?.addEventListener("click", close);
  previousButton?.addEventListener("click", () => showStep(activeIndex - 1));
  nextButton?.addEventListener("click", () => {
    if (activeIndex >= tutorialSteps.length - 1) close();
    else showStep(activeIndex + 1);
  });
  pageButton?.addEventListener("click", revealActiveStep);
  win?.addEventListener("resize", positionSpotlight);
  win?.addEventListener("scroll", positionSpotlight, true);
  doc?.addEventListener?.("arena:community-draft-ready", revealGeneratedResult);

  function refreshRole() {
    const nextRole = normalizeArenaGuideTutorialRole(options.getRole?.());
    const nextSteps = ARENA_GUIDE_TUTORIAL_STEPS_BY_ROLE[nextRole];
    const roleChanged = tutorialRole !== nextRole;
    tutorialRole = nextRole;
    tutorialSteps = nextSteps;
    if (roleChanged || dots.length !== tutorialSteps.length) {
      activeIndex = 0;
      buildStepNavigation();
    }
    const roleCopy = ARENA_GUIDE_TUTORIAL_ROLE_COPY[tutorialRole];
    if (startSummary) startSummary.textContent = `${roleCopy.label}에게 필요한 핵심 기능을 ${tutorialSteps.length}단계로 안내합니다.`;
    if (roleTitle) roleTitle.textContent = roleCopy.title;
    if (nav) nav.setAttribute("aria-label", `${roleCopy.label} 튜토리얼 ${tutorialSteps.length}단계`);
    tutorial.dataset.guideTutorialRole = tutorialRole;
    render();
  }

  function buildStepNavigation() {
    if (!nav || !doc?.createElement) return;
    nav.replaceChildren?.();
    dots = [];
    nav.style.setProperty("--guide-step-count", String(tutorialSteps.length));
    let previousLabel = "";
    tutorialSteps.forEach((step, index) => {
      const dot = doc.createElement("button");
      dot.type = "button";
      dot.dataset.guideTutorialStep = String(index);
      dot.setAttribute("aria-label", `${index + 1}단계 ${step.label}: ${step.title}`);
      if (index > 0 && step.label !== previousLabel) dot.dataset.guideChapterStart = "true";
      dot.addEventListener("click", () => showStep(index));
      nav.append(dot);
      dots.push(dot);
      previousLabel = step.label;
    });
  }

  function start() {
    refreshRole();
    panel.hidden = false;
    root.dataset.guideState = "open";
    root.dataset.guideMode = "tutorial";
    tutorial.hidden = false;
    doc?.body?.setAttribute("data-guide-tutorial-open", "true");
    showStep(0);
  }

  function close() {
    clearRevealTimer();
    clearChapterAnimationTimer();
    hideSpotlight();
    clearChapterHighlight();
    tutorial.hidden = true;
    root.dataset.guideMode = "chat";
    options.onClose?.();
  }

  function reset() {
    activeIndex = 0;
    clearRevealTimer();
    clearChapterAnimationTimer();
    hideSpotlight();
    clearChapterHighlight();
    tutorial.hidden = true;
    root.dataset.guideMode = "chat";
    render();
  }

  function showStep(index) {
    activeIndex = Math.max(0, Math.min(tutorialSteps.length - 1, Number(index) || 0));
    render();
    revealActiveStep();
  }

  function revealActiveStep() {
    const step = tutorialSteps[activeIndex];
    clearRevealTimer();
    hideSpotlight();
    const currentPage = options.getCurrentPage?.() || "";
    const pageChanged = currentPage !== step.page;
    if (pageChanged) options.navigate?.(step.page, { skipScroll: true });
    options.onNavigate?.(step, { pageChanged });
    revealTimer = win?.setTimeout(() => {
      const pageFallback = `[data-page-panel="${step.page}"]`;
      activeTarget = findVisibleTarget(step.target, step.fallbackTarget, pageFallback);
      if (!activeTarget) return;
      activeIncludedTargets = resolveIncludedTargets(step);
      if (step.expandTarget) activeTarget.classList?.add("is-guide-expanded");
      const reduceMotion = win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      activeTarget.scrollIntoView?.({
        behavior: reduceMotion ? "auto" : "smooth",
        block: step.pageOverview ? "start" : "center",
        inline: "nearest"
      });
      revealTimer = win?.setTimeout(() => showSpotlight(step), reduceMotion ? 0 : 320) || 0;
    }, pageChanged ? 120 : 0) || 0;
  }

  function findVisibleTarget(...selectors) {
    for (const selector of selectors) {
      if (!selector) continue;
      const candidate = doc?.querySelector(selector);
      if (!candidate || candidate.hidden || candidate.closest?.("[hidden]")) continue;
      return candidate;
    }
    return null;
  }

  function resolveIncludedTargets(step) {
    return (step.includeTargets || [])
      .map((selector) => findVisibleTarget(selector))
      .filter((target, index, targets) => target && target !== activeTarget && targets.indexOf(target) === index);
  }

  function revealGeneratedResult() {
    if (tutorial.hidden || root.dataset.guideMode !== "tutorial") return;
    const step = tutorialSteps[activeIndex];
    if (!step.resultTarget) return;
    const resultTarget = findVisibleTarget(step.resultTarget);
    if (!resultTarget) return;
    activeIncludedTargets = resolveIncludedTargets(step);
    resultTarget.classList?.add("is-guide-result-ready");
    const reduceMotion = win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    resultTarget.scrollIntoView?.({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
      inline: "nearest"
    });
    revealTimer = win?.setTimeout(() => {
      positionSpotlight();
      resultTarget.classList?.remove("is-guide-result-ready");
      revealTimer = 0;
    }, reduceMotion ? 0 : 340) || 0;
  }

  function showSpotlight(step) {
    if (!activeTarget || !spotlight) return;
    spotlight.dataset.label = step.targetLabel;
    spotlight.hidden = false;
    doc?.body?.setAttribute("data-guide-tour-active", "true");
    positionSpotlight();
  }

  function positionSpotlight() {
    if (!activeTarget || !spotlight || spotlight.hidden) return;
    const rects = [activeTarget, ...activeIncludedTargets]
      .map((target) => target?.getBoundingClientRect?.())
      .filter(Boolean);
    if (!rects.length) return;
    const rect = rects.reduce((bounds, item) => ({
      top: Math.min(bounds.top, item.top),
      right: Math.max(bounds.right, item.right),
      bottom: Math.max(bounds.bottom, item.bottom),
      left: Math.min(bounds.left, item.left)
    }));
    const padding = win?.innerWidth && win.innerWidth < 640 ? 7 : 11;
    spotlight.style.setProperty("--guide-x", `${Math.max(5, rect.left - padding)}px`);
    spotlight.style.setProperty("--guide-y", `${Math.max(5, rect.top - padding)}px`);
    spotlight.style.setProperty("--guide-width", `${Math.max(40, Math.min((win?.innerWidth || rect.right) - 10, rect.right + padding) - Math.max(5, rect.left - padding))}px`);
    spotlight.style.setProperty("--guide-height", `${Math.max(40, Math.min((win?.innerHeight || rect.bottom) - 10, rect.bottom + padding) - Math.max(5, rect.top - padding))}px`);
  }

  function hideSpotlight() {
    if (spotlight) spotlight.hidden = true;
    activeTarget?.classList?.remove("is-guide-expanded");
    activeTarget = null;
    activeIncludedTargets = [];
    doc?.body?.removeAttribute("data-guide-tour-active");
  }

  function clearRevealTimer() {
    if (revealTimer) win?.clearTimeout(revealTimer);
    revealTimer = 0;
  }

  function clearChapterAnimationTimer() {
    if (chapterAnimationTimer) win?.clearTimeout(chapterAnimationTimer);
    chapterAnimationTimer = 0;
  }

  function updateChapterHighlight(step) {
    const chapter = ARENA_GUIDE_TUTORIAL_CHAPTERS.find((item) => item.label === step.label);
    if (!chapter) return;
    const chapterChanged = Boolean(activeChapter && activeChapter !== chapter.key);
    doc?.querySelectorAll?.("[data-guide-chapter]").forEach((item) => {
      const current = item.dataset.guideChapter === chapter.key;
      item.classList.toggle("is-guide-chapter-active", current);
      item.classList.remove("is-guide-chapter-arriving");
    });
    if (chapterChanged) {
      clearChapterAnimationTimer();
      const activeMenu = doc?.querySelector?.(`[data-guide-chapter="${chapter.key}"]`);
      void activeMenu?.getBoundingClientRect?.();
      activeMenu?.classList.add("is-guide-chapter-arriving");
      chapterAnimationTimer = win?.setTimeout(() => {
        activeMenu?.classList.remove("is-guide-chapter-arriving");
        chapterAnimationTimer = 0;
      }, 900) || 0;
    }
    activeChapter = chapter.key;
  }

  function clearChapterHighlight() {
    doc?.querySelectorAll?.("[data-guide-chapter]").forEach((item) => {
      item.classList.remove("is-guide-chapter-active", "is-guide-chapter-arriving");
    });
    doc?.body?.removeAttribute("data-guide-tutorial-open");
    activeChapter = "";
  }

  function render() {
    const step = tutorialSteps[activeIndex];
    if (!step) return;
    if (!tutorial.hidden && root.dataset.guideMode === "tutorial") updateChapterHighlight(step);
    const chapterSteps = tutorialSteps.filter((item) => item.label === step.label);
    const chapterIndex = chapterSteps.findIndex((item) => item.key === step.key) + 1;
    if (number) number.textContent = step.number;
    if (label) label.textContent = `${step.label} · ${chapterIndex}/${chapterSteps.length}`;
    if (title) title.textContent = step.title;
    if (description) description.textContent = step.description;
    if (progress) progress.textContent = `${activeIndex + 1} / ${tutorialSteps.length}`;
    if (previousButton) previousButton.disabled = activeIndex === 0;
    if (nextButton) nextButton.textContent = activeIndex === tutorialSteps.length - 1 ? "튜토리얼 마치기" : "다음 단계 →";
    if (pageButton) pageButton.textContent = `${step.actionLabel} →`;
    dots.forEach((dot, index) => {
      const current = index === activeIndex;
      dot.classList.toggle("is-active", current);
      dot.classList.toggle("is-complete", index < activeIndex);
      if (current) dot.setAttribute("aria-current", "step");
      else dot.removeAttribute("aria-current");
    });
  }

  render();
  return { start, reset, close, refreshRole, isOpen: () => !tutorial.hidden };
}

function createSpotlight(doc) {
  if (!doc?.createElement || !doc?.body) return null;
  const spotlight = doc.createElement("div");
  spotlight.className = "arena-guide-live-spotlight";
  spotlight.setAttribute("aria-hidden", "true");
  spotlight.hidden = true;
  doc.body.append(spotlight);
  return spotlight;
}
