import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("public/arena/index.html", "utf8");
const js = readFileSync("public/arena/arena.js", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");

test("What’s New is the first Discover content block and uses the latest official Community notice", () => {
  const overview = html.match(/<section id="overviewPage"[\s\S]*?<section id="partnerProfileCard"/)?.[0] || "";
  assert.ok(overview.indexOf("overview-top-notice") < overview.indexOf("program-hero"));
  assert.match(overview, /WHAT'S NEW/);
  assert.match(js, /fetch\("\/api\/arena-announcements"/);
  assert.match(js, /cache:\s*"no-store"/);
  assert.match(js, /payload\?\.announcements\) \? payload\.announcements\[0\]/);
  assert.match(js, /spark-arena:announcements-updated/);
  assert.match(js, /if \(pageName === "overview"\) loadLatestArenaAnnouncement\(\)/);
  assert.match(js, /SPARKLABS OFFICIAL/);
  assert.match(js, /Community에서 공지 보기/);
  assert.doesNotMatch(js.slice(js.indexOf("function renderWeeklyNotice"), js.indexOf("function renderSectorChart")), /hub\.weeklyNotice/);
  assert.match(css, /Compact What's New bar/);
  assert.match(css, /#overviewPage > \.overview-top-notice\s*\{[\s\S]*?grid-template-columns:\s*138px minmax\(0, 1fr\);[\s\S]*?padding:\s*10px 14px;/);
  assert.match(css, /#overviewPage \.overview-top-notice \.notice-content\s*\{[\s\S]*?min-height:\s*56px;[\s\S]*?padding:\s*9px 13px;/);
  assert.match(css, /#overviewPage \.overview-top-notice \.notice-content p\s*\{[\s\S]*?white-space:\s*nowrap;/);
  assert.match(css, /#overviewPage > \.overview-top-notice::before\s*\{[\s\S]*?linear-gradient\(180deg, #23d7ba, #1977ec/);
  assert.match(css, /#overviewPage > \.overview-top-notice:hover\s*\{[\s\S]*?translate3d\(0, -3px, 10px\)/);
  assert.match(css, /@keyframes overview-notice-scan/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?#overviewPage > \.overview-top-notice::after/);
});
