import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("public/arena/index.html", root), "utf8");
const css = await readFile(new URL("public/arena/arena.css", root), "utf8");
const overview = html.slice(html.indexOf('<section id="overviewPage"'), html.indexOf('<section id="discoverPage"'));
const advisors = html.slice(html.indexOf('<section id="advisorsPage"'), html.indexOf('<section id="teamsPage"'));

test("Global Advisors and Faculty is a separate Discover page with all six supplied leaders", () => {
  assert.match(html, /data-nav-page="advisors"[^>]*><strong>Global Advisors &amp; Faculty<\/strong>/);
  assert.match(advisors, /id="advisorsPage"[^>]*data-page-panel="advisors" hidden/);
  assert.match(advisors, /id="globalAdvisors"[^>]*aria-labelledby="globalAdvisorsTitle"/);
  assert.match(advisors, /id="globalAdvisorsTitle">Global Advisors &amp; Faculty/);
  assert.doesNotMatch(overview, /id="globalAdvisors"/);
  assert.equal((advisors.match(/class="global-advisor-card" data-advisor=/g) || []).length, 6);
  for (const name of ["Brian Behlendorf", "Lili Cheng", "Amr Awadallah", "Tim Draper", "Sang Cha", "Paul Feng"]) {
    assert.match(advisors, new RegExp(`>${name}<`));
  }
  assert.match(advisors, /global-advisor-role is-faculty">Senior Faculty/);
});

test("advisor portraits use the supplied slides and remain accessible by name", async () => {
  const assets = [
    new URL("public/arena/assets/advisors/global-advisors-source-01.png", root),
    new URL("public/arena/assets/advisors/global-advisors-source-02.png", root)
  ];
  for (const asset of assets) assert.ok((await stat(asset)).size > 100_000);
  assert.equal((advisors.match(/class="global-advisor-portrait[^>]*role="img" aria-label=/g) || []).length, 6);
  assert.match(css, /global-advisors-source-01\.png/);
  assert.match(css, /global-advisors-source-02\.png/);
});

test("portrait crops use fixed slide pixels so every face stays aligned across layouts", () => {
  const expectedPositions = {
    brian: "-47px -181px",
    lili: "-382px -181px",
    amr: "-711px -181px",
    tim: "-65px -182px",
    sang: "-387px -182px",
    paul: "-713px -182px"
  };
  for (const [name, position] of Object.entries(expectedPositions)) {
    assert.match(css, new RegExp(`\\.global-advisor-portrait\\.is-${name}[^\\n]*background-position: ${position.replaceAll("-", "\\-")}`));
  }
  assert.doesNotMatch(css, /global-advisor-portrait\.is-[^\n]*background-position:\s*calc\(/);
});

test("advisor cards use three, two, and swipeable mobile layouts without a long phone stack", () => {
  assert.match(css, /\.global-advisors-grid\s*\{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*?\.global-advisors-grid\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.global-advisors-grid\s*\{[\s\S]*?display: flex;[\s\S]*?overflow-x: auto;[\s\S]*?scroll-snap-type: x mandatory/);
  assert.match(css, /\.global-advisor-card\s*\{[\s\S]*?scroll-snap-align: start/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.global-advisor-card/);
});
