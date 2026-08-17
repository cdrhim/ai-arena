import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import arenaGuideApi from "../netlify/functions/arena-guide.mjs";
import { answerArenaGuide, deterministicGuideAnswer } from "../netlify/lib/arena-guide.mjs";

test("클로이는 Global Advisors & Faculty 독립 페이지를 안내한다", () => {
  const result = deterministicGuideAnswer("글로벌 어드바이저와 Faculty를 보여줘", { role: "member" });
  assert.equal(result.suggestedPage, "advisors");
  assert.match(result.suggestedLabel, /Global Advisors & Faculty/);
});

test("클로이는 공개 방문자에게 안전한 AI Arena 안내만 제공한다", () => {
  const result = deterministicGuideAnswer("협업할 기업을 찾아서 바로 소개해줘", { role: "public" });
  assert.match(result.answer, /상대 스타트업.*승인/u);
  assert.match(result.answer, /로그인/u);
  assert.equal(result.suggestedPage, "overview");
  assert.doesNotMatch(result.answer, /Gemini/iu);
});

test("클로이의 AI 요청은 서버 소유 가이드만 전송하고 공급자 키를 노출하지 않는다", async () => {
  let requestUrl = "";
  let requestBody = "";
  const result = await answerArenaGuide({ question: "Community 글 쓰는 법", page: "community" }, {
    viewer: { id: "viewer-1", role: "member" },
    env: { GEMINI_API_KEY: "server-only-guide-key" },
    fetchImpl: async (url, init) => {
      requestUrl = String(url);
      requestBody = String(init.body || "");
      return Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          answer: "내용을 먼저 적고 클로이 게시 설정을 확인한 뒤 게시해 주세요.",
          suggestedPage: "community",
          suggestedLabel: "Community 열기",
          followUps: ["Public과 Private 차이는?"]
        }) }] } }]
      });
    }
  });
  assert.equal(result.source, "spark_ai");
  assert.match(requestUrl, /generativelanguage\.googleapis\.com/);
  assert.match(requestBody, /SparkClaw AI Arena/);
  assert.doesNotMatch(requestBody, /server-only-guide-key/);
  assert.doesNotMatch(JSON.stringify(result), /Gemini|gemini-2\.5/iu);
});

test("클로이 API는 비로그인 안내를 허용하되 요청 빈도와 입력 크기를 제한한다", async () => {
  let viewerRole = "";
  const response = await arenaGuideApi(new Request("https://example.test/api/arena-guide", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.1" },
    body: JSON.stringify({ question: "Company Directory는 어디야?" })
  }), {
    consumeRateLimit: async () => ({ allowed: true }),
    answerArenaGuide: async (_input, options) => {
      viewerRole = options.viewer.role;
      return { answer: "안내", suggestedPage: "overview", suggestedLabel: "홈", followUps: [], source: "deterministic_fallback" };
    }
  });
  assert.equal(response.status, 200);
  assert.equal(viewerRole, "public");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("클로이 UI는 첨부 캐릭터, 친절한 문구, 접근 가능한 대화창을 제공한다", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const client = readFileSync("public/arena/arena-guide.js", "utf8");
  const arenaClient = readFileSync("public/arena/arena.js", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");
  const config = readFileSync("netlify.toml", "utf8");
  assert.match(html, /id="arenaGuide"[^>]*hidden/);
  assert.match(html, /Clawee 클로이/);
  assert.match(html, /모든 거 시키세요!/);
  assert.match(html, /\/arena\/assets\/clawee-guide\.png/);
  assert.match(html, /\/arena\/assets\/clawee-guide-search\.png/);
  assert.match(html, /class="arena-guide-avatar"/);
  assert.doesNotMatch(html, /arena-guide-search-icon/);
  assert.match(html, /role="log"/);
  assert.match(html, /data-guide-tutorial-start/);
  assert.match(html, /id="arenaGuideTutorial"/);
  assert.match(html, /Enter로 실행 · Shift\+Enter로 줄바꿈/);
  assert.match(client, /fetch\("\/api\/arena-guide"/);
  assert.match(client, /event\.key !== "Enter" \|\| event\.shiftKey \|\| event\.isComposing/);
  assert.match(client, /form\.requestSubmit\(\)/);
  assert.match(client, /initArenaGuideTutorial/);
  assert.match(client, /function setVisible\(visible\)/);
  assert.match(client, /root\.hidden = !visible/);
  assert.match(arenaClient, /function showApp\(\)[\s\S]*?arenaGuide\.setVisible\(true\)/);
  assert.match(arenaClient, /function showPublicBriefGate[\s\S]*?arenaGuide\.setVisible\(false\)/);
  assert.match(client, /document\.createElement\("p"\)/);
  assert.doesNotMatch(client, /innerHTML/);
  assert.match(css, /\.arena-guide-panel/);
  assert.match(css, /\.arena-guide-tutorial-start/);
  assert.match(css, /\.arena-guide-tutorial\[hidden\]/);
  assert.match(css, /body \.arena-guide\[hidden\]\s*\{[\s\S]*?display:\s*none !important/);
  assert.match(css, /Header-mounted Clawee guide/);
  assert.doesNotMatch(css, /\.arena-guide-search-icon/);
  assert.match(css, /\.arena-guide-launcher:hover \.arena-guide-avatar > img/);
  assert.match(css, /body \.arena-guide\s*\{[\s\S]*?top:\s*7px;[\s\S]*?left:\s*max\(190px/);
  assert.match(css, /body \.arena-guide-panel\s*\{[\s\S]*?transform-origin:\s*top left;[\s\S]*?arena-guide-drop/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.app-header \.brand-copy[\s\S]*?display:\s*none[\s\S]*?body \.arena-guide[\s\S]*?left:\s*61px/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.arena-guide-panel/);
  assert.match(config, /from = "\/api\/arena-guide"/);
  assert.doesNotMatch(`${html}\n${client}`, /GEMINI_API_KEY|GOOGLE_API_KEY|x-goog-api-key|Gemini/);
});
