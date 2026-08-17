import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { sectorCompanyNames } from "../public/arena/sector-flywheel.js";
import { taskMapEntries } from "../public/arena/task-map.js";

const arena = readFileSync("public/arena/arena.js", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");

test("sector flywheel maps only real companies in the selected multi-sector category", () => {
  const teams = [
    { id: 1, name: "Alpha", sector: "SaaS / Data Analytics" },
    { id: 2, name: "Beta", sector: "Healthcare, SaaS" },
    { id: 3, name: "Gamma", sector: "Advertising" },
    { id: 4, name: "alpha", sector: "SaaS" }
  ];

  assert.deepEqual(sectorCompanyNames(teams, "saas"), ["Alpha", "Beta"]);
  assert.deepEqual(sectorCompanyNames(teams, "Data Analytics"), ["Alpha"]);
  assert.deepEqual(sectorCompanyNames(teams, "Healthcare"), ["Beta"]);
});

test("task map aggregates concrete work outcomes across all teams without broad industry labels", () => {
  const entries = taskMapEntries([
    { name: "Alpha", sector: "SaaS", description: "계약서 OCR 문서 검토와 고객 상담 문의 자동화" },
    { name: "Beta", sector: "Adtech", description: "광고 캠페인 타깃과 마케팅 운영 최적화" },
    { name: "Gamma", sector: "Healthcare", description: "병원 환자 기록과 의료 운영 자동화" },
    { name: "Only Broad", sector: "SaaS" }
  ]);

  assert.ok(entries.some((entry) => entry.name === "문서 검토·정보 추출" && entry.companies.includes("Alpha")));
  assert.ok(entries.some((entry) => entry.name === "고객 문의·상담 자동화" && entry.companies.includes("Alpha")));
  assert.ok(entries.some((entry) => entry.name === "광고 타깃·캠페인 최적화" && entry.companies.includes("Beta")));
  assert.ok(entries.some((entry) => entry.name === "의료 기록·환자 운영" && entry.companies.includes("Gamma")));
  assert.ok(entries.every((entry) => !["SaaS", "Adtech", "Healthcare"].includes(entry.name)));
  assert.ok(entries.every((entry) => !entry.companies.includes("Only Broad")), "broad industry alone must not invent a Task");
});

test("community task map reveals an accessible horizontal company flywheel on hover or focus", () => {
  assert.match(arena, /taskMapEntries\(hub\.teams \|\| \[\], 12\)/);
  assert.match(arena, /class="sector-row" tabindex="0" role="group"/);
  assert.match(arena, /class="sector-flywheel-track"/);
  assert.match(arena, /class="sector-flywheel-set" role="list"/);
  assert.match(css, /\.sector-row:hover \.sector-flywheel[\s\S]*?max-height:\s*58px/);
  assert.match(css, /\.sector-row:focus-visible \.sector-flywheel/);
  assert.match(css, /animation:\s*sector-flywheel-roll/);
  assert.match(css, /@keyframes sector-flywheel-roll/);
});

test("reduced-motion users receive a stable company list without auto-scrolling", () => {
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.sector-flywheel-track[\s\S]*?animation:\s*none\s*!important/);
});
