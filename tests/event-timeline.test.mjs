import test from "node:test";
import assert from "node:assert/strict";

import {
  eventDescriptionPreview,
  formatEventTime,
  koreanWeekday,
  shouldCollapseEventDescription,
  sortEventsChronologically
} from "../public/arena/event-timeline.js";

test("events are ordered by date and then by starting time", () => {
  const events = [
    { id: "oct-15", date: "2026-10-15", time: "14:00:00" },
    { id: "sep-29-late", date: "2026-09-29", time: "15:00:00" },
    { id: "oct-01", date: "2026-10-01", time: "15:00:00" },
    { id: "sep-29-early", date: "2026-09-29", time: "14:00:00" }
  ];

  assert.deepEqual(
    sortEventsChronologically(events).map((event) => event.id),
    ["sep-29-early", "sep-29-late", "oct-01", "oct-15"]
  );
  assert.deepEqual(events.map((event) => event.id), ["oct-15", "sep-29-late", "oct-01", "sep-29-early"]);
});

test("untimed events follow timed events and invalid dates remain at the end", () => {
  const events = [
    { id: "invalid-b", date: "TBD", title: "나" },
    { id: "untimed", date: "2026-09-29" },
    { id: "timed", date: "2026-09-29", time: "18:30" },
    { id: "invalid-a", date: "", title: "가" }
  ];

  assert.deepEqual(
    sortEventsChronologically(events).map((event) => event.id),
    ["timed", "untimed", "invalid-a", "invalid-b"]
  );
});

test("Korean weekday and compact event time are formatted for the date card", () => {
  assert.equal(koreanWeekday("2026-09-29"), "화요일");
  assert.equal(koreanWeekday("not-a-date"), "");
  assert.equal(formatEventTime("14:00:00"), "14:00");
  assert.equal(formatEventTime("14:00:00 - 16:30:00"), "14:00 - 16:30");
});

test("long descriptions get a concise preview while short descriptions stay expanded", () => {
  const longDescription = "가".repeat(170);
  assert.equal(shouldCollapseEventDescription("짧은 안내입니다."), false);
  assert.equal(shouldCollapseEventDescription(longDescription), true);
  assert.equal(eventDescriptionPreview(longDescription).endsWith("…"), true);
  assert.equal(eventDescriptionPreview(longDescription).length, 116);
});

test("description previews measure readable text instead of raw HTML markup", () => {
  const description = "<p>파트너 오리엔테이션 안내입니다.</p><ul><li>사전 질문 준비</li><li>Zoom 접속</li></ul>";

  assert.equal(shouldCollapseEventDescription(description), false);
  assert.equal(
    eventDescriptionPreview(description),
    "파트너 오리엔테이션 안내입니다. • 사전 질문 준비 • Zoom 접속"
  );
});
