import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("public/arena/arena.css", "utf8");

test("open dialogs lock the document behind the backdrop", () => {
  assert.match(css, /html:has\(dialog\[open\]\),\s*body:has\(dialog\[open\]\)\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?overscroll-behavior:\s*none;/);
  assert.match(css, /html\s*\{[\s\S]*?scrollbar-gutter:\s*stable;/);
});

test("dialog scrolling stays inside the white popup at both ends", () => {
  assert.match(css, /\.team-dialog\s*\{[\s\S]*?overscroll-behavior:\s*none;/);
  assert.match(css, /\.dialog-shell\s*\{[\s\S]*?overflow:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/);
  assert.match(css, /\.community-thread-dialog-shell\s*\{[\s\S]*?overscroll-behavior:\s*contain;/);
});
