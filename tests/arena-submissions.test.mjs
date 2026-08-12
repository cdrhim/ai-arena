import assert from "node:assert/strict";
import test from "node:test";

import { buildArenaSnapshot } from "../netlify/lib/arena-core.mjs";
import {
  calculateReadiness,
  createSubmissionEvent,
  filterSubmissionsForViewer,
  generateArenaCardMarkdown,
  humanValidationQueueForViewer,
  sanitizeAsset,
  validateAsset,
  validateUrl
} from "../netlify/lib/arena-submissions.mjs";
import { submissionRow, supabaseSubmissionConfig } from "../netlify/lib/supabase-submissions-store.mjs";

const member = { id: "u_member", email: "founder@example.com", role: "member", canScore: false, canSubmitProducts: true };
const b2bPartner = {
  id: "u_b2b",
  email: "buyer@partner.com",
  role: "b2b_partner",
  b2bProfileId: "partner_retail",
  canScore: false,
  canSubmitProducts: false
};
const staff = { id: "u_staff", email: "a.rhim@sparklabs.co.kr", role: "staff", canScore: true };
const otherMember = { id: "u_other", email: "other@example.com", role: "member", canScore: false, canSubmitProducts: true };
const validator = {
  id: "u_validator",
  email: "mentor@example.com",
  role: "human_validator",
  canScore: false,
  canSubmitHumanReviews: true,
  humanValidatorStatus: "active"
};
const PNG_1X1_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XnF0aAAAAASUVORK5CYII=";
const PNG_1X1_DATA_URL = `data:image/png;base64,${PNG_1X1_BASE64}`;
const PNG_1X1_SIZE = Buffer.from(PNG_1X1_BASE64, "base64").length;

function completeSubmission() {
  return {
    type: "AI Agent",
    name: "Agent Desk",
    tagline: "Resolve Korean support tickets faster",
    shortDescription: "A support automation product for Korean and English CX teams.",
    category: "Customer Support",
    stage: "Pre-Seed",
    region: "Seoul",
    affiliation: "Partner Company",
    makerNote: "We built this for B2B service teams that need verified AI workflows.",
    launchTags: ["Support", "Agent"],
    technicalTags: ["RAG", "Voice"],
    links: [{ type: "demo", url: "https://example.com/demo?utm_source=test" }],
    assets: [
      {
        id: "asset_thumb",
        type: "thumbnail",
        fileName: "logo.png",
        mimeType: "image/png",
        size: PNG_1X1_SIZE,
        dataUrl: PNG_1X1_DATA_URL
      },
      {
        id: "asset_g1",
        type: "gallery",
        fileName: "shot-1.png",
        mimeType: "image/png",
        size: PNG_1X1_SIZE,
        dataUrl: PNG_1X1_DATA_URL,
        sortOrder: 0
      },
      {
        id: "asset_g2",
        type: "gallery",
        fileName: "shot-2.png",
        mimeType: "image/png",
        size: PNG_1X1_SIZE,
        dataUrl: PNG_1X1_DATA_URL,
        sortOrder: 1
      }
    ],
    thumbnailAssetId: "asset_thumb",
    teamMembers: [{ name: "Founder One", role: "CEO", email: "founder@example.com" }],
    technicalProfile: {
      productType: "AI Agent",
      modalities: ["text", "audio"],
      stack: ["OpenAI", "Supabase"],
      limitations: "Requires clean handoff rules.",
      privacy: "Customer data is isolated per workspace.",
      evaluationClaims: "Partner supplied pilot accuracy."
    }
  };
}

test("readiness gates product submissions but allows complete payloads", () => {
  const incomplete = calculateReadiness({ type: "Product", name: "Half" });
  assert.equal(incomplete.canSubmit, false);
  assert.ok(incomplete.missingItems.includes("Thumbnail uploaded"));

  const event = createSubmissionEvent("saveSubmissionDraft", { submission: completeSubmission() }, member, { submissions: [] });
  assert.equal(event.submission.readiness.canSubmit, true);
  assert.equal(event.submission.readiness.score, 100);
});

