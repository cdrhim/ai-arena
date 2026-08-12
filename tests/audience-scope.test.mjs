import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  audienceScopeLabel,
  audienceScopeOptionsForRole,
  canViewAudienceScope,
  canonicalAudienceScope
} from "../public/arena/audience-scope.js";

test("site audience policy exposes only Public and Private publishing choices", () => {
  assert.deepEqual(audienceScopeOptionsForRole("member").map((option) => option.value), ["public", "members_only"]);
  assert.deepEqual(audienceScopeOptionsForRole("sparklabs").map((option) => option.value), ["public", "members_only"]);
  assert.deepEqual(audienceScopeOptionsForRole("b2b_partner").map((option) => option.value), ["public"]);
  assert.deepEqual(audienceScopeOptionsForRole("human_validator").map((option) => option.value), ["public"]);
});

test("Public includes approved industry partners while Private excludes them", () => {
  assert.equal(canViewAudienceScope("public", "member"), true);
  assert.equal(canViewAudienceScope("public", "b2b_partner"), true);
  assert.equal(canViewAudienceScope("public", "public"), false);
  assert.equal(canViewAudienceScope("members_only", "member"), true);
  assert.equal(canViewAudienceScope("members_only", "sparklabs"), true);
  assert.equal(canViewAudienceScope("members_only", "b2b_partner"), false);
  assert.equal(canViewAudienceScope("members_only", "human_validator"), false);
});

test("legacy partner-only content maps to Public labels without changing staff-only policy", () => {
  assert.equal(canonicalAudienceScope("partners_only"), "public");
  assert.equal(audienceScopeLabel("partners_only"), "PUBLIC");
  assert.equal(audienceScopeLabel("members_only"), "PRIVATE");
});

test("Community and Bounty forms explain the same two audience scopes", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  assert.match(html, /Public · SparkClaw 산업 파트너 포함/);
  assert.match(html, /Private · 부트캠프 멤버 \+ SparkLabs/);
  assert.doesNotMatch(html, /Public · Arena 회원과 기업 파트너/);
  assert.doesNotMatch(html, /value="partners_only"|value="staff_only"/);
});
