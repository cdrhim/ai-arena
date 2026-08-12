import { brandSafeDisplayText, escapeHtml } from "./sanitize.js";
import { finishProcessStatus, setProcessStatus, startProcessStatus } from "./progress-status.js";
import { audienceScopeLabel, audienceScopeOptionsForRole } from "./audience-scope.js";
import { communityPromptProfile, personalizedCommunityPrompts } from "./community-prompts.js?v=ai-arena-20260812-meeting-next-steps";
import { communityHighlightItems, communityHighlightsForViewer } from "./featured-news.js";
import { communityLiveCopy } from "./community-live.js";

const SESSION_KEY = "sparkclaw-program-hub-session-v1";
const FOUNDER_POST_TYPES = {
  ask: {
    label: "Ask",
    categorySlug: "ask",
    titlePlaceholder: "예: 엔터프라이즈 고객의 보안 검토에서 막힌 팀 있나요?",
    fields: ["상황", "이미 시도한 것", "막힌 지점", "구체적으로 필요한 도움"],
    template: "상황:\n\n이미 시도한 것:\n\n막힌 지점:\n\n구체적으로 필요한 도움:"
  },
  ship: {
    label: "Ship",
    categorySlug: "show",
    titlePlaceholder: "예: 최근 온보딩 에이전트 v1을 출시했습니다",
    fields: ["출시하거나 실험한 것", "배운 점", "확인하고 싶은 점", "링크 또는 데모 (선택)"],
    template: "출시하거나 실험한 것:\n\n배운 점:\n\n확인하고 싶은 점:\n\n링크 또는 데모 (선택):"
  },
  connect: {
    label: "Connect",
    categorySlug: "connect",
    titlePlaceholder: "예: 제조 데이터 보안 경험이 있는 전문가를 찾습니다",
    fields: ["찾는 대상", "연결 목적", "상대에게 줄 수 있는 것", "원하는 시점 또는 조건"],
    template: "찾는 대상:\n\n연결 목적:\n\n상대에게 줄 수 있는 것:\n\n원하는 시점 또는 조건:"
  },
  outcome: {
    label: "Outcome",
    categorySlug: "outcome",
    titlePlaceholder: "예: 보안 체크리스트 공유 후 첫 PoC 검토를 통과했습니다",
    fields: ["원래 문제 또는 요청", "받은 도움", "실행 결과", "다음 단계"],
    template: "원래 문제 또는 요청:\n\n받은 도움:\n\n실행 결과:\n\n다음 단계:"
  }
};
const POST_TYPE_ALIASES = { ask: "ask", show: "ship", ship: "ship", connect: "connect", outcome: "outcome" };
const DISCOVERY_PROGRESS_STEPS = [
  "요청에서 목표와 필수 조건을 구조화하고 있습니다.",
  "참가기업의 안전한 기본 프로필에서 후보를 탐색하고 있습니다.",
  "역량·사례·배포 근거와 누락 정보를 비교하고 있습니다.",
  "검토할 후보와 다음 단계를 정리하고 있습니다."
];
const COMMUNITY_PROGRESS_STEPS = [
  "회원 권한과 공개 범위를 확인하고 있습니다.",
  "최신 대화와 응답 상태를 불러오고 있습니다.",
  "Community 피드를 정리하고 있습니다."
];
const COMMUNITY_DRAFT_PROGRESS_STEPS = [
  "작성한 내용을 게시 가능한 맥락으로 구조화하고 있습니다.",
  "Spark AI가 가장 적합한 채널과 공개 범위를 분석하고 있습니다.",
  "읽기 쉬운 제목과 게시 설정을 정리하고 있습니다."
];
let context = window.__sparkArenaContext || {};
let forum = { categories: [], threads: [], comments: [] };
let selectedCategory = "";
let selectedSort = "hot";
let forumLoaded = false;
let forumViewerKey = "";
let discoveryPending = false;
let discoveryRequestId = 0;
let threadDraftAnalysisPending = false;
let lastAnalyzedBody = "";
let selectedThreadId = "";
let selectedParentCommentId = "";
let pendingHistoryThreadId = "";
let activeCommunityPrompts = [];
let promptGuideTimer = null;
let featuredHighlightKey = "";
let featuredHighlightRequestId = 0;
let communityLiveTimer = null;
let arenaAnnouncements = [];
let arenaAnnouncementRequestId = 0;
let announcementDraftMode = false;

const els = {
  discoveryForm: document.querySelector("#agenticDiscoveryForm"),
  discoveryQuery: document.querySelector("#agenticDiscoveryQuery"),
  discoverySubmit: document.querySelector("#agenticDiscoverySubmit"),
  discoveryStatus: document.querySelector("#agenticDiscoveryStatus"),
  discoveryResults: document.querySelector("#agenticDiscoveryResults"),
  featuredNews: document.querySelector("#featuredNews"),
  announcementBoard: document.querySelector("#communityAnnouncementBoard"),
  announcementList: document.querySelector("#communityAnnouncementList"),
  announcementCount: document.querySelector("#communityAnnouncementCount"),
  announcementTools: document.querySelector("#communityAnnouncementTools"),
  announcementMode: document.querySelector("#communityAnnouncementMode"),
  liveCard: document.querySelector("#communityLiveCard"),
  liveTitle: document.querySelector("#communityLiveTitle"),
  liveMeta: document.querySelector("#communityLiveMeta"),
  partnerLogoRail: document.querySelector("#partnerLogoRail"),
  memberPerkRequestForm: document.querySelector("#memberPerkRequestForm"),
  memberPerkRequestInput: document.querySelector("#memberPerkRequestInput"),
  memberPerkRequestStatus: document.querySelector("#memberPerkRequestStatus"),
  promptKicker: document.querySelector("#communityPromptKicker"),
  promptTitle: document.querySelector("#communityPromptTitle"),
  promptList: document.querySelector("#communityPromptList"),
  promptContext: document.querySelector("#communityPromptContext"),
  promptGuide: document.querySelector("#communityPromptGuide"),
  promptGuideTitle: document.querySelector("#communityPromptGuideTitle"),
  promptGuideCopy: document.querySelector("#communityPromptGuideCopy"),
  composer: document.querySelector("#communityComposer"),
  categories: document.querySelector("#communityCategories"),
  threadForm: document.querySelector("#communityThreadForm"),
  threadLinkedLabel: document.querySelector("#communityThreadLinkedLabel"),
  threadBody: document.querySelector("#communityThreadBody"),
  threadTitle: document.querySelector("#communityThreadTitle"),
  threadCategory: document.querySelector("#communityThreadCategory"),
  threadVisibility: document.querySelector("#communityThreadVisibility"),
  threadAnalyze: document.querySelector("#communityAnalyzeDraft"),
  threadMetadata: document.querySelector("#communityDraftMetadata"),
  threadReason: document.querySelector("#communityDraftReason"),
  threadSubmit: document.querySelector("#communityThreadSubmit"),
  threadStatus: document.querySelector("#communityThreadStatus"),
  threadList: document.querySelector("#communityThreadList"),
  threadDialog: document.querySelector("#communityThreadDialog"),
  threadDialogClose: document.querySelector("#communityThreadDialogClose"),
  threadDetail: document.querySelector("#communityThreadDetail"),
  commentList: document.querySelector("#communityCommentList"),
  commentCount: document.querySelector("#communityCommentCount"),
  commentForm: document.querySelector("#communityCommentForm"),
  commentBody: document.querySelector("#communityCommentBody"),
  commentStatus: document.querySelector("#communityCommentStatus"),
  commentUnavailable: document.querySelector("#communityCommentUnavailable"),
  replyContext: document.querySelector("#communityReplyContext"),
  replyLabel: document.querySelector("#communityReplyLabel"),
  replyCancel: document.querySelector("#communityReplyCancel")
};

configureCommunitySorts();
bindEvents();
renderEditorial();
renderConversationPrompts();

window.addEventListener("spark-arena:data", (event) => {
  const nextContext = event.detail || {};
  const nextViewerKey = viewerKey(nextContext.viewer);
  const currentViewerKey = viewerKey(context.viewer);
  if ((currentViewerKey && currentViewerKey !== nextViewerKey) || (forumViewerKey && forumViewerKey !== nextViewerKey)) {
    resetForumForViewerChange();
  }
  context = nextContext;
  renderEditorial();
  renderConversationPrompts();
  configureAnnouncementComposer();
  loadArenaAnnouncements();
});

