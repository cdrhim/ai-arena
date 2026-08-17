import assert from "node:assert/strict";
import test from "node:test";

import {
  netlifyCountryCode,
  recommendedPublicBriefLanguage
} from "../netlify/lib/public-locale.mjs";
import arenaAuth from "../netlify/functions/arena-auth.mjs";

test("country recommendation maps Korea, Japan, Arabic regions and Chinese regions", () => {
  assert.equal(recommendedPublicBriefLanguage("KR"), "ko");
  assert.equal(recommendedPublicBriefLanguage("JP"), "ja");
  assert.equal(recommendedPublicBriefLanguage("AE"), "ar");
  assert.equal(recommendedPublicBriefLanguage("SA"), "ar");
  assert.equal(recommendedPublicBriefLanguage("CN"), "zh");
  assert.equal(recommendedPublicBriefLanguage("TW"), "zh");
  assert.equal(recommendedPublicBriefLanguage("US"), "en");
  assert.equal(recommendedPublicBriefLanguage(""), "");
});

test("Netlify geolocation extraction is defensive and normalizes country codes", () => {
  assert.equal(netlifyCountryCode({ geo: { country: { code: "jp" } } }), "JP");
  assert.equal(netlifyCountryCode({ geo: { country: { countryCode: "ae" } } }), "AE");
  assert.equal(netlifyCountryCode({}), "");
});

test("public auth bootstrap returns only a language recommendation from Netlify country context", async () => {
  const response = await arenaAuth(
    new Request("https://arena.example/api/arena-auth"),
    { geo: { country: { code: "JP" } } }
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(payload.recommendedLanguage, "ja");
  assert.equal(Object.hasOwn(payload, "countryCode"), false);
});
