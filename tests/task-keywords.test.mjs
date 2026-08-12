import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { searchableTaskKeywords, taskKeywords, TASK_KEYWORD_PENDING } from "../public/arena/task-keywords.js";

test("task taxonomy translates technology profiles into work outcomes", () => {
  const tasks = taskKeywords({
    serviceSummary: "제조 공장의 비전 검사로 불량을 검출하고 MES 데이터를 연결해 생산 공정을 최적화합니다.",
    functions: ["컴퓨터 비전", "API 연동", "스마트 팩토리"]
  }, 6);
  assert.ok(tasks.includes("품질 검사"));
  assert.ok(tasks.includes("생산 공정 최적화"));
  assert.ok(tasks.includes("API·시스템 연동"));
});

test("task taxonomy distinguishes customer, document, and inventory work", () => {
  assert.deepEqual(taskKeywords({ description: "계약서 OCR 문서 검토 자동화" }, 2), ["문서 검토·정보 추출"]);
  assert.ok(taskKeywords({ description: "콜센터 고객 상담과 문의 자동화" }).includes("고객 문의·상담 자동화"));
  assert.ok(taskKeywords({ description: "수요 예측과 SKU 재고 최적화" }).includes("수요·재고 예측"));
});

test("sparse profiles stay explicit instead of receiving an invented task", () => {
  assert.deepEqual(taskKeywords({ name: "Unknown Product" }), [TASK_KEYWORD_PENDING]);
  assert.deepEqual(searchableTaskKeywords({ name: "Unknown Product" }), []);
});

test("Task-driven Search exposes tasks while Company Directory keeps them out of cards", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const market = readFileSync("public/arena/market.js", "utf8");
  const arena = readFileSync("public/arena/arena.js", "utf8");
  assert.match(html, /Task-driven Search[\s\S]*?업무·문제 기반 기업 검색/);
  assert.match(html, /TASK-DRIVEN COMPANY SEARCH/);
  assert.match(market, /function marketTeamCardMarkup[\s\S]*?taskKeywordMarkup\(startup, 4\)/);
  assert.match(market, /\["해결 Task", \(team\) => taskKeywords/);
  const directoryCard = arena.match(/function teamCardMarkup\(team\) \{[\s\S]*?^\}/m)?.[0] || "";
  assert.doesNotMatch(directoryCard, /해결 Task|task-keyword-block/);
  assert.match(arena, /<h2>해결하는 Task<\/h2>/);
});