window.addEventListener("spark-arena:page", (event) => {
  if (event.detail?.page === "community") {
    resetAgenticDiscovery();
    loadForum();
  }
});

window.addEventListener("spark-arena:discovery-reset", resetAgenticDiscovery);
window.addEventListener("spark-arena:load-community-activity", () => loadForum());
window.addEventListener("spark-arena:close-history-overlays", () => closeThreadDialog({ historyMode: "none" }));
window.addEventListener("spark-arena:restore-history-overlay", (event) => {
  if (event.detail?.type !== "community-thread") return;
  const threadId = String(event.detail.id || "");
  if (forumLoaded) openThreadDialog(threadId, { recordHistory: false });
  else pendingHistoryThreadId = threadId;
});

function bindEvents() {
  els.discoveryForm?.addEventListener("submit", runAgenticDiscovery);
  els.announcementMode?.addEventListener("click", prepareArenaAnnouncement);
  els.announcementList?.addEventListener("click", handleAnnouncementOpen);
  els.featuredNews?.addEventListener("click", handleAnnouncementOpen);
  els.featuredNews?.addEventListener("keydown", handleAnnouncementOpen);
  els.memberPerkRequestForm?.addEventListener("submit", prepareMemberPerkRequest);
  els.discoveryResults?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-recommended-product-id]");
    if (!card) return;
    window.dispatchEvent(new CustomEvent("spark-arena:open-program-team", {
      detail: { productId: card.dataset.recommendedProductId }
    }));
  });
  document.querySelectorAll("[data-agent-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!els.discoveryQuery) return;
      els.discoveryQuery.value = button.dataset.agentPrompt || "";
      els.discoveryQuery.focus();
    });
  });
  els.categories?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-community-category]");
    if (!button) return;
    selectedCategory = button.dataset.communityCategory || "";
    renderCategories();
    renderThreads();
  });
  document.querySelectorAll("[data-community-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSort = button.dataset.communitySort || "hot";
      document.querySelectorAll("[data-community-sort]").forEach((item) => item.classList.toggle("is-active", item === button));
      renderThreads();
    });
  });
  els.promptList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-community-prompt]");
    if (button) hydrateConversationPrompt(button.dataset.communityPrompt);
  });
  els.threadAnalyze?.addEventListener("click", analyzeThreadDraft);
  els.threadBody?.addEventListener("input", () => {
    if (lastAnalyzedBody && els.threadBody.value.trim() !== lastAnalyzedBody) invalidateThreadAnalysis();
  });
  els.threadForm?.addEventListener("submit", createThread);
  els.threadList?.addEventListener("click", (event) => {
    const voteButton = event.target.closest("[data-community-vote]");
    if (voteButton) {
      voteThread(voteButton.dataset.communityVote);
      return;
    }
    const openButton = event.target.closest("[data-community-open-thread]");
    if (openButton) openThreadDialog(openButton.dataset.communityOpenThread);
  });
  els.threadDialogClose?.addEventListener("click", closeThreadDialog);
  els.threadDialog?.addEventListener("click", (event) => {
    if (event.target === els.threadDialog) closeThreadDialog();
  });
  els.threadDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeThreadDialog();
  });
  els.threadDialog?.addEventListener("close", resetThreadDialogState);
  els.commentForm?.addEventListener("submit", createComment);
  els.commentList?.addEventListener("click", (event) => {
    const replyButton = event.target.closest("[data-community-reply]");
    if (replyButton) selectCommentReply(replyButton.dataset.communityReply);
  });
  els.replyCancel?.addEventListener("click", clearCommentReply);
}

function prepareMemberPerkRequest(event) {
  event.preventDefault();
  const request = String(els.memberPerkRequestInput?.value || "").trim();
  if (request.length < 6) {
    setStatus(els.memberPerkRequestStatus, "원하는 혜택을 조금 더 구체적으로 적어주세요.", "error");
    els.memberPerkRequestInput?.focus();
    return;
  }

  if (!els.threadBody) return;
  if (els.threadLinkedLabel) els.threadLinkedLabel.value = "perk_request";
  els.threadBody.value = [
    "원하는 혜택:",
    request,
    "",
    "필요한 이유:",
    "",
    "예상 사용 방식 또는 팀 규모:",
    "",
    "희망 시점 또는 조건:"
  ].join("\n");
  invalidateThreadAnalysis({ preserveStatus: true });

  if (els.promptGuide && els.promptGuideTitle && els.promptGuideCopy) {
    els.promptGuide.hidden = false;
    els.promptGuideTitle.textContent = "원하는 혜택 요청 초안";
    els.promptGuideCopy.textContent = "필요한 이유와 예상 사용 방식까지 보완한 뒤 Spark AI로 제목·채널·공개 범위를 제안받아 게시해 주세요.";
  }

  setStatus(els.memberPerkRequestStatus, "Community 초안을 만들었습니다. 이동 후 내용을 확인해 주세요.", "success");
  document.querySelector('[data-go-page="community"]')?.click();
  window.requestAnimationFrame(() => {
    els.composer?.scrollIntoView({ behavior: "smooth", block: "start" });
    els.threadBody?.focus({ preventScroll: true });
    const requestEnd = els.threadBody.value.indexOf("\n\n필요한 이유:");
    const caretPosition = requestEnd >= 0 ? requestEnd + "\n\n필요한 이유:\n".length : els.threadBody.value.length;
    els.threadBody.setSelectionRange(caretPosition, caretPosition);
  });
}

function configureCommunitySorts() {
  const hotButton = document.querySelector('[data-community-sort="hot"]');
  const newButton = document.querySelector('[data-community-sort="new"]');
  const topButton = document.querySelector('[data-community-sort="top"]');
  if (hotButton) hotButton.textContent = "인기순";
  if (newButton) newButton.textContent = "최신순";
  if (topButton) {
    topButton.dataset.communitySort = "needs";
    topButton.textContent = "답변 필요";
  }
}

async function runAgenticDiscovery(event) {
  event.preventDefault();
  const query = String(new FormData(els.discoveryForm).get("query") || "").trim();
  if (!query || discoveryPending) return;
  const requestId = ++discoveryRequestId;
  const progressToken = startProcessStatus(els.discoveryStatus, DISCOVERY_PROGRESS_STEPS, {
    announcement: "Spark AI가 파트너 후보 탐색을 시작했습니다.",
    interval: 1650
  });
  els.discoveryResults.hidden = true;
  setDiscoveryPending(true);
  try {
    const response = await fetch("/api/b2b-match", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ query })
    });
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(discoveryErrorMessage(response.status));
    if (requestId !== discoveryRequestId) return;
    renderAgenticResults(payload.matches || [], payload.source);
    finishProcessStatus(
      els.discoveryStatus,
      progressToken,
      payload.source === "anthropic"
        ? "Spark AI가 공개 프로필의 근거를 바탕으로 후보를 정리했습니다. 확인되지 않은 정보는 소개 전에 검증합니다."
        : "공개 프로필의 구조화된 근거로 후보를 정리했습니다. 확인되지 않은 정보는 소개 전에 검증합니다.",
      "success"
    );
  } catch (error) {
    if (requestId !== discoveryRequestId) return;
    const message = /[가-힣]/u.test(String(error?.message || ""))
      ? error.message
      : "회사 추천을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    finishProcessStatus(els.discoveryStatus, progressToken, message, "error");
  } finally {
    if (requestId === discoveryRequestId) setDiscoveryPending(false);
  }
}

function resetAgenticDiscovery() {
  discoveryRequestId += 1;
  setDiscoveryPending(false);
  setProcessStatus(els.discoveryStatus);
  if (els.discoveryQuery) {
    els.discoveryQuery.value = "";
    delete els.discoveryQuery.dataset.profileSeeded;
  }
  if (els.discoveryResults) {
    els.discoveryResults.hidden = true;
    els.discoveryResults.replaceChildren();
  }
}

