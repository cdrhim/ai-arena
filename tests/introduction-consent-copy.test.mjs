import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sources = await Promise.all([
  "../public/arena/index.html",
  "../public/arena/arena.js",
  "../public/arena/community.js",
  "../public/arena/market.js",
  "../netlify/lib/b2b-match-ai.mjs",
  "../netlify/lib/public-arena.mjs",
  "../netlify/functions/arena-public.mjs"
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

const [html, arenaJs, communityJs, marketJs, matchAi, publicArena, publicIntake] = sources;

test("recommendations open a profile and explain target-startup consent before introduction", () => {
  assert.match(communityJs, /기업 프로필 보기/);
  assert.doesNotMatch(communityJs, /기업 소개 보기/);
  assert.match(communityJs, /대상 스타트업이 My Log에서 요청을 승인한 뒤 SparkLabs가 소개/);
  assert.match(matchAi, /대상 스타트업에 협업 검토 요청/);
});

test("the introduction workflow records requester intent and waits for the receiving startup", () => {
  assert.match(html, /대상 스타트업 동의 후 소개/);
  assert.match(arenaJs, /요청을 보내면 소개 의사가 기록되고 상대 팀 My Log에 전달/);
  assert.match(arenaJs, /대상 스타트업의 동의가 확인되었습니다/);
  assert.match(marketJs, /대상 스타트업인 우리 팀이 승인한 뒤에만 SparkLabs가 연락처를 연결/);
  assert.match(marketJs, />소개 동의</);
});

test("public intake and member-access copy use the same receiving-startup consent policy", () => {
  assert.match(publicArena, /대상 스타트업이 동의한 경우에만 SparkLabs가 연결/);
  assert.match(publicIntake, /대상 스타트업이 My Log에서 요청을 승인한 경우에만 소개/);
  assert.doesNotMatch(sources.join("\n"), /양측(?:이 모두)? 동의/);
});
