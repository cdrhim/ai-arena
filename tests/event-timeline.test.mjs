import test from "node:test";
import assert from "node:assert/strict";

import {
  eventDescriptionPreview,
  formatEventTime,
  isCommunityEventFromOrientation,
  isPartnerVisibleProgramEvent,
  koreanWeekday,
  partnerVisibleProgramEvents,
  shouldCollapseEventDescription,
  sortEventsChronologically
} from "../public/arena/event-timeline.js";

test("Community Events begin with the 13 August 2026 BootCamp Orientation", () => {
  assert.equal(isCommunityEventFromOrientation({ date: "2026-08-12" }), false);
  assert.equal(isCommunityEventFromOrientation({ date: "2026-08-13" }), true);
  assert.equal(isCommunityEventFromOrientation({ event_date: "2026-08-14" }), true);
  assert.equal(isCommunityEventFromOrientation({ date: "TBD" }), false);
});

test("partner calendar keeps the 13 August OT and only public major program events", () => {
  const events = [
    { id: "private-team", title: "팀별 비공개 멘토링", date: "2026-08-20", teamId: "team-1" },
    { id: "minor", title: "운영 체크인", date: "2026-08-21", targetGroup: "운영진" },
    { id: "public-demo", title: "SparkClaw Demo Day", date: "2026-09-30", targetGroup: "전체 공개" }
  ];
  assert.equal(isPartnerVisibleProgramEvent(events[0]), false);
  assert.equal(isPartnerVisibleProgramEvent(events[1]), false);
  assert.equal(isPartnerVisibleProgramEvent(events[2]), true);
  assert.deepEqual(
    partnerVisibleProgramEvents(events).map((event) => event.id),
    ["partner-program-orientation-2026-08-13", "public-demo"]
  );
});

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