test("tech passports use evidence readiness instead of marketing image requirements", () => {
  const passport = {
    type: "Tech Passport",
    name: "Evidence Agent",
    tagline: "Auditable AI workflow automation",
    shortDescription: "A governed agent platform for enterprise document workflows.",
    category: "Developer / AI Infrastructure",
    stage: "Seed",
    longDescriptionMarkdown: "Context → API service → retrieval → model router → human approval.",
    links: [{ type: "github", url: "https://github.com/example/evidence-agent" }],
    teamMembers: [{ name: "Founder", role: "CTO", email: "founder@example.com" }],
    technicalProfile: {
      productType: "AI Agent",
      modalities: ["LLM", "RAG"],
      stack: ["TypeScript", "PostgreSQL"],
      deployment: "Korea-region container deployment with tenant isolation.",
      apiDetails: "REST API with OAuth2 and signed webhooks.",
      limitations: "Human approval is required for high-risk actions.",
      privacy: "Customer data is isolated and deleted by policy.",
      evaluationClaims: "95% task completion on a pinned 100-case evaluation set."
    }
  };
  const event = createSubmissionEvent("saveSubmissionDraft", { submission: passport }, member, { submissions: [] });

  assert.equal(event.submission.readiness.canSubmit, true);
  assert.equal(event.submission.readiness.score, 100);
  assert.equal(event.submission.assets.length, 0);
});

test("approved-partner stack visibility requires a matching active technical-profile grant", () => {
  const passport = {
    type: "Tech Passport",
    name: "Private Stack Agent",
    tagline: "Controlled technical disclosure",
    shortDescription: "An enterprise agent with partner-gated technical details.",
    category: "Developer / AI Infrastructure",
    stage: "Seed",
    longDescriptionMarkdown: "Context → services → model router → approval.",
    links: [{ type: "github", url: "https://github.com/example/private-stack" }],
    teamMembers: [{ name: "Founder", role: "CTO", email: member.email }],
    technicalProfile: {
      productType: "AI Agent",
      modalities: ["LLM", "RAG"],
      stack: ["TypeScript", "Python"],
      frameworks: ["Next.js", "FastAPI"],
      providers: ["AWS"],
      dataSources: ["PostgreSQL", "Redis"],
      stackVisibility: "approved_partner",
      deployment: "AWS container deployment.",
      apiDetails: "OAuth2 REST API.",
      limitations: "Human approval required.",
      privacy: "Tenant-isolated storage.",
      evaluationClaims: "Pinned evaluation set."
    }
  };
  const draft = createSubmissionEvent("saveSubmissionDraft", { submission: passport }, member, { submissions: [] });
  const submitted = createSubmissionEvent(
    "submitSubmissionForReview",
    { id: draft.submission.id, submission: draft.submission },
    member,
    { submissions: [draft.submission] }
  );
  const approved = createSubmissionEvent(
    "approveSubmission",
    { id: submitted.submission.id },
    staff,
    { submissions: [submitted.submission] }
  );
  const published = createSubmissionEvent(
    "publishSubmission",
    { id: approved.submission.id },
    staff,
    { submissions: [approved.submission] }
  );

  const memberView = filterSubmissionsForViewer([published.submission], otherMember)[0];
  const partnerWithoutGrant = filterSubmissionsForViewer([published.submission], b2bPartner)[0];
  assert.deepEqual(memberView.technicalProfile.stack, []);
  assert.equal(memberView.technicalProfile.stackRestricted, true);
  assert.deepEqual(partnerWithoutGrant.technicalProfile.stack, []);
  assert.equal(partnerWithoutGrant.technicalProfile.stackRestricted, true);

  const rejectedGrantCases = [
    { partnerEmail: "different@partner.com", scopes: ["technical_profile"], expiresAt: "2099-01-01T00:00:00.000Z" },
    { partnerEmail: b2bPartner.email, scopes: ["contact"], expiresAt: "2099-01-01T00:00:00.000Z" },
    { partnerEmail: b2bPartner.email, scopes: ["technical_profile"], expiresAt: "2020-01-01T00:00:00.000Z" }
  ];
  for (const grant of rejectedGrantCases) {
    const restricted = filterSubmissionsForViewer([{ ...published.submission, partnerGrants: [grant] }], b2bPartner)[0];
    assert.deepEqual(restricted.technicalProfile.stack, []);
    assert.equal(restricted.technicalProfile.stackRestricted, true);
  }

  const emailGranted = filterSubmissionsForViewer(
    [
      {
        ...published.submission,
        partnerGrants: [
          { partnerEmail: b2bPartner.email, scopes: ["technical_profile"], expiresAt: "2099-01-01T00:00:00.000Z" }
        ]
      }
    ],
    b2bPartner
  )[0];
  assert.deepEqual(emailGranted.technicalProfile.stack, ["TypeScript", "Python"]);

  const profileGranted = filterSubmissionsForViewer(
    [
      {
        ...published.submission,
        partnerGrants: [
          { partnerId: b2bPartner.b2bProfileId, scopes: ["technical_profile"], expiresAt: "2099-01-01T00:00:00.000Z" }
        ]
      }
    ],
    b2bPartner
  )[0];
  assert.deepEqual(profileGranted.technicalProfile.stack, ["TypeScript", "Python"]);
});

