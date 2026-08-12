import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync("public/arena/arena.js", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");

test("profile health exposes missing team names on hover and keyboard focus", () => {
  assert.match(client, /Array\.isArray\(item\.missingTeams\)/);
  assert.match(client, /아직 입력하지 않은 팀/);
  assert.match(client, /class="health-row\$\{missingTeams\.length \? " has-missing"/);
  assert.match(client, /tabindex="0" aria-describedby/);
  assert.match(client, /class="health-missing-tooltip" role="tooltip"/);
  assert.match(client, /missingTeams\.map\(\(teamName\) => `<li>\$\{escapeHtml\(teamName\)\}<\/li>`/);
  assert.match(css, /\.health-row\.has-missing:hover \.health-missing-tooltip/);
  assert.match(css, /\.health-row\.has-missing:focus \.health-missing-tooltip/);
});

test("long missing-team lists stay readable without overflowing the page", () => {
  assert.match(css, /\.health-missing-tooltip\s*\{[\s\S]*?max-height:\s*290px;[\s\S]*?overflow:\s*auto/);
  assert.match(css, /\.health-missing-tooltip ul\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.health-missing-tooltip ul[\s\S]*?grid-template-columns:\s*1fr/);
});
