import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("public/arena/market.css", "utf8");
const js = readFileSync("public/arena/market.js", "utf8");

test("comparison reserves one fixed dimension column and equal company columns", () => {
  assert.match(css, /\.comparison-table \{[\s\S]*?table-layout:\s*fixed;/);
  assert.match(css, /\.comparison-dimension-column \{\s*width:\s*170px;/);
  assert.match(css, /\.comparison-company-column \{\s*width:\s*auto;/);
  assert.match(js, /const companyColumns = teams\.map\(\(\) => `<col class="comparison-company-column">`\)\.join\(""\);/);
  assert.match(js, /<colgroup><col class="comparison-dimension-column">\$\{companyColumns\}<\/colgroup>/);
});

test("long comparison copy wraps inside its equal-width company cell", () => {
  assert.match(css, /\.comparison-table th,\s*\.comparison-table td \{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?word-break:\s*keep-all;/);
});
