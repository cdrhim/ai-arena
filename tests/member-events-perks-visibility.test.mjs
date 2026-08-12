import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/arena/index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../public/arena/arena.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/arena/arena.css", import.meta.url), "utf8");

test("Claw members do not see Events & Perks navigation or Discover entry points", () => {
  assert.match(
    html,
    /data-page="calendar" data-nav-roles="b2b_partner,human_validator,sparklabs,admin"/
  );
  assert.equal((html.match(/data-hide-from-claw-member/g) || []).length, 4);
  assert.match(js, /const clawMemberViewer = role === "member"/);
  assert.match(js, /function isClawMemberViewer\(\)[\s\S]*?=== "member"/);
  assert.match(js, /element\.hidden = clawMemberViewer/);
  assert.match(html, /id="memberPerkRequestForm"[\s\S]*?data-show-for-claw-member/);
  assert.match(js, /\[data-show-for-claw-member\][\s\S]*?element\.hidden = !clawMemberViewer/);
  assert.match(js, /clawMemberViewer[\s\S]*?기업 둘러보기[\s\S]*?: `<button[\s\S]*?혜택 확인/);
});

test("Claw member direct Events & Perks navigation returns to Discover", () => {
  assert.match(js, /isClawMemberViewer\(\) && \["calendar", "benefits"\]\.includes\(pageName\)/);
  assert.match(js, /Events & Perks는 기존 SparkClaw 프로그램 사이트에서 확인해 주세요\./);
});

test("member overview keeps a balanced two-column metric grid", () => {
  assert.match(css, /body\.is-claw-member #overviewPage > \.metric-grid\s*{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
