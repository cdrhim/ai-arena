import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("public/arena/arena.css", "utf8");

function ruleBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] || "";
}

function nodeOffset(selector) {
  const block = ruleBlock(selector);
  const x = Number(block.match(/--node-x:\s*(-?[\d.]+)px/)?.[1]);
  const y = Number(block.match(/--node-y:\s*(-?[\d.]+)px/)?.[1]);
  return { x, y, radius: Math.hypot(x, y) };
}

test("login orbit markers are center-anchored instead of using unrelated edge offsets", () => {
  assert.match(css, /\.login-visual-node\s*\{[\s\S]*?left:\s*calc\(50% \+ var\(--node-x\)\);[\s\S]*?top:\s*calc\(50% \+ var\(--node-y\)\);[\s\S]*?transform:\s*translate\(-50%, -50%\);/);
  assert.doesNotMatch(ruleBlock(".login-visual-node-a"), /\b(?:left|right|top|bottom)\s*:/);
  assert.doesNotMatch(ruleBlock(".login-visual-node-b"), /\b(?:left|right|top|bottom)\s*:/);
  assert.doesNotMatch(ruleBlock(".login-visual-node-c"), /\b(?:left|right|top|bottom)\s*:/);
});

test("every static login marker center sits on the 112.5px outer orbit", () => {
  for (const selector of [".login-visual-node-a", ".login-visual-node-b", ".login-visual-node-c"]) {
    const point = nodeOffset(selector);
    assert.ok(Number.isFinite(point.radius));
    assert.ok(Math.abs(point.radius - 112.5) < 0.15, `${selector} radius ${point.radius} should align to 112.5px`);
  }
});

test("animated orbit marker is horizontally centered on the orbit stroke", () => {
  assert.match(css, /\.login-visual-orbit::after\s*\{[\s\S]*?left:\s*50%;[\s\S]*?top:\s*-5px;[\s\S]*?transform:\s*translateX\(-50%\);/);
});