test("published records marked private stay out of Discover and non-owner views", () => {
  const draft = createSubmissionEvent("saveSubmissionDraft", { submission: completeSubmission() }, member, { submissions: [] });
  const privatePublished = { ...draft.submission, status: "published", visibility: "private" };

  assert.equal(filterSubmissionsForViewer([privatePublished], otherMember).length, 0);
  assert.equal(filterSubmissionsForViewer([privatePublished], staff).length, 1);

  const snapshot = buildArenaSnapshot([], "2026-06-07T00:03:00Z", [privatePublished]);
  assert.equal(snapshot.startups.some((startup) => startup.id === privatePublished.id), false);
});

test("converted B2B accounts do not inherit legacy member submission ownership", () => {
  const draft = createSubmissionEvent("saveSubmissionDraft", { submission: completeSubmission() }, member, { submissions: [] }).submission;
  const convertedPartner = {
    ...b2bPartner,
    id: member.id,
    email: member.email
  };

  assert.equal(filterSubmissionsForViewer([draft], convertedPartner).length, 0);

  const published = {
    ...draft,
    status: "published",
    visibility: "public",
    technicalProfile: {
      ...draft.technicalProfile,
      stackVisibility: "arena_members"
    }
  };
  const [safeView] = filterSubmissionsForViewer([published], convertedPartner);

  assert.equal(safeView.ownerId, null);
  assert.equal(safeView.ownerEmail, "");
  assert.equal(Object.hasOwn(safeView.teamMembers[0], "email"), false);
  assert.deepEqual(safeView.technicalProfile.stack, []);
  assert.equal(safeView.technicalProfile.stackRestricted, true);
});

test("URL validation rejects unsafe schemes and removes tracking params", () => {
  assert.equal(validateUrl("javascript:alert(1)").ok, false);
  const result = validateUrl("https://example.com/demo?utm_source=mail&keep=yes");
  assert.equal(result.ok, true);
  assert.equal(result.url, "https://example.com/demo?keep=yes");
});

test("file validation rejects executable web uploads", () => {
  assert.equal(validateAsset({ fileName: "logo.svg", mimeType: "image/svg+xml", size: 100 }).ok, false);
  assert.equal(validateAsset({ fileName: "logo.png", mimeType: "image/png", size: PNG_1X1_SIZE, dataUrl: PNG_1X1_DATA_URL }).ok, true);
  assert.equal(validateAsset({ fileName: "logo.png", mimeType: "image/png", size: 100, dataUrl: "data:text/html;base64,abc" }).ok, false);
});

