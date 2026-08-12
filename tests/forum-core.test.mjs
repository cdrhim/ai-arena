import assert from "node:assert/strict";
import test from "node:test";

import {
  buildForumSnapshot,
  createForumEvent,
  forumComposerCategories,
  forumComposerVisibilities,
  forumHotScore,
  sanitizeForumMarkdown
} from "../netlify/lib/forum-core.mjs";

const member = { id: "member_1", email: "member@example.com", role: "member", roleLabel: "Approved member" };
const partner = { id: "partner_1", email: "partner@example.com", role: "b2b_partner", roleLabel: "B2B partner" };
const staff = { id: "staff_1", email: "staff@sparklabs.co.kr", role: "sparklabs", roleLabel: "SparkLabs staff", canScore: true };
const unapproved = { id: "public_1", email: "public@example.com", role: "public", roleLabel: "Public" };

test("forum hot score rewards votes and recency with pinned/staff boosts", () => {
  const base = forumHotScore(
    { upvoteCount: 10, commentCount: 4, createdAt: "2026-06-30T00:00:00.000Z" },
    "2026-06-30T01:00:00.000Z"
  );
  const boosted = forumHotScore(
    { upvoteCount: 10, commentCount: 4, pinned: true, staffPick: true, createdAt: "2026-06-30T00:00:00.000Z" },
    "2026-06-30T01:00:00.000Z"
  );
  assert.ok(boosted > base);
});

test("forum thread validation and public snapshot avoid private author fields", () => {
  const event = createForumEvent(
    "createForumThread",
    {
      title: "What eval stack are Korean AI teams using?",
      categorySlug: "technical",
      bodyMarkdown: "Looking for practical agent reliability evals.",
      visibility: "public"
    },
    member,
    [],
    "2026-06-30T00:00:00.000Z"
  );
  const snapshot = buildForumSnapshot([event], { viewer: member, now: "2026-06-30T00:10:00.000Z" });
  assert.equal(snapshot.threads[0].title, "What eval stack are Korean AI teams using?");
  assert.equal(Object.hasOwn(snapshot.threads[0], "authorEmail"), false);
  assert.equal(Object.hasOwn(snapshot.threads[0], "staffNotes"), false);
});

test("forum votes dedupe server-side", () => {
  const thread = createForumEvent(
    "createForumThread",
    { title: "Show us your B2B AI pilot checklist", categorySlug: "b2b", bodyMarkdown: "Checklist please." },
    partner,
    [],
    "2026-06-30T00:00:00.000Z"
  );
  const vote = createForumEvent("voteForumThread", { threadId: thread.thread.id }, member, [thread], "2026-06-30T00:01:00.000Z");
  assert.throws(
    () => createForumEvent("voteForumThread", { threadId: thread.thread.id }, member, [thread, vote], "2026-06-30T00:02:00.000Z"),
    /already upvoted/
  );
  const snapshot = buildForumSnapshot([thread, vote, vote], { viewer: member, now: "2026-06-30T00:03:00.000Z" });
  assert.equal(snapshot.threads[0].upvoteCount, 1);
});

test("forum snapshot exposes only the signed-in user's safe My Log activity", () => {
  const ownThread = createForumEvent(
    "createForumThread",
    { title: "Looking for a manufacturing pilot peer", categorySlug: "connect", bodyMarkdown: "Who has shipped a factory PoC?" },
    member,
    [],
    "2026-08-11T01:00:00.000Z"
  );
  const partnerThread = createForumEvent(
    "createForumThread",
    { title: "Partner feedback office hours", categorySlug: "b2b", bodyMarkdown: "Share what you are testing." },
    partner,
    [ownThread],
    "2026-08-11T01:05:00.000Z"
  );
  const replyReceived = createForumEvent(
    "createForumComment",
    { threadId: ownThread.thread.id, bodyMarkdown: "We can share our PoC checklist." },
    partner,
    [ownThread, partnerThread],
    "2026-08-11T01:10:00.000Z"
  );
  const ownComment = createForumEvent(
    "createForumComment",
    { threadId: partnerThread.thread.id, bodyMarkdown: "I would like to join the office hours." },
    member,
    [ownThread, partnerThread, replyReceived],
    "2026-08-11T01:15:00.000Z"
  );
  const threadVote = createForumEvent(
    "voteForumThread",
    { threadId: ownThread.thread.id },
    partner,
    [ownThread, partnerThread, replyReceived, ownComment],
    "2026-08-11T01:20:00.000Z"
  );
  const commentVote = createForumEvent(
    "voteForumComment",
    { commentId: ownComment.comment.id },
    partner,
    [ownThread, partnerThread, replyReceived, ownComment, threadVote],
    "2026-08-11T01:21:00.000Z"
  );
  const snapshot = buildForumSnapshot(
    [ownThread, partnerThread, replyReceived, ownComment, threadVote, commentVote],
    { viewer: member, now: "2026-08-11T01:30:00.000Z" }
  );

  assert.deepEqual(snapshot.personalActivity.summary, { posts: 1, comments: 1, commentsReceived: 1, likesReceived: 2 });
  assert.equal(snapshot.personalActivity.posts[0].title, ownThread.thread.title);
  assert.equal(snapshot.personalActivity.comments[0].threadTitle, partnerThread.thread.title);
  assert.equal(snapshot.personalActivity.reactions.filter((item) => item.kind === "comment_received").length, 1);
  assert.equal(snapshot.personalActivity.reactions.filter((item) => item.kind === "like_received").length, 2);
  assert.equal(JSON.stringify(snapshot.personalActivity).includes(member.email), false);
  assert.equal(JSON.stringify(snapshot.personalActivity).includes(partner.email), false);
});

