import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Spark AI discovery interface and result labels are Korean", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const arenaJs = readFileSync("public/arena/arena.js", "utf8");
  const communityJs = readFileSync("public/arena/community.js", "utf8");
  const source = [html, arenaJs, communityJs].join("\n");

  assert.match(html, /SPARK AI 기업 탐색/);
  assert.match(html, /어떤 AI 회사를 찾고 계신가요/);
  assert.match(html, /Spark AI에게 묻기 →/);
  assert.match(arenaJs, /\["고객 연결",/);
  assert.match(arenaJs, /\["평가 도움",/);
  assert.match(communityJs, /<strong>추천 기업<\/strong>/);
  assert.match(communityJs, /Spark AI가 기업별 차별 근거를 정리했습니다/);
  assert.match(communityJs, /기업별 공개 프로필 차이를 기준으로 정리했습니다/);
  assert.doesNotMatch(
    source,
    /Recommended companies|Profile evidence review|AI-assisted evidence review|Ask Spark AI|Customer intro|Evaluation help|Manufacturing vision|Document workflow|Developer tools|What kind of company are you looking for/i
  );
});

test("discovery errors shown to users are mapped to Korean", () => {
  const source = readFileSync("public/arena/community.js", "utf8");
  assert.match(source, /function discoveryErrorMessage/);
  assert.match(source, /기업 추천을 이용하려면 로그인이 필요합니다/);
  assert.match(source, /기업 추천 요청이 많습니다/);
  assert.match(source, /if \(!response\.ok\) throw new Error\(discoveryErrorMessage\(response\.status\)\)/);
});
