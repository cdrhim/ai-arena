import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("public/arena/arena.css", "utf8");

test("SPARK orchestrator core reserves separate readable rows", () => {
  assert.match(css, /\.brief-agent-core\s*\{[\s\S]*?width:\s*112px;[\s\S]*?height:\s*112px;[\s\S]*?grid-template-rows:\s*auto auto auto;[\s\S]*?gap:\s*4px;/);
  assert.match(css, /\.brief-agent-core img\s*\{[\s\S]*?width:\s*32px;[\s\S]*?height:\s*32px;/);
  assert.match(css, /\.brief-agent-core strong\s*\{[\s\S]*?line-height:\s*1;/);
  assert.match(css, /\.brief-agent-core small\s*\{[\s\S]*?line-height:\s*1;[\s\S]*?white-space:\s*nowrap;/);
});

test("compact layouts keep the core large enough for its Korean label", () => {
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.brief-agent-core\s*\{[\s\S]*?width:\s*96px;[\s\S]*?height:\s*96px;[\s\S]*?gap:\s*3px;/);
});