test("forum permissions let B2B partners post publicly while staff retains moderation", () => {
  const partnerThread = createForumEvent(
    "createForumThread",
    { title: "Show launch feedback request", categorySlug: "show", bodyMarkdown: "A partner shares a public launch request.", visibility: "public" },
    partner,
    [],
    "2026-06-30T00:00:00.000Z"
  );
  assert.equal(partnerThread.thread.visibility, "public");
  assert.equal(partnerThread.thread.categorySlug, "show");
  const staffThread = createForumEvent(
    "createForumThread",
    { title: "Official AMA", categorySlug: "ama", bodyMarkdown: "SparkLabs AMA.", pinned: true, staffPick: true },
    staff,
    [],
    "2026-06-30T00:00:00.000Z"
  );
  const moderated = createForumEvent(
    "moderateThread",
    { threadId: staffThread.thread.id, moderationAction: "lock", reason: "AMA closed." },
    staff,
    [staffThread],
    "2026-06-30T00:05:00.000Z"
  );
  const snapshot = buildForumSnapshot([partnerThread, staffThread, moderated], { viewer: staff, now: "2026-06-30T00:06:00.000Z" });
  assert.equal(snapshot.threads.find((thread) => thread.id === staffThread.thread.id).locked, true);
  assert.equal(snapshot.moderationActions.length, 1);
  assert.ok(forumComposerCategories(partner).some((category) => category.slug === "show"));
  assert.deepEqual(forumComposerVisibilities(partner), ["public"]);
  assert.deepEqual(forumComposerVisibilities(member), ["public", "members_only"]);
  assert.deepEqual(forumComposerVisibilities(staff), ["public", "members_only"]);
});

test("forum public means approved SparkClaw members and industry partners, not unapproved accounts", () => {
  const publicThread = createForumEvent(
    "createForumThread",
    { title: "Shared SparkClaw update", categorySlug: "general", bodyMarkdown: "Approved network update.", visibility: "public" },
    member,
    [],
    "2026-08-11T00:00:00.000Z"
  );
  const memberView = buildForumSnapshot([publicThread], { viewer: member, now: "2026-08-11T00:01:00.000Z" });
  const partnerView = buildForumSnapshot([publicThread], { viewer: partner, now: "2026-08-11T00:01:00.000Z" });
  const unapprovedView = buildForumSnapshot([publicThread], { viewer: unapproved, now: "2026-08-11T00:01:00.000Z" });
  assert.equal(memberView.threads.length, 1);
  assert.equal(partnerView.threads.length, 1);
  assert.equal(unapprovedView.threads.length, 0);
});

test("legacy partner-only threads follow the new Public audience without widening staff-only records", () => {
  const partnerLegacy = createForumEvent(
    "createForumThread",
    { title: "Legacy partner update", categorySlug: "b2b", bodyMarkdown: "Legacy partner post.", visibility: "public" },
    partner,
    [],
    "2026-08-11T00:00:00.000Z"
  );
  partnerLegacy.thread.visibility = "partners_only";
  const staffLegacy = createForumEvent(
    "createForumThread",
    { title: "Internal moderation note", categorySlug: "general", bodyMarkdown: "Staff-only legacy record.", visibility: "public" },
    staff,
    [partnerLegacy],
    "2026-08-11T00:01:00.000Z"
  );
  staffLegacy.thread.visibility = "staff_only";
  const memberView = buildForumSnapshot([partnerLegacy, staffLegacy], { viewer: member, now: "2026-08-11T00:02:00.000Z" });
  const staffView = buildForumSnapshot([partnerLegacy, staffLegacy], { viewer: staff, now: "2026-08-11T00:02:00.000Z" });
  assert.deepEqual(memberView.threads.map((thread) => thread.id), [partnerLegacy.thread.id]);
  assert.equal(staffView.threads.length, 2);
});

