import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const js = readFileSync("public/arena/arena.js", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");

test("Editorial Spotlight prioritizes weekly and recent verified achievements", () => {
  assert.match(js, /function prioritizeFeaturedSpotlightEntries\(entries\)/);
  assert.match(js, /sourceType === "weekly_program_update"/);
  assert.match(js, /Date\.parse\(right\.curation\?\.verifiedAt/);
  assert.doesNotMatch(js, /Math\.random\(\)/);
  assert.doesNotMatch(js, /FEATURED_SPOTLIGHT_ORDER_KEY/);
});

test("Spotlight shows one readable slide at a time and keeps rotating through interaction", () => {
  assert.match(js, /data-featured-slide="\$\{index\}"/);
  assert.match(js, /data-spotlight-direction/);
  assert.doesNotMatch(js, /onpointerenter = stopFeaturedSpotlightRotation/);
  assert.doesNotMatch(js, /onfocusin = stopFeaturedSpotlightRotation/);
  assert.match(js, /window\.setInterval\(\(\) => \{[\s\S]*?featuredSpotlightActiveIndex \+ 1[\s\S]*?\}, 3800\)/);
  assert.match(css, /\.featured-spotlight-progress i\.is-running\s*\{[\s\S]*?3\.8s linear/);
  assert.match(js, /window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(css, /\.featured-spotlight-slide\[hidden\]\s*\{[\s\S]*?display:\s*none/);
  assert.match(css, /\.featured-spotlight-progress i\.is-running/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.featured-spotlight-slide/);
});

test("Spotlight keeps a stable frame and maps wheel gestures to horizontal company navigation", () => {
  assert.match(js, /addEventListener\("wheel", handleFeaturedSpotlightWheel, \{ passive: false \}\)/);
  assert.match(js, /const delta = Math\.abs\(event\.deltaX\) > Math\.abs\(event\.deltaY\) \? event\.deltaX : event\.deltaY/);
  assert.match(js, /event\.preventDefault\(\)/);
  assert.match(js, /featuredSpotlightActiveIndex \+ \(delta > 0 \? 1 : -1\)/);
  assert.match(css, /\.featured-spotlight-stage\s*\{[\s\S]*?height:\s*184px;[\s\S]*?min-height:\s*184px;/);
  assert.match(css, /@media \(min-width: 901px\)[\s\S]*?\.featured-spotlight\s*\{[\s\S]*?min-height:\s*372px;[\s\S]*?grid-template-rows:\s*auto 252px auto;/);
  assert.match(css, /@media \(min-width: 1121px\)[\s\S]*?\.program-hero-copy\s*\{[\s\S]*?translateX\(-22px\)[\s\S]*?\.hero-orbit\s*\{[\s\S]*?translateX\(-46px\)/);
});
