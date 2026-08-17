import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { COMPANY_EXTERNAL_LINKS } from "../public/arena/company-external-link-data.js";
import {
  companyExternalLinkCount,
  companyExternalLinkIcon,
  companyExternalLinks
} from "../public/arena/company-external-links.js";

const allLinks = Object.values(COMPANY_EXTERNAL_LINKS).flat();

test("verified company manifest contains only allowlisted HTTPS links", () => {
  const allowedKinds = new Set([
    "google_play", "apple_app_store", "instagram", "linkedin", "youtube",
    "x", "facebook", "threads", "tiktok", "naver_blog", "kakao_channel"
  ]);
  assert.equal(Object.keys(COMPANY_EXTERNAL_LINKS).length, 21);
  assert.equal(companyExternalLinkCount(), 41);
  assert.ok(allLinks.every((link) => allowedKinds.has(link.kind)));
  assert.ok(allLinks.every((link) => /^https:\/\//.test(link.url)));
  assert.ok(allLinks.every((link) => link.verificationStatus === "verified" || link.verificationStatus === "curated_official_source" || link.verificationStatus === "official_website_linked" || link.verificationStatus === "submitted_official_link" || link.verificationStatus === "submitted_program_profile"));
});

test("official store overrides are present for Oing and Callva", () => {
  const oing = companyExternalLinks({ id: "a079253b-fccc-45e1-8844-798edf427235" });
  const callva = companyExternalLinks({ id: "88387f03-1406-4db4-83c7-c1ae795a4bf5" });
  assert.deepEqual(oing.map((link) => link.url), ["https://apps.apple.com/app/id6756283759"]);
  assert.ok(callva.some((link) => link.url === "https://play.google.com/store/apps/details?id=com.storyweaver.callva"));
  assert.ok(callva.some((link) => link.url === "https://apps.apple.com/app/id6758038393"));
  assert.equal(companyExternalLinkIcon("google_play"), "GP");
});

test("company cards and details render compact official-link controls", async () => {
  const [arenaSource, marketSource, cssSource] = await Promise.all([
    readFile(new URL("../public/arena/arena.js", import.meta.url), "utf8"),
    readFile(new URL("../public/arena/market.js", import.meta.url), "utf8"),
    readFile(new URL("../public/arena/arena.css", import.meta.url), "utf8")
  ]);
  for (const source of [arenaSource, marketSource]) {
    assert.match(source, /companyOfficialLinksMarkup\([^)]*\)/);
    assert.match(source, /companyOfficialLinksMarkup\([^\n]+\{ section: true \}\)/);
    assert.match(source, /공식 채널·앱/);
    assert.match(source, /target="_blank" rel="noopener noreferrer"/);
  }
  assert.match(cssSource, /\.company-official-link:hover/);
  assert.match(cssSource, /\.company-official-links-section/);
});

test("sc_arena external-link migration is RLS protected and service-synced", async () => {
  const source = await readFile(
    new URL("../supabase/migrations/20260814190000_sc_arena_organization_external_links.sql", import.meta.url),
    "utf8"
  );
  assert.match(source, /create table if not exists public\.sc_arena_organization_external_links/i);
  assert.match(source, /enable row level security/i);
  assert.match(source, /verification_status in \('verified', 'curated'\)/i);
  assert.match(source, /revoke all on table public\.sc_arena_organization_external_links[\s\S]+service_role/i);
  assert.match(source, /sc_arena_replace_organization_external_links/i);
  assert.match(source, /grant execute[\s\S]+to service_role/i);
});