test("forum comments enforce nesting depth and sanitize markdown", () => {
  const thread = createForumEvent(
    "createForumThread",
    { title: "Nested comment test", categorySlug: "ask", bodyMarkdown: "How deep is safe?" },
    member,
    [],
    "2026-06-30T00:00:00.000Z"
  );
  let events = [thread];
  let parentCommentId = null;
  for (let depth = 0; depth <= 5; depth += 1) {
    const comment = createForumEvent(
      "createForumComment",
      { threadId: thread.thread.id, parentCommentId, bodyMarkdown: `Depth ${depth}` },
      member,
      events,
      `2026-06-30T00:0${depth + 1}:00.000Z`
    );
    events = [...events, comment];
    parentCommentId = comment.comment.id;
  }
  assert.throws(
    () =>
      createForumEvent(
        "createForumComment",
        { threadId: thread.thread.id, parentCommentId, bodyMarkdown: "<script>alert(1)</script>" },
        member,
        events,
        "2026-06-30T00:10:00.000Z"
      ),
    /nested levels/
  );
  assert.doesNotMatch(sanitizeForumMarkdown("<script>alert(1)</script><b>x</b> javascript:alert(1)"), /<script|<b>|javascript:/i);
});

test("forum comments require an approved role", () => {
  const thread = createForumEvent(
    "createForumThread",
    { title: "Approved commenters only", categorySlug: "general", bodyMarkdown: "Public discussion." },
    member,
    [],
    "2026-06-30T00:00:00.000Z"
  );

  assert.throws(
    () =>
      createForumEvent(
        "createForumComment",
        { threadId: thread.thread.id, bodyMarkdown: "An unapproved account must not publish this." },
        unapproved,
        [thread],
        "2026-06-30T00:01:00.000Z"
      ),
    (error) => error.status === 404 && /thread not found/i.test(error.message)
  );

  const partnerComment = createForumEvent(
    "createForumComment",
    { threadId: thread.thread.id, bodyMarkdown: "An approved partner can join a visible public discussion." },
    partner,
    [thread],
    "2026-06-30T00:02:00.000Z"
  );
  assert.equal(partnerComment.comment.threadId, thread.thread.id);

  const technicalThread = createForumEvent(
    "createForumThread",
    { title: "Founder technical discussion", categorySlug: "technical", bodyMarkdown: "Member-created technical context." },
    member,
    [thread],
    "2026-06-30T00:03:00.000Z"
  );
  const technicalComment = createForumEvent(
    "createForumComment",
    { threadId: technicalThread.thread.id, bodyMarkdown: "An approved partner can comment in a public technical channel." },
    partner,
    [thread, technicalThread],
    "2026-06-30T00:04:00.000Z"
  );
  assert.equal(technicalComment.comment.threadId, technicalThread.thread.id);
});

test("forum comment replies require an existing parent in the same thread", () => {
  const firstThread = createForumEvent(
    "createForumThread",
    { title: "First reply thread", categorySlug: "general", bodyMarkdown: "First thread." },
    member,
    [],
    "2026-06-30T00:00:00.000Z"
  );
  const secondThread = createForumEvent(
    "createForumThread",
    { title: "Second reply thread", categorySlug: "general", bodyMarkdown: "Second thread." },
    member,
    [firstThread],
    "2026-06-30T00:01:00.000Z"
  );
  const firstComment = createForumEvent(
    "createForumComment",
    { threadId: firstThread.thread.id, bodyMarkdown: "Parent on the first thread." },
    member,
    [firstThread, secondThread],
    "2026-06-30T00:02:00.000Z"
  );
  const events = [firstThread, secondThread, firstComment];

  assert.throws(
    () =>
      createForumEvent(
        "createForumComment",
        { threadId: secondThread.thread.id, parentCommentId: "missing-comment", bodyMarkdown: "Missing parent." },
        member,
        events,
        "2026-06-30T00:03:00.000Z"
      ),
    (error) => error.status === 404 && /parent comment not found/i.test(error.message)
  );
  assert.throws(
    () =>
      createForumEvent(
        "createForumComment",
        { threadId: secondThread.thread.id, parentCommentId: firstComment.comment.id, bodyMarkdown: "Cross-thread reply." },
        member,
        events,
        "2026-06-30T00:04:00.000Z"
      ),
    (error) => error.status === 400 && /same thread/i.test(error.message)
  );
});

