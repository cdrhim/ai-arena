import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("public/arena/index.html", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");
const js = readFileSync("public/arena/arena.js", "utf8");

test("overview hero exposes an honest current-query status and floating network cloud", () => {
  assert.match(html, /class="hero-live-status" role="status" aria-live="polite"/);
  assert.match(html, /<time id="heroLiveTime">조회 시각 확인 중<\/time>/);
  assert.equal((html.match(/data-hero-cloud-tag/g) || []).length, 4);
  assert.match(html, /class="hero-network-core"/);
  assert.match(html, /class="hero-cloud-field" aria-hidden="true"/);
});

test("hero timestamp reflects page data retrieval in KST instead of claiming a streaming update", () => {
  assert.match(js, /function renderHeroLiveNetwork\(partnerProfile\)/);
  assert.match(js, /timeZone: "Asia\/Seoul"/);
  assert.match(js, /KST 조회/);
  assert.match(js, /heroLiveTime\.setAttribute\("datetime", now\.toISOString\(\)\)/);
  assert.doesNotMatch(js, /setInterval\(renderHeroLiveNetwork/);
  assert.match(js, /const sectorNames = \(hub\.sectors \|\| \[\]\)/);
});

test("floating hero motion remains responsive and reduced-motion safe", () => {
  assert.match(css, /@keyframes hero-planet-orbit/);
  assert.match(css, /@keyframes hero-node-orbit/);
  assert.match(css, /@keyframes hero-network-core-breathe/);
  assert.match(css, /@keyframes hero-aurora-cloud-one/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.hero-visual \.hero-network-core\s*\{\s*display:\s*grid;/);
  assert.match(css, /\.orbit-card\s*\{[\s\S]*?offset-path:\s*ellipse\(calc\(50% - 96px\) calc\(50% - 78px\) at 50% 47%\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.hero-visual \.hero-network-core,[\s\S]*?display:\s*none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.hero-cloud-tag,[\s\S]*?\.orbit-card,[\s\S]*?animation:\s*none !important;/);
});
