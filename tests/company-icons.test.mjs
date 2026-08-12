import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { companyIconKind, companyIconMarkup } from "../public/arena/company-icon.js";

const marketJs = await readFile(new URL("../public/arena/market.js", import.meta.url), "utf8");
const marketCss = await readFile(new URL("../public/arena/market.css", import.meta.url), "utf8");

test("company icons follow each profile's industry and service content", () => {
  assert.equal(companyIconKind({ category: "Fashion/Design", description: "AI 패션 디자인 솔루션" }), "fashion");
  assert.equal(companyIconKind({ category: "Healthcare/Medicaltech", functions: ["헬스케어", "문서 AI"] }), "health");
  assert.equal(companyIconKind({ category: "Advertising/Adtech", tags: ["푸드테크", "마케팅"] }), "marketing");
  assert.equal(companyIconKind({ category: "SaaS", functions: ["AI 에이전트", "Workflow Automation"] }), "saas");
  assert.equal(companyIconKind({ category: "Robotics/Mobility", description: "제조 로봇" }), "robotics");
});

test("company cards render semantic SVG icons instead of legal-name fragments", () => {
  const markup = companyIconMarkup({ name: "(주)네안데르", category: "Fashion/Design" });
  assert.match(markup, /data-company-icon="fashion"/);
  assert.match(markup, /aria-label="패션·디자인 아이콘"/);
  assert.match(markup, /<svg/);
  assert.doesNotMatch(markup, /\(주\)|네안|㈜/);
  assert.equal((marketJs.match(/companyIconMarkup\(/g) || []).length, 6);
  assert.doesNotMatch(marketJs, /function initials\(|initials\(startup\.name\)|initials\(team\.name\)/);
});

test("icon system keeps a consistent frame with category-specific colors", () => {
  assert.match(marketCss, /\.market-team-icon svg[\s\S]*?stroke: currentColor/);
  for (const kind of ["fashion", "health", "marketing", "education", "analytics", "robotics", "finance", "security", "climate", "commerce", "saas", "general"]) {
    assert.match(marketCss, new RegExp(`data-company-icon="${kind}"`));
  }
});
