import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PUBLIC_BRIEF_LANGUAGE_STORAGE_KEY,
  normalizePublicBriefLanguage,
  publicBriefCopy,
  publicBriefUrl,
  resolvePublicBriefLanguage
} from "../public/arena/public-brief-i18n.js";

test("public Brief language resolution prefers a shareable query and safely defaults to Korean", () => {
  assert.equal(PUBLIC_BRIEF_LANGUAGE_STORAGE_KEY, "sparkclaw-public-brief-language-v1");
  assert.equal(resolvePublicBriefLanguage({ search: "?lang=en", stored: "ko" }), "en");
  assert.equal(resolvePublicBriefLanguage({ search: "?lang=ko", stored: "en" }), "ko");
  assert.equal(resolvePublicBriefLanguage({ search: "?view=brief", stored: "en" }), "en");
  assert.equal(resolvePublicBriefLanguage({ search: "?lang=fr", stored: "fr" }), "ko");
  assert.equal(normalizePublicBriefLanguage("EN"), "en");
});

test("English public Brief copy covers discovery, form, submission and login flow", () => {
  const copy = publicBriefCopy("en");
  assert.equal(copy.htmlLang, "en");
  assert.match(copy.titleHtml, /technology you need/);
  assert.equal(copy.steps.length, 3);
  assert.equal(copy.nodes.length, 4);
  assert.equal(Object.keys(copy.fields).length, 10);
  assert.equal(Object.keys(copy.budgets).length, 5);
  assert.match(copy.consent, /SparkLabs may process/);
  assert.match(copy.messages.success, /two business days/);
  assert.equal(copy.login.progress.length, 4);
  assert.match(copy.login.title, /Member Login/);
});

test("English links retain existing route state while Korean links remove only the language query", () => {
  const english = new URL(publicBriefUrl("https://sparkclaw-arena.netlify.app/?source=partner#discover", "en"));
  assert.equal(english.searchParams.get("source"), "partner");
  assert.equal(english.searchParams.get("lang"), "en");
  assert.equal(english.hash, "#discover");

  const korean = new URL(publicBriefUrl(english, "ko"));
  assert.equal(korean.searchParams.get("source"), "partner");
  assert.equal(korean.searchParams.has("lang"), false);
  assert.equal(korean.hash, "#discover");
});

test("public landing binds an accessible language switch without changing Brief field values", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const js = readFileSync("public/arena/arena.js", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");
  const formStart = html.indexOf('<form id="publicBriefForm"');
  const formEnd = html.indexOf("</form>", formStart);
  const form = html.slice(formStart, formEnd);

  assert.match(html, /id="publicBriefLanguageSwitch"[^>]*role="group"[^>]*aria-label="페이지 언어"[^>]*hidden/);
  assert.match(html, /data-public-brief-language="ko"[^>]*aria-pressed="true"/);
  assert.match(html, /data-public-brief-language="en"[^>]*aria-pressed="false"/);
  assert.match(js, /resolvePublicBriefLanguage\(\{[\s\S]*?window\.location\.search/);
  assert.match(js, /window\.history\.replaceState\(window\.history\.state, "", nextUrl\)/);
  assert.match(js, /document\.documentElement\.lang = copy\.htmlLang/);
  assert.match(js, /els\.publicBriefLanguageSwitch\.hidden = false/);
  assert.match(js, /els\.publicBriefLanguageSwitch\.hidden = true/);
  assert.match(js, /Object\.entries\(copy\.placeholders\)/);
  assert.match(js, /option\.textContent = copy\.budgets\[option\.value\]/);
  assert.match(css, /\.public-brief-language-switch\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(css, /\.public-brief-language-switch button\.is-active/);
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.public-brief-language-switch button/);

  for (const value of ["", "under_10m", "10m_30m", "30m_100m", "over_100m"]) {
    assert.match(form, new RegExp(`<option value="${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">`));
  }
  assert.equal((form.match(/name="organization"/g) || []).length, 1);
  assert.equal((form.match(/name="problem"/g) || []).length, 1);
});
