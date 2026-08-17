import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { googleIdentityProviders, isAllowedGoogleAdminUser } from "../public/arena/google-admin-auth.js";

const html = readFileSync("public/arena/index.html", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");
const client = readFileSync("public/arena/arena.js", "utf8");

test("SparkLabs Google login is feature-gated and uses the Supabase OAuth endpoint", () => {
  assert.match(html, /id="googleAdminLoginGroup"[^>]*hidden/);
  assert.match(html, /id="googleAdminLoginButton"/);
  assert.match(client, /googleAdminLoginEnabled/);
  assert.match(client, /\/auth\/v1\/authorize/);
  assert.match(client, /authorizeUrl\.searchParams\.set\("provider", "google"\)/);
  assert.match(client, /redirect_to/);
  assert.match(client, /consumeOAuthSessionFromUrl\(\)/);
  assert.doesNotMatch(client, /provider_token/);
  assert.match(css, /\.google-admin-login-button/);
});

test("OAuth callback stores only Supabase session tokens and clears the URL fragment", () => {
  const callback = client.slice(client.indexOf("function consumeOAuthSessionFromUrl"), client.indexOf("async function handleLogin"));
  assert.match(callback, /access_token/);
  assert.match(callback, /refresh_token/);
  assert.match(callback, /saveStoredSession/);
  assert.match(callback, /window\.history\.replaceState/);
  assert.doesNotMatch(callback, /localStorage\.setItem/);
});

test("Google admin OAuth rejects non-SparkLabs domains and revokes their session", () => {
  const callback = client.slice(client.indexOf("async function consumeOAuthSessionFromUrl"), client.indexOf("async function handleLogin"));
  assert.match(callback, /\/auth\/v1\/user/);
  assert.match(callback, /isAllowedGoogleAdminUser\(user, allowedDomains\)/);
  assert.match(callback, /authConfig\?\.adminDomains/);
  assert.match(callback, /revokeSupabaseSession\(session\)/);
  assert.match(callback, /\/auth\/v1\/logout/);
  assert.match(html, /@sparklabs\.co\.kr 업무용 Google 계정만 로그인할 수 있습니다/);
});

test("an existing email account linked to Google is accepted for the SparkLabs domain", () => {
  const linkedUser = {
    email: "a.rhim@sparklabs.co.kr",
    app_metadata: { provider: "email", providers: ["email", "google"] },
    identities: [{ provider: "email" }, { provider: "google" }]
  };

  assert.deepEqual([...googleIdentityProviders(linkedUser)].sort(), ["email", "google"]);
  assert.equal(isAllowedGoogleAdminUser(linkedUser, ["sparklabs.co.kr"]), true);
});

test("Google admin validation still rejects the wrong domain or a non-Google identity", () => {
  assert.equal(
    isAllowedGoogleAdminUser(
      { email: "person@example.com", app_metadata: { provider: "google", providers: ["google"] } },
      ["sparklabs.co.kr"]
    ),
    false
  );
  assert.equal(
    isAllowedGoogleAdminUser(
      { email: "a.rhim@sparklabs.co.kr", app_metadata: { provider: "email", providers: ["email"] } },
      ["sparklabs.co.kr"]
    ),
    false
  );
  assert.equal(
    isAllowedGoogleAdminUser(
      { email: "a.rhim@sparklabs.co.kr.example.com", app_metadata: { provider: "google" } },
      ["sparklabs.co.kr"]
    ),
    false
  );
});
