import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isBenefitReadyForDisplay } from "../public/arena/benefit-visibility.js";

test("discussion-stage benefits are excluded across Korean spacing variants", () => {
  assert.equal(isBenefitReadyForDisplay({ provider: "AB180", value: "논의 중" }), false);
  assert.equal(isBenefitReadyForDisplay({ provider: "Flitto", value: "논의중" }), false);
  assert.equal(isBenefitReadyForDisplay({ provider: "ByteDance", description: "혜택 범위 협의 중" }), false);
  assert.equal(isBenefitReadyForDisplay({ provider: "Partner", eligibility: ["최종 제공 조건 협의중"] }), false);
  assert.equal(isBenefitReadyForDisplay({ provider: "Partner", value: "Under discussion" }), false);
});

test("confirmed benefit copy remains displayable", () => {
  assert.equal(
    isBenefitReadyForDisplay({
      title: "스파크플러스 오피스 혜택",
      value: "사무실 계약 시 회의실 이용 크레딧 제공",
      description: "세부 자격은 운영진 확인 후 안내합니다."
    }),
    true
  );
});

test("every member-facing benefit surface uses the discussion-stage filter", () => {
  const source = readFileSync("public/arena/arena.js", "utf8");
  assert.ok((source.match(/isBenefitReadyForDisplay/g) || []).length >= 7);
  assert.match(source, /\.filter\(isBenefitReadyForDisplay\)/);
  assert.doesNotMatch(source, /benefitConfigSelect/);
});
