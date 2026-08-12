import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("public/arena/index.html", "utf8");
const js = readFileSync("public/arena/arena.js", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");

test("Bounty is a top-level hub instead of a Workspace child", () => {
  assert.match(html, /data-page="arena"[^>]*>Bounty<\/button>/);
  assert.doesNotMatch(html, /<strong>AI Arena<\/strong><small>Bounty·평가·기회<\/small>/);
  assert.match(html, /data-nav-page="arena" data-nav-target="arenaBountyBoard"/);
  assert.match(html, /data-nav-page="partnerships" data-nav-target="bountyBriefPanel"/);
  assert.match(html, /data-nav-page="partnerships" data-nav-target="partnershipPipelinePanel"/);
  assert.match(js, /bountyNavigation \? "arena" : primaryPageFor\(pageName\)/);
  assert.match(js, /if \(\["operations", "database"\]\.includes\(pageName\)\) return "workspace"/);
});

test("Bounty hub connects sponsor, team, and operator workflows without duplicating forms", () => {
  assert.match(html, /id="bountyRolePaths"/);
  assert.match(html, /data-bounty-audience="sponsor"/);
  assert.match(html, /data-bounty-audience="builder"/);
  assert.match(html, /data-bounty-audience="operator"/);
  assert.equal((html.match(/id="bountyBriefForm"/g) || []).length, 1);
  assert.equal((html.match(/id="arenaCreateBountyForm"/g) || []).length, 1);
  assert.match(js, /function renderBountyRolePaths\(\)/);
  assert.match(js, /card\.classList\.toggle\("is-current", current\)/);
  assert.match(js, /button\.hidden = !\(sponsor \|\| staff\)/);
  assert.match(js, /button\.hidden = !staff/);
});

test("Bounty path cards stay readable and collapse to one column on narrow screens", () => {
  assert.match(css, /\.bounty-role-grid\s*\{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.bounty-role-grid article\.is-current/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.bounty-role-grid\s*\{[\s\S]*?grid-template-columns: 1fr/);
});
