import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { sectorCompanyNames } from "../public/arena/sector-flywheel.js";

const arena = readFileSync("public/arena/arena.js", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");

test("sector flywheel maps only real companies in the selected multi-sector category", () => {
  const teams = [
    { id: 1, name: "Alpha", sector: "SaaS / Data Analytics" },
    { id: 2, name: "Beta", sector: "Healthcare, SaaS" },
    { id: 3, name: "Gamma", sector: "Advertising" },
    { id: 4, name: "alpha", sector: "SaaS" }
  ];

  assert.deepEqual(sectorCompanyNames(teams, "saas"), ["Alpha", "Beta"]);
  assert.deepEqual(sectorCompanyNames(teams, "Data Analytics"), ["Alpha"]);
  assert.deepEqual(sectorCompanyNames(teams, "Healthcare"), ["Beta"]);
});

test("community map reveals an accessible horizontal company flywheel on hover or focus", () => {
  assert.match(arena, /sectorCompanyNames\(hub\.teams \|\| \[\], sector\.name\)/);
  assert.match(arena, /class="sector-row" tabindex="0" role="group"/);
  assert.match(arena, /class="sector-flywheel-track"/);
  assert.match(arena, /class="sector-flywheel-set" role="list"/);
  assert.match(css, /\.sector-row:hover \.sector-flywheel[\s\S]*?max-height:\s*58px/);
  assert.match(css, /\.sector-row:focus-visible \.sector-flywheel/);
  assert.match(css, /animation:\s*sector-flywheel-roll/);
  assert.match(css, /@keyframes sector-flywheel-roll/);
});

test("reduced-motion users receive a stable company list without auto-scrolling", () => {
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.sector-flywheel-track[\s\S]*?animation:\s*none\s*!important/);
});
