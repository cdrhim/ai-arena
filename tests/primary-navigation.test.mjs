import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("public/arena/index.html", "utf8");
const js = readFileSync("public/arena/arena.js", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");
const primaryNav = html.match(/<nav id="primaryNav"[\s\S]*?<\/nav>/)?.[0] || "";

test("every primary tab exposes an accessible child menu", () => {
  assert.equal((primaryNav.match(/data-nav-menu/g) || []).length, 5);
  assert.equal((primaryNav.match(/aria-haspopup="true"/g) || []).length, 5);
  assert.equal((primaryNav.match(/aria-expanded="false"/g) || []).length, 5);
  assert.equal((primaryNav.match(/role="menu"/g) || []).length, 5);
  assert.match(primaryNav, /Discover/);
  assert.match(primaryNav, /Community/);
  assert.match(primaryNav, /data-page="arena"[^>]*>Bounty<\/button>/);
  assert.match(primaryNav, /Events &amp; Perks/);
  assert.match(primaryNav, /My Log/);
});

test("dropdowns link every existing child surface and preserve staff permissions", () => {
  for (const page of [
    "overview",
    "advisors",
    "teams",
    "discover",
    "passports",
    "compare",
    "partnerships",
    "community",
    "calendar",
    "benefits",
    "workspace",
    "arena",
    "database"
  ]) {
    assert.match(primaryNav, new RegExp(`data-nav-page="${page}"`));
  }
  assert.match(primaryNav, /Company Directory/);
  assert.match(primaryNav, /data-nav-target="communityComposer"/);
  assert.match(primaryNav, /data-nav-target="communityFeedSection"/);
  assert.match(primaryNav, /data-nav-target="arenaBountyBoard"/);
  assert.match(primaryNav, /data-nav-target="bountyBriefPanel"/);
  assert.match(primaryNav, /data-nav-target="partnershipPipelinePanel"/);
  assert.match(primaryNav, /data-nav-target="myLogMatches"/);
  assert.match(primaryNav, /data-nav-target="myLogCommunity"/);
  assert.match(primaryNav, /data-nav-target="myLogBounties"/);
  assert.doesNotMatch(primaryNav, /Program Operations|data-nav-page="operations"/);
  assert.match(primaryNav, /data-nav-page="database" data-permission="canViewRawDatabase"/);
});

test("primary dropdowns support hover, keyboard navigation, and touch expansion", () => {
  assert.match(css, /\.nav-menu\.is-open > \.nav-dropdown/);
  assert.doesNotMatch(css, /\.nav-menu:is\(:hover, :focus-within, \.is-open\) > \.nav-dropdown/);
  assert.match(css, /transition: opacity 170ms ease, transform 190ms/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /\.nav-dropdown-link:focus-visible/);
  assert.match(js, /function bindPrimaryNavigation\(\)/);
  assert.match(js, /\(hover: none\), \(pointer: coarse\), \(max-width: 900px\)/);
  assert.match(js, /event\.key === "ArrowDown"/);
  assert.match(js, /event\.key === "Escape"/);
  assert.match(js, /setAttribute\("aria-expanded", String\(open\)\)/);
  assert.match(js, /closeMenus\(menu\);\s*setMenuOpen\(menu, true\)/);
  assert.match(js, /menu\.addEventListener\("mouseleave", \(\) => \{\s*if \(!compactNavigation\(\)\) setMenuOpen\(menu, false\)/);
  assert.match(js, /button\.hidden = !Boolean\(hub\.permissions\?\.\[button\.dataset\.permission\]\)/);
});

test("only the exact child destination is marked as the current navigation item", () => {
  assert.match(js, /function setCurrentNavigationItem\(pageName, target = ""\)/);
  assert.match(js, /button\.dataset\.navPage === pageName && \(button\.dataset\.navTarget \|\| ""\) === target/);
  assert.match(js, /showPage\(page, \{ navTarget: target \|\| "" \}\)/);
  assert.match(js, /button\.setAttribute\("aria-current", "page"\)/);
  assert.match(js, /button\.removeAttribute\("aria-current"\)/);
});
