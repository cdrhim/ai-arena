import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("public/arena/index.html", "utf8");

function pngSize(path) {
  const image = readFileSync(path);
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

test("AI Arena declares cache-busted favicon and touch icons", () => {
  assert.match(html, /rel="shortcut icon" href="\/favicon\.ico\?v=ai-arena-20260811"/);
  assert.match(html, /rel="icon" type="image\/png" sizes="64x64" href="\/favicon\.png\?v=ai-arena-20260811"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png\?v=ai-arena-20260811"/);
});

test("favicon assets are square brand images at their declared sizes", () => {
  assert.deepEqual(pngSize("public/favicon.png"), { width: 64, height: 64 });
  assert.deepEqual(pngSize("public/apple-touch-icon.png"), { width: 180, height: 180 });
  const ico = readFileSync("public/favicon.ico");
  assert.ok(ico.length > 1000);
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0]);
});
