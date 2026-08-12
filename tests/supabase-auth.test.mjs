import assert from "node:assert/strict";
import test from "node:test";

import {
  arenaAuthConfig,
  authorizeArenaAction,
  publicArenaAuthConfig,
  viewerFromUser
} from "../netlify/lib/supabase-auth.mjs";

test("arena auth config reads Supabase and SparkLabs role settings", () => {
  const config = arenaAuthConfig({
    SUPABASE_URL: "https://example.supabase.co/",
    SUPABASE_ANON_KEY: "anon",
    SPARKLABS_ARENA_ADMIN_DOMAINS: "sparklabs.co.kr;example.com",
    SPARKLABS_ARENA_ADMIN_EMAILS: "admin@sparklabs.co.kr"
  });

  assert.equal(config.configured, true);
  assert.equal(config.supabaseUrl, "https://example.supabase.co");
  assert.deepEqual(config.adminDomains, ["sparklabs.co.kr", "example.com"]);
  assert.deepEqual(config.adminEmails, ["admin@sparklabs.co.kr"]);
});

test("public arena auth config exposes only client-safe settings", () => {
  const config = publicArenaAuthConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SPARKLABS_ARENA_ADMIN_EMAILS: "secret@sparklabs.co.kr"
  });

  assert.equal(config.authConfigured, true);
  assert.equal(config.supabaseAnonKey, "anon");
  assert.equal(Object.hasOwn(config, "adminEmails"), false);
});

test("SparkLabs users can score and partner users cannot", () => {
  const config = arenaAuthConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SPARKLABS_ARENA_ADMIN_DOMAINS: "sparklabs.co.kr",
    SPARKLABS_ARENA_B2B_PARTNER_DOMAINS: "partner.com",
    SPARKLABS_ARENA_MEMBER_EMAILS: "founder@example.com"
  });
  const staff = viewerFromUser({ id: "u1", email: "a.rhim@sparklabs.co.kr" }, config);
  const b2bPartner = viewerFromUser({ id: "u2", email: "buyer@partner.com" }, config);
  const member = viewerFromUser({ id: "u3", email: "founder@example.com" }, config);

  assert.equal(staff.canScore, true);
  assert.equal(staff.role, "sparklabs");
  assert.equal(b2bPartner.canScore, false);
  assert.equal(b2bPartner.role, "b2b_partner");
  assert.equal(b2bPartner.canRequestConnections, true);
  assert.equal(member.role, "member");
  assert.equal(member.canSubmitProducts, true);
  assert.doesNotThrow(() => authorizeArenaAction("submitBenchmark", staff));
  assert.throws(() => authorizeArenaAction("submitBenchmark", b2bPartner), /Only SparkLabs users/);
  assert.throws(
    () => authorizeArenaAction("upvoteProduct", member),
    (error) => {
      assert.equal(error.status, 410);
      assert.match(error.message, /Peer popularity voting is disabled/);
      return true;
    }
  );
  assert.throws(() => authorizeArenaAction("saveSubmissionDraft", b2bPartner), /Only approved members/);
  assert.doesNotThrow(() => authorizeArenaAction("saveSubmissionDraft", member));
  assert.doesNotThrow(() => authorizeArenaAction("requestConnection", b2bPartner));
  assert.throws(() => authorizeArenaAction("requestConnection", member), /Only B2B partners/);
});

test("trusted Supabase app metadata can mark a user as a B2B partner", () => {
  const config = arenaAuthConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SPARKLABS_ARENA_ADMIN_DOMAINS: "sparklabs.co.kr"
  });
  const viewer = viewerFromUser(
    {
      id: "u4",
      email: "buyer@example.com",
      user_metadata: {
        organization: "Retail Buyer"
      },
      app_metadata: {
        role: "b2b_partner",
        b2b_focus_categories: "Retail, Computer Vision"
      }
    },
    config
  );

  assert.equal(viewer.role, "b2b_partner");
  assert.equal(viewer.organization, "Retail Buyer");
  assert.deepEqual(viewer.b2bFocusCategories, ["Retail", "Computer Vision"]);
});

test("trusted external partner mapping makes test account Youngone B2B and overrides mutable metadata", () => {
  const config = arenaAuthConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SPARKLABS_ARENA_ADMIN_DOMAINS: "sparklabs.co.kr"
  });
  const viewer = viewerFromUser(
    {
      id: "legacy_test_user",
      email: "TEST@gmail.com",
      user_metadata: {
        role: "member",
        organization: "Forged Organization",
        b2b_profile_id: "forged-profile",
        b2b_focus_categories: "Untrusted Category"
      },
      app_metadata: {
        role: "member",
        b2b_profile_id: "wrong-app-profile",
        b2b_focus_categories: "Wrong App Category"
      }
    },
    config
  );

  assert.equal(viewer.role, "b2b_partner");
  assert.equal(viewer.canRequestConnections, true);
  assert.equal(viewer.canSubmitProducts, false);
  assert.equal(viewer.organization, "영원무역");
  assert.match(viewer.b2bProfileId, /youngone/i);
  assert.equal(viewer.b2bFocusCategories.includes("Untrusted Category"), false);
  assert.equal(viewer.b2bFocusCategories.includes("Wrong App Category"), false);
  assert.ok(viewer.b2bFocusCategories.length > 0);
});

