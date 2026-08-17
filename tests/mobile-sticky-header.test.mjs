import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const css = await readFile(new URL("public/arena/arena.css", root), "utf8");

test("the complete two-row mobile header stays together while the page scrolls", () => {
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?:root\s*\{[\s\S]*?--header-height:\s*126px/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.app-header\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*0;[\s\S]*?grid-template-columns:\s*1fr auto;/);
  assert.doesNotMatch(css, /@media \(max-width: 900px\)[\s\S]*?\.app-header\s*\{[^}]*position:\s*static;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?:root\s*\{[\s\S]*?--header-height:\s*120px/);
});
