import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("public/arena/arena.css", "utf8");

test("Arena principle cards float with independent timing and preserved depth", () => {
  assert.match(css, /\.arena-principles article \{[\s\S]*?arena-principle-float var\(--principle-float-duration\) ease-in-out var\(--principle-float-delay\) infinite/);
  assert.match(css, /\.arena-principles article:nth-child\(2\) \{[\s\S]*?--principle-base-y:\s*-18px[\s\S]*?--principle-float-duration:\s*7\.1s[\s\S]*?--principle-float-delay:\s*-4\.6s/);
  assert.match(css, /\.arena-principles article:nth-child\(3\) \{[\s\S]*?--principle-float-duration:\s*5\.8s[\s\S]*?--principle-float-delay:\s*-2\.7s/);
  assert.match(css, /@keyframes arena-principle-float[\s\S]*?var\(--principle-base-y\)[\s\S]*?calc\(var\(--principle-base-y\) \+ var\(--principle-float-y\)\)/);
});

test("Arena principles highlight the 01 to 03 direction in a restrained sequence", () => {
  assert.match(css, /\.arena-principles::after \{[\s\S]*?animation:\s*arena-principle-progress 6s linear infinite/);
  assert.match(css, /\.arena-principles article \{[\s\S]*?--principle-sequence-delay:\s*0s/);
  assert.match(css, /\.arena-principles article:nth-child\(2\) \{[\s\S]*?--principle-sequence-delay:\s*2s/);
  assert.match(css, /\.arena-principles article:nth-child\(3\) \{[\s\S]*?--principle-sequence-delay:\s*4s/);
  assert.match(css, /\.arena-principles article::before \{[\s\S]*?radial-gradient\(circle at 50% 46%[\s\S]*?animation:\s*arena-principle-breathe 6s ease-in-out var\(--principle-sequence-delay\) infinite/);
  assert.match(css, /\.arena-principles article:hover \{[\s\S]*?scale:\s*1\.02/);
  assert.match(css, /@keyframes arena-principle-stage[\s\S]*?border-color:\s*rgba\(105, 218, 255, 0\.58\)/);
  assert.match(css, /@keyframes arena-principle-progress[\s\S]*?transform:\s*translateX\(586%\)/);
  assert.match(css, /@keyframes arena-principle-breathe[\s\S]*?opacity:\s*0\.14[\s\S]*?opacity:\s*0\.72/);
  assert.match(css, /@keyframes arena-principle-pulse/);
});

test("Arena principle motion is restrained on small screens and for reduced motion", () => {
  assert.match(css, /\.arena-principles article,\s*\.arena-principles article:nth-child\(2\) \{\s*min-height:\s*120px;\s*transform:\s*none;\s*animation:\s*none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.arena-principles article,[\s\S]*?animation:\s*none !important/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.arena-principles article::before,[\s\S]*?animation:\s*none !important/);
});
