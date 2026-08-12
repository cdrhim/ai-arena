import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("public/arena/arena.css", "utf8");

test("Discover key surfaces receive restrained mouse depth feedback", () => {
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /#overviewPage > \.agentic-discovery:hover[\s\S]*?scale\(1\.006\)/);
  assert.match(css, /#overviewPage > \.metric-grid > \.metric-card:hover[\s\S]*?scale\(1\.018\)/);
  assert.match(css, /#overviewPage \.featured-company-row:hover[\s\S]*?translateX\(4px\) scale\(1\.006\)/);
  assert.match(css, /#overviewPage \.benefit-mini:hover/);
  assert.match(css, /#overviewPage \.agentic-result-card:hover/);
});

test("Discover hover motion stays scoped and respects reduced-motion users", () => {
  assert.doesNotMatch(css, /(?:^|\n)\.panel:hover\s*\{/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?#overviewPage > \.agentic-discovery,[\s\S]*?transform:\s*none !important;[\s\S]*?transition:\s*none !important;/);
});
