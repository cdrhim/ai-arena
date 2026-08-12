import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const js = readFileSync("public/arena/arena.js", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");

test("Editorial Spotlight shuffles its display order once per access dataset", () => {
  assert.match(js, /function randomizedFeaturedSpotlightEntries\(entries\)/);
  assert.match(js, /const orderKey = safeEntries\.map\([\s\S]*?\.sort\(\)\.join\("\|"\)/);
  assert.match(js, /for \(let index = shuffledIds\.length - 1; index > 0; index -= 1\)/);
  assert.match(js, /Math\.floor\(Math\.random\(\) \* \(index \+ 1\)\)/);
  assert.match(js, /shuffledIds\.join\("\|"\) === previousOrder\.join\("\|"\)[\s\S]*?shuffledIds\.push\(shuffledIds\.shift\(\)\)/);
  assert.match(js, /localStorage\.setItem\(FEATURED_SPOTLIGHT_ORDER_KEY, JSON\.stringify\(ids\)\)/);
  assert.match(js, /if \(orderKey !== featuredSpotlightOrderKey\)/);
  assert.match(js, /featuredSpotlightOrderKey = "";[\s\S]*?featuredSpotlightOrderIds = \[\]/);
});

test("Spotlight highlights one company at a time and pauses for direct hover or focus", () => {
  assert.match(js, /data-spotlight-index="\$\{index\}"/);
  assert.match(js, /button\.addEventListener\("pointerenter", \(\) => \{[\s\S]*?stopFeaturedSpotlightRotation\(\);[\s\S]*?setFeaturedSpotlightActive/);
  assert.match(js, /button\.addEventListener\("focus", \(\) => \{[\s\S]*?setFeaturedSpotlightActive/);
  assert.match(js, /window\.setInterval\(\(\) => \{[\s\S]*?featuredSpotlightActiveIndex \+ 1[\s\S]*?\}, 2800\)/);
  assert.match(js, /window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(css, /\.featured-spotlight-bubble\.is-spotlight-active \{[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*translateY\(-3px\) scale\(1\.025\) rotateX\(1deg\)/);
  assert.match(css, /\.has-spotlight-active \.featured-spotlight-bubble:not\(\.is-spotlight-active\) \{\s*opacity:\s*0\.72;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.featured-spotlight-bubble \{\s*transition:\s*none !important;/);
});
