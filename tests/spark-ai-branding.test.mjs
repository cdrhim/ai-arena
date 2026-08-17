import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { brandSafeDisplayText, escapeHtml } from "../public/arena/sanitize.js";

const providerPattern = new RegExp(["g", "e", "m", "i", "n", "i"].join(""), "iu");

test("public Arena actions use Clawee branding", () => {
  const files = readdirSync("public/arena", { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:html|js|css)$/iu.test(entry.name))
    .map((entry) => `public/arena/${entry.name}`);
  const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, providerPattern);
  assert.match(source, /클로이가 제목·채널·공개 범위를 제안했습니다/);
  assert.match(source, /Clawee 클로이에게 물어보기/);
  assert.doesNotMatch(source, /Spark AI|SPARK AI/iu);
  assert.doesNotMatch(source, /SPARK AI\s+ASSIST(?:ANT|ED)/iu);
  assert.doesNotMatch(source, /member-star/iu);
});

test("external profile copy cannot reintroduce provider branding into rendered HTML", () => {
  const providerName = ["G", "e", "m", "i", "n", "i"].join("");
  assert.equal(brandSafeDisplayText(`${providerName} Vision 기반`), "Google AI Vision 기반");
  assert.equal(escapeHtml(`<b>${providerName}-assisted</b>`), "&lt;b&gt;Google AI-assisted&lt;/b&gt;");
});
