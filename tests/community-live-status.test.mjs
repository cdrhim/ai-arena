import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { communityLiveCopy, relativeActivity } from "../public/arena/community-live.js";

test("Community live status summarizes real conversations and current activity", () => {
  const now = Date.parse("2026-08-11T09:10:00.000Z");
  const status = communityLiveCopy({
    threads: [
      { lastActivityAt: "2026-08-11T09:07:00.000Z", responseStatus: "awaiting_response" },
      { lastActivityAt: "2026-08-11T08:00:00.000Z", responseStatus: "response_received" }
    ],
    comments: [{ createdAt: "2026-08-11T09:07:00.000Z" }]
  }, now);

  assert.equal(status.state, "active");
  assert.equal(status.title, "2개의 대화에서 답변이 이어지고 있습니다");
  assert.equal(status.meta, "댓글 1개 · 답변을 기다리는 요청 1개 · 3분 전 활동");
});

test("Community live status stays honest when no conversation exists", () => {
  assert.deepEqual(communityLiveCopy({ threads: [], comments: [] }), {
    state: "ready",
    title: "첫 대화를 기다리고 있습니다",
    meta: "Ask · Ship · Connect · Outcome에서 새로운 신호를 열어보세요."
  });
  assert.equal(relativeActivity("2026-08-11T09:09:45.000Z", Date.parse("2026-08-11T09:10:00.000Z")), "방금 활동");
});

test("Community live card uses an accessible data-driven current state", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const client = readFileSync("public/arena/community.js", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");

  assert.match(html, /id="communityLiveCard"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(html, /COMMUNITY NOW/);
  assert.match(client, /communityLiveCopy\(forum\)/);
  assert.match(client, /60_000/);
  assert.match(css, /@keyframes community-live-step/);
  assert.match(css, /prefers-reduced-motion[\s\S]+community-live-flow b/);
});
