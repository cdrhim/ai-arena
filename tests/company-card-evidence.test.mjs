import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { rankedTaskDetails, taskDetails } from "../public/arena/task-keywords.js";

test("기업 카드는 선발 상태 대신 현단계와 공개 가능한 검증 숫자를 사용한다", () => {
  const js = readFileSync("public/arena/arena.js", "utf8");
  assert.match(js, /<small>현단계<\/small>/);
  assert.match(js, /teamProgressSignals\(progress/);
  assert.match(js, /고객 인터뷰/);
  assert.match(js, /주간 리포트/);
  assert.doesNotMatch(js, /<span>프로필<\/span><strong>/);
  assert.doesNotMatch(js, /team\.status \? `<span class="status-tag">/);
});

test("기업 카드와 상세 화면은 팀 소개와 구체적인 Task 설명을 제공한다", () => {
  const js = readFileSync("public/arena/arena.js", "utf8");
  assert.match(js, /team-introduction-block/);
  assert.match(js, /해결 가능한 Task · 근거 순/);
  assert.match(js, /해결 가능한 모든 Task/);
  assert.match(js, /specialtyTasks/);
  assert.match(js, /공개 근거/);
  assert.match(js, /task-detail-list/);
  assert.doesNotMatch(js, /경력·학력·성과는 팀 제출 지원자료/);
  assert.doesNotMatch(js, /controlled-intro-note is-evidence/);

  const tasks = taskDetails({
    description: "계약서 OCR 문서 검토 자동화와 고객 상담을 지원하는 AI agent"
  }, 3);
  assert.ok(tasks.length >= 2);
  assert.ok(tasks.every((task) => task.label && task.description.length >= 20));
  assert.ok(tasks.some((task) => /계약서|문서/.test(task.description)));
});

test("Task-driven Search는 전체 공개 필드를 훑어 모든 Task를 근거 강도 순으로 정렬한다", () => {
  const tasks = rankedTaskDetails({
    item: "계약서 검토 에이전트",
    serviceSummary: "OCR로 계약서와 PDF 정보를 추출하고 CRM 후속 업무를 자동화합니다.",
    aiIdeaSummary: "RAG 기반 사내 검색과 API 시스템 연동",
    functions: ["Document AI", "Workflow Automation", "RAG", "API integration"],
    tags: ["Legal Tech"]
  }, 32);

  assert.ok(tasks.length >= 5);
  assert.deepEqual(tasks.map((task) => task.rank), tasks.map((_, index) => index + 1));
  assert.ok(tasks.some((task) => task.label === "문서 검토·정보 추출"));
  assert.ok(tasks.some((task) => task.label === "검색·지식 응답"));
  assert.ok(tasks.some((task) => task.label === "업무 워크플로 자동화"));
  assert.ok(tasks.some((task) => task.label === "API·시스템 연동"));
  assert.ok(tasks.every((task) => Array.isArray(task.basis)));
});

test("Task-driven Search 제목은 한글 단어를 중간에서 자르지 않는다", () => {
  const css = readFileSync("public/arena/market.css", "utf8");
  const headingRule = css.match(/\.market-page-head h1\s*\{[\s\S]*?\}/)?.[0] || "";
  assert.match(headingRule, /word-break:\s*keep-all/);
  assert.match(headingRule, /overflow-wrap:\s*normal/);
  assert.match(headingRule, /text-wrap:\s*balance/);
});

test("카드용 공개 집계는 Program Supabase 원문과 연락처를 포함하지 않는다", () => {
  const server = readFileSync("netlify/lib/program-hub.mjs", "utf8");
  assert.match(server, /publicProgressSignals/);
  assert.match(server, /teamSize/);
  assert.match(server, /weeklyReportInterviews/);
  assert.doesNotMatch(server, /publicProgressSignals[\s\S]{0,900}content:/);
  assert.doesNotMatch(server, /publicProgressSignals[\s\S]{0,900}email:/);
});
