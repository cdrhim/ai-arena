import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { COMPANY_LOGOS } from "../public/arena/company-logo-data.js";
import { companyLogoAsset, companyLogoCount } from "../public/arena/company-logo.js";

const root = path.resolve(import.meta.dirname, "..");

test("official company logos are local, traceable card assets", async () => {
  const entries = Object.entries(COMPANY_LOGOS);
  assert.ok(entries.length >= 37, "expected the verified official logo set");
  assert.equal(companyLogoCount(), entries.length);

  for (const [teamId, logo] of entries) {
    assert.match(teamId, /^[0-9a-f-]{36}$/);
    assert.match(logo.src, /^\/arena\/assets\/company-logos\/[0-9a-f-]+\.(?:png|jpe?g|webp|gif|svg)$/i);
    assert.doesNotMatch(logo.src, /^https?:/i);
    assert.ok(logo.websiteHost, `${teamId} needs a source host`);
    assert.ok(["light", "dark"].includes(logo.tone));
    const localPath = path.join(root, "public", logo.src.replace(/^\//, ""));
    await access(localPath);
    assert.ok((await stat(localPath)).size > 100, `${logo.src} should not be empty`);
  }
});

test("company logo lookup fails closed to the semantic fallback", () => {
  const firstId = Object.keys(COMPANY_LOGOS)[0];
  assert.deepEqual(companyLogoAsset({ id: firstId }), COMPANY_LOGOS[firstId]);
  assert.equal(companyLogoAsset({ id: "unknown-team" }), null);
  assert.equal(companyLogoAsset({}), null);
});

test("white Enfloyd wordmark uses a contrasting dark surface", () => {
  const logo = COMPANY_LOGOS["9c773922-286b-4798-95c2-0fbad37319ad"];
  assert.ok(logo);
  assert.equal(logo.tone, "dark");
});

test("white Prief wordmark uses a contrasting dark surface", () => {
  const logo = COMPANY_LOGOS["5e65a80c-6c49-4bd3-b161-f4d7af75d63a"];
  assert.ok(logo);
  assert.equal(logo.tone, "dark");
});

test("Company Directory renders the official logo beside the title and keeps an industry fallback", async () => {
  const source = await readFile(path.join(root, "public", "arena", "arena.js"), "utf8");
  const styles = await readFile(path.join(root, "public", "arena", "arena.css"), "utf8");
  assert.match(source, /companyLogoAsset\(team\)/);
  assert.match(source, /data-official-company-logo=/);
  assert.match(source, /data-company-logo-fallback=/);
  assert.match(source, /companyIconMarkup\(team\)/);
  assert.match(source, /class="team-card-brand"/);
  assert.doesNotMatch(source, /data-official-company-logo[^\n]+onerror=/i);
  assert.match(styles, /\.team-card-logo img\s*\{[\s\S]*?object-fit:\s*contain/);
  assert.match(styles, /\.team-card-logo\.is-dark/);
});
