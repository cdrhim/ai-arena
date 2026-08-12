import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import featuredKeywordsApi from "../netlify/functions/featured-keywords.mjs";
import { polishFeaturedKeywords } from "../netlify/lib/featured-keywords.mjs";

test("Spark AI edits only the server-owned verified editorial facts and keeps exact company anchors", async () => {
  let requestBody = "";
  const result = await polishFeaturedKeywords({ ids: ["neander-acscent", "gorocket-oing"] }, {
    env: { GEMINI_API_KEY: "server-only-key" },
    fetchImpl: async (_url, init) => {
      requestBody = String(init.body || "");
      return Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          items: [
            { id: "neander-acscent", hook: "AI 체험을 매장 경험으로 확장", keywords: ["190+ 행사", "42개 콘텐츠", "리테일 AI"] },
            { id: "gorocket-oing", hook: "건강 루틴과 케어 데이터 연결", keywords: ["디지털 헬스", "CareMate", "영양 기록"] }
          ]
        }) }] } }]
      });
    }
  });

  assert.equal(result.source, "spark_ai");
  assert.equal(result.model, null);
  assert.deepEqual(result.items.map((item) => item.id), ["neander-acscent", "gorocket-oing"]);
  assert.match(requestBody, /190회 이상 행사/);
  assert.doesNotMatch(requestBody, /ownerEmail|reviewerEmail|internalNote|server-only-key/);
});

test("featured keywords stay useful when the provider is unavailable", async () => {
  const result = await polishFeaturedKeywords({ ids: ["vivivava-hemogry"] }, {
    env: { GEMINI_API_KEY: "server-only-key" },
    fetchImpl: async () => { throw new Error("offline"); }
  });
  assert.equal(result.source, "deterministic_fallback");
  assert.equal(result.items[0].keywords.length, 3);
  assert.match(result.items[0].hook, /레시피/);
});

test("featured keyword API rejects anonymous requests before AI work", async () => {
  let called = false;
  const response = await featuredKeywordsApi(new Request("https://example.test/api/featured-keywords", { method: "POST" }), {
    verifyRequest: async () => ({ ok: false, status: 401 }),
    polishFeaturedKeywords: async () => { called = true; return {}; }
  });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("Discover renders four integrated editorial bubbles and keeps provider credentials server-side", () => {
  const html = fs.readFileSync("public/arena/index.html", "utf8");
  const client = fs.readFileSync("public/arena/arena.js", "utf8");
  const css = fs.readFileSync("public/arena/arena.css", "utf8");
  const config = fs.readFileSync("netlify.toml", "utf8");
  const hero = html.match(/<div class="program-hero">([\s\S]*?)<\/div>\s*<section id="partnerProfileCard"/)?.[1] || "";

  assert.match(hero, /id="featuredSpotlight"/);
  assert.match(hero, /4 PICKS EDITORIAL SPOTLIGHT/);
  assert.doesNotMatch(hero, /featuredSpotlightPosition|featured-spotlight-position/);
  assert.match(hero, /featured-spotlight-cluster/);
  assert.doesNotMatch(html, /FEATURED · EDITORIAL CURATION/);
  assert.match(client, /fetch\("\/api\/featured-keywords"/);
  assert.match(client, /featuredSpotlightEntries\.slice\(0, 4\)/);
  assert.match(client, /featured-spotlight-bubble-/);
  assert.doesNotMatch(client, /featured-spotlight-bubble-meta"><b>0\$\{index \+ 1\}/);
  assert.match(client, /weeklyFeaturedTeams\(hub\.teams \|\| \[\], hub\.featuredCompanies \|\| \[\]\)/);
  assert.match(client, /WEEKLY UPDATE \$\{date\} · MON 09:00 KST/);
  assert.match(css, /\.featured-spotlight-bubble-meta\s*\{[\s\S]*?justify-content:\s*flex-end/);
  assert.doesNotMatch(client, /featuredSpotlightIndex|featuredSpotlightTimer/);
  assert.match(client, /openTeamDialog\(team\)/);
  assert.doesNotMatch(client, /const teamId = event\.currentTarget\.dataset\.featuredTeamId;\s*showPage\("teams"\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@keyframes featured-spotlight-bubble-orbit/);
  assert.match(css, /@keyframes featured-spotlight-cluster-orbit/);
  assert.doesNotMatch(css, /@keyframes featured-spotlight-border-scan/);
  assert.match(css, /\.featured-spotlight-cluster:hover[\s\S]*?opacity:\s*0\.68/);
  assert.match(css, /\.hero-visual::before[\s\S]*?hero-visual-signal-field/);
  assert.match(css, /\.featured-spotlight-cluster::before,[\s\S]*?\.featured-spotlight-bubble,[\s\S]*animation:\s*none !important/);
  assert.doesNotMatch(css, /@keyframes featured-spotlight-pop/);
  assert.doesNotMatch(css, /featured-spotlight[^}]*filter:\s*blur/is);
  assert.match(config, /from = "\/api\/featured-keywords"/);
  assert.doesNotMatch(`${html}\n${client}`, /GEMINI_API_KEY|GOOGLE_API_KEY|x-goog-api-key|Gemini/);
});

test("Discover hero separates editorial picks from network metrics at every responsive size", () => {
  const html = fs.readFileSync("public/arena/index.html", "utf8");
  const css = fs.readFileSync("public/arena/arena.css", "utf8");
  const visual = html.match(/<div class="hero-visual">([\s\S]*?)<\/div>\s*<\/div>\s*<section id="partnerProfileCard"/)?.[1] || "";

  assert.match(visual, /id="featuredSpotlight"/);
  assert.match(visual, /class="hero-orbit"/);
  assert.match(css, /\.hero-visual\s*\{[\s\S]*?display:\s*grid;[\s\S]*?gap:\s*14px;/);
  assert.match(css, /\.featured-spotlight\s*\{[\s\S]*?position:\s*relative;[\s\S]*?width:\s*100%;/);
  assert.doesNotMatch(css, /\.featured-spotlight\s*\{[^}]*position:\s*absolute;/);
  assert.match(css, /\.featured-spotlight\s*\{[\s\S]*?padding:\s*0;[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/);
  assert.match(css, /\.hero-orbit\s*\{[\s\S]*?perspective:\s*960px;[\s\S]*?transform-style:\s*preserve-3d;/);
  assert.match(css, /\.hero-visual \.hero-network-core\s*\{\s*display:\s*grid;/);
  assert.match(css, /\.hero-visual \.hero-cloud-tag\s*\{\s*display:\s*block;/);
  assert.match(css, /\.orbit-card\s*\{[\s\S]*?offset-path:\s*ellipse\(calc\(50% - 96px\) calc\(50% - 78px\) at 50% 47%\)[\s\S]*?animation:\s*hero-planet-orbit/);
  assert.match(css, /@media \(max-width: 1120px\)[\s\S]*?\.program-hero\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.featured-spotlight-cluster\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.orbit-card,[\s\S]*?offset-path:\s*none;/);
});
