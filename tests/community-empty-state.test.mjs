import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const communitySource = readFileSync("public/arena/community.js", "utf8");
const cssSource = readFileSync("public/arena/arena.css", "utf8");

test("Community empty guidance renders every sentence as a separate readable paragraph", () => {
  const start = communitySource.indexOf("function renderEmptyThreads");
  const end = communitySource.indexOf("function threadMarkup", start);
  const source = communitySource.slice(start, end);

  assert.match(source, /\.match\(\/\[\^\.!\?\]\+\[\.!\?\]\+\|\[\^\.!\?\]\+\$\/g\)/);
  assert.match(source, /class="agentic-empty community-feed-empty"/);
  assert.match(source, /paragraphs\.map\(\(sentence\) => `<p>\$\{escapeHtml\(sentence\)\}<\/p>`\)/);
  assert.doesNotMatch(source, /<span>\$\{escapeHtml\(message \|\| partnerCopy\)\}<\/span>/);
});

test("Community empty paragraphs have explicit vertical spacing and readable line height", () => {
  assert.match(cssSource, /\.community-feed-empty\s*\{[\s\S]{0,260}?display:\s*grid;[\s\S]{0,260}?gap:\s*10px/);
  assert.match(cssSource, /\.community-feed-empty > div\s*\{[\s\S]{0,100}?display:\s*grid;[\s\S]{0,100}?gap:\s*7px/);
  assert.match(cssSource, /\.community-feed-empty p\s*\{[\s\S]{0,140}?margin:\s*0;[\s\S]{0,140}?font-size:\s*14px;[\s\S]{0,140}?line-height:\s*1\.65/);
});
