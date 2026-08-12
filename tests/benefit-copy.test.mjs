import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { plainBenefitText, summarizeBenefit } from "../public/arena/benefit-copy.js";

test("rich benefit markup becomes plain readable text", () => {
  assert.equal(
    plainBenefitText("<ul><li><p>첫 번째 &amp; 조건</p></li><li>두 번째 조건</li></ul><p></p>"),
    "첫 번째 & 조건 · 두 번째 조건"
  );
  assert.equal(plainBenefitText("&lt;ul&gt;&lt;li&gt;인코딩된 조건&lt;/li&gt;&lt;/ul&gt;"), "인코딩된 조건");
  assert.equal(plainBenefitText("<script>alert(1)</script><p>안전한 혜택</p>"), "안전한 혜택");
});

test("GitHub rich copy is rewritten as a concise natural Korean summary", () => {
  const summary = summarizeBenefit({
    provider: "Github",
    value: "<ul><li><p>최대 12개월간 $10,000 상당의 Credit</p></li></ul><p></p>",
    description: "<p>최대 12개월간 $10,000 상당의 Credit</p><ul><li>Series B 이하 기업</li><li>GitHub for Startups 파트너 관계 필요</li></ul>"
  });

  assert.equal(
    summary,
    "최대 12개월간 미화 10,000달러 상당의 GitHub 크레딧 · 시리즈 B 이하 기업 · GitHub for Startups 파트너 관계 필요"
  );
  assert.doesNotMatch(summary, /<\/?(?:ul|li|p)\b/iu);
});

test("quantified value and eligibility facts are retained while duplicate and boilerplate copy is removed", () => {
  const summary = summarizeBenefit({
    provider: "원티드랩",
    value: "(택 1) 1) 채용건당 150만원 (계약후 6개월간) 2) 26년 8월 기준 정액제 상품 10% 할인",
    description: "<p>채용 건당 150만원 (계약 후 6개월간)</p><p>최종 선정팀 Scaler</p><p>세부 자격은 운영진 확인 후 안내합니다.</p>"
  });

  assert.equal(
    summary,
    "둘 중 하나 선택: 채용 건당 150만원 (계약 후 6개월간) · 2026년 8월 기준 정액제 상품 10% 할인 · 최종 선정된 Scaler 팀 대상"
  );
});

test("Sparkplus office credits are rewritten as one concise Korean sentence", () => {
  const summary = summarizeBenefit({
    provider: "스파크플러스",
    value: "사무실 계약 시 회의실 이용 크레딧 추가 제공 (4인실 이하: 인당 10크레딧 5인실 이상: 인당 7크레딧)",
    description: "<p>세부 자격은 운영진 확인 후 안내합니다.</p>"
  });

  assert.equal(
    summary,
    "사무실 계약 시 회의실 이용 크레딧 추가 제공 (4인실 이하는 인당 10크레딧 · 5인실 이상은 인당 7크레딧)"
  );
});

test("all member benefit surfaces escape one normalized summary instead of raw fields", () => {
  const source = readFileSync("public/arena/arena.js", "utf8");
  assert.equal((source.match(/escapeHtml\(summarizeBenefit\(benefit\)\)/g) || []).length, 3);
  assert.match(source, /<p class="benefit-summary">\$\{escapeHtml\(summarizeBenefit\(benefit\)\)\}<\/p>/);
  assert.doesNotMatch(source, /<p class="benefit-value">\$\{escapeHtml\(benefit\.value/);
  assert.doesNotMatch(source, /benefit\.eligibility\.map\(\(item\) => `<li>/);
});