test("file validation rejects disguised non-images and oversize uploads", () => {
  const disguised = `data:image/png;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`;
  assert.equal(validateAsset({ fileName: "logo.png", mimeType: "image/png", size: 25, dataUrl: disguised }).ok, false);
  assert.equal(validateAsset({ fileName: "large.png", mimeType: "image/png", size: 1_500_001, dataUrl: PNG_1X1_DATA_URL }).ok, false);
});

test("jpeg EXIF metadata is stripped before asset persistence", () => {
  const dataUrl = jpegWithExifDataUrl();
  const size = Buffer.from(dataUrl.split(",")[1], "base64").length;
  const result = sanitizeAsset({ fileName: "photo.jpg", mimeType: "image/jpeg", size, dataUrl });
  assert.equal(result.ok, true);
  const stripped = Buffer.from(result.asset.dataUrl.split(",")[1], "base64");
  assert.equal(stripped.includes(Buffer.from("Exif")), false);
  assert.equal(validateAsset(result.asset).ok, true);
});

test("approved members can submit own project but cannot publish it", () => {
  const draft = createSubmissionEvent("saveSubmissionDraft", { submission: completeSubmission() }, member, { submissions: [] });
  const submitted = createSubmissionEvent(
    "submitSubmissionForReview",
    { id: draft.submission.id, submission: draft.submission },
    member,
    { submissions: [draft.submission] }
  );
  assert.equal(submitted.submission.status, "submitted");
  assert.throws(
    () => createSubmissionEvent("publishSubmission", { id: submitted.submission.id }, member, { submissions: [submitted.submission] }),
    /Only SparkLabs staff/
  );
});

test("B2B partners cannot use member submission actions", () => {
  assert.throws(
    () => createSubmissionEvent("saveSubmissionDraft", { submission: completeSubmission() }, b2bPartner, { submissions: [] }),
    /Only approved members/
  );
});

test("members cannot read or mutate another member draft", () => {
  const draft = createSubmissionEvent("saveSubmissionDraft", { submission: completeSubmission() }, member, { submissions: [] });
  assert.equal(filterSubmissionsForViewer([draft.submission], otherMember).length, 0);
  assert.throws(
    () =>
      createSubmissionEvent(
        "saveSubmissionDraft",
        { submission: { ...draft.submission, tagline: "Stolen edit" } },
        otherMember,
        { submissions: [draft.submission] }
      ),
    /own submissions/
  );
});

test("staff can publish and published submissions appear in Discover snapshot", () => {
  const draft = createSubmissionEvent("saveSubmissionDraft", { submission: completeSubmission() }, member, { submissions: [] }, "2026-06-07T00:00:00Z");
  const submitted = createSubmissionEvent(
    "submitSubmissionForReview",
    { id: draft.submission.id, submission: draft.submission },
    member,
    { submissions: [draft.submission] },
    "2026-06-07T00:01:00Z"
  );
  const published = createSubmissionEvent(
    "publishSubmission",
    { id: submitted.submission.id, note: "Approved" },
    staff,
    { submissions: [submitted.submission] },
    "2026-06-07T00:02:00Z"
  );
  const snapshot = buildArenaSnapshot([published, submitted, draft], "2026-06-07T00:03:00Z");
  assert.ok(snapshot.startups.some((startup) => startup.id === draft.submission.id));
  assert.equal(snapshot.submissions[0].status, "published");
});

