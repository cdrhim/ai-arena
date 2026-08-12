import assert from "node:assert/strict";
import test from "node:test";

import {
  curatedFeaturedTeams,
  FEATURED_EDITORIAL_CRITERIA,
  featuredCurationForTeam,
  featuredCurationUpdatedLabel,
  featuredEditorialFacts
} from "../public/arena/featured-curation.js";

test("featured curation is an explicit SparkLabs editorial list", () => {
  const teams = [
    { id: "random", name: "임의 프로필 회사" },
    { id: "crack", name: "(주)크랙더데이" },
    { id: "neander", name: "(주) 네안데르 / AC'SCENT" },
    { id: "gorocket", name: "(주)고로켓컴퍼니/Oing" },
    { id: "vivivava", name: "(주)비비바바(VIVIVAVA)/Hemogry (해먹으리)" }
  ];
  const featured = curatedFeaturedTeams(teams);

  assert.deepEqual(featured.map(({ team }) => team.id), ["neander", "gorocket", "vivivava", "crack"]);
  assert.equal(featuredCurationForTeam(teams[0]), null);
  assert.ok(featured.every(({ curation }) => curation.achievement && curation.sourceUrl && curation.verifiedAt));
  assert.ok(featured.every(({ curation }) => curation.hook && curation.appealKeywords.length === 3));
});

test("featured editorial facts expose only public milestone copy and fallback appeal keywords", () => {
  const facts = featuredEditorialFacts(["neander-acscent", "gorocket-oing"]);
  assert.deepEqual(facts.map((item) => item.id), ["neander-acscent", "gorocket-oing"]);
  assert.ok(facts.every((item) => item.company && item.achievement && item.hook && item.keywords.length === 3));
  assert.ok(facts.every((item) => !Object.hasOwn(item, "sourceUrl") && !Object.hasOwn(item, "aliases")));
});

test("featured editorial metadata communicates recency and non-personalization", () => {
  assert.match(featuredCurationUpdatedLabel(), /SPARKLABS OPERATIONS · VERIFIED 2026\.08\.11/);
  assert.ok(FEATURED_EDITORIAL_CRITERIA.includes("파트너별 개인화 아님"));
  assert.ok(FEATURED_EDITORIAL_CRITERIA.includes("최근 제품·고객·운영 성과"));
});
