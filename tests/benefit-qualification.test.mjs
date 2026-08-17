import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  benefitMatchesQualification,
  benefitTargetQualifications,
  classifyBenefitForViewer,
  viewerBenefitQualification
} from "../public/arena/benefit-qualification.js";

test("benefits resolve program target qualifications from their stored tier", () => {
  assert.deepEqual(benefitTargetQualifications({ tier: "discoverer" }), ["discoverer"]);
  assert.deepEqual(benefitTargetQualifications({ tier: "validator" }), ["validator"]);
  assert.deepEqual(benefitTargetQualifications({ tier: "scaler" }), ["scaler"]);
  assert.deepEqual(benefitTargetQualifications({ tier: "Program benefit" }), ["all"]);
  assert.equal(benefitMatchesQualification({ tier: "Program benefit" }, "validator"), true);
  assert.equal(benefitMatchesQualification({ tier: "scaler" }, "discoverer"), false);
});

test("member benefits are classified from the linked team status and verified conditions", () => {
  const discoverer = viewerBenefitQualification({ group: "Discoverer" });
  assert.equal(discoverer, "discoverer");
  assert.equal(classifyBenefitForViewer({ tier: "discoverer", canApply: true }, discoverer).key, "eligible");
  assert.equal(classifyBenefitForViewer({ tier: "validator", canApply: true }, discoverer).key, "ineligible");
  assert.equal(classifyBenefitForViewer({ tier: "discoverer", verificationStatus: "pending" }, discoverer).key, "review");
  assert.equal(classifyBenefitForViewer({ tier: "discoverer", viewerApplication: { status: "approved" } }, discoverer).key, "progress");
});

test("operator and partner accounts without a linked team do not fail qualification rendering", () => {
  assert.equal(viewerBenefitQualification(null), "");
  assert.equal(viewerBenefitQualification(undefined), "");
  assert.equal(viewerBenefitQualification(""), "");
});

test("benefit page separates the partner catalog from member applications and operator filters", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const js = readFileSync("public/arena/arena.js", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");
  assert.match(html, /id="benefitQualificationFilterLabel" hidden/);
  assert.match(html, /id="benefitEligibilitySummary"/);
  assert.match(js, /function isPartnerBenefitCatalogViewer\(\)[\s\S]*?=== "b2b_partner"/);
  assert.match(js, /function isBenefitQualificationOperator\(\)[\s\S]*?canManageProgramActions/);
  assert.match(js, /파트너 신청 화면이 아닙니다/);
  assert.match(js, /partnerBenefitCatalogMarkup/);
  assert.match(js, /프로그램 제공 사례 · 신청은 Claw Member 대상/);
  assert.match(js, /memberBenefitGroupsMarkup/);
  assert.match(js, /operatorBenefitGroupsMarkup/);
  assert.match(css, /\.benefit-qualification-group/);
  assert.match(css, /\.benefit-catalog-context/);
});
