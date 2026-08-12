import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("public/arena/arena.css", "utf8");

test("hero planet orbit reserves enough inset for the full metric cards", () => {
  assert.match(css, /\.hero-orbit\s*\{[\s\S]*?min-height:\s*252px;[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.orbit-card\s*\{[\s\S]*?width:\s*146px;[\s\S]*?min-height:\s*94px;[\s\S]*?offset-path:\s*ellipse\(calc\(50% - 96px\) calc\(50% - 78px\) at 50% 47%\)/);
  assert.match(css, /\.orbit-card-main\s*\{[\s\S]*?width:\s*168px;[\s\S]*?min-height:\s*108px;/);
  assert.match(css, /@media \(max-width: 1120px\)[\s\S]*?\.hero-orbit\s*\{[\s\S]*?min-height:\s*252px;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.orbit-card,[\s\S]*?offset-path:\s*none;/);
});
