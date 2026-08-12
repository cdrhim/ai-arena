import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const logoFiles = ["sparkplus.png", "wantedlab.png", "ab180.png", "flitto.png", "github.png"];

test("official benefit brand logos are square transparent PNG assets", () => {
  const pngSignature = "89504e470d0a1a0a";

  for (const fileName of logoFiles) {
    const image = readFileSync(`public/arena/assets/benefit-logos/${fileName}`);
    assert.equal(image.subarray(0, 8).toString("hex"), pngSignature, fileName);
    assert.equal(image.readUInt32BE(16), 512, `${fileName} width`);
    assert.equal(image.readUInt32BE(20), 512, `${fileName} height`);
    assert.equal(image[25], 6, `${fileName} must use RGBA color`);
  }
});

test("known benefit providers use local brand assets before database logo URLs", () => {
  const source = readFileSync("public/arena/arena.js", "utf8");

  assert.match(source, /\["스파크플러스", "\/arena\/assets\/benefit-logos\/sparkplus\.png"\]/);
  assert.match(source, /\["원티드랩", "\/arena\/assets\/benefit-logos\/wantedlab\.png"\]/);
  assert.match(source, /\["ab180", "\/arena\/assets\/benefit-logos\/ab180\.png"\]/);
  assert.match(source, /\["flitto", "\/arena\/assets\/benefit-logos\/flitto\.png"\]/);
  assert.match(source, /\["github", "\/arena\/assets\/benefit-logos\/github\.png"\]/);
  assert.match(source, /\["github for startups", "\/arena\/assets\/benefit-logos\/github\.png"\]/);
  assert.match(source, /const names = \[benefit\.provider, benefit\.title\]/);
  assert.match(source, /benefitBrandLogoUrl\(benefit\) \|\| benefit\.logoUrl/);
});
