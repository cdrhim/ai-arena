import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/arena/index.html", import.meta.url), "utf8");
const client = await readFile(new URL("../public/arena/arena.js", import.meta.url), "utf8");

test("partner Events and Perks presents public milestones and an informational perk catalog", () => {
  assert.match(html, /8월 13일 OT 이후 공개 일정/);
  assert.match(html, /프로그램 파트너 제공 사례/);
  assert.match(client, /8월 13일 OT부터 이후 공개 주요 일정/);
  assert.match(client, /프로그램 파트너 혜택 카탈로그/);
  assert.match(client, /제공 사례 살펴보기 →/);
  assert.match(client, /파트너 신청 화면이 아닙니다/);
});
