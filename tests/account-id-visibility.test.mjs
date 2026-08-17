import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("public/arena/arena.css", "utf8");
const client = readFileSync("public/arena/arena.js", "utf8");

test("desktop header shows the complete signed-in account id without ellipsis", () => {
  const accountRule = css.match(/\.account-copy strong,\s*\.account-copy small\s*\{(?<body>[\s\S]*?)\}/u)?.groups?.body || "";
  assert.match(accountRule, /max-width:\s*none/u);
  assert.match(accountRule, /text-overflow:\s*clip/u);
  assert.doesNotMatch(accountRule, /ellipsis/u);
  assert.match(client, /accountName\.title = organizationName \? `\$\{organizationName\} · \$\{email\}` : email/u);
  assert.match(client, /로그인 계정 \$\{email\}/u);
});

test("account text remains protected only at the genuinely narrow header breakpoint", () => {
  assert.doesNotMatch(css, /@media \(max-width:\s*1320px\)[\s\S]{0,120}\.account-copy\s*\{\s*display:\s*none/u);
  assert.match(css, /@media \(max-width:\s*1180px\)[\s\S]*?\.account-copy\s*\{\s*display:\s*none/u);
});
