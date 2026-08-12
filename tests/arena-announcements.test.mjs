import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import arenaAnnouncementsApi, { publicAnnouncements } from "../netlify/functions/arena-announcements.mjs";
import { buildForumSnapshot, createForumEvent, forumComposerCategories } from "../netlify/lib/forum-core.mjs";

const member = { id: "member-1", email: "member@example.com", role: "member" };
const partner = { id: "partner-1", email: "partner@example.com", role: "b2b_partner" };
const staff = { id: "staff-1", email: "staff@sparklabs.co.kr", role: "sparklabs", canScore: true };

test("only SparkLabs staff can publish official AI Arena announcements", () => {
  assert.equal(forumComposerCategories(member).some((category) => category.slug === "announcements"), false);
  assert.equal(forumComposerCategories(partner).some((category) => category.slug === "announcements"), false);
  assert.equal(forumComposerCategories(staff).some((category) => category.slug === "announcements"), true);
  assert.throws(() => createForumEvent("createForumThread", {
    title: "Member-authored fake notice",
    categorySlug: "announcements",
    bodyMarkdown: "This must never become an official notice.",
    visibility: "public",
    official: true,
    pinned: true
  }, member), (error) => error.status === 403);

  const event = createForumEvent("createForumThread", {
    title: "새로운 AI Arena 운영 안내",
    categorySlug: "announcements",
    bodyMarkdown: "AI Arena 기능 업데이트와 적용 시점을 안내합니다.",
    visibility: "public",
    threadType: "announcement",
    official: true,
    pinned: true,
    staffPick: true
  }, staff, [], "2026-08-12T01:00:00.000Z");
  assert.equal(event.thread.official, true);
  assert.equal(event.thread.pinned, true);
  assert.equal(event.thread.categorySlug, "announcements");
});

test("announcement projection exposes only visible official announcement threads", () => {
  const official = createForumEvent("createForumThread", {
    title: "AI Arena 공식 공지",
    categorySlug: "announcements",
    bodyMarkdown: "운영 변경 내용을 안내합니다.",
    visibility: "public",
    official: true,
    pinned: true
  }, staff, [], "2026-08-12T01:00:00.000Z");
  const ordinary = createForumEvent("createForumThread", {
    title: "일반 운영진 글",
    categorySlug: "general",
    bodyMarkdown: "일반 Community 글입니다.",
    visibility: "public",
    official: true
  }, staff, [official], "2026-08-12T02:00:00.000Z");
  const snapshot = buildForumSnapshot([official, ordinary], { viewer: member, now: "2026-08-12T03:00:00.000Z" });
  const result = publicAnnouncements(snapshot.threads);
  assert.deepEqual(result.map((item) => item.id), [official.thread.id]);
  assert.equal(Object.hasOwn(result[0], "authorEmail"), false);
});

test("announcement API authenticates viewers and returns their safe forum projection", async () => {
  const event = createForumEvent("createForumThread", {
    title: "승인 회원 대상 공지",
    categorySlug: "announcements",
    bodyMarkdown: "Community와 Arena 소식에 함께 표시됩니다.",
    visibility: "public",
    official: true,
    pinned: true
  }, staff, [], "2026-08-12T01:00:00.000Z");
  const response = await arenaAnnouncementsApi(new Request("https://example.test/api/arena-announcements"), {
    verifyRequest: async () => ({ ok: true, viewer: member }),
    loadEvents: async () => [event]
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.announcements.map((item) => item.id), [event.thread.id]);
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("Community composer and Arena updates share the same official announcement source", async () => {
  const [html, client, config] = await Promise.all([
    readFile(new URL("../public/arena/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/arena/community.js", import.meta.url), "utf8"),
    readFile(new URL("../netlify.toml", import.meta.url), "utf8")
  ]);
  assert.match(html, /id="communityAnnouncementTools"/);
  assert.match(html, /id="communityAnnouncementBoard"/);
  assert.match(client, /categorySlug === "announcements"/);
  assert.match(client, /payload\.official = true/);
  assert.match(client, /fetch\("\/api\/arena-announcements"/);
  assert.match(client, /Community 상단과 Discover의 Arena 소식/);
  assert.match(config, /from = "\/api\/arena-announcements"/);
});
