import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ARENA_GUIDE_TUTORIAL_STEPS, initArenaGuideTutorial } from "../public/arena/arena-guide-tutorial.js";

test("클로이 튜토리얼은 각 메뉴의 전체 화면을 먼저 보여준 뒤 실제 기능을 안내한다", () => {
  assert.equal(ARENA_GUIDE_TUTORIAL_STEPS.length, 21);
  assert.deepEqual(
    ARENA_GUIDE_TUTORIAL_STEPS.map((step) => step.label),
    ["DISCOVER", "DISCOVER", "DISCOVER", "DISCOVER", "DISCOVER", "DISCOVER", "DISCOVER", "DISCOVER", "DISCOVER", "DISCOVER", "COMMUNITY", "COMMUNITY", "COMMUNITY", "COMMUNITY", "COMMUNITY", "BOUNTY", "BOUNTY", "MY LOG", "MY LOG", "MY LOG", "MY LOG"]
  );
  assert.deepEqual(ARENA_GUIDE_TUTORIAL_STEPS.map((step) => step.number), Array.from({ length: 21 }, (_, index) => String(index + 1).padStart(2, "0")));
  assert.deepEqual(
    ARENA_GUIDE_TUTORIAL_STEPS.slice(7, 10).map((step) => [step.key, step.page, step.target]),
    [
      ["discover-company-directory", "teams", "#teamsPage"],
      ["discover-task-driven-search", "discover", "#discoverPage"],
      ["discover-compare", "compare", "#comparePage"]
    ]
  );
  assert.deepEqual(
    ARENA_GUIDE_TUTORIAL_STEPS.filter((step) => step.pageOverview).map((step) => step.target),
    ["#overviewPage", "#teamsPage", "#discoverPage", "#comparePage", "#communityPage", "#arenaPage", "#workspacePage"]
  );
  assert.match(ARENA_GUIDE_TUTORIAL_STEPS[16].description, /Release 준비 중/);
  assert.match(ARENA_GUIDE_TUTORIAL_STEPS[13].description, /제목·채널·공개 범위/);
  assert.equal(typeof initArenaGuideTutorial, "function");
});

test("튜토리얼은 단계 이동, 직접 화면 이동, 닫기 동작을 분리한다", () => {
  const source = readFileSync("public/arena/arena-guide-tutorial.js", "utf8");
  assert.match(source, /data-guide-tutorial-previous/);
  assert.match(source, /data-guide-tutorial-next/);
  assert.match(source, /data-guide-tutorial-page/);
  assert.match(source, /buildStepNavigation/);
  assert.match(source, /const currentPage = options\.getCurrentPage\?\.\(\) \|\| ""/);
  assert.match(source, /const pageChanged = currentPage !== step\.page/);
  assert.match(source, /if \(pageChanged\) options\.navigate\?\.\(step\.page, \{ skipScroll: true \}\)/);
  assert.match(source, /pageChanged \? 120 : 0/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /arena-guide-live-spotlight/);
  assert.match(source, /includeTargets:\s*\["#metricProfilesTooltip"\]/);
  assert.match(source, /key:\s*"community-feed"[\s\S]*?includeTargets:\s*\["#communityThreadList"\]/);
  assert.match(source, /key:\s*"community-ai-settings"[\s\S]*?resultTarget:\s*"#communityDraftMetadata"/);
  assert.match(source, /arena:community-draft-ready/);
  assert.match(source, /function revealGeneratedResult/);
  assert.match(source, /resultTarget\.scrollIntoView/);
  assert.match(source, /activeIncludedTargets/);
  assert.match(source, /is-guide-expanded/);
  assert.match(source, /Math\.max\(bounds\.right, item\.right\)/);
  assert.match(source, /ARENA_GUIDE_TUTORIAL_CHAPTERS/);
  assert.doesNotMatch(source, /createChapterRoute/);
  assert.doesNotMatch(source, /data-guide-route-chapter/);
  assert.match(source, /is-guide-chapter-arriving/);
  assert.match(source, /data-guide-tutorial-open/);
  assert.match(source, /튜토리얼 마치기/);
  assert.doesNotMatch(source, /innerHTML/);
});

test("클로이 게시 설정이 생성되면 튜토리얼 하이라이트가 결과 창까지 자동 확장된다", () => {
  const tutorialSource = readFileSync("public/arena/arena-guide-tutorial.js", "utf8");
  const communitySource = readFileSync("public/arena/community.js", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");
  assert.match(communitySource, /els\.threadMetadata\.hidden = false;[\s\S]*?arena:community-draft-ready/);
  assert.match(tutorialSource, /if \(tutorial\.hidden \|\| root\.dataset\.guideMode !== "tutorial"\) return/);
  assert.match(tutorialSource, /activeIncludedTargets = resolveIncludedTargets\(step\)/);
  assert.match(css, /\.community-draft-metadata\.is-guide-result-ready/);
  assert.match(css, /@keyframes arena-guide-result-ready/);
});

test("튜토리얼의 대분류 전환은 별도 메뉴 없이 기존 상단 내비게이션만 강조한다", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");
  assert.match(html, /data-guide-chapter="discover"/);
  assert.match(html, /data-guide-chapter="community"/);
  assert.match(html, /data-guide-chapter="bounty"/);
  assert.match(html, /data-guide-chapter="my-log"/);
  assert.match(css, /\.nav-menu\.is-guide-chapter-active > \.nav-link/);
  assert.match(css, /@keyframes arena-guide-nav-arrive/);
  assert.doesNotMatch(css, /\.arena-guide-chapter-route/);
  assert.doesNotMatch(html, /TUTORIAL ROUTE/);
});

test("튜토리얼 단계 이동은 같은 탭을 다시 열거나 페이지 맨 위로 먼저 이동하지 않는다", () => {
  const tutorialSource = readFileSync("public/arena/arena-guide-tutorial.js", "utf8");
  const guideSource = readFileSync("public/arena/arena-guide.js", "utf8");
  const arenaSource = readFileSync("public/arena/arena.js", "utf8");
  assert.match(tutorialSource, /const pageChanged = currentPage !== step\.page/);
  assert.match(tutorialSource, /if \(pageChanged\) options\.navigate\?\.\(step\.page, \{ skipScroll: true \}\)/);
  assert.match(guideSource, /getCurrentPage: pageFromHash/);
  assert.match(arenaSource, /skipScroll = false/);
  assert.match(arenaSource, /if \(!skipScroll\) \{[\s\S]*?window\.scrollTo/);
});
