import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("public/arena/index.html", "utf8");
const css = readFileSync("public/arena/market.css", "utf8");

test("Partnership actions begin as an equal two-column layout", () => {
  assert.match(css, /\.partnership-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(html, /id="bountyBriefPanel" class="panel partnership-action-panel partnership-action-panel-bounty"/);
  assert.match(html, /id="connectionPanel" class="panel partnership-action-panel partnership-action-panel-introduction"/);
});

test("Partnership actions expand toward their neighboring card on hover or keyboard focus", () => {
  assert.match(css, /partnership-action-panel-bounty\s*\{\s*transform-origin:\s*left center/);
  assert.match(css, /partnership-action-panel-introduction\s*\{\s*transform-origin:\s*right center/);
  assert.match(css, /\.partnership-action-panel:is\(:hover, :focus-within\)[\s\S]*?scaleX\(1\.045\) scaleY\(1\.006\)/);
  assert.match(css, /partnership-action-panel-bounty:is\(:hover, :focus-within\)[\s\S]*?partnership-action-panel-introduction[\s\S]*?scaleX\(0\.985\)/);
  assert.match(css, /partnership-action-panel-introduction:is\(:hover, :focus-within\)[\s\S]*?partnership-action-panel-bounty[\s\S]*?scaleX\(0\.985\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.partnership-grid,[\s\S]*?grid-template-columns:\s*1fr/);
});

test("Partnership hover returns without grid reflow or an abrupt shrink", () => {
  assert.doesNotMatch(css, /transition:\s*grid-template-columns/);
  assert.doesNotMatch(css, /grid-template-columns:\s*minmax\(0, 1\.16fr\)/);
  assert.match(css, /\.partnership-action-panel\s*\{[\s\S]*?transform 540ms cubic-bezier\(0\.45, 0, 0\.55, 1\)/);
  assert.match(css, /\.partnership-action-panel:is\(:hover, :focus-within\)[\s\S]*?transition-duration:\s*350ms, 250ms, 220ms, 350ms/);
  assert.match(css, /transition-timing-function:[\s\S]*?cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.partnership-action-panel[\s\S]*?transform:\s*none !important/);
});

test("Partnership stages highlight in order and carry motion to the right", () => {
  assert.match(html, /<span>Interest<\/span><i>→<\/i><span>Matched<\/span><i>→<\/i><span>NDA<\/span><i>→<\/i><span>Pilot<\/span><i>→<\/i><span>Production<\/span>/);
  assert.match(css, /@keyframes pipeline-bubble-flow[\s\S]*?translate3d\(4px, -2px, 0\) scale\(1\.09\)/);
  assert.match(css, /span:nth-of-type\(5\)[\s\S]*?--pipeline-delay:\s*4s/);
  assert.match(css, /i:nth-of-type\(4\)[\s\S]*?--pipeline-arrow-delay:\s*3\.5s/);
  assert.match(css, /@keyframes pipeline-arrow-flow[\s\S]*?translate3d\(4px, 0, 0\) scale\(1\.18\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.market-pipeline-mini span[\s\S]*?animation:\s*none !important/);
});
