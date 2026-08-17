import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PUBLIC_BRIEF_LANGUAGE_STORAGE_KEY,
  PUBLIC_BRIEF_LANGUAGES,
  hasExplicitPublicBriefLanguage,
  normalizePublicBriefLanguage,
  publicBriefCopy,
  publicBriefUrl,
  resolvePublicBriefLanguage
} from "../public/arena/public-brief-i18n.js";

test("public Brief language resolution prefers query, saved choice, country recommendation, then browser language", () => {
  assert.equal(PUBLIC_BRIEF_LANGUAGE_STORAGE_KEY, "sparkclaw-public-brief-language-v1");
  assert.equal(resolvePublicBriefLanguage({ search: "?lang=en", stored: "ko" }), "en");
  assert.equal(resolvePublicBriefLanguage({ search: "?lang=ko", stored: "en" }), "ko");
  assert.equal(resolvePublicBriefLanguage({ search: "?view=brief", stored: "en" }), "en");
  assert.equal(resolvePublicBriefLanguage({ recommended: "ar", browserLanguages: ["en-US"] }), "ar");
  assert.equal(resolvePublicBriefLanguage({ recommended: "ja", browserLanguages: ["ko-KR"] }), "ja");
  assert.equal(resolvePublicBriefLanguage({ browserLanguages: ["zh-CN", "en-US"] }), "zh");
  assert.equal(resolvePublicBriefLanguage({ browserLanguages: ["ar-AE"] }), "ar");
  assert.equal(resolvePublicBriefLanguage({ search: "?lang=fr", stored: "fr" }), "ko");
  assert.equal(normalizePublicBriefLanguage("EN"), "en");
  assert.equal(normalizePublicBriefLanguage("zh-TW"), "zh");
  assert.equal(hasExplicitPublicBriefLanguage({ search: "?lang=ja" }), true);
  assert.equal(hasExplicitPublicBriefLanguage({ stored: "ar" }), true);
  assert.equal(hasExplicitPublicBriefLanguage({ search: "?lang=fr", stored: "" }), false);
  assert.deepEqual(PUBLIC_BRIEF_LANGUAGES, ["ko", "en", "ar", "ja", "zh"]);
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

test("Arabic, Japanese and Chinese copy fully covers the anonymous Brief and login surfaces", () => {
  for (const language of ["ar", "ja", "zh"]) {
    const copy = publicBriefCopy(language);
    assert.ok(copy.htmlLang);
    assert.ok(copy.titleHtml.length > 12);
    assert.equal(copy.steps.length, 3);
    assert.equal(copy.nodes.length, 4);
    assert.equal(Object.keys(copy.fields).length, 10);
    assert.equal(Object.keys(copy.placeholders).length, 5);
    assert.equal(Object.keys(copy.budgets).length, 5);
    assert.equal(copy.login.features.length, 3);
    assert.equal(copy.login.route.length, 3);
    assert.equal(copy.login.progress.length, 4);
  }
  assert.equal(publicBriefCopy("ar").direction, "rtl");
  assert.equal(publicBriefCopy("ja").htmlLang, "ja");
  assert.equal(publicBriefCopy("zh").htmlLang, "zh-CN");
});

test("English links retain existing route state while Korean links remove only the language query", () => {
  const english = new URL(publicBriefUrl("https://sparkclaw-arena.netlify.app/?source=partner#discover", "en"));
  assert.equal(english.searchParams.get("source"), "partner");
  assert.equal(english.searchParams.get("lang"), "en");
  assert.equal(english.hash, "#discover");

  const japanese = new URL(publicBriefUrl(english, "ja"));
  assert.equal(japanese.searchParams.get("lang"), "ja");

  const arabic = new URL(publicBriefUrl(japanese, "ar"));
  assert.equal(arabic.searchParams.get("lang"), "ar");

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

  assert.match(html, /id="publicBriefLanguageSwitch"[^>]*hidden/);
  assert.match(html, /id="publicBriefLanguageSelect"[^>]*aria-label="페이지 언어"/);
  for (const language of ["ko", "en", "ar", "ja", "zh"]) {
    assert.match(html, new RegExp(`<option value="${language}">`));
  }
  assert.match(js, /resolvePublicBriefLanguage\(\{[\s\S]*?window\.location\.search/);
  assert.match(js, /window\.history\.replaceState\(window\.history\.state, "", nextUrl\)/);
  assert.match(js, /document\.documentElement\.lang = copy\.htmlLang/);
  assert.match(js, /document\.documentElement\.dir = copy\.direction/);
  assert.match(js, /payload\?\.recommendedLanguage/);
  assert.match(js, /els\.publicBriefLanguageSwitch\.hidden = false/);
  assert.match(js, /els\.publicBriefLanguageSwitch\.hidden = true/);
  assert.match(js, /publicBriefLanguageSelect\?\.addEventListener\("change"/);
  assert.match(js, /els\.publicBriefLanguageSelect\.value = publicBriefLanguage/);
  assert.match(js, /Object\.entries\(copy\.placeholders\)/);
  assert.match(js, /option\.textContent = copy\.budgets\[option\.value\]/);
  assert.match(css, /\.public-brief-language-switch\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(css, /\.public-brief-language-switch select/);
  assert.match(css, /\.public-brief-language-switch\s*\{[\s\S]*?grid-template-columns:\s*20px minmax\(88px, auto\)/);
  assert.match(css, /\.public-brief-language-switch select\s*\{[\s\S]*?appearance:\s*none/);
  assert.match(css, /\.public-brief-language-switch::after\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.match(css, /html\[dir="rtl"\] \.public-brief-section/);
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.public-brief-language-switch select/);

  for (const value of ["", "under_10m", "10m_30m", "30m_100m", "over_100m"]) {
    assert.match(form, new RegExp(`<option value="${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">`));
  }
  assert.equal((form.match(/name="organization"/g) || []).length, 1);
  assert.equal((form.match(/name="problem"/g) || []).length, 1);
});
