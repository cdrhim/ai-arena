import { plainEventDescription } from "./event-copy.js";

export const EVENT_DESCRIPTION_COLLAPSE_AT = 150;
export const EVENT_DESCRIPTION_PREVIEW_LENGTH = 116;

const KOREAN_WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

export function sortEventsChronologically(events = []) {
  return [...events]
    .map((event, index) => ({ event, index, order: eventOrder(event) }))
    .sort((left, right) => {
      const leftIsValid = Number.isFinite(left.order);
      const rightIsValid = Number.isFinite(right.order);
      if (leftIsValid !== rightIsValid) return leftIsValid ? -1 : 1;
      if (leftIsValid && left.order !== right.order) return left.order - right.order;

      const titleDifference = String(left.event?.title || "").localeCompare(
        String(right.event?.title || ""),
        "ko"
      );
      if (titleDifference) return titleDifference;
      return left.index - right.index;
    })
    .map(({ event }) => event);
}

export function koreanWeekday(value) {
  const parts = calendarDateParts(value);
  if (!parts) return "";
  return KOREAN_WEEKDAYS[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
}

export function formatEventTime(value) {
  return String(value || "")
    .trim()
    .replace(/\b([01]?\d|2[0-3]):([0-5]\d):00\b/g, "$1:$2");
}

export function shouldCollapseEventDescription(value, limit = EVENT_DESCRIPTION_COLLAPSE_AT) {
  return normalizedDescription(value).length > limit;
}

export function eventDescriptionPreview(value, limit = EVENT_DESCRIPTION_PREVIEW_LENGTH) {
  const description = normalizedDescription(value);
  if (description.length <= limit) return description;
  return `${description.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function eventOrder(event) {
  const dateText = String(event?.date || "").trim();
  const date = calendarDateParts(dateText);
  if (!date) {
    const timestamp = Date.parse(dateText);
    return Number.isFinite(timestamp) ? timestamp : Number.NaN;
  }

  const time = clockTimeParts(event?.time) || clockTimeParts(dateText);
  const milliseconds = time
    ? ((time.hours * 60 + time.minutes) * 60 + time.seconds) * 1000
    : 86_399_999;
  return Date.UTC(date.year, date.month - 1, date.day) + milliseconds;
}

function calendarDateParts(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function clockTimeParts(value) {
  const match = String(value || "").match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/);
  if (!match) return null;
  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
    seconds: Number(match[3] || 0)
  };
}

function normalizedDescription(value) {
  return plainEventDescription(value).replace(/\s+/gu, " ").trim();
}
