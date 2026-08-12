import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("public/arena/index.html", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");

test("header wordmark cycles from SparkLabs to SparkClaw without changing width", () => {
  assert.match(html, /class="brand-name-prefix">Spark<\/span>/);
  assert.match(html, /class="brand-name-labs">Labs<\/span>/);
  assert.match(html, /class="brand-name-claw">Claw<\/span>/);
  assert.match(html, /aria-label="SparkLabs·SparkClaw AI Arena 홈"/);
  assert.match(css, /\.brand-name-suffix\s*\{[\s\S]*?display:\s*inline-grid;[\s\S]*?min-width:\s*2\.28em;[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /animation:\s*brand-labs-cycle 6\.4s/);
  assert.match(css, /animation:\s*brand-claw-cycle 6\.4s/);
});

test("wordmark loop keeps a stable Spark prefix and respects reduced motion", () => {
  assert.match(css, /@keyframes brand-labs-cycle/);
  assert.match(css, /@keyframes brand-claw-cycle/);
  assert.match(css, /@keyframes brand-suffix-scan/);
  assert.match(css, /\.brand-name-suffix::after\s*\{[\s\S]*?animation:\s*brand-suffix-scan 6\.4s/);
  const brandAnimationCss = css.match(/\.brand-name-suffix\s*\{[\s\S]*?@keyframes brand-suffix-scan\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(brandAnimationCss, /filter:\s*blur/i);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.brand-name-labs,[\s\S]*?\.brand-name-claw,[\s\S]*?animation:\s*none !important;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.brand-name-labs\s*\{[\s\S]*?opacity:\s*1 !important;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.brand-name-claw\s*\{[\s\S]*?opacity:\s*0 !important;/);
});
