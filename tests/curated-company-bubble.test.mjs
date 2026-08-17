import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("public/arena/index.html", "utf8");
const js = readFileSync("public/arena/market.js", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");

test("Curated Companies is an accessible Company Directory link with a stacked preview", () => {
  assert.match(html, /id="curatedCompaniesCard"[^>]*tabindex="0"[^>]*role="link"[^>]*data-market-page="teams"/);
  assert.match(html, /id="curatedCompanyStack"[^>]*class="curated-company-stack"/);
  assert.match(js, /curatedCompaniesCard\?\.addEventListener\("pointerenter", startCuratedCompanyPreview\)/);
  assert.match(js, /if \(!\["Enter", " "\]\.includes\(event\.key\)\) return;[\s\S]*?goPage\("teams"\)/);
});

test("Company preview stack draws five unique, safe candidates and reveals them in sequence", () => {
  assert.match(js, /function renderAll\(\) \{[\s\S]*?curatedCompanyPreviewCandidates = \(market\(\)\.startups \|\| \[\]\)\.filter\(isCuratedCompanyPreviewCandidate\)/);
  assert.match(js, /!\/\^test\(\?:\\s\|\$\)\/i\.test\(name\)/);
  assert.match(js, /!\[[^\]]*"unclassified"\]\.includes\(category\.toLocaleLowerCase\(\)\)/);
  assert.match(js, /curatedCompanyPreviewStack = pickCuratedCompanyPreviewCards\(5\)/);
  assert.match(js, /const pool = \[\.\.\.curatedCompanyPreviewCandidates\]/);
  assert.match(js, /pool\.splice\(index, 1\)\[0\]/);
  assert.match(js, /const remainingKeys = new Set\(remaining\.map\(curatedCompanyPreviewKey\)\)/);
  assert.match(js, /window\.setInterval\(showRandomCuratedCompany, 1600\)/);
  assert.match(js, /classList\.add\("is-leaving"\)/);
  assert.match(js, /classList\.add\("is-settling"\)/);
  assert.match(js, /window\.setTimeout\([\s\S]*?, 240\)/);
  assert.match(js, /window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
});

test("Curated company cards fill the right side, fan in depth, reveal one card, and respect reduced motion", () => {
  assert.match(css, /\.curated-company-stack \{[\s\S]*?left:\s*clamp\(150px, 39%, 250px\)[\s\S]*?perspective:\s*760px/);
  assert.match(css, /\.curated-company-stack-card:nth-child\(5\) \{[\s\S]*?rotate\(-2\.2deg\) scale\(0\.86\)/);
  assert.match(css, /\.curated-company-stack\.is-revealing \.curated-company-stack-card:first-child \{[\s\S]*?translate3d\(54px, -66%, 70px\)/);
  assert.match(css, /\.curated-company-stack\.is-leaving \{[\s\S]*?opacity:\s*0;[\s\S]*?visibility:\s*visible/);
  assert.match(css, /\.curated-company-stack\.is-settling \.curated-company-stack-card:nth-child\(5\) \{[\s\S]*?opacity:\s*0;/);
  assert.match(css, /rgba\(11, 75, 137, 0\.97\), rgba\(43, 125, 207, 0\.96\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.curated-company-stack,[\s\S]*?\.curated-company-stack-card \{\s*transition:\s*none !important/);
});
