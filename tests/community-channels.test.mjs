import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildForumSnapshot, createForumEvent } from "../netlify/lib/forum-core.mjs";

const root = new URL("../", import.meta.url);
const communitySource = await readFile(new URL("public/arena/community.js", root), "utf8");
const htmlSource = await readFile(new URL("public/arena/index.html", root), "utf8");
const cssSource = await readFile(new URL("public/arena/arena.css", root), "utf8");

const member = { id: "member_channels", email: "member@example.com", role: "member" };
const partner = { id: "partner_channels", email: "partner@example.com", role: "b2b_partner" };
const unapproved = { id: "public_channels", email: "public@example.com", role: "public" };

test("approved users can create a channel and use it for threads and comments", () => {
  const categoryEvent = createForumEvent(
    "createForumCategory",
    { label: "AI 세일즈", description: "AI 세일즈 운영 사례", visibility: "public" },
    member,
    [],
    "2026-08-13T00:00:00.000Z"
  );
  const categorySlug = categoryEvent.category.slug;
  const emptySnapshot = buildForumSnapshot([categoryEvent], { viewer: member, now: "2026-08-13T00:01:00.000Z" });
  const newCategory = emptySnapshot.categories.find((category) => category.slug === categorySlug);
  assert.equal(newCategory.label, "AI 세일즈");
  assert.equal(newCategory.threadCount, 0);
  assert.equal(newCategory.canPost, true);

  const threadEvent = createForumEvent(
    "createForumThread",
    { title: "첫 AI 세일즈 사례", bodyMarkdown: "실제로 실행한 AI 세일즈 사례를 공유합니다.", categorySlug, visibility: "public" },
    member,
    [categoryEvent],
    "2026-08-13T00:02:00.000Z"
  );
  const commentEvent = createForumEvent(
    "createForumComment",
    { threadId: threadEvent.thread.id, bodyMarkdown: "파트너 관점에서도 유용한 사례입니다." },
    partner,
    [categoryEvent, threadEvent],
    "2026-08-13T00:03:00.000Z"
  );
  const activeSnapshot = buildForumSnapshot([categoryEvent, threadEvent, commentEvent], {
    viewer: member,
    now: "2026-08-13T00:04:00.000Z"
  });
  assert.equal(activeSnapshot.categories.find((category) => category.slug === categorySlug).threadCount, 1);
  assert.equal(activeSnapshot.threads[0].categoryLabel, "AI 세일즈");
  assert.equal(activeSnapshot.comments.length, 1);
});

test("channel creation rejects duplicates, private partner channels, and unapproved users", () => {
  const first = createForumEvent(
    "createForumCategory",
    { label: "글로벌 진출", visibility: "public" },
    member,
    [],
    "2026-08-13T01:00:00.000Z"
  );
  assert.throws(
    () => createForumEvent("createForumCategory", { label: "글로벌 진출", visibility: "public" }, member, [first], "2026-08-13T01:01:00.000Z"),
    (error) => error.status === 409
  );
  assert.throws(
    () => createForumEvent("createForumCategory", { label: "비공개 파트너", visibility: "members_only" }, partner, [], "2026-08-13T01:02:00.000Z"),
    (error) => error.status === 403
  );
  assert.throws(
    () => createForumEvent("createForumCategory", { label: "미승인 채널", visibility: "public" }, unapproved, [], "2026-08-13T01:03:00.000Z"),
    (error) => error.status === 403
  );
});

test("Community folds zero-count channels into muted recommendations and exposes the creator", () => {
  assert.match(htmlSource, /id="communityCreateChannelToggle"/);
  assert.match(htmlSource, /id="communityCreateChannelForm"/);
  assert.match(communitySource, /Number\(category\.threadCount \|\| 0\) > 0/);
  assert.match(communitySource, /Number\(category\.threadCount \|\| 0\) === 0/);
  assert.match(communitySource, /<details class="community-suggested-channels"/);
  assert.match(communitySource, /action: "createForumCategory"/);
  assert.match(communitySource, /preferredDraftCategorySlug/);
  assert.match(communitySource, /function configureChannelCreator\(\)/);
  assert.match(cssSource, /\.community-categories button\.is-suggested/);
  assert.match(cssSource, /opacity: 0\.88/);
});

test("AI suggested channel can be replaced with a directly entered channel", () => {
  assert.match(htmlSource, /id="communityCustomChannelField"/);
  assert.match(htmlSource, /id="communityCustomChannelName"[^>]*maxlength="40"/);
  assert.match(communitySource, /CUSTOM_CHANNEL_VALUE = "__custom_channel__"/);
  assert.match(communitySource, /＋ 새 채널 직접 입력/);
  assert.match(communitySource, /async function resolveThreadCategory\(payload\)/);
  assert.match(communitySource, /category\.label \|\| ""\)[\s\S]*toLocaleLowerCase\(\) === label\.toLocaleLowerCase\(\)/);
  assert.match(communitySource, /payload\.categorySlug = await resolveThreadCategory\(payload\)/);
  assert.match(cssSource, /\.community-custom-channel-field\[hidden\]/);
});