test("B2B match profile fields ignore user metadata and accept trusted app metadata only", () => {
  const config = arenaAuthConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SPARKLABS_ARENA_B2B_PARTNER_EMAILS: "buyer@example.com"
  });
  const appBacked = viewerFromUser(
    {
      id: "app_backed",
      email: "buyer@example.com",
      user_metadata: {
        b2b_profile_id: "forged-profile",
        b2b_focus_categories: "Forged Category",
        b2b_target_stages: "Forged Stage",
        b2b_preferred_regions: "Forged Region",
        b2b_thesis: "Forged thesis"
      },
      app_metadata: {
        b2b_profile_id: "trusted-profile",
        b2b_focus_categories: "Retail, Computer Vision",
        b2b_target_stages: "Seed, Growth",
        b2b_preferred_regions: "Korea, Global",
        b2b_thesis: "Trusted enterprise pilot thesis"
      }
    },
    config
  );

  assert.equal(appBacked.b2bProfileId, "trusted-profile");
  assert.deepEqual(appBacked.b2bFocusCategories, ["Retail", "Computer Vision"]);
  assert.deepEqual(appBacked.b2bTargetStages, ["Seed", "Growth"]);
  assert.deepEqual(appBacked.b2bPreferredRegions, ["Korea", "Global"]);
  assert.equal(appBacked.b2bThesis, "Trusted enterprise pilot thesis");

  const untrustedOnly = viewerFromUser(
    {
      id: "untrusted_only",
      email: "buyer@example.com",
      user_metadata: {
        b2b_profile_id: "forged-profile",
        b2b_focus_categories: "Forged Category",
        b2b_thesis: "Forged thesis"
      }
    },
    config
  );
  assert.equal(untrustedOnly.role, "b2b_partner");
  assert.equal(untrustedOnly.b2bProfileId, "");
  assert.deepEqual(untrustedOnly.b2bFocusCategories, []);
  assert.equal(untrustedOnly.b2bThesis, "");
});

test("user metadata cannot self-escalate into privileged Arena roles", () => {
  const config = arenaAuthConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SPARKLABS_ARENA_ADMIN_DOMAINS: "sparklabs.co.kr"
  });
  const staffClaim = viewerFromUser(
    {
      id: "u6",
      email: "founder@example.com",
      user_metadata: { role: "staff", human_validator: true }
    },
    config
  );
  const b2bClaim = viewerFromUser(
    {
      id: "u7",
      email: "buyer@example.com",
      user_metadata: { role: "b2b_partner" }
    },
    config
  );
  const memberClaim = viewerFromUser(
    {
      id: "u8",
      email: "member-claim@example.com",
      user_metadata: { role: "member" }
    },
    config
  );

  assert.equal(staffClaim.canScore, false);
  assert.equal(staffClaim.canSubmitHumanReviews, false);
  assert.equal(staffClaim.role, "public");
  assert.equal(b2bClaim.canRequestConnections, false);
  assert.equal(b2bClaim.role, "public");
  assert.equal(memberClaim.canSubmitProducts, false);
  assert.equal(memberClaim.role, "public");
});

test("membership requires an explicit allowlist entry or trusted app metadata", () => {
  const config = arenaAuthConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SPARKLABS_ARENA_ADMIN_DOMAINS: "sparklabs.co.kr",
    SPARKLABS_ARENA_MEMBER_EMAILS: "allowed@example.com"
  });

  const arbitrary = viewerFromUser({ id: "u_public", email: "arbitrary@example.com" }, config);
  const allowlisted = viewerFromUser({ id: "u_allowed", email: "allowed@example.com" }, config);
  const trustedMetadata = viewerFromUser(
    { id: "u_trusted", email: "trusted@example.com", app_metadata: { role: "approved_member" } },
    config
  );

  assert.equal(arbitrary.role, "public");
  assert.equal(arbitrary.canSubmitProducts, false);
  assert.equal(allowlisted.role, "member");
  assert.equal(allowlisted.canSubmitProducts, true);
  assert.equal(trustedMetadata.role, "member");
  assert.equal(trustedMetadata.canSubmitProducts, true);
});

test("selected human validators can review without staff scoring permissions", () => {
  const config = arenaAuthConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SPARKLABS_ARENA_ADMIN_DOMAINS: "sparklabs.co.kr",
    SPARKLABS_ARENA_HUMAN_VALIDATOR_EMAILS: "mentor@example.com"
  });
  const viewer = viewerFromUser(
    {
      id: "u5",
      email: "mentor@example.com",
      user_metadata: {
        validator_type: "technical_expert",
        expertise_tags: "AI Agents, B2B SaaS"
      }
    },
    config
  );

  assert.equal(viewer.role, "human_validator");
  assert.equal(viewer.canScore, false);
  assert.equal(viewer.canSubmitHumanReviews, true);
  assert.equal(viewer.humanValidatorType, "technical_expert");
  assert.deepEqual(viewer.humanValidatorExpertiseTags, ["AI Agents", "B2B SaaS"]);
});
