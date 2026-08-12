import { summarizeBenefit } from "./benefit-copy.js";
import { isBenefitReadyForDisplay } from "./benefit-visibility.js";

const ITEM_ORDER = ["arena", "event", "perk", "bounty"];
const CLAW_MEMBER_HIDDEN_ITEMS = new Set(["event", "perk"]);

export function communityHighlightItems(hub = {}, now = new Date()) {
  const events = Array.isArray(hub?.events) ? hub.events : [];
  const benefits = Array.isArray(hub?.benefits) ? hub.benefits : [];
  const event = [...events]
    .filter((item) => isUpcomingEvent(item, now))
    .sort((left, right) => eventSortKey(left).localeCompare(eventSortKey(right), "ko"))[0];
  const benefit = benefits.find((item) => item?.isActive !== false && isBenefitReadyForDisplay(item));

  return normalizeCommunityHighlights([
    {
      id: "arena",
      tag: "ARENA",
      title: "AI Arena 커뮤니티 운영 중",
      copy: "선별된 AI 스타트업·창업팀·산업 파트너가 문제와 실행 경험을 연결합니다."
    },
    {
      id: "event",
      tag: "EVENT",
      title: event ? eventTitle(event) : "다가오는 Arena 일정",
      copy: event ? eventSummary(event) : "교육·코칭·기업 네트워킹 일정을 확인하고 필요한 연결을 준비하세요."
    },
    {
      id: "perk",
      tag: "PERK",
      title: benefitTitle(benefit),
      copy: benefit ? summarizeBenefit(benefit) : "창업팀이 실제로 활용할 수 있는 검증된 혜택을 준비하고 있습니다."
    },
    {
      id: "bounty",
      tag: "BOUNTY",
      title: "실전 Bounty Board",
      copy: "기업의 실제 문제를 검증 가능한 과제로 설계하고, 참가팀의 실행 결과를 평가해 Pilot 기회로 연결합니다."
    }
  ]);
}

export function normalizeCommunityHighlights(items = []) {
  const byId = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const id = text(item?.id, 40).toLowerCase();
    if (!ITEM_ORDER.includes(id) || byId.has(id)) continue;
    byId.set(id, {
      id,
      tag: plainText(item?.tag, 24).toUpperCase(),
      title: plainText(item?.title, 100),
      copy: plainText(item?.copy, 360)
    });
  }
  return ITEM_ORDER.map((id) => byId.get(id)).filter((item) => item?.tag && item?.title && item?.copy);
}

export function communityHighlightsForViewer(items = [], viewer = {}) {
  const normalized = normalizeCommunityHighlights(items);
  const role = text(viewer?.role, 40).toLowerCase();
  return role === "member"
    ? normalized.filter((item) => !CLAW_MEMBER_HIDDEN_ITEMS.has(item.id))
    : normalized;
}

function benefitTitle(benefit) {
  if (!benefit) return "검증된 회원 혜택";
  const provider = plainText(benefit.provider || benefit.title, 80);
  return provider ? `${provider} 회원 혜택` : "검증된 회원 혜택";
}

function eventTitle(event = {}) {
  const title = plainText(event.title, 100) || "Arena 일정";
  return /(?:세션|행사|워크숍|밋업|데모데이|부트캠프|네트워킹|오피스아워|설명회)/u.test(title)
    ? title
    : `${title} 세션`;
}

function eventSummary(event = {}) {
  const parts = [dateLabel(event.date), timeLabel(event), plainText(event.location, 100)].filter(Boolean);
  return parts.join(" · ") || "세부 일정과 참여 방법을 Events에서 확인하세요.";
}

function dateLabel(value) {
  const date = dateOnly(value);
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00+09:00`);
  if (!Number.isFinite(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(parsed);
}

function timeLabel(event = {}) {
  const value = plainText(event.time || event.startTime, 40);
  if (!value) return "";
  return value.replace(/^(\d{1,2}):00$/u, "$1시").replace(/^(\d{1,2}):(\d{2})$/u, "$1시 $2분");
}

function isUpcomingEvent(event, now) {
  const date = dateOnly(event?.date);
  if (!date) return false;
  const current = now instanceof Date ? now : new Date(now);
  const today = Number.isFinite(current.getTime())
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(current)
    : new Date().toISOString().slice(0, 10);
  return date >= today;
}

function eventSortKey(event = {}) {
  return `${dateOnly(event.date) || "9999-12-31"}|${text(event.time || event.startTime, 40) || "99:99"}|${text(event.title, 100)}`;
}

function dateOnly(value) {
  const match = String(value || "").match(/\d{4}-\d{2}-\d{2}/u);
  return match?.[0] || "";
}

function plainText(value, maxLength) {
  return text(value, maxLength)
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function text(value, maxLength) {
  return String(value || "").normalize("NFKC").trim().slice(0, maxLength);
}