test("Founder Commons supports Ask, Ship, Connect, and Outcome post types", () => {
  const cases = [
    ["ask", "ask"],
    ["show", "ship"],
    ["connect", "connect"],
    ["outcome", "outcome"]
  ];
  const events = cases.map(([categorySlug, threadType], index) =>
    createForumEvent(
      "createForumThread",
      {
        title: `${threadType} founder workflow ${index}`,
        categorySlug,
        threadType,
        bodyMarkdown: `Human-authored ${threadType} details and concrete context.`,
        visibility: "members_only"
      },
      member,
      [],
      `2026-08-07T0${index}:00:00.000Z`
    )
  );
  const snapshot = buildForumSnapshot(events, { viewer: member, now: "2026-08-07T05:00:00.000Z" });

  assert.deepEqual(new Set(snapshot.threads.map((thread) => thread.threadType)), new Set(["ask", "ship", "connect", "outcome"]));
  assert.equal(snapshot.founderCommonsAccess, true);
  assert.equal(snapshot.threads.find((thread) => thread.threadType === "connect").introductionPolicy, "double_opt_in");
  assert.equal(snapshot.threads.find((thread) => thread.threadType === "connect").introductionStatus, "awaiting_sparklabs_review");
  assert.equal(snapshot.threads.find((thread) => thread.threadType === "outcome").responseStatus, "outcome_recorded");
});

test("B2B partners see public Community channels but never founder-private threads", () => {
  const founderAsk = createForumEvent(
    "createForumThread",
    {
      title: "Private founder request",
      categorySlug: "ask",
      threadType: "ask",
      bodyMarkdown: "Context shared only with verified founders.",
      visibility: "members_only"
    },
    member,
    [],
    "2026-08-07T00:00:00.000Z"
  );

  const founderSnapshot = buildForumSnapshot([founderAsk], { viewer: member, now: "2026-08-07T01:00:00.000Z" });
  const partnerSnapshot = buildForumSnapshot([founderAsk], { viewer: partner, now: "2026-08-07T01:00:00.000Z" });
  assert.equal(founderSnapshot.threads.length, 1);
  assert.equal(partnerSnapshot.threads.length, 0);
  assert.equal(partnerSnapshot.categories.some((category) => category.slug === "ask"), true);
  assert.equal(partnerSnapshot.founderCommonsAccess, false);
  assert.throws(
    () =>
      createForumEvent(
        "createForumThread",
        {
          title: "Partner cannot enter founder-private space",
          categorySlug: "b2b",
          bodyMarkdown: "This must remain partner-visible or public.",
          visibility: "members_only"
        },
        partner,
        [],
        "2026-08-07T02:00:00.000Z"
      ),
    /cannot use the selected forum visibility/
  );

  const publicAsk = createForumEvent(
    "createForumThread",
    {
      title: "Public founder and partner request",
      categorySlug: "ask",
      threadType: "ask",
      bodyMarkdown: "A public request that approved corporate partners can read.",
      visibility: "public"
    },
    member,
    [founderAsk],
    "2026-08-07T03:00:00.000Z"
  );
  const sharedSnapshot = buildForumSnapshot([founderAsk, publicAsk], { viewer: partner, now: "2026-08-07T04:00:00.000Z" });
  assert.deepEqual(sharedSnapshot.threads.map((thread) => thread.id), [publicAsk.thread.id]);
});

test("response status exposes the 24-hour first-response operating SLA", () => {
  const ask = createForumEvent(
    "createForumThread",
    {
      title: "Need a concrete founder answer",
      categorySlug: "ask",
      threadType: "ask",
      bodyMarkdown: "Context, attempted solution, blocker, and a specific request.",
      visibility: "members_only"
    },
    member,
    [],
    "2026-08-07T00:00:00.000Z"
  );
  const awaiting = buildForumSnapshot([ask], { viewer: member, now: "2026-08-07T23:00:00.000Z" }).threads[0];
  const overdue = buildForumSnapshot([ask], { viewer: member, now: "2026-08-08T01:00:00.000Z" }).threads[0];
  const reply = createForumEvent(
    "createForumComment",
    { threadId: ask.thread.id, bodyMarkdown: "A human founder reply with a concrete next step." },
    member,
    [ask],
    "2026-08-08T02:00:00.000Z"
  );
  const answered = buildForumSnapshot([ask, reply], { viewer: member, now: "2026-08-08T03:00:00.000Z" }).threads[0];

  assert.equal(awaiting.responseSlaHours, 24);
  assert.equal(awaiting.responseDueAt, "2026-08-08T00:00:00.000Z");
  assert.equal(awaiting.responseStatus, "awaiting_response");
  assert.equal(overdue.responseStatus, "needs_attention");
  assert.equal(answered.responseStatus, "response_received");
});

test("explicit demo mode never fabricates founder conversations", () => {
  const snapshot = buildForumSnapshot([], { viewer: member, demo: true, now: "2026-08-07T00:00:00.000Z" });
  assert.equal(snapshot.threads.length, 0);
  assert.equal(snapshot.comments.length, 0);
});
