import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const arenaCss = readFileSync("public/arena/arena.css", "utf8");
const marketCss = readFileSync("public/arena/market.css", "utf8");
const html = readFileSync("public/arena/index.html", "utf8");

test("site typography does not render micro text below 12px", () => {
  const pixelSizes = [...`${arenaCss}\n${marketCss}`.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]));
  assert.ok(pixelSizes.length > 100);
  assert.equal(pixelSizes.filter((size) => size < 12).length, 0);
});

test("global reading defaults use a balanced body size and line height", () => {
  assert.match(arenaCss, /body\s*\{[\s\S]*?font-size:\s*15px;[\s\S]*?line-height:\s*1\.6;/);
  assert.match(arenaCss, /text-rendering:\s*optimizeLegibility/);
  assert.match(arenaCss, /p,[\s\S]*?li,[\s\S]*?text-wrap:\s*pretty/);
});

test("comparison summary establishes a readable information hierarchy", () => {
  assert.match(marketCss, /\.compare-summary-card\s*\{[\s\S]*?padding:\s*clamp\(24px, 2\.4vw, 34px\)/);
  assert.match(marketCss, /\.compare-summary-overview\s*\{[\s\S]*?max-width:\s*78ch;[\s\S]*?font-size:\s*15px;[\s\S]*?line-height:\s*1\.75/);
  assert.match(marketCss, /\.compare-summary-teams p\s*\{[\s\S]*?font-size:\s*14px;[\s\S]*?line-height:\s*1\.7/);
  assert.match(marketCss, /\.compare-summary-differences li\s*\{[\s\S]*?font-size:\s*14px;[\s\S]*?line-height:\s*1\.65/);
  assert.match(marketCss, /@media \(max-width: 640px\)[\s\S]*?\.compare-summary-head\s*\{[\s\S]*?flex-direction:\s*column/);
});

test("production HTML cache-busts the application assets together", () => {
  const assetVersions = [...html.matchAll(/\/(?:arena\/(?:arena|market|community)\.(?:css|js))\?v=([^"']+)/g)].map(
    (match) => match[1]
  );
  assert.equal(assetVersions.length, 5);
  assert.equal(new Set(assetVersions).size, 1);
  assert.ok(html.indexOf("/arena/arena.css") < html.indexOf("/arena/market.css"));
});

test("brand theme uses the original AI Arena blue palette", () => {
  assert.match(arenaCss, /--navy:\s*#0b1f47/);
  assert.match(arenaCss, /--blue:\s*#1465e8/);
  assert.match(arenaCss, /--blue-soft:\s*#eaf2ff/);
  assert.match(arenaCss, /body\s*\{[\s\S]*?rgba\(20, 101, 232, 0\.08\)/);
  assert.match(html, /meta name="theme-color" content="#1465e8"/);
  assert.doesNotMatch(html, /brand-theme\.css/);
});

test("global progress stays in the app flow without covering page headings", () => {
  assert.match(html, /id="programApp"[\s\S]*?id="globalProcessStatus"[\s\S]*?id="overviewPage"/);
  assert.match(arenaCss, /\.form-status\.global-process-status\.process-status\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?z-index:\s*40;[\s\S]*?width:\s*min\(540px, calc\(100% - 24px\)\);[\s\S]*?margin:\s*0 auto 14px;/);
  assert.match(arenaCss, /@media \(max-width: 480px\)[\s\S]*?grid-template-columns:\s*16px minmax\(0, 1fr\) auto;[\s\S]*?\.process-status-step\s*\{[\s\S]*?grid-column:\s*auto;[\s\S]*?justify-self:\s*end;/);
});

test("navigation and partner hero stay readable without truncating primary content", () => {
  assert.match(arenaCss, /\.nav-dropdown-wide\s*\{[\s\S]*?width:\s*400px;/);
  assert.match(arenaCss, /\.nav-link\s*\{[\s\S]*?font-size:\s*14px;/);
  assert.match(arenaCss, /\.program-hero h1\s*\{[\s\S]*?font-size:\s*clamp\(36px, 4vw, 56px\);[\s\S]*?word-break:\s*keep-all;/);
});