test("invite-only human validation requires nomination before member acceptance", () => {
  const draft = createSubmissionEvent("saveSubmissionDraft", { submission: completeSubmission() }, member, { submissions: [] });
  assert.throws(
    () => createSubmissionEvent("acceptHumanValidationInvitation", { id: draft.submission.id }, member, { submissions: [draft.submission] }),
    /Human validation request not found/
  );

  const nominated = createSubmissionEvent(
    "nominateHumanValidation",
    { id: draft.submission.id, validationType: "Technical validation", reason: "Strong enterprise pilot candidate." },
    staff,
    { submissions: [draft.submission] },
    "2026-06-07T00:03:00Z"
  );
  assert.equal(nominated.submission.humanValidation.humanStatus, "invited");

  const accepted = createSubmissionEvent(
    "acceptHumanValidationInvitation",
    { id: draft.submission.id, requestId: nominated.submission.humanValidation.requests[0].id },
    member,
    { submissions: [nominated.submission] },
    "2026-06-07T00:04:00Z"
  );
  assert.equal(accepted.submission.humanValidation.humanStatus, "requested");
  assert.equal(accepted.submission.humanValidation.requests[0].memberConsentAt, "2026-06-07T00:04:00Z");
});

test("assigned human validator submits weighted rubric review and staff issues badge", () => {
  const draft = createSubmissionEvent("saveSubmissionDraft", { submission: completeSubmission() }, member, { submissions: [] }, "2026-06-07T00:00:00Z");
  const nominated = createSubmissionEvent("nominateHumanValidation", { id: draft.submission.id }, staff, { submissions: [draft.submission] }, "2026-06-07T00:01:00Z");
  const accepted = createSubmissionEvent(
    "acceptHumanValidationInvitation",
    { id: draft.submission.id, requestId: nominated.submission.humanValidation.requests[0].id },
    member,
    { submissions: [nominated.submission] },
    "2026-06-07T00:02:00Z"
  );
  const assigned = createSubmissionEvent(
    "assignHumanValidator",
    {
      id: draft.submission.id,
      requestId: accepted.submission.humanValidation.requests[0].id,
      reviewerEmail: validator.email,
      validatorType: "technical_expert"
    },
    staff,
    { submissions: [accepted.submission] },
    "2026-06-07T00:03:00Z"
  );
  const assignmentId = assigned.submission.humanValidation.assignments[0].id;
  assert.throws(
    () => createSubmissionEvent("submitHumanValidationReview", { assignmentId, scores: {} }, b2bPartner, { submissions: [assigned.submission] }),
    /Only assigned active human validators/
  );

  const reviewed = createSubmissionEvent(
    "submitHumanValidationReview",
    {
      assignmentId,
      conflictStatus: "no_conflict",
      confidence: 90,
      publicSummary: "Technically credible and ready for a focused enterprise pilot.",
      privateNote: "Private reviewer note must stay hidden.",
      riskFlags: "procurement",
      missingEvidence: "security questionnaire",
      rubricScores: {
        product_clarity: { score: 9 },
        problem_relevance: { score: 8 },
        demo_functionality: { score: 8 },
        b2b_customer_fit: { score: 9 },
        technical_credibility: { score: 8 },
        evidence_traction: { score: 7 },
        enterprise_readiness: { score: 7 },
        differentiation: { score: 6 }
      }
    },
    validator,
    { submissions: [assigned.submission] },
    "2026-06-07T00:04:00Z"
  );
  assert.equal(reviewed.submission.humanValidation.reviewCount, 1);
  assert.equal(reviewed.submission.humanValidation.humanScore, 79.5);
  assert.ok(reviewed.submission.humanValidation.confidence > 0.45);

  const badged = createSubmissionEvent(
    "issueHumanValidationBadge",
    { id: draft.submission.id, requestId: reviewed.submission.humanValidation.requests[0].id, publicNote: "SparkLabs Human Validated after selected expert review." },
    staff,
    { submissions: [reviewed.submission] },
    "2026-06-07T00:05:00Z"
  );
  assert.equal(badged.submission.humanValidation.humanStatus, "human_validated");
  assert.equal(badged.submission.humanValidation.badges[0].status, "active");
});

