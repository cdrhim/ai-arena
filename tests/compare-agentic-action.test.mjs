import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("public/arena/index.html", "utf8");
const css = readFileSync("public/arena/market.css", "utf8");
const js = readFileSync("public/arena/market.js", "utf8");

test("comparison action presents Spark AI as an agentic evidence analysis", () => {
  assert.match(html, /id="runCompareButton"[\s\S]*?sparkclaw-logo-blue\.png[\s\S]*?Spark AI 비교 분석[\s\S]*?Agentic comparison engine/);
  assert.match(html, /id="compareAgentNote"[\s\S]*?AGENTIC AI[\s\S]*?공개 프로필·역량 키워드·AI 적용 근거를 교차 분석해 핵심 차이를 계산합니다/);
  assert.match(css, /\.compare-agent-button \{[\s\S]*?linear-gradient[\s\S]*?box-shadow/);
  assert.match(css, /\.compare-agent-button\[aria-busy="true"\] \.compare-agent-button-mark[\s\S]*?compare-agent-mark-pulse/);
});

test("comparison states consistently use Spark AI agentic language", () => {
  assert.equal((js.match(/AGENTIC COMPARISON/g) || []).length, 3);
  assert.match(js, /에이전트 분석 중/);
  assert.match(js, /Spark AI 분석 실행 시 생성/);
  assert.match(js, /Spark AI 분석 완료/);
  assert.doesNotMatch(js, /비교 업데이트로 생성/);
});
