import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("public/arena/arena.css", "utf8");
const js = readFileSync("public/arena/arena.js", "utf8");

test("narrow screens stack editorial copy and logo without clipping the company name", () => {
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.featured-spotlight-head p\s*\{[\s\S]*?display:\s*none;/);
  assert.doesNotMatch(css, /\.program-hero-copy #cohortBadge,\s*\n\s*\.program-hero-copy > p,\s*\n\s*\.featured-spotlight-head p/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.program-hero\s*\{[\s\S]*?row-gap:\s*36px;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.program-hero-copy #cohortBadge\s*\{[\s\S]*?display:\s*inline-flex;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.program-hero-copy > p\s*\{[\s\S]*?display:\s*block;[\s\S]*?line-height:\s*1\.65;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.featured-spotlight-cluster\s*\{[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*0;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.featured-spotlight-stage,[\s\S]*?\.featured-spotlight-slide\s*\{[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*0;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.featured-spotlight-slide\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.featured-spotlight-content\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.featured-spotlight-slide h3\s*\{[\s\S]*?word-break:\s*keep-all;[\s\S]*?overflow-wrap:\s*anywhere;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.featured-spotlight-slide p\s*\{[\s\S]*?-webkit-line-clamp:\s*2;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.featured-spotlight-keywords\s*\{[\s\S]*?max-height:\s*none;[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.featured-spotlight-visual\s*\{[\s\S]*?height:\s*clamp\(168px, 48vw, 220px\);[\s\S]*?min-height:\s*168px;[\s\S]*?border-left:\s*0;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.featured-spotlight-visual\.is-product img\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?object-fit:\s*contain;/);
});

test("a narrow Spotlight container stays complete and the whole card opens its company", () => {
  assert.match(css, /\.featured-spotlight\s*\{[\s\S]*?container-type:\s*inline-size;/);
  assert.match(css, /@container \(max-width: 520px\)[\s\S]*?\.featured-spotlight-slide\s*\{[\s\S]*?height:\s*184px;[\s\S]*?min-height:\s*184px;/);
  assert.match(css, /@container \(max-width: 520px\)[\s\S]*?\.featured-spotlight-content\s*\{[\s\S]*?align-content:\s*start;[\s\S]*?gap:\s*4px;/);
  assert.match(css, /@container \(max-width: 520px\)[\s\S]*?\.featured-spotlight-profile\s*\{[\s\S]*?justify-self:\s*start;[\s\S]*?padding:\s*0;/);
  assert.match(js, /data-featured-team-id="\$\{escapeHtml\(company\.id\)\}" role="button" tabindex="0"/);
  assert.match(js, /slide\.addEventListener\("click", openFeaturedTeam\)/);
  assert.match(js, /event\.key !== "Enter" && event\.key !== " "/);
});

test("desktop hero makes Editorial Spotlight the primary visual and separates its verification row", () => {
  assert.match(css, /@media \(min-width: 1121px\)[\s\S]*?\.featured-spotlight\s*\{[\s\S]*?max-width:\s*620px;[\s\S]*?min-height:\s*414px;/);
  assert.match(css, /@media \(min-width: 1121px\)[\s\S]*?\.featured-spotlight-head h2\s*\{[\s\S]*?font-size:\s*clamp\(22px, 1\.7vw, 27px\);/);
  assert.match(css, /@media \(min-width: 1121px\)[\s\S]*?\.featured-spotlight-slide\s*\{[\s\S]*?height:\s*242px;[\s\S]*?min-height:\s*242px;/);
  assert.match(css, /@media \(min-width: 1121px\)[\s\S]*?\.featured-spotlight-footer\s*\{[\s\S]*?margin-top:\s*20px;[\s\S]*?padding-top:\s*4px;/);
  assert.match(css, /@media \(min-width: 1121px\)[\s\S]*?\.hero-orbit\s*\{[\s\S]*?opacity:\s*0\.74;/);
});

test("Spotlight description keeps a small vertical gap before the company card", () => {
  assert.match(css, /\.featured-spotlight-cluster\s*\{[\s\S]*?margin-top:\s*13px;/);
  assert.match(css, /@media \(min-width: 901px\)[\s\S]*?\.featured-spotlight-cluster\s*\{[\s\S]*?margin-top:\s*14px;/);
  assert.match(css, /@media \(min-width: 1121px\)[\s\S]*?\.featured-spotlight-cluster\s*\{[\s\S]*?margin-top:\s*16px;/);
});

test("Spotlight cards use layered depth without forcing motion-sensitive users through 3D movement", () => {
  assert.match(css, /\.featured-spotlight-stage\s*\{[\s\S]*?perspective:\s*1100px;[\s\S]*?transform-style:\s*preserve-3d;/);
  assert.match(css, /\.featured-spotlight-stage\s*\{[\s\S]*?animation:\s*featured-spotlight-breathe 4\.6s ease-in-out 500ms infinite alternate;/);
  assert.match(css, /\.featured-spotlight-slide\s*\{[\s\S]*?transform:\s*translate3d\(0, -4px, 22px\) rotateX\(0\.8deg\) rotateY\(-0\.65deg\) scale\(1\.006\);/);
  assert.match(css, /@keyframes featured-spotlight-breathe\s*\{[\s\S]*?translate3d\(0, -4px, 0\);[\s\S]*?drop-shadow\(0 23px 30px rgba\(0, 11, 34, 0\.3\)\)/);
  assert.match(css, /\.featured-spotlight-slide:hover,[\s\S]*?transform:\s*translate3d\(0, -7px, 34px\) rotateX\(1\.6deg\) rotateY\(-1\.4deg\) scale\(1\.012\);/);
  assert.match(css, /\.featured-spotlight-slide:hover \.featured-spotlight-content,[\s\S]*?translate3d\(-2px, -1px, 34px\);/);
  assert.match(css, /\.featured-spotlight-slide:hover \.featured-spotlight-visual,[\s\S]*?translate3d\(4px, -3px, 52px\) scale\(1\.018\);/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.featured-spotlight-stage,[\s\S]*?animation:\s*none !important;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.featured-spotlight-slide:hover,[\s\S]*?translate3d\(0, -3px, 0\);/);
});
