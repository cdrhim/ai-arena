import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("public/arena/index.html", root), "utf8");
const js = await readFile(new URL("public/arena/arena.js", root), "utf8");
const css = await readFile(new URL("public/arena/arena.css", root), "utf8");

test("authenticated SparkClaw viewers get a safe Arena and Welcome site switcher", () => {
  assert.doesNotMatch(html, /id="ecosystemSwitcherToggle"/);
  assert.match(html, /id="homeButton"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*aria-controls="ecosystemSwitcherMenu"/);
  assert.match(html, /id="ecosystemSwitcherMenu"[^>]*role="menu"[^>]*hidden/);
  assert.match(
    html,
    /href="https:\/\/sparkclaw-welcome\.vercel\.app\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/
  );
  assert.match(html, /sparkclaw-logo\.png[^>]*alt=""/);
  assert.match(html, /SparkClaw Welcome[\s\S]*?프로그램 일정 · Weekly Report · 운영/);
});

test("the switcher is limited to Claw Members and SparkLabs administrators", () => {
  assert.match(js, /const canSwitchSparkClawSites = clawMemberViewer \|\| adminViewer/);
  assert.match(js, /ecosystemSwitcher\?\.classList\.toggle\("is-enabled", canSwitchSparkClawSites\)/);
  assert.match(js, /if \(!canSwitchSparkClawSites\) setEcosystemSwitcherOpen\(false\)/);
  assert.match(js, /function showPublicBriefGate[\s\S]*?ecosystemSwitcher\?\.classList\.remove\("is-enabled"\)/);
});

test("the icon-free pull-down supports hover, keyboard, outside-click, and responsive layout", () => {
  assert.match(js, /ecosystemSwitcher\?\.addEventListener\("pointerenter"[\s\S]*?setEcosystemSwitcherOpen\(true\)/);
  assert.match(js, /ecosystemSwitcher\?\.addEventListener\("focusin"[\s\S]*?setEcosystemSwitcherOpen\(true\)/);
  assert.match(js, /function handleEcosystemSwitcherKeydown[\s\S]*?"ArrowDown"[\s\S]*?"Escape"/);
  assert.match(js, /!event\.target\.closest\("#ecosystemSwitcher"\)[\s\S]*?setEcosystemSwitcherOpen\(false\)/);
  assert.doesNotMatch(css, /\.ecosystem-switcher-toggle/);
  assert.match(css, /\.ecosystem-switcher-item\.is-welcome\s*\{[\s\S]*?border-color:\s*transparent;/);
  assert.match(css, /\.ecosystem-switcher-item\.is-welcome:is\(:hover, :focus-visible, :active\)\s*\{[\s\S]*?border-color:\s*#f08a72;[\s\S]*?box-shadow:\s*0 0 0 2px rgba\(215, 63, 31, 0\.1\)/);
  assert.match(css, /\.ecosystem-switcher-menu\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*calc\(100% \+ 14px\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.ecosystem-switcher-menu\s*\{[\s\S]*?position:\s*fixed;/);
  assert.match(css, /prefers-reduced-motion:[\s\S]*?\.ecosystem-switcher-menu/);
});

test("the Arena wordmark and current-site item close the bubble and reload the clean landing page", () => {
  assert.match(js, /ecosystemHomeButton\?\.addEventListener\("click", \(\) => \{\s*reloadArenaLandingPage\(\);\s*\}\)/);
  assert.match(js, /homeButton\.addEventListener\("click", reloadArenaLandingPage\)/);
  assert.match(js, /function reloadArenaLandingPage\(\) \{[\s\S]*?setEcosystemSwitcherOpen\(false\)[\s\S]*?window\.location\.assign\(new URL\("\/arena\/", window\.location\.origin\)\.href\)/);
  assert.doesNotMatch(js, /homeButton\.addEventListener\("click"[\s\S]{0,500}?showPage\("overview"\)/);
});
