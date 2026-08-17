import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { communityEngagement, sortCommunityThreads } from "../public/arena/community-sort.js";

const threads = [
  {
    id: "official-zero",
    score: 0,
    commentCount: 0,
    hotScore: 120,
    pinned: true,
    staffPick: true,
    createdAt: "2026-08-13T09:00:00.000Z",
    lastActivityAt: "2026-08-13T09:00:00.000Z"
  },
  {
    id: "community-popular",
    score: 3,
    commentCount: 1,
    hotScore: 1,
    createdAt: "2026-08-12T09:00:00.000Z",
    lastActivityAt: "2026-08-13T08:00:00.000Z"
  },
  {
    id: "older-unanswered",
    score: 1,
    commentCount: 0,
    createdAt: "2026-08-10T09:00:00.000Z",
    lastActivityAt: "2026-08-10T09:00:00.000Z"
  }
];

test("인기순은 운영진 고정 보너스가 아니라 실제 공감과 댓글 참여도를 사용한다", () => {
  assert.equal(communityEngagement(threads[1]), 5);
  assert.deepEqual(sortCommunityThreads(threads, "hot").map((thread) => thread.id), [
    "community-popular",
    "older-unanswered",
    "official-zero"
  ]);
});

test("최신순은 글 작성 시각의 역순이다", () => {
  assert.deepEqual(sortCommunityThreads(threads, "new").map((thread) => thread.id), [
    "official-zero",
    "community-popular",
    "older-unanswered"
  ]);
});

test("댓글 필요는 댓글이 없는 글만 오래 기다린 순서로 표시한다", () => {
  assert.deepEqual(sortCommunityThreads(threads, "needs").map((thread) => thread.id), [
    "older-unanswered",
    "official-zero"
  ]);
});

test("Community 정렬 탭은 사용자에게 최종 한국어 이름을 바로 제공한다", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  assert.match(html, /data-community-sort="hot"[^>]*>인기순<\/button>/);
  assert.match(html, /data-community-sort="new"[^>]*>최신순<\/button>/);
  assert.match(html, /data-community-sort="needs"[^>]*>댓글 필요<\/button>/);
  assert.doesNotMatch(html, /답변 필요/);
});
