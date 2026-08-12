import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../public/arena/arena.css", import.meta.url), "utf8");

test("partner heading wraps from its own available width before text becomes a narrow column", () => {
  assert.match(css, /\.partner-profile-heading,[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(css, /\.partner-profile-heading\s*>\s*div,[\s\S]*?flex:\s*1 1 280px/);
  assert.match(css, /\.partner-profile-heading\s+h2\s*\{[\s\S]*?word-break:\s*keep-all/);
  assert.match(css, /\.partner-profile-label\s*\{[\s\S]*?max-width:\s*100%/);
});

test("mobile partner profile uses one readable column and bounded spacing", () => {
  const mobile = css.slice(css.indexOf("@media (max-width: 640px)"), css.indexOf(".metric-card", css.indexOf("@media (max-width: 640px)")));
  assert.match(mobile, /\.partner-profile-heading,[\s\S]*?flex-direction:\s*column/);
  assert.match(mobile, /\.partner-profile-summary,[\s\S]*?padding:\s*24px/);
  assert.match(mobile, /\.partner-profile-facts\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});