function renderAgenticResults(matches, source) {
  const uniqueMatches = [];
  const seen = new Set();
  for (const match of matches) {
    if (seen.has(match.productId)) continue;
    seen.add(match.productId);
    uniqueMatches.push(match);
    if (uniqueMatches.length === 6) break;
  }
  els.discoveryResults.hidden = false;
  els.discoveryResults.innerHTML = uniqueMatches.length
    ? `<div class="agentic-results-head">
         <div><strong>추천 기업</strong><span>${escapeHtml(source === "anthropic" ? "Spark AI가 기업별 차별 근거를 정리했습니다." : "기업별 공개 프로필 차이를 기준으로 정리했습니다.")}</span></div>
         <p class="agentic-results-policy">대상 스타트업이 My Log에서 요청을 승인한 뒤 SparkLabs가 소개를 진행합니다.</p>
       </div>
       <div class="agentic-result-grid">${uniqueMatches.map((match, index) => agenticResultMarkup(match, index)).join("")}</div>`
    : `<div class="agentic-empty"><strong>아직 추천 가능한 공개 프로필이 없습니다.</strong><span>운영진이 선별 회사 프로필을 준비하고 있습니다.</span></div>`;
}

function discoveryErrorMessage(status) {
  if (status === 401) return "기업 추천을 이용하려면 로그인이 필요합니다.";
  if (status === 403) return "현재 계정으로는 기업 추천을 이용할 수 없습니다.";
  if (status === 429) return "기업 추천 요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  return "회사 추천을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function agenticResultMarkup(match, index = 0) {
  const missing = Array.isArray(match.missingInfo) ? match.missingInfo.filter(Boolean).slice(0, 3) : [];
  const evidence = recommendationEvidence(match);
  const verification = match.verificationFocus || (missing.length
    ? missing.join(" · ")
    : "대표 적용 사례, 현재 제공 가능한 데모 범위와 고객 환경에서의 검증 수준");
  const companyName = match.productName || "AI 기업";
  const recommendationLabel = match.recommendationLens || "추천 포인트";
  return `<button class="agentic-result-card" data-recommended-product-id="${escapeHtml(match.productId || "")}" type="button" aria-label="${escapeHtml(companyName)} 기업 프로필 보기">
    <div>
      <div class="agentic-result-card-head">
        <span class="market-category">${escapeHtml(evidenceLabel(match.priority))}</span>
        <span class="agentic-evidence-count">공개 근거 ${evidence.length || 1}개</span>
      </div>
      <h3>${escapeHtml(companyName)}</h3>
      <p class="agentic-grounded-summary"><strong>${escapeHtml(recommendationLabel)}</strong><span>${escapeHtml(detailedRecommendationReason(match, evidence, index))}</span></p>
      ${recommendationEvidenceMarkup(evidence)}
      <div class="agentic-verification-note"><strong>확인 질문</strong><span>${escapeHtml(verification)}</span></div>
      <div class="agentic-next-step"><strong>첫 검토</strong><span>${escapeHtml(match.recommendedApproach || match.nextStep || "프로필에서 실제 적용 범위와 도입 조건을 확인해 보세요.")}</span></div>
    </div>
    <span class="agentic-result-card-cta">기업 프로필 보기 <span aria-hidden="true">→</span></span>
  </button>`;
}

function recommendationEvidence(match = {}) {
  const labelByField = new Map([
    ["service_focus", "서비스 초점"],
    ["capabilities", "핵심 역량"],
    ["query_terms", "요청어 일치"],
    ["category", "산업·업무 영역"],
    ["stage", "기업 단계"],
    ["region", "활동 지역"],
    ["traction", "실적 신호"]
  ]);
  const evidence = Array.isArray(match.evidence) ? match.evidence : [];
  const normalized = evidence.map((item) => ({
    field: String(item?.field || "").trim(),
    label: labelByField.get(String(item?.field || "").trim()) || String(item?.label || "프로필 근거").trim(),
    value: String(item?.value || "").trim()
  })).filter((item) => item.value);
  if (normalized.length) return normalized.slice(0, 4);
  return (Array.isArray(match.matchReasons) ? match.matchReasons : [])
    .map((item) => {
      const text = String(item || "").trim();
      const separator = text.indexOf(":");
      return separator > 0
        ? { field: "profile", label: text.slice(0, separator).trim(), value: text.slice(separator + 1).trim() }
        : { field: "profile", label: "프로필 근거", value: text };
    })
    .filter((item) => item.value)
    .slice(0, 4);
}

function recommendationEvidenceMarkup(evidence = []) {
  if (!evidence.length) return `<div class="agentic-evidence-list"><div><span>공개 프로필</span><strong>상세 근거를 기업 프로필에서 확인해 주세요.</strong></div></div>`;
  return `<div class="agentic-evidence-list" aria-label="추천 상세 근거">
    ${evidence.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join("")}
  </div>`;
}

function detailedRecommendationReason(match = {}, evidence = [], index = 0) {
  const focus = match.profileFocus || evidence.find((item) => item.field === "service_focus")?.value;
  const capability = evidence.find((item) => item.field === "capabilities")?.value;
  const queryTerms = evidence.find((item) => item.field === "query_terms")?.value;
  const category = evidence.find((item) => item.field === "category")?.value;
  const anchor = focus || capability || queryTerms || category;
  if (anchor) {
    const variants = [
      `‘${anchor}’에 초점이 있어, 요청 중 ${capability || queryTerms || "핵심 업무"}를 실제 서비스로 연결할 가능성을 먼저 볼 수 있습니다.`,
      `${category || "해당 업무 영역"}에서 ‘${anchor}’를 제공한다는 점이 다른 후보와 구분되는 공개 근거입니다.`,
      `요청어와 겹치는 ${queryTerms || capability || "역량"}보다 더 구체적인 차별점은 ‘${anchor}’라는 적용 장면입니다.`,
      `이 후보는 범용 역량 자체보다 ‘${anchor}’를 어느 업무 흐름에 적용하는지가 명확한 편입니다.`,
      `공개 프로필에서 확인되는 ‘${anchor}’가 이번 탐색의 실무 적용 가능성을 판단할 출발점입니다.`,
      `같은 기술군 가운데 ‘${anchor}’를 전면에 둔 기업이라 별도의 검증 후보로 분리했습니다.`
    ];
    return variants[index % variants.length];
  }
  return match.reason || "입력한 요청과 연결되는 공개 프로필 근거를 확인할 수 있는 후보입니다.";
}

async function loadForum(force = false) {
  if (forumLoaded && !force) return;
  renderCommunityLive({ loading: true });
  const progressToken = startProcessStatus(els.threadStatus, COMMUNITY_PROGRESS_STEPS, {
    announcement: "Community의 최신 대화를 불러오고 있습니다."
  });
  try {
    const response = await fetch("/api/forum", { headers: { Accept: "application/json", ...authHeaders() } });
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(payload?.error || "커뮤니티를 불러오지 못했습니다.");
    forum = payload;
    forumLoaded = true;
    forumViewerKey = viewerKey(forum.viewer);
    publishCommunityActivity();
    populateThreadCategories();
    renderCategories();
    renderThreads();
    syncAnnouncementsFromForum();
    renderCommunityLive();
    scheduleCommunityLiveRefresh();
    if (pendingHistoryThreadId) {
      const threadId = pendingHistoryThreadId;
      pendingHistoryThreadId = "";
      openThreadDialog(threadId, { recordHistory: false });
    }
    if (els.threadDialog?.open && selectedThreadId) renderThreadDialog();
    finishProcessStatus(els.threadStatus, progressToken);
  } catch (error) {
    renderCommunityLive({ error: true });
    renderEmptyThreads("커뮤니티 대화를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    finishProcessStatus(els.threadStatus, progressToken, error.message || "커뮤니티를 불러오지 못했습니다.", "error");
  }
}

function resetForumForViewerChange() {
  closeThreadDialog({ historyMode: "none" });
  forum = { categories: [], threads: [], comments: [] };
  forumLoaded = false;
  forumViewerKey = "";
  selectedCategory = "";
  selectedThreadId = "";
  selectedParentCommentId = "";
  pendingHistoryThreadId = "";
  arenaAnnouncementRequestId += 1;
  arenaAnnouncements = [];
  resetThreadComposer();
  resetMemberPerkRequest();
  publishCommunityActivity();
  if (els.categories) els.categories.innerHTML = "";
  if (els.threadList) els.threadList.innerHTML = "";
  clearInterval(communityLiveTimer);
  communityLiveTimer = null;
  renderCommunityLive({ loading: true });
}

function publishCommunityActivity() {
  const activity = forumLoaded
    ? { ...(forum.personalActivity || {}), loaded: true }
    : { loaded: false, summary: { posts: 0, comments: 0, commentsReceived: 0, likesReceived: 0 }, posts: [], comments: [], reactions: [], recent: [] };
  window.__sparkArenaCommunityActivity = activity;
  window.dispatchEvent(new CustomEvent("spark-arena:community-activity", { detail: activity }));
}

function resetMemberPerkRequest() {
  els.memberPerkRequestForm?.reset();
  setStatus(els.memberPerkRequestStatus);
}

function renderCommunityLive(options = {}) {
  if (!els.liveCard || !els.liveTitle || !els.liveMeta) return;
  if (options.loading) {
    els.liveCard.className = "community-live-card is-loading";
    els.liveTitle.textContent = "최신 대화를 불러오는 중입니다";
    els.liveMeta.textContent = "창업팀·기업 파트너·SparkLabs의 활동을 확인하고 있습니다.";
    return;
  }
  if (options.error) {
    els.liveCard.className = "community-live-card is-paused";
    els.liveTitle.textContent = "Community 연결을 다시 확인하고 있습니다";
    els.liveMeta.textContent = "피드는 잠시 후 자동으로 다시 불러올 수 있습니다.";
    return;
  }
  const copy = communityLiveCopy(forum);
  els.liveCard.className = `community-live-card is-${copy.state}`;
  els.liveTitle.textContent = copy.title;
  els.liveMeta.textContent = copy.meta;
}

function scheduleCommunityLiveRefresh() {
  clearInterval(communityLiveTimer);
  communityLiveTimer = window.setInterval(() => renderCommunityLive(), 60_000);
}

function viewerKey(viewer = {}) {
  return `${viewer?.id || viewer?.email || "anonymous"}|${viewer?.role || "public"}`;
}

function populateThreadCategories() {
  if (!els.threadCategory) return;
  const founderOrder = new Map(["ask", "show", "connect", "outcome"].map((slug, index) => [slug, index]));
  const allowed = (forum.categories || [])
    .filter((category) => category.slug !== "staff" && category.canPost !== false)
    .sort((left, right) => {
      const leftOrder = founderOrder.has(left.slug) ? founderOrder.get(left.slug) : 100 + Number(left.sortOrder || 0);
      const rightOrder = founderOrder.has(right.slug) ? founderOrder.get(right.slug) : 100 + Number(right.sortOrder || 0);
      return leftOrder - rightOrder;
    });
  const previous = els.threadCategory.value;
  els.threadCategory.innerHTML = allowed
    .map((category) => `<option value="${escapeHtml(category.slug)}">${escapeHtml(category.label || category.name || category.slug)}</option>`)
    .join("");
  if (allowed.some((category) => category.slug === previous)) els.threadCategory.value = previous;
  populateThreadVisibilities();
}

function populateThreadVisibilities() {
  if (!els.threadVisibility) return;
  const role = forum.viewer?.role || "public";
  const options = audienceScopeOptionsForRole(role);
  const previous = els.threadVisibility.value;
  els.threadVisibility.innerHTML = options
    .map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`)
    .join("");
  els.threadVisibility.value = options.some((option) => option.value === previous) ? previous : "public";
}

function renderCategories() {
  if (!els.categories) return;
  const categories = forum.categories || [];
  els.categories.innerHTML = `<button class="${selectedCategory ? "" : "is-active"}" data-community-category="" type="button"><span>전체 대화</span><strong>${formatNumber((forum.threads || []).length)}</strong></button>${categories
    .filter((category) => category.slug !== "staff")
    .map((category) => `<button class="${selectedCategory === category.slug ? "is-active" : ""}" data-community-category="${escapeHtml(category.slug)}" type="button"><span>${escapeHtml(category.label || category.name || category.slug)}</span><strong>${formatNumber(category.threadCount || 0)}</strong></button>`)
    .join("")}`;
}

function renderThreads() {
  renderCommunityLive();
  if (!els.threadList) return;
  const categoryNames = new Map((forum.categories || []).map((category) => [category.slug, category.label || category.name]));
  const threads = sortThreads((forum.threads || []).filter((thread) => !selectedCategory || thread.categorySlug === selectedCategory));
  if (!threads.length) {
    renderEmptyThreads();
    return;
  }
  els.threadList.innerHTML = threads.map((thread) => threadMarkup(thread, categoryNames.get(thread.categorySlug))).join("");
}

function renderEmptyThreads(message = "") {
  if (!els.threadList) return;
  const partnerCopy = forum.viewer?.role === "b2b_partner"
    ? "Private 대화는 표시되지 않습니다. 산업 파트너에게 공개된 Public 대화만 확인할 수 있습니다."
    : "첫 실제 Ask, Ship, Connect 또는 Outcome을 남겨주세요. Arena는 AI가 만든 예시 글로 피드를 채우지 않습니다.";
  const paragraphs = String(message || partnerCopy)
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [];
  els.threadList.innerHTML = `
    <div class="agentic-empty community-feed-empty">
      <strong>아직 표시할 실제 대화가 없습니다.</strong>
      <div>${paragraphs.map((sentence) => `<p>${escapeHtml(sentence)}</p>`).join("")}</div>
    </div>
  `;
}

function threadMarkup(thread, categoryName) {
  const type = postTypeForThread(thread);
  const response = responseStatusForThread(thread);
  const visibilityBadge = threadVisibilityBadge(thread.visibility);
  const introPolicy = type.key === "connect"
    ? `<div class="thread-footer"><span>소개 절차: SparkLabs 검토 → 양측 개별 동의 → 연락처 공유</span></div>`
    : "";
  return `<article class="community-thread-card ${thread.staffPick ? "is-featured" : ""} ${thread.official && thread.categorySlug === "announcements" ? "is-official-notice" : ""}">
    <button class="thread-vote" data-community-vote="${escapeHtml(thread.id)}" type="button" aria-label="도움돼요" title="도움돼요"><span>↑</span><strong>${formatNumber(thread.score || thread.upvoteCount || 0)}</strong></button>
    <div class="community-thread-main">
      <div class="thread-meta"><span>${escapeHtml(type.label || categoryName || "Community")}</span>${visibilityBadge}${thread.official && thread.categorySlug === "announcements" ? "<b>OFFICIAL NOTICE</b>" : thread.staffPick ? "<b>SPARKLABS PICK</b>" : ""}<time>${escapeHtml(relativeDate(thread.lastActivityAt || thread.createdAt))}</time></div>
      <h3><button class="thread-title-button" data-community-open-thread="${escapeHtml(thread.id)}" type="button">${escapeHtml(thread.title)}</button></h3>
      <p>${escapeHtml(summary(thread.bodyMarkdown || thread.body || "", 240))}</p>
      ${introPolicy}
      <div class="thread-footer"><span>${escapeHtml(thread.authorDisplayName || thread.authorName || thread.authorRoleLabel || "Arena member")}</span><span>댓글 ${formatNumber(thread.commentCount || 0)}개</span><span>${escapeHtml(response.label)} · ${escapeHtml(response.detail)}</span></div>
      <button class="thread-open-button" data-community-open-thread="${escapeHtml(thread.id)}" type="button">${thread.commentCount ? `댓글 ${formatNumber(thread.commentCount)}개 보기` : "대화 열고 첫 댓글 남기기"}<span aria-hidden="true">→</span></button>
    </div>
  </article>`;
}

function threadVisibilityBadge(visibility, localized = false) {
  if (["public", "members_only", "partners_only"].includes(visibility)) {
    return `<b>${escapeHtml(audienceScopeLabel(visibility, { localized }))}</b>`;
  }
  if (visibility === "staff_only") return `<b>${localized ? "운영진 전용" : "STAFF ONLY"}</b>`;
  return `<b>${escapeHtml(audienceScopeLabel("public", { localized }))}</b>`;
}

function openThreadDialog(threadId, { recordHistory = true } = {}) {
  const thread = (forum.threads || []).find((item) => item.id === threadId);
  if (!thread || !els.threadDialog) return;
  selectedThreadId = thread.id;
  clearCommentReply();
  renderThreadDialog();
  if (!els.threadDialog.open) els.threadDialog.showModal();
  if (recordHistory) {
    window.dispatchEvent(new CustomEvent("spark-arena:history-overlay-opened", {
      detail: { type: "community-thread", id: String(thread.id) }
    }));
  }
}

function closeThreadDialog(options = {}) {
  const historyMode = options?.historyMode || "back";
  if (!els.threadDialog?.open) return;
  if (historyMode === "back") {
    const shouldClose = window.dispatchEvent(new CustomEvent("spark-arena:history-overlay-close-request", {
      detail: { type: "community-thread", id: String(selectedThreadId || "") },
      cancelable: true
    }));
    if (!shouldClose) return;
  }
  els.threadDialog.close();
}

function resetThreadDialogState() {
  selectedThreadId = "";
  clearCommentReply();
  els.commentForm?.reset();
  if (els.commentStatus) {
    els.commentStatus.hidden = true;
    els.commentStatus.textContent = "";
    els.commentStatus.className = "form-status";
  }
}

function renderThreadDialog() {
  const thread = (forum.threads || []).find((item) => item.id === selectedThreadId);
  if (!thread) {
    closeThreadDialog();
    return;
  }

  const type = postTypeForThread(thread);
  const response = responseStatusForThread(thread);
  const visibilityBadge = threadVisibilityBadge(thread.visibility, true);
  const comments = commentsForThread(thread.id);
  const access = commentAccessForThread(thread);

  if (els.threadDetail) {
    els.threadDetail.innerHTML = `<div class="thread-meta"><span>${escapeHtml(type.label || thread.categoryLabel || "커뮤니티")}</span>${visibilityBadge}${thread.official && thread.categorySlug === "announcements" ? "<b>OFFICIAL NOTICE</b>" : thread.staffPick ? "<b>SPARKLABS PICK</b>" : ""}<time>${escapeHtml(relativeDate(thread.lastActivityAt || thread.createdAt))}</time></div>
      <h2 id="communityThreadDialogTitle">${escapeHtml(thread.title)}</h2>
      <p class="community-thread-body">${escapeHtml(thread.bodyMarkdown || thread.body || "")}</p>
      <div class="community-thread-detail-footer"><span>${escapeHtml(thread.authorDisplayName || "Arena 회원")}</span><span>댓글 ${formatNumber(comments.length)}개</span><span>${escapeHtml(response.detail)}</span>${thread.locked ? "<span>댓글 작성 종료</span>" : ""}</div>`;
  }

  if (els.commentCount) els.commentCount.textContent = formatNumber(comments.length);
  if (els.commentList) {
    els.commentList.innerHTML = comments.length
      ? commentTreeMarkup(comments, access.allowed)
      : '<li class="community-comment-empty">아직 댓글이 없습니다. 첫 번째 답변을 남겨주세요.</li>';
  }

  if (els.commentForm) {
    els.commentForm.hidden = !access.allowed;
    const threadField = els.commentForm.elements.namedItem("threadId");
    if (threadField) threadField.value = thread.id;
  }
  if (els.commentUnavailable) {
    els.commentUnavailable.hidden = access.allowed;
    els.commentUnavailable.textContent = access.reason;
  }
  if (!access.allowed) clearCommentReply();
}

function commentsForThread(threadId) {
  return (forum.comments || [])
    .filter((comment) => comment.threadId === threadId)
    .sort((left, right) => Date.parse(left.createdAt || 0) - Date.parse(right.createdAt || 0));
}

function commentTreeMarkup(comments, canReply) {
  const ids = new Set(comments.map((comment) => comment.id));
  const children = new Map();
  for (const comment of comments) {
    const parentId = comment.parentCommentId && ids.has(comment.parentCommentId) ? comment.parentCommentId : "root";
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(comment);
  }
  const renderBranch = (parentId, level = 0) => (children.get(parentId) || []).map((comment) => {
    const depth = Math.min(5, Math.max(level, Number(comment.depth || 0)));
    const deleted = comment.status === "deleted";
    const nested = renderBranch(comment.id, depth + 1);
    return `<li class="community-comment-item" data-comment-id="${escapeHtml(comment.id)}" data-depth="${depth}" style="--comment-depth:${depth}" tabindex="-1">
      <article class="community-comment-card">
        <div class="community-comment-meta"><strong>${escapeHtml(deleted ? "삭제된 댓글" : comment.authorDisplayName || "Arena 회원")}</strong><time>${escapeHtml(relativeDate(comment.createdAt))}</time>${depth ? `<span>답글 ${depth}단계</span>` : ""}</div>
        <p class="community-comment-body">${escapeHtml(deleted ? "삭제된 댓글입니다." : comment.bodyMarkdown || "")}</p>
        ${canReply && !deleted && depth < 5 ? `<button class="community-comment-reply" data-community-reply="${escapeHtml(comment.id)}" type="button">답글 달기</button>` : ""}
      </article>
      ${nested ? `<ol class="community-comment-children">${nested}</ol>` : ""}
    </li>`;
  }).join("");
  return renderBranch("root");
}

function commentAccessForThread(thread) {
  const role = forum.viewer?.role || "public";
  const isStaff = role === "sparklabs" || role === "admin";
  if (thread.locked && !isStaff) return { allowed: false, reason: "댓글 작성이 종료된 대화입니다." };
  if (isStaff || role === "member" || role === "human_validator") return { allowed: true, reason: "" };
  if (role === "b2b_partner") {
    if (["public", "partners_only"].includes(thread.visibility)) return { allowed: true, reason: "" };
    return { allowed: false, reason: "기업 파트너는 공개·파트너 대화에서만 댓글을 작성할 수 있습니다." };
  }
  return { allowed: false, reason: "승인된 Arena 회원으로 로그인해야 댓글을 작성할 수 있습니다." };
}

function selectCommentReply(commentId) {
  const comment = commentsForThread(selectedThreadId).find((item) => item.id === commentId);
  if (!comment || comment.status === "deleted") return;
  selectedParentCommentId = comment.id;
  const field = els.commentForm?.elements.namedItem("parentCommentId");
  if (field) field.value = comment.id;
  if (els.replyLabel) els.replyLabel.textContent = `“${comment.authorDisplayName || "Arena 회원"}”님에게 답글 작성 중`;
  if (els.replyContext) els.replyContext.hidden = false;
  els.commentBody?.focus();
}

function clearCommentReply() {
  selectedParentCommentId = "";
  const field = els.commentForm?.elements.namedItem("parentCommentId");
  if (field) field.value = "";
  if (els.replyContext) els.replyContext.hidden = true;
  if (els.replyLabel) els.replyLabel.textContent = "";
}

async function createComment(event) {
  event.preventDefault();
  if (!selectedThreadId || !els.commentForm) return;
  const formData = new FormData(els.commentForm);
  const payload = {
    threadId: selectedThreadId,
    parentCommentId: selectedParentCommentId || null,
    bodyMarkdown: String(formData.get("bodyMarkdown") || "").trim()
  };
  if (!payload.bodyMarkdown) {
    setStatus(els.commentStatus, "댓글 내용을 입력해 주세요.", "error");
    els.commentBody?.focus();
    return;
  }

  setFormPending(els.commentForm, true);
  const progressToken = startProcessStatus(
    els.commentStatus,
    ["댓글 내용과 작성 권한을 확인하고 있습니다.", "Founder Commons에 안전하게 등록하고 있습니다.", "최신 대화에 댓글을 반영하고 있습니다."],
    { announcement: "댓글을 등록하고 있습니다." }
  );
  try {
    const response = await fetch("/api/forum", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action: "createForumComment", payload })
    });
    const result = await safeJson(response);
    if (!response.ok) throw new Error(commentErrorMessage(response.status, result?.error));
    forum = result.snapshot;
    forumLoaded = true;
    const createdCommentId = result.event?.comment?.id || "";
    els.commentForm.reset();
    clearCommentReply();
    renderCategories();
    renderThreads();
    renderThreadDialog();
    finishProcessStatus(els.commentStatus, progressToken, "댓글을 등록했습니다.", "success");
    if (createdCommentId) {
      requestAnimationFrame(() => els.commentList?.querySelector(`[data-comment-id="${CSS.escape(createdCommentId)}"]`)?.focus());
    }
  } catch (error) {
    finishProcessStatus(els.commentStatus, progressToken, error.message || "댓글을 등록하지 못했습니다.", "error");
  } finally {
    setFormPending(els.commentForm, false);
  }
}

function commentErrorMessage(status, serverMessage = "") {
  if (status === 401) return "댓글을 작성하려면 로그인해 주세요.";
  if (status === 403 && /locked/i.test(serverMessage)) return "댓글 작성이 종료된 대화입니다.";
  if (status === 403) return "현재 계정은 이 대화에 댓글을 작성할 수 없습니다.";
  if (status === 404 && /parent/i.test(serverMessage)) return "답글을 달 댓글이 삭제되었거나 존재하지 않습니다. 대화를 새로고침해 주세요.";
  if (status === 404) return "대화를 찾을 수 없습니다. 목록을 새로고침해 주세요.";
  if (status === 429) return "댓글 등록 요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  if (status === 503) return "댓글 저장소에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
  return "댓글을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

async function analyzeThreadDraft() {
  if (!els.threadForm || threadDraftAnalysisPending) return;
  const bodyMarkdown = String(els.threadBody?.value || "").trim();
  if (bodyMarkdown.length < 20) {
    setStatus(els.threadStatus, "분석할 내용을 20자 이상 작성해 주세요.", "error");
    els.threadBody?.focus();
    return;
  }

  invalidateThreadAnalysis({ preserveStatus: true });
  setThreadAnalysisPending(true);
  const progressToken = startProcessStatus(els.threadStatus, COMMUNITY_DRAFT_PROGRESS_STEPS, {
    announcement: "Spark AI가 게시글 내용을 분석하고 있습니다.",
    interval: 1500
  });
  try {
    const response = await fetch("/api/forum-draft-analysis", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ bodyMarkdown })
    });
    const result = await safeJson(response);
    if (!response.ok) throw new Error(draftAnalysisErrorMessage(response.status, result?.error));
    const analysis = result?.analysis || {};
    const suggestedCategory = announcementDraftMode ? "announcements" : analysis.categorySlug;
    const suggestedVisibility = announcementDraftMode ? "public" : analysis.visibility;
    const categoryAvailable = Array.from(els.threadCategory?.options || []).some((option) => option.value === suggestedCategory);
    const visibilityAvailable = Array.from(els.threadVisibility?.options || []).some((option) => option.value === suggestedVisibility);
    if (!analysis.title || !categoryAvailable || !visibilityAvailable) throw new Error("AI가 유효한 게시 설정을 만들지 못했습니다. 다시 분석해 주세요.");

    els.threadTitle.value = analysis.title;
    els.threadCategory.value = suggestedCategory;
    els.threadVisibility.value = suggestedVisibility;
    lastAnalyzedBody = bodyMarkdown;
    if (els.threadReason) {
      els.threadReason.textContent = brandSafeDisplayText([analysis.reason, analysis.warning].filter(Boolean).join(" "));
    }
    if (els.threadMetadata) els.threadMetadata.hidden = false;
    finishProcessStatus(
      els.threadStatus,
      progressToken,
      analysis.source === "spark_ai"
        ? "Spark AI가 제목·채널·공개 범위를 제안했습니다. 확인하거나 수정한 뒤 게시해 주세요."
        : "내용 기반 게시 설정을 제안했습니다. 확인하거나 수정한 뒤 게시해 주세요.",
      "success"
    );
    requestAnimationFrame(() => els.threadTitle?.focus());
  } catch (error) {
    invalidateThreadAnalysis({ preserveStatus: true });
    finishProcessStatus(els.threadStatus, progressToken, error.message || "게시 설정을 분석하지 못했습니다.", "error");
  } finally {
    setThreadAnalysisPending(false);
  }
}

async function createThread(event) {
  event.preventDefault();
  if (!els.threadForm) return;
  const bodyMarkdown = String(els.threadBody?.value || "").trim();
  if (!lastAnalyzedBody || bodyMarkdown !== lastAnalyzedBody) {
    setStatus(els.threadStatus, "먼저 본문을 Spark AI로 분석해 제목·채널·공개 범위를 만들어 주세요.", "error");
    els.threadAnalyze?.focus();
    return;
  }
  const payload = Object.fromEntries(new FormData(els.threadForm).entries());
  const type = postTypeForCategory(payload.categorySlug);
  if (type) payload.threadType = type.key;
  const isAnnouncement = payload.categorySlug === "announcements";
  if (isAnnouncement) {
    payload.threadType = "announcement";
    payload.linkedLabel = "arena_announcement";
    payload.pinned = true;
    payload.staffPick = true;
    payload.official = true;
  }
  if (!payload.title || !payload.categorySlug || !payload.visibility) {
    setStatus(els.threadStatus, "제안된 제목·채널·공개 범위를 확인해 주세요.", "error");
    return;
  }
  setFormPending(els.threadForm, true);
  const progressToken = startProcessStatus(
    els.threadStatus,
    ["제목·채널·공개 범위를 최종 확인하고 있습니다.", "Community에 내용을 안전하게 등록하고 있습니다.", "최신 피드에 반영하고 있습니다."],
    { announcement: "대화를 등록하고 있습니다." }
  );
  try {
    const response = await fetch("/api/forum", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action: "createForumThread", payload })
    });
    const result = await safeJson(response);
    if (!response.ok) throw new Error(result?.error || "대화를 등록하지 못했습니다.");
    forum = result.snapshot;
    forumLoaded = true;
    resetThreadComposer();
    populateThreadCategories();
    renderCategories();
    renderThreads();
    syncAnnouncementsFromForum();
    finishProcessStatus(
      els.threadStatus,
      progressToken,
      isAnnouncement
        ? "AI Arena 공지를 게시했습니다. Community 상단과 Discover의 Arena 소식에 함께 반영했습니다."
        : type?.key === "outcome"
        ? "Outcome을 기록했습니다. 이 경험은 다음 팀의 실행에 도움이 됩니다."
        : type?.key === "connect"
          ? "Connect 요청을 등록했습니다. SparkLabs 검토 후 양측이 각각 동의해야 연락처가 공유됩니다."
          : "Arena에 대화를 등록했습니다. Ask·Ship은 24시간 내 유용한 첫 응답을 목표로 운영합니다.",
      "success"
    );
  } catch (error) {
    finishProcessStatus(els.threadStatus, progressToken, error.message || "대화를 등록하지 못했습니다.", "error");
  } finally {
    setFormPending(els.threadForm, false);
    updateThreadSubmitState();
  }
}

async function voteThread(threadId) {
  if (!threadId) return;
  const progressToken = startProcessStatus(
    els.threadStatus,
    ["공감 요청을 확인하고 있습니다.", "중복 여부를 검증하고 최신 점수에 반영하고 있습니다."],
    { announcement: "공감을 기록하고 있습니다." }
  );
  try {
    const response = await fetch("/api/forum", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action: "voteForumThread", payload: { threadId } })
    });
    const result = await safeJson(response);
    if (!response.ok) throw new Error(result?.error || "공감을 기록하지 못했습니다.");
    forum = result.snapshot;
    renderCategories();
    renderThreads();
    finishProcessStatus(els.threadStatus, progressToken);
  } catch (error) {
    finishProcessStatus(els.threadStatus, progressToken, error.message || "공감을 기록하지 못했습니다.", "error");
  }
}

function renderConversationPrompts() {
  const profile = communityPromptProfile(context);
  activeCommunityPrompts = personalizedCommunityPrompts(context);
  const organizationName = communityPromptOrganizationName();
  const preOtGuided = activeCommunityPrompts.some((prompt) => prompt.origin?.includes("PRE-OT"));
  const railCopy = communityPromptRailCopy(profile.kind);
  if (els.promptKicker) els.promptKicker.textContent = railCopy.kicker;
  if (els.promptTitle) els.promptTitle.textContent = railCopy.title;
  if (els.promptContext) {
    els.promptContext.textContent = profile.kind === "partner"
      ? `${organizationName} 파트너 프로필 맞춤 · 협업 수요와 제공 가치를 구체화하도록 구성한 작성 가이드입니다. 아직 게시된 글이 아닙니다.`
      : profile.kind === "staff"
        ? `${organizationName} 운영 계정 맞춤 · 회원 간 수요와 연결 신호를 확인하기 위한 작성 가이드입니다. 아직 게시된 글이 아닙니다.`
        : preOtGuided
          ? `${organizationName} 프로필 맞춤 · 프리 OT에서 확인한 공통 수요를 운영진 질문으로 정리했습니다. 아직 게시된 글이 아닙니다.`
          : `${organizationName} 프로필 맞춤 작성 가이드입니다. 아직 게시된 글이 아닙니다.`;
  }
  if (!els.promptList) return;
  els.promptList.innerHTML = activeCommunityPrompts.map((prompt) => `
    <button type="button" data-community-prompt="${escapeHtml(prompt.id)}" aria-label="${escapeHtml(prompt.label)} 작성 가이드 열기">
      <small>${escapeHtml(prompt.origin || "운영진 작성 가이드")}</small>
      <strong>${escapeHtml(prompt.label)}</strong>
      <span>${escapeHtml(prompt.hint)}</span>
      <i aria-hidden="true">→</i>
    </button>
  `).join("");
}

function communityPromptRailCopy(kind) {
  if (kind === "partner") {
    return { kicker: "PARTNER CONVERSATION STARTERS", title: "협업 수요를 구체화할 질문" };
  }
  if (kind === "staff") {
    return { kicker: "COMMUNITY OPERATIONS", title: "운영진이 대화를 여는 질문" };
  }
  return { kicker: "PRE-OT NETWORKING NEEDS", title: "먼저 꺼내볼 운영 질문" };
}

function communityPromptOrganizationName() {
  return String(
    context?.hub?.partnerProfile?.organizationName
      || context?.hub?.viewerTeam?.companyName
      || context?.hub?.viewerTeam?.name
      || context?.hub?.viewer?.organization
      || context?.viewer?.organization
      || (context?.hub?.viewer?.canScore ? "SparkLabs" : "로그인한 회사")
  ).trim();
}

function hydrateConversationPrompt(promptId) {
  if (!els.threadBody) return;
  const prompt = activeCommunityPrompts.find((item) => item.id === promptId);
  if (!prompt) return;
  if (els.threadLinkedLabel) els.threadLinkedLabel.value = "";
  els.threadBody.value = prompt.template.trim();
  invalidateThreadAnalysis();
  if (els.promptGuide && els.promptGuideTitle && els.promptGuideCopy) {
    els.promptGuide.hidden = false;
    els.promptGuideTitle.textContent = `${communityPromptOrganizationName()} 맞춤 작성 가이드`;
    els.promptGuideCopy.textContent = prompt.guide;
  }
  if (promptGuideTimer) window.clearTimeout(promptGuideTimer);
  els.composer?.classList.add("is-prompt-guided");
  promptGuideTimer = window.setTimeout(() => els.composer?.classList.remove("is-prompt-guided"), 1600);
  els.composer?.scrollIntoView({ behavior: "smooth", block: "start" });
  els.threadBody.focus();
  const firstBlank = els.threadBody.value.indexOf("\n\n");
  const caretPosition = firstBlank >= 0 ? firstBlank + 1 : els.threadBody.value.length;
  els.threadBody.setSelectionRange(caretPosition, caretPosition);
}

function invalidateThreadAnalysis({ preserveStatus = false } = {}) {
  lastAnalyzedBody = "";
  if (els.threadMetadata) els.threadMetadata.hidden = true;
  if (els.threadTitle) els.threadTitle.value = "";
  if (els.threadReason) els.threadReason.textContent = "";
  updateThreadSubmitState();
  if (!preserveStatus && els.threadStatus && !els.threadStatus.classList.contains("is-loading")) {
    setStatus(els.threadStatus, "내용을 작성한 뒤 Spark AI로 게시 설정을 만들어 주세요.");
  }
}

function resetThreadComposer() {
  els.threadForm?.reset();
  resetAnnouncementDraftMode();
  lastAnalyzedBody = "";
  if (els.promptGuide) els.promptGuide.hidden = true;
  if (els.threadMetadata) els.threadMetadata.hidden = true;
  if (els.threadReason) els.threadReason.textContent = "";
  updateThreadSubmitState();
}

function setThreadAnalysisPending(pending) {
  threadDraftAnalysisPending = pending;
  if (els.threadAnalyze) els.threadAnalyze.disabled = pending;
  if (els.threadBody) els.threadBody.readOnly = pending;
  els.threadForm?.classList.toggle("is-analyzing", pending);
  els.threadForm?.setAttribute("aria-busy", String(pending));
  updateThreadSubmitState();
}

function updateThreadSubmitState() {
  if (!els.threadSubmit) return;
  const currentBody = String(els.threadBody?.value || "").trim();
  els.threadSubmit.disabled = threadDraftAnalysisPending || !lastAnalyzedBody || currentBody !== lastAnalyzedBody;
}

function draftAnalysisErrorMessage(status, serverMessage = "") {
  if (status === 400 || status === 413) return serverMessage || "분석할 게시글 내용을 조금 더 구체적으로 작성해 주세요.";
  if (status === 401) return "게시글 AI 분석을 이용하려면 다시 로그인해 주세요.";
  if (status === 403) return "현재 계정은 게시글 AI 분석을 이용할 수 없습니다.";
  if (status === 429) return "게시글 분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  return "현재 게시 설정을 분석하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function postTypeForCategory(categorySlug) {
  const key = POST_TYPE_ALIASES[String(categorySlug || "").toLowerCase()];
  return key ? { key, ...FOUNDER_POST_TYPES[key] } : null;
}

function postTypeForThread(thread) {
  const key = POST_TYPE_ALIASES[String(thread?.threadType || "").toLowerCase()]
    || POST_TYPE_ALIASES[String(thread?.categorySlug || "").toLowerCase()];
  return key ? { key, ...FOUNDER_POST_TYPES[key] } : { key: "discussion", label: thread?.categoryLabel || "Discussion" };
}

function promptType(prompt) {
  const value = String(prompt || "");
  if (/출시|ship|만들|실험/i.test(value)) return { key: "ship", ...FOUNDER_POST_TYPES.ship };
  if (/소개|연결|찾습니다|구합니다/i.test(value)) return { key: "connect", ...FOUNDER_POST_TYPES.connect };
  if (/결과|해결|배웠|후속/i.test(value)) return { key: "outcome", ...FOUNDER_POST_TYPES.outcome };
  return { key: "ask", ...FOUNDER_POST_TYPES.ask };
}

function firstMissingStructuredField(type, value) {
  const body = String(value || "");
  for (let index = 0; index < type.fields.length; index += 1) {
    const optional = /\(선택\)/.test(type.fields[index]);
    const field = `${type.fields[index]}:`;
    const start = body.indexOf(field);
    if (start < 0) {
      if (optional) continue;
      return type.fields[index];
    }
    const nextStarts = type.fields
      .slice(index + 1)
      .map((nextField) => body.indexOf(`${nextField}:`, start + field.length))
      .filter((position) => position >= 0);
    const end = nextStarts.length ? Math.min(...nextStarts) : body.length;
    if (!body.slice(start + field.length, end).trim() && !optional) return type.fields[index];
  }
  return "";
}

function responseStatusForThread(thread) {
  if (thread.responseStatus === "outcome_recorded") return { label: "OUTCOME RECORDED", detail: "실행 결과 기록됨" };
  if (thread.responseStatus === "response_received") return { label: "RESPONSE RECEIVED", detail: "첫 응답 있음 · 유용성 확인 필요" };
  if (thread.responseStatus === "needs_attention") return { label: "HOST FOLLOW-UP", detail: "24시간 응답 목표 경과" };
  if (thread.responseStatus === "awaiting_response") return { label: "REPLY WITHIN 24H", detail: "유용한 첫 응답 대기" };
  return { label: "OPEN", detail: "열린 대화" };
}

function renderEditorial() {
  if (els.featuredNews) {
    const items = communityHighlightItems(context.hub || {});
    renderFeaturedNews(items);
    refineFeaturedNews(items);
  }
  if (els.partnerLogoRail) {
    els.partnerLogoRail.innerHTML = ["GitHub for Startups · verified ecosystem listing"]
      .map((name) => `<span>${escapeHtml(name)}</span>`)
      .join("");
  }
}

function renderFeaturedNews(items) {
  if (!els.featuredNews) return;
  const safeItems = communityHighlightsForViewer(items, context.viewer);
  const announcements = arenaAnnouncements.slice(0, 3).map((item) => `<article class="featured-news-announcement" data-announcement-thread-id="${escapeHtml(item.id)}" tabindex="0" role="button" aria-label="${escapeHtml(item.title)} 공지 열기"><span>NOTICE</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(summary(item.bodyMarkdown, 180))}</p><small>${escapeHtml(formatAnnouncementDate(item.updatedAt || item.createdAt))} · SparkLabs 운영진</small></div></article>`).join("");
  const highlights = safeItems.map((item) => `<article data-highlight-id="${escapeHtml(item.id)}"><span>${escapeHtml(item.tag)}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.copy)}</p></div></article>`).join("");
  els.featuredNews.innerHTML = announcements + highlights;
}

function configureAnnouncementComposer() {
  const allowed = isSparkLabsOperator();
  if (els.announcementTools) els.announcementTools.hidden = !allowed;
  if (!allowed && announcementDraftMode) resetAnnouncementDraftMode();
}

function isSparkLabsOperator() {
  const viewer = context?.hub?.viewer || context?.viewer || {};
  const role = String(viewer.role || "").toLowerCase();
  return Boolean(viewer.canScore || viewer.canAdmin || role === "sparklabs" || role === "admin");
}

function prepareArenaAnnouncement() {
  if (!isSparkLabsOperator() || !els.threadBody) return;
  announcementDraftMode = true;
  if (els.threadLinkedLabel) els.threadLinkedLabel.value = "arena_announcement";
  els.threadBody.value = [
    "공지 내용:",
    "",
    "적용 대상:",
    "",
    "적용 시점:",
    "",
    "필요한 조치:"
  ].join("\n");
  invalidateThreadAnalysis();
  if (els.promptGuide && els.promptGuideTitle && els.promptGuideCopy) {
    els.promptGuide.hidden = false;
    els.promptGuideTitle.textContent = "AI Arena 공식 공지 작성";
    els.promptGuideCopy.textContent = "사실과 적용 대상을 명확히 작성하세요. 분석 후 제목과 공개 범위를 확인하면 Community와 Arena 소식에 함께 게시됩니다.";
  }
  els.composer?.classList.add("is-announcement-mode");
  els.threadBody.placeholder = "AI Arena 회원에게 안내할 운영 변경, 새 기능, 모집 또는 중요 일정을 작성해 주세요.";
  els.composer?.scrollIntoView({ behavior: "smooth", block: "start" });
  els.threadBody.focus();
}

function resetAnnouncementDraftMode() {
  announcementDraftMode = false;
  els.composer?.classList.remove("is-announcement-mode");
  if (els.threadBody) els.threadBody.placeholder = "지금 나누고 싶은 문제, 직접 해본 것, 필요한 도움이나 공유할 경험을 자유롭게 적어주세요.";
}

async function loadArenaAnnouncements(force = false) {
  const session = readSession();
  if (!session?.access_token) {
    arenaAnnouncementRequestId += 1;
    arenaAnnouncements = [];
    renderFeaturedNews(communityHighlightItems(context.hub || {}));
    renderAnnouncementBoard();
    return;
  }
  const requestId = ++arenaAnnouncementRequestId;
  if (!force && arenaAnnouncements.length) {
    renderAnnouncementBoard();
    return;
  }
  try {
    const response = await fetch("/api/arena-announcements", { headers: { Accept: "application/json", ...authHeaders() } });
    const payload = await safeJson(response);
    if (!response.ok || requestId !== arenaAnnouncementRequestId) return;
    arenaAnnouncements = Array.isArray(payload.announcements) ? payload.announcements : [];
    renderFeaturedNews(communityHighlightItems(context.hub || {}));
    renderAnnouncementBoard();
  } catch {
    // The existing deterministic Arena updates remain visible if announcements cannot be loaded.
  }
}

function syncAnnouncementsFromForum() {
  const threads = Array.isArray(forum.threads) ? forum.threads : [];
  arenaAnnouncements = threads
    .filter((thread) => thread.categorySlug === "announcements" && thread.official)
    .sort((left, right) => Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0))
    .slice(0, 5);
  renderFeaturedNews(communityHighlightItems(context.hub || {}));
  renderAnnouncementBoard();
}

function renderAnnouncementBoard() {
  if (!els.announcementBoard || !els.announcementList) return;
  els.announcementBoard.hidden = !arenaAnnouncements.length;
  if (els.announcementCount) els.announcementCount.textContent = `${formatNumber(arenaAnnouncements.length)}건`;
  els.announcementList.innerHTML = arenaAnnouncements.map((item) => `<button type="button" data-announcement-thread-id="${escapeHtml(item.id)}"><span>OFFICIAL NOTICE</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(summary(item.bodyMarkdown, 220))}</p><small>${escapeHtml(formatAnnouncementDate(item.updatedAt || item.createdAt))} · SparkLabs 운영진</small></button>`).join("");
}

function handleAnnouncementOpen(event) {
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  const target = event.target.closest("[data-announcement-thread-id]");
  if (!target) return;
  if (event.type === "keydown") event.preventDefault();
  const threadId = target.dataset.announcementThreadId || "";
  document.querySelector('[data-go-page="community"]')?.click();
  selectedCategory = "announcements";
  if (forumLoaded) {
    renderCategories();
    renderThreads();
    openThreadDialog(threadId);
  } else {
    pendingHistoryThreadId = threadId;
    loadForum();
  }
}

function formatAnnouncementDate(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "최근 업데이트";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(new Date(timestamp));
}

async function refineFeaturedNews(items) {
  if (!context.hub || !readSession()?.access_token) return;
  const key = JSON.stringify(items);
  if (key === featuredHighlightKey) return;
  featuredHighlightKey = key;
  const requestId = ++featuredHighlightRequestId;
  try {
    const response = await fetch("/api/community-highlights", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ items })
    });
    const payload = await safeJson(response);
    if (!response.ok || requestId !== featuredHighlightRequestId) return;
    renderFeaturedNews(payload?.highlights?.items || items);
  } catch {
    // The deterministic copy is already rendered and remains the safe fallback.
  }
}

function sortThreads(items) {
  const copy = [...items];
  if (selectedSort === "new") return copy.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  if (selectedSort === "needs") {
    const priority = { needs_attention: 0, awaiting_response: 1, open_discussion: 2, response_received: 3, outcome_recorded: 4 };
    return copy.sort((a, b) => {
      const statusDifference = (priority[a.responseStatus] ?? 5) - (priority[b.responseStatus] ?? 5);
      if (statusDifference) return statusDifference;
      return Date.parse(a.responseDueAt || a.createdAt || 0) - Date.parse(b.responseDueAt || b.createdAt || 0);
    });
  }
  return copy.sort((a, b) => Number(b.hotScore || b.score || 0) - Number(a.hotScore || a.score || 0));
}

function authHeaders() {
  const session = readSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function setFormPending(form, pending) {
  form?.setAttribute("aria-busy", String(pending));
  form?.querySelectorAll("input, textarea, select, button").forEach((control) => {
    control.disabled = pending;
  });
}

function setDiscoveryPending(pending) {
  discoveryPending = pending;
  els.discoveryForm?.classList.toggle("is-searching", pending);
  els.discoveryForm?.setAttribute("aria-busy", String(pending));
  if (els.discoverySubmit) {
    els.discoverySubmit.classList.toggle("is-searching", pending);
    els.discoverySubmit.textContent = pending ? "찾는 중…" : els.discoverySubmit.dataset.idleLabel || "Spark AI에게 묻기 →";
  }
  setFormPending(els.discoveryForm, pending);
}

function setStatus(element, message, type = "") {
  setProcessStatus(element, message, type);
}

function evidenceLabel(priority) {
  if (priority === "high") return "근거 강함";
  if (priority === "medium") return "부분 근거";
  if (priority === "low") return "탐색 후보";
  return "추가 검증 필요";
}

function summary(value, max) {
  const text = String(value || "").replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function relativeDate(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "방금 전";
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  if (days < 35) return `${Math.floor(days / 7)}주 전`;
  return `${Math.floor(days / 30)}개월 전`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(Number(value || 0));
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
