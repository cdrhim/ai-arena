import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import communityHighlightsApi from "../netlify/functions/community-highlights.mjs";
import { polishCommunityHighlights } from "../netlify/lib/community-highlights.mjs";
import { communityHighlightItems, communityHighlightsForViewer } from "../public/arena/featured-news.js";

const fallbackItems = communityHighlightItems({
  events: [{ id: "event-1", title: "엄익진", date: "2026-08-12", time: "14:00", location: "SparkLabs" }],
  benefits: [{
    id: "perk-1",
    provider: "스파크플러스",
    title: "스파크플러스 오피스 혜택",
    value: "<ul><li><p>사무실 계약 시 회의실 이용 크레딧 추가 제공<br>4인실 이하: 인당 10크레딧<br>5인실 이상: 인당 7크레딧</p></li></ul>",
    verificationStatus: "confirmed",
    isActive: true
  }]
}, new Date("2026-08-11T09:00:00+09:00"));

test("Featured News uses readable Korean event and perk summaries without raw markup", () => {
  const event = fallbackItems.find((item) => item.id === "event");
  const perk = fallbackItems.find((item) => item.id === "perk");
  assert.equal(event.title, "엄익진 세션");
  assert.match(event.copy, /2026년 8월 12일/);
  assert.equal(perk.title, "스파크플러스 회원 혜택");
  assert.match(perk.copy, /회의실 이용 크레딧/);
  assert.doesNotMatch(perk.copy, /<\/?(?:ul|li|p|br)/i);
});

test("Claw members do not see event or perk cards in Arena updates", () => {
  assert.deepEqual(
    communityHighlightsForViewer(fallbackItems, { role: "member" }).map((item) => item.id),
    ["arena", "bounty"]
  );
  assert.deepEqual(
    communityHighlightsForViewer(fallbackItems, { role: "b2b_partner" }).map((item) => item.id),
    ["arena", "event", "perk", "bounty"]
  );
});

test("server-side AI polishing receives only normalized facts and keeps item anchors", async () => {
  let requestBody = "";
  const result = await polishCommunityHighlights({ items: fallbackItems }, {
    env: { GEMINI_API_KEY: "server-only-key" },
    fetchImpl: async (_url, init) => {
      requestBody = String(init.body || "");
      return Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          items: fallbackItems.map((item) => ({ id: item.id, title: `${item.title} 정리`, copy: item.copy }))
        }) }] } }]
      });
    }
  });
  assert.equal(result.source, "spark_ai");
  assert.equal(result.model, null);
  assert.deepEqual(result.items.map((item) => item.id), ["arena", "event", "perk", "bounty"]);
  assert.doesNotMatch(requestBody, /<\/?(?:ul|li|p|br)/i);
});

test("community highlight API rejects anonymous requests before AI work", async () => {
  let called = false;
  const response = await communityHighlightsApi(new Request("https://example.test/api/community-highlights", { method: "POST" }), {
    verifyRequest: async () => ({ ok: false, status: 401 }),
    polishCommunityHighlights: async () => { called = true; return {}; }
  });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("client renders the safe fallback first and refines through a server-only endpoint", () => {
  const html = fs.readFileSync("public/arena/index.html", "utf8");
  const client = fs.readFileSync("public/arena/community.js", "utf8");
  const config = fs.readFileSync("netlify.toml", "utf8");
  assert.match(html, /<h2>Arena 소식<\/h2>/);
  assert.match(client, /communityHighlightItems\(context\.hub \|\| \{\}\)/);
  assert.match(client, /communityHighlightsForViewer\(items, context\.viewer\)/);
  assert.match(client, /fetch\("\/api\/community-highlights"/);
  assert.match(config, /from = "\/api\/community-highlights"/);
  assert.doesNotMatch(`${html}\n${client}`, /GEMINI_API_KEY|GOOGLE_API_KEY|x-goog-api-key/);
});