test("human validation snapshot hides private notes and exposes assigned reviewer queue", () => {
  const draft = createSubmissionEvent("saveSubmissionDraft", { submission: completeSubmission() }, member, { submissions: [] }, "2026-06-07T00:00:00Z");
  const nominated = createSubmissionEvent("nominateHumanValidation", { id: draft.submission.id }, staff, { submissions: [draft.submission] }, "2026-06-07T00:01:00Z");
  const assigned = createSubmissionEvent(
    "assignHumanValidator",
    { id: draft.submission.id, requestId: nominated.submission.humanValidation.requests[0].id, reviewerEmail: validator.email },
    staff,
    { submissions: [nominated.submission] },
    "2026-06-07T00:02:00Z"
  );
  const reviewed = createSubmissionEvent(
    "submitHumanValidationReview",
    {
      assignmentId: assigned.submission.humanValidation.assignments[0].id,
      conflictStatus: "no_conflict",
      confidence: 85,
      publicSummary: "Useful product for B2B validation.",
      privateNote: "Internal diligence note.",
      rubricScores: Object.fromEntries([
        "product_clarity",
        "problem_relevance",
        "demo_functionality",
        "b2b_customer_fit",
        "technical_credibility",
        "evidence_traction",
        "enterprise_readiness",
        "differentiation"
      ].map((key) => [key, { score: 8 }]))
    },
    validator,
    { submissions: [assigned.submission] },
    "2026-06-07T00:03:00Z"
  );

  const staffView = filterSubmissionsForViewer([reviewed.submission], staff)[0];
  assert.equal(staffView.humanValidation.reviews[0].privateNote, "Internal diligence note.");

  const memberView = filterSubmissionsForViewer([reviewed.submission], member)[0];
  assert.equal(memberView.humanValidation.reviews[0].publicSummary, "Useful product for B2B validation.");
  assert.equal(Object.hasOwn(memberView.humanValidation.reviews[0], "privateNote"), false);

  const reviewerQueue = humanValidationQueueForViewer([reviewed.submission], validator);
  assert.equal(reviewerQueue.length, 1);
  assert.equal(reviewerQueue[0].humanValidation.reviews[0].privateNote, "Internal diligence note.");
});

test("Arena Card markdown labels partner-supplied metadata", () => {
  const card = generateArenaCardMarkdown({
    ...completeSubmission(),
    status: "submitted",
    review: { staffVerified: false }
  });
  assert.match(card, /verification: partner_supplied/);
  assert.match(card, /# Agent Desk/);
  assert.match(card, /Partner supplied pilot accuracy/);
});

test("Supabase submission rows keep indexed columns and full payload", () => {
  const event = createSubmissionEvent("saveSubmissionDraft", { submission: completeSubmission() }, member, { submissions: [] });
  const row = submissionRow(event.submission);
  assert.equal(row.id, event.submission.id);
  assert.equal(row.owner_email, "founder@example.com");
  assert.equal(row.status, "draft");
  assert.equal(row.payload.name, "Agent Desk");
  assert.equal(row.readiness_score, 100);

  const config = supabaseSubmissionConfig({
    SUPABASE_URL: "https://example.supabase.co/",
    SUPABASE_SECRET_KEY: "server-secret"
  });
  assert.equal(config.supabaseUrl, "https://example.supabase.co");
  assert.equal(config.configured, true);
});

function jpegWithExifDataUrl() {
  const bytes = Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xe1,
    0x00,
    0x10,
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00,
    0x53,
    0x45,
    0x43,
    0x52,
    0x45,
    0x54,
    0x21,
    0x21,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    0x00,
    0x01,
    0x00,
    0x01,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xda,
    0x00,
    0x08,
    0x01,
    0x01,
    0x00,
    0x00,
    0x3f,
    0x00,
    0x00,
    0xff,
    0xd9
  ]);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}
