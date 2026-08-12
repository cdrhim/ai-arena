import crypto from "node:crypto";
import { canViewAudienceScope } from "../../public/arena/audience-scope.js";

export const FORUM_CATEGORIES = [
  {
    id: "forum-cat-announcements",
    slug: "announcements",
    label: "AI Arena 공지",
    description: "SparkLabs 운영진이 게시하는 AI Arena 공식 안내와 운영 업데이트입니다.",
    type: "announcement",
    visibility: "public",
    sortOrder: 5
  },
  {
    id: "forum-cat-general",
    slug: "general",
    label: "General",
    description: "General AI founder and SparkClaw community discussion.",
    type: "general",
    visibility: "public",
    sortOrder: 10
  },
  {
    id: "forum-cat-ask",
    slug: "ask",
    label: "Ask",
    description: "Share the context, what you tried, where you are blocked, and the specific help you need.",
    type: "ask",
    visibility: "public",
    sortOrder: 20
  },
  {
    id: "forum-cat-show",
    slug: "show",
    label: "Ship",
    description: "Share a launch or experiment, what you learned, and the feedback you want from other founders.",
    type: "ship",
    visibility: "public",
    sortOrder: 30
  },
  {
    id: "forum-cat-connect",
    slug: "connect",
    label: "Connect",
    description: "Request a customer, hiring, partner, or expert introduction. Contact details are shared only after both sides agree.",
    type: "connect",
    visibility: "public",
    sortOrder: 35
  },
  {
    id: "forum-cat-outcome",
    slug: "outcome",
    label: "Outcome",
    description: "Close the loop by recording the help received, action taken, result, and next step.",
    type: "outcome",
    visibility: "public",
    sortOrder: 38
  },
  {
    id: "forum-cat-bounties",
    slug: "bounties",
    label: "Bounties",
    description: "Discuss active SparkClaw bounties, strategies, eligibility, teams, and submissions.",
    type: "bounty",
    visibility: "public",
    sortOrder: 40
  },
  {
    id: "forum-cat-launches",
    slug: "launches",
    label: "Launches",
    description: "Feedback and discussion for SparkClaw product launches.",
    type: "launch",
    visibility: "public",
    sortOrder: 50
  },
  {
    id: "forum-cat-solo-founder",
    slug: "solo-founder",
    label: "Solo Founder",
    description: "One-person startup building, shipping, sales, automation, and founder routines.",
    type: "general",
    visibility: "public",
    sortOrder: 60
  },
  {
    id: "forum-cat-b2b",
    slug: "b2b",
    label: "B2B",
    description: "Enterprise pilots, procurement, customer discovery, corporate partnerships, and GTM.",
    type: "partner",
    visibility: "public",
    sortOrder: 70
  },
  {
    id: "forum-cat-fundraising",
    slug: "fundraising",
    label: "Fundraising",
    description: "Seed, grants, SparkLabs fast-track, investor updates, and pitch feedback.",
    type: "general",
    visibility: "public",
    sortOrder: 80
  },
  {
    id: "forum-cat-technical",
    slug: "technical",
    label: "Technical",
    description: "LLM agents, models, infra, evals, APIs, data, cloud, and product engineering.",
    type: "general",
    visibility: "public",
    sortOrder: 90
  },
  {
    id: "forum-cat-ama",
    slug: "ama",
    label: "AMA",
    description: "AMAs with founders, SparkLabs staff, B2B partners, investors, and technical experts.",
    type: "ama",
    visibility: "public",
    sortOrder: 100
  }
];

const PUBLIC_THREAD_STATUSES = new Set(["published"]);
const STAFF_ONLY_ACTIONS = new Set([
  "hide",
  "unhide",
  "lock",
  "unlock",
  "pin",
  "unpin",
  "delete",
  "restore",
  "move",
  "mark_staff_pick",
  "clear_staff_pick"
]);
const MEMBER_BLOCKED_CATEGORIES = new Set(["staff", "announcements"]);
const STAFF_POST_ONLY_CATEGORIES = new Set(["staff", "announcements"]);
const RESPONSE_SLA_THREAD_TYPES = new Set(["ask", "ship", "connect"]);
const RESPONSE_SLA_HOURS = 24;
const MAX_COMMENT_DEPTH = 5;

export function buildForumSnapshot(events = [], options = {}) {
  const now = options.now || new Date().toISOString();
  const viewer = options.viewer || null;
  // Community content always comes from authenticated human actions. Even explicit
  // preview requests must not manufacture founder conversations.
  const state = initialForumState();
  const ordered = chronologicalEvents(events);
  for (const event of ordered) applyForumEvent(state, event);
  finalizeForumState(state, now);

  const categoryRecords = state.categories
    .filter((category) => canViewVisibility(category.visibility, viewer))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));

  const visibleCategorySlugs = new Set(categoryRecords.map((category) => category.slug));
  const visibleThreadRecords = state.threads
    .filter((thread) => visibleCategorySlugs.has(thread.categorySlug))
    .filter((thread) => canViewThread(thread, viewer));
  const threads = visibleThreadRecords.map((thread) => publicThread(thread, viewer));
  const threadCounts = countBy(threads, "categorySlug");
  const categories = categoryRecords.map((category) => publicCategory(category, threadCounts.get(category.slug) || 0, viewer));
  const visibleCommentRecords = state.comments
    .filter((comment) => threads.some((thread) => thread.id === comment.threadId))
    .filter((comment) => canViewComment(comment, viewer));
  const comments = visibleCommentRecords.map((comment) => publicComment(comment, viewer));

  return {
    generatedAt: now,
    categories,
    threads: sortForumThreads(threads, "hot"),
    comments,
    trending: sortForumThreads(threads, "hot").slice(0, 3),
    reports: canModerate(viewer) ? state.reports.map((report) => ({ ...report })) : [],
    moderationActions: canModerate(viewer) ? state.moderationActions.map((action) => ({ ...action })) : [],
    personalActivity: buildPersonalForumActivity(visibleThreadRecords, visibleCommentRecords, ordered, viewer),
    viewer: viewer ? { id: viewer.id, email: viewer.email, role: viewer.role, roleLabel: viewer.roleLabel } : null,
    founderCommonsAccess: canViewVisibility("members_only", viewer)
  };
}

function buildPersonalForumActivity(threads, comments, events, viewer) {
  if (!viewer?.email && !viewer?.id) return emptyPersonalForumActivity();
  const threadById = new Map(threads.map((thread) => [thread.id, thread]));
  const ownThreads = threads.filter((thread) => forumItemBelongsToViewer(thread, viewer));
  const ownThreadIds = new Set(ownThreads.map((thread) => thread.id));
  const ownComments = comments.filter((comment) => forumItemBelongsToViewer(comment, viewer));
  const ownCommentIds = new Set(ownComments.map((comment) => comment.id));
  const receivedComments = comments.filter(
    (comment) => ownThreadIds.has(comment.threadId) && !forumItemBelongsToViewer(comment, viewer) && comment.status === "published"
  );
  const seenVoteKeys = new Set();
  const voteEvents = events.filter((event) => {
    if (event?.type !== "forum_vote_cast") return false;
    if (event.targetType === "thread" && !ownThreadIds.has(event.targetId)) return false;
    if (event.targetType === "comment" && !ownCommentIds.has(event.targetId)) return false;
    const key = `${event.targetType}:${event.targetId}:${event.voterKey || event.userId || event.id}`;
    if (seenVoteKeys.has(key)) return false;
    seenVoteKeys.add(key);
    return true;
  });
  const posts = ownThreads
    .map((thread) => ({
      id: thread.id,
      kind: "post",
      title: thread.title,
      categoryLabel: categoryBySlug(thread.categorySlug)?.label || thread.categorySlug,
      commentCount: Number(thread.commentCount || 0),
      likeCount: Number(thread.upvoteCount || 0),
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt
    }))
    .sort(newestActivityFirst)
    .slice(0, 30);
  const authoredComments = ownComments
    .map((comment) => ({
      id: comment.id,
      threadId: comment.threadId,
      kind: "comment",
      threadTitle: threadById.get(comment.threadId)?.title || "Community 글",
      bodyPreview: forumActivityPreview(comment.bodyMarkdown),
      likeCount: Number(comment.upvoteCount || 0),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt
    }))
    .sort(newestActivityFirst)
    .slice(0, 30);
  const reactions = [
    ...receivedComments.map((comment) => ({
      id: comment.id,
      threadId: comment.threadId,
      kind: "comment_received",
      threadTitle: threadById.get(comment.threadId)?.title || "내 Community 글",
      actorDisplayName: comment.authorDisplayName || "Arena member",
      bodyPreview: forumActivityPreview(comment.bodyMarkdown),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt
    })),
    ...voteEvents.map((event) => ({
      id: event.id,
      threadId: event.targetType === "thread" ? event.targetId : comments.find((comment) => comment.id === event.targetId)?.threadId || null,
      kind: "like_received",
      threadTitle:
        event.targetType === "thread"
          ? threadById.get(event.targetId)?.title || "내 Community 글"
          : threadById.get(comments.find((comment) => comment.id === event.targetId)?.threadId)?.title || "내 댓글",
      targetType: event.targetType,
      createdAt: event.createdAt,
      updatedAt: event.createdAt
    }))
  ]
    .sort(newestActivityFirst)
    .slice(0, 40);
  const recent = [
    ...posts.map((item) => ({ ...item, at: item.updatedAt || item.createdAt })),
    ...authoredComments.map((item) => ({ ...item, at: item.updatedAt || item.createdAt })),
    ...reactions.map((item) => ({ ...item, at: item.updatedAt || item.createdAt }))
  ]
    .sort((left, right) => Date.parse(right.at || 0) - Date.parse(left.at || 0))
    .slice(0, 40);
  return {
    summary: {
      posts: ownThreads.length,
      comments: ownComments.length,
      commentsReceived: receivedComments.length,
      likesReceived: voteEvents.length
    },
    posts,
    comments: authoredComments,
    reactions,
    recent
  };
}

function emptyPersonalForumActivity() {
  return { summary: { posts: 0, comments: 0, commentsReceived: 0, likesReceived: 0 }, posts: [], comments: [], reactions: [], recent: [] };
}

function forumItemBelongsToViewer(item, viewer) {
  if (viewer?.id && item?.authorUserId && String(item.authorUserId) === String(viewer.id)) return true;
  return Boolean(viewer?.email && item?.authorEmail && String(item.authorEmail).toLowerCase() === String(viewer.email).toLowerCase());
}

function forumActivityPreview(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function newestActivityFirst(left, right) {
  return Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0);
}

export function forumComposerCategories(viewer = {}) {
  return FORUM_CATEGORIES
    .filter((category) => canViewVisibility(category.visibility, viewer))
    .filter((category) => {
      try {
        assertCanPostInCategory(category, viewer);
        return true;
      } catch {
        return false;
      }
    })
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
    .map((category) => ({
      slug: category.slug,
      label: category.label,
      description: category.description,
      type: category.type
    }));
}

export function forumComposerVisibilities(viewer = {}) {
  const allowed = [];
  if (["member", "b2b_partner", "human_validator"].includes(viewer?.role) || canModerate(viewer)) allowed.push("public");
  if (viewer?.role === "member" || canModerate(viewer)) allowed.push("members_only");
  return allowed;
}

export function createForumEvent(action, payload, viewer, events = [], now = new Date().toISOString()) {
  if (!viewer?.email) {
    const error = new Error("Login required for forum actions.");
    error.status = 401;
    throw error;
  }
  if (action === "createForumThread") return createThreadEvent(payload, viewer, events, now);
  if (action === "updateOwnForumThread") return updateThreadEvent(payload, viewer, events, now);
  if (action === "deleteOwnForumThread") return deleteThreadEvent(payload, viewer, events, now);
  if (action === "createForumComment") return createCommentEvent(payload, viewer, events, now);
  if (action === "updateOwnForumComment") return updateCommentEvent(payload, viewer, events, now);
  if (action === "deleteOwnForumComment") return deleteCommentEvent(payload, viewer, events, now);
  if (action === "voteForumThread") return voteEvent("thread", payload.threadId || payload.id, viewer, events, now);
  if (action === "voteForumComment") return voteEvent("comment", payload.commentId || payload.id, viewer, events, now);
  if (action === "bookmarkThread") return bookmarkEvent(payload, viewer, events, now);
  if (action === "reportThread") return reportEvent("thread", payload, viewer, now);
  if (action === "reportComment") return reportEvent("comment", payload, viewer, now);
  if (action === "moderateThread") return moderationEvent("thread", payload, viewer, events, now);
  if (action === "moderateComment") return moderationEvent("comment", payload, viewer, events, now);
  throw new Error(`Unsupported forum action: ${action || "missing"}`);
}

export function sortForumThreads(threads = [], mode = "hot") {
  const copy = [...threads];
  if (mode === "new") {
    return copy.sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
  }
  if (mode === "top") {
    return copy.sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  }
  if (mode === "comments") {
    return copy.sort((left, right) => Date.parse(right.lastActivityAt || right.createdAt || 0) - Date.parse(left.lastActivityAt || left.createdAt || 0));
  }
  return copy.sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return Number(right.hotScore || 0) - Number(left.hotScore || 0);
  });
}

export function forumHotScore(thread, now = new Date().toISOString()) {
  const createdMs = Date.parse(thread.createdAt || now);
  const nowMs = Date.parse(now);
  const hoursSinceCreated = Math.max(0, (nowMs - createdMs) / 3_600_000);
  const staffPickBonus = thread.staffPick ? 18 : 0;
  const pinnedBonus = thread.pinned ? 60 : 0;
  return round4((Number(thread.upvoteCount || 0) + Number(thread.commentCount || 0) * 0.7 + staffPickBonus + pinnedBonus) / Math.pow(hoursSinceCreated + 2, 1.5));
}

export function sanitizeForumMarkdown(value, maxLength = 20_000) {
  const text = String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
  return text
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/[<>]/g, (char) => (char === "<" ? "&lt;" : "&gt;"))
    .replace(/javascript:/gi, "blocked:");
}

export function forumCategoryPath(slug) {
  return `/p/${normalizeCategorySlug(slug)}`;
}

function createThreadEvent(payload, viewer, events, now) {
  assertPlainObject(payload, "forum thread");
  const snapshot = buildForumSnapshot(events, { viewer: { canScore: true }, now });
  const category = categoryBySlug(payload.categorySlug || payload.categoryId || "general");
  if (!category) throw userError("category is required.", 400);
  assertCanPostInCategory(category, viewer);
  const title = requiredString(payload, "title", 120);
  const bodyMarkdown = sanitizeForumMarkdown(payload.bodyMarkdown || payload.body || "");
  const url = optionalHttpsUrl(payload.url);
  if (!bodyMarkdown && !url) throw userError("bodyMarkdown is required unless URL is provided.", 400);
  const visibility = allowedThreadVisibility(payload.visibility || category.visibility || "public", category, viewer);
  const slug = uniqueSlug(slugify(title), snapshot.threads.map((thread) => thread.slug));
  const threadType = allowedThreadType(payload.threadType || category.type || "discussion");
  const isStaff = canModerate(viewer);
  const thread = {
    id: eventId("thread", `${viewer.id || viewer.email}:${title}`, now),
    slug,
    categoryId: category.id,
    categorySlug: category.slug,
    authorUserId: viewer.id || null,
    authorEmail: viewer.email,
    authorDisplayName: authorDisplayName(viewer),
    title,
    bodyMarkdown,
    url,
    linkedProductId: optionalId(payload.linkedProductId),
    linkedBountyId: optionalId(payload.linkedBountyId),
    linkedPartnerOrgId: optionalId(payload.linkedPartnerOrgId),
    linkedLaunchId: optionalId(payload.linkedLaunchId),
    linkedLabel: optionalString(payload, "linkedLabel", 120),
    threadType,
    status: "published",
    visibility,
    score: 0,
    upvoteCount: 0,
    commentCount: 0,
    hotScore: 0,
    lastActivityAt: now,
    pinned: Boolean(isStaff && payload.pinned),
    staffPick: Boolean(isStaff && payload.staffPick),
    official: Boolean(isStaff && payload.official),
    locked: Boolean(isStaff && payload.locked),
    createdAt: now,
    updatedAt: now
  };
  return { id: eventId("forum_event", thread.id, now), type: "forum_thread_created", thread, createdAt: now };
}

function updateThreadEvent(payload, viewer, events, now) {
  assertPlainObject(payload, "forum thread update");
  const thread = findThread(events, payload.threadId || payload.id);
  if (!thread) throw userError("Thread not found.", 404);
  assertOwnsOrModerates(thread, viewer);
  if (!canModerate(viewer) && Date.parse(now) - Date.parse(thread.createdAt || now) > 30 * 60 * 1000) {
    throw userError("Thread edit window has closed.", 403);
  }
  const changes = {};
  if (payload.title !== undefined) changes.title = requiredString(payload, "title", 120);
  if (payload.bodyMarkdown !== undefined || payload.body !== undefined) changes.bodyMarkdown = sanitizeForumMarkdown(payload.bodyMarkdown || payload.body || "");
  if (payload.url !== undefined) changes.url = optionalHttpsUrl(payload.url);
  return {
    id: eventId("forum_event", `${thread.id}:update`, now),
    type: "forum_thread_updated",
    threadId: thread.id,
    changes: { ...changes, updatedAt: now },
    createdAt: now
  };
}

function deleteThreadEvent(payload, viewer, events, now) {
  assertPlainObject(payload, "forum thread delete");
  const thread = findThread(events, payload.threadId || payload.id);
  if (!thread) throw userError("Thread not found.", 404);
  assertOwnsOrModerates(thread, viewer);
  return {
    id: eventId("forum_event", `${thread.id}:delete`, now),
    type: "forum_thread_updated",
    threadId: thread.id,
    changes: { status: "deleted", updatedAt: now },
    createdAt: now
  };
}

function createCommentEvent(payload, viewer, events, now) {
  assertPlainObject(payload, "forum comment");
  const snapshot = buildForumSnapshot(events, { viewer, now });
  const thread = snapshot.threads.find((item) => item.id === payload.threadId || item.slug === payload.threadSlug);
  if (!thread) throw userError("Thread not found.", 404);
  assertCanComment(viewer, categoryBySlug(thread.categorySlug));
  if (thread.locked && !canModerate(viewer)) throw userError("This thread is locked.", 403);
  const parent = payload.parentCommentId ? snapshot.comments.find((comment) => comment.id === payload.parentCommentId) : null;
  if (payload.parentCommentId && !parent) throw userError("Parent comment not found.", 404);
  if (parent && parent.threadId !== thread.id) throw userError("Parent comment must belong to the same thread.", 400);
  const depth = parent ? Number(parent.depth || 0) + 1 : 0;
  if (depth > MAX_COMMENT_DEPTH) throw userError(`Comments are limited to ${MAX_COMMENT_DEPTH} nested levels.`, 400);
  const bodyMarkdown = sanitizeForumMarkdown(requiredString({ bodyMarkdown: payload.bodyMarkdown || payload.body }, "bodyMarkdown", 20_000));
  const comment = {
    id: eventId("comment", `${thread.id}:${viewer.id || viewer.email}:${bodyMarkdown.slice(0, 80)}`, now),
    threadId: thread.id,
    parentCommentId: parent?.id || null,
    authorUserId: viewer.id || null,
    authorEmail: viewer.email,
    authorDisplayName: authorDisplayName(viewer),
    bodyMarkdown,
    status: "published",
    score: 0,
    upvoteCount: 0,
    depth,
    createdAt: now,
    updatedAt: now
  };
  return { id: eventId("forum_event", comment.id, now), type: "forum_comment_created", comment, createdAt: now };
}

function updateCommentEvent(payload, viewer, events, now) {
  assertPlainObject(payload, "forum comment update");
  const comment = findComment(events, payload.commentId || payload.id);
  if (!comment) throw userError("Comment not found.", 404);
  assertOwnsOrModerates(comment, viewer);
  if (!canModerate(viewer) && Date.parse(now) - Date.parse(comment.createdAt || now) > 30 * 60 * 1000) {
    throw userError("Comment edit window has closed.", 403);
  }
  return {
    id: eventId("forum_event", `${comment.id}:update`, now),
    type: "forum_comment_updated",
    commentId: comment.id,
    changes: {
      bodyMarkdown: sanitizeForumMarkdown(requiredString({ bodyMarkdown: payload.bodyMarkdown || payload.body }, "bodyMarkdown", 20_000)),
      updatedAt: now
    },
    createdAt: now
  };
}

function deleteCommentEvent(payload, viewer, events, now) {
  assertPlainObject(payload, "forum comment delete");
  const comment = findComment(events, payload.commentId || payload.id);
  if (!comment) throw userError("Comment not found.", 404);
  assertOwnsOrModerates(comment, viewer);
  return {
    id: eventId("forum_event", `${comment.id}:delete`, now),
    type: "forum_comment_updated",
    commentId: comment.id,
    changes: { status: "deleted", bodyMarkdown: "", updatedAt: now },
    createdAt: now
  };
}

function voteEvent(targetType, targetId, viewer, events, now) {
  const id = requiredString({ id: targetId }, "id", 120);
  const voterKey = forumVoterKey(viewer);
  const duplicate = events.some((event) => event?.type === "forum_vote_cast" && event.targetType === targetType && event.targetId === id && event.voterKey === voterKey);
  if (duplicate) {
    const error = new Error("You already upvoted this forum item.");
    error.status = 409;
    throw error;
  }
  return {
    id: eventId("forum_vote", `${targetType}:${id}:${voterKey}`, now),
    type: "forum_vote_cast",
    targetType,
    targetId: id,
    voteType: "upvote",
    userId: viewer.id || null,
    voterKey,
    createdAt: now
  };
}

function bookmarkEvent(payload, viewer, events, now) {
  assertPlainObject(payload, "forum bookmark");
  const threadId = requiredString({ threadId: payload.threadId || payload.id }, "threadId", 120);
  return {
    id: eventId("forum_bookmark", `${threadId}:${viewer.id || viewer.email}`, now),
    type: "forum_thread_bookmarked",
    threadId,
    userId: viewer.id || null,
    userEmail: viewer.email,
    createdAt: now
  };
}

function reportEvent(targetType, payload, viewer, now) {
  assertPlainObject(payload, "forum report");
  const targetId = requiredString({ targetId: payload.targetId || payload.threadId || payload.commentId || payload.id }, "targetId", 120);
  const reason = requiredString(payload, "reason", 40);
  if (!["spam", "harassment", "off_topic", "confidential_info", "scam", "illegal", "other"].includes(reason)) {
    throw userError("Unsupported report reason.", 400);
  }
  return {
    id: eventId("forum_report", `${targetType}:${targetId}:${viewer.id || viewer.email}`, now),
    type: "forum_report_created",
    report: {
      id: eventId("report", `${targetType}:${targetId}:${viewer.id || viewer.email}`, now),
      reporterUserId: viewer.id || null,
      reporterEmail: viewer.email,
      targetType,
      targetId,
      reason,
      note: optionalString(payload, "note", 500),
      status: "open",
      reviewedByUserId: null,
      createdAt: now,
      reviewedAt: null
    },
    createdAt: now
  };
}

function moderationEvent(targetType, payload, viewer, events, now) {
  assertPlainObject(payload, "forum moderation");
  if (!canModerate(viewer)) throw userError("Only SparkLabs staff can moderate forum content.", 403);
  const targetId = requiredString({ targetId: payload.targetId || payload.threadId || payload.commentId || payload.id }, "targetId", 120);
  const moderationAction = requiredString({ action: payload.moderationAction || payload.action }, "action", 40);
  if (!STAFF_ONLY_ACTIONS.has(moderationAction)) throw userError("Unsupported moderation action.", 400);
  const changes = moderationChanges(targetType, moderationAction, payload, now);
  return {
    id: eventId("forum_moderation", `${targetType}:${targetId}:${moderationAction}`, now),
    type: "forum_moderation_action",
    moderationAction,
    targetType,
    targetId,
    moderatorUserId: viewer.id || null,
    moderatorEmail: viewer.email,
    reason: optionalString(payload, "reason", 500) || "",
    changes,
    createdAt: now
  };
}

function applyForumEvent(state, event) {
  if (!event || typeof event !== "object") return state;
  if (event.type === "forum_thread_created" && event.thread) {
    if (!state.threads.some((thread) => thread.id === event.thread.id)) state.threads.push({ ...event.thread });
  } else if (event.type === "forum_thread_updated") {
    const thread = state.threads.find((item) => item.id === event.threadId);
    if (thread) Object.assign(thread, event.changes || {});
  } else if (event.type === "forum_comment_created" && event.comment) {
    if (!state.comments.some((comment) => comment.id === event.comment.id)) state.comments.push({ ...event.comment });
  } else if (event.type === "forum_comment_updated") {
    const comment = state.comments.find((item) => item.id === event.commentId);
    if (comment) Object.assign(comment, event.changes || {});
  } else if (event.type === "forum_vote_cast") {
    applyVoteEvent(state, event);
  } else if (event.type === "forum_thread_bookmarked") {
    state.bookmarks.push({ id: event.id, threadId: event.threadId, userId: event.userId, userEmail: event.userEmail, createdAt: event.createdAt });
  } else if (event.type === "forum_report_created" && event.report) {
    state.reports.push({ ...event.report });
  } else if (event.type === "forum_moderation_action") {
    const list = event.targetType === "comment" ? state.comments : state.threads;
    const target = list.find((item) => item.id === event.targetId);
    if (target) Object.assign(target, event.changes || {});
    state.moderationActions.unshift({
      id: event.id,
      moderatorUserId: event.moderatorUserId,
      moderatorEmail: event.moderatorEmail,
      action: event.moderationAction,
      targetType: event.targetType,
      targetId: event.targetId,
      reason: event.reason || "",
      createdAt: event.createdAt
    });
  }
  return state;
}

function applyVoteEvent(state, event) {
  const key = `${event.targetType}:${event.targetId}:${event.voterKey}`;
  if (state.voteKeys.has(key)) return;
  state.voteKeys.add(key);
  const list = event.targetType === "comment" ? state.comments : state.threads;
  const target = list.find((item) => item.id === event.targetId);
  if (!target) return;
  target.upvoteCount = Number(target.upvoteCount || 0) + 1;
  target.score = Number(target.score || 0) + 1;
}

function finalizeForumState(state, now) {
  const visibleComments = state.comments.filter((comment) => comment.status === "published");
  const commentsByThread = countBy(visibleComments, "threadId");
  const latestCommentByThread = new Map();
  for (const comment of visibleComments) {
    const previous = latestCommentByThread.get(comment.threadId);
    if (!previous || Date.parse(comment.createdAt || 0) > Date.parse(previous.createdAt || 0)) latestCommentByThread.set(comment.threadId, comment);
  }
  for (const thread of state.threads) {
    thread.commentCount = commentsByThread.get(thread.id) || 0;
    const latestComment = latestCommentByThread.get(thread.id);
    thread.lastActivityAt = latestComment?.createdAt || thread.lastActivityAt || thread.createdAt;
    const responseDueAt = new Date(Date.parse(thread.createdAt || now) + RESPONSE_SLA_HOURS * 3_600_000).toISOString();
    thread.responseSlaHours = RESPONSE_SLA_HOURS;
    thread.responseDueAt = responseDueAt;
    if (thread.threadType === "outcome") thread.responseStatus = "outcome_recorded";
    else if (thread.commentCount > 0) thread.responseStatus = "response_received";
    else if (RESPONSE_SLA_THREAD_TYPES.has(thread.threadType) && Date.parse(now) >= Date.parse(responseDueAt)) thread.responseStatus = "needs_attention";
    else if (RESPONSE_SLA_THREAD_TYPES.has(thread.threadType)) thread.responseStatus = "awaiting_response";
    else thread.responseStatus = "open_discussion";
    if (thread.threadType === "connect") {
      thread.introductionPolicy = "double_opt_in";
      thread.introductionStatus = "awaiting_sparklabs_review";
    }
    thread.hotScore = forumHotScore(thread, now);
  }
}

function initialForumState(seedEvents = []) {
  const state = {
    categories: FORUM_CATEGORIES.map((category) => ({
      ...category,
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z"
    })),
    threads: [],
    comments: [],
    bookmarks: [],
    reports: [],
    moderationActions: [],
    voteKeys: new Set()
  };
  for (const event of seedEvents) applyForumEvent(state, event);
  return state;
}

function canViewThread(thread, viewer) {
  if (canModerate(viewer)) return thread.status !== "deleted";
  return PUBLIC_THREAD_STATUSES.has(thread.status) && canViewVisibility(thread.visibility, viewer);
}

function canViewComment(comment, viewer) {
  if (comment.status === "deleted") return true;
  if (canModerate(viewer)) return comment.status !== "deleted";
  return comment.status === "published";
}

function canViewVisibility(visibility, viewer) {
  if (["public", "members_only", "partners_only"].includes(visibility)) {
    return Boolean(viewer?.email) && canViewAudienceScope(visibility, canModerate(viewer) ? "sparklabs" : viewer.role);
  }
  if (visibility === "staff_only") return canModerate(viewer);
  return false;
}

function assertCanPostInCategory(category, viewer) {
  if (canModerate(viewer)) return;
  if (STAFF_POST_ONLY_CATEGORIES.has(category.slug)) throw userError("Only SparkLabs staff can publish AI Arena announcements.", 403);
  if (viewer?.role === "b2b_partner") {
    if (category.visibility !== "public") throw userError("B2B partners cannot post in this forum category.", 403);
    return;
  }
  if (viewer?.role === "member" || viewer?.role === "human_validator") {
    if (MEMBER_BLOCKED_CATEGORIES.has(category.slug)) throw userError("Members cannot post in this forum category.", 403);
    return;
  }
  throw userError("Approved member, B2B partner, or SparkLabs staff access is required to post.", viewer?.email ? 403 : 401);
}

function assertCanComment(viewer, category) {
  if (canModerate(viewer)) return;
  if (viewer?.role === "b2b_partner") {
    if (!category || category.visibility !== "public") {
      throw userError("B2B partners cannot comment in this forum category.", 403);
    }
    return;
  }
  if (["member", "human_validator"].includes(viewer?.role)) return;
  throw userError("Approved member, B2B partner, human validator, or SparkLabs staff access is required to comment.", viewer?.email ? 403 : 401);
}

function allowedThreadVisibility(value, category, viewer) {
  const visibility = normalizeToken(value || "public");
  const allowed = new Set(forumComposerVisibilities(viewer));
  if (!allowed.has(visibility)) throw userError("This account cannot use the selected forum visibility.", 403);
  if (!canViewVisibility(category.visibility, viewer)) throw userError("This account cannot post in this category.", 403);
  return visibility;
}

function publicCategory(category, threadCount = 0, viewer = null) {
  return {
    id: category.id,
    slug: category.slug,
    path: forumCategoryPath(category.slug),
    label: category.label,
    description: category.description,
    type: category.type,
    visibility: category.visibility,
    sortOrder: category.sortOrder,
    threadCount: Number(threadCount || 0),
    canPost: canPostInCategory(category, viewer)
  };
}

function canPostInCategory(category, viewer) {
  try {
    assertCanPostInCategory(category, viewer);
    return true;
  } catch {
    return false;
  }
}

function publicThread(thread, viewer) {
  return {
    id: thread.id,
    slug: thread.slug,
    path: `/arena/forum/thread/${thread.slug}`,
    categoryId: thread.categoryId,
    categorySlug: thread.categorySlug,
    categoryPath: forumCategoryPath(thread.categorySlug),
    categoryLabel: categoryBySlug(thread.categorySlug)?.label || thread.categorySlug,
    authorDisplayName: thread.authorDisplayName,
    title: thread.title,
    bodyMarkdown: thread.bodyMarkdown,
    url: thread.url || null,
    urlDomain: thread.url ? safeDomain(thread.url) : "",
    linkedProductId: thread.linkedProductId || null,
    linkedBountyId: thread.linkedBountyId || null,
    linkedPartnerOrgId: thread.linkedPartnerOrgId || null,
    linkedLaunchId: thread.linkedLaunchId || null,
    linkedLabel: thread.linkedLabel || "",
    threadType: thread.threadType,
    status: thread.status,
    visibility: thread.visibility,
    responseStatus: thread.responseStatus || "open_discussion",
    responseSlaHours: Number(thread.responseSlaHours || RESPONSE_SLA_HOURS),
    responseDueAt: thread.responseDueAt || null,
    introductionPolicy: thread.introductionPolicy || null,
    introductionStatus: thread.introductionStatus || null,
    score: Number(thread.score || 0),
    upvoteCount: Number(thread.upvoteCount || 0),
    commentCount: Number(thread.commentCount || 0),
    hotScore: Number(thread.hotScore || 0),
    lastActivityAt: thread.lastActivityAt || thread.createdAt,
    pinned: Boolean(thread.pinned),
    staffPick: Boolean(thread.staffPick),
    official: Boolean(thread.official),
    locked: Boolean(thread.locked),
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    canEdit: Boolean(viewer?.email && (canModerate(viewer) || thread.authorEmail === viewer.email)),
    canModerate: canModerate(viewer)
  };
}

function publicComment(comment, viewer) {
  if (comment.status === "deleted") {
    return {
      id: comment.id,
      threadId: comment.threadId,
      parentCommentId: comment.parentCommentId || null,
      authorDisplayName: "deleted",
      bodyMarkdown: "Comment deleted",
      status: "deleted",
      score: 0,
      upvoteCount: 0,
      depth: Number(comment.depth || 0),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      canEdit: false,
      canModerate: canModerate(viewer)
    };
  }
  return {
    id: comment.id,
    threadId: comment.threadId,
    parentCommentId: comment.parentCommentId || null,
    authorDisplayName: comment.authorDisplayName,
    bodyMarkdown: comment.bodyMarkdown,
    status: comment.status,
    score: Number(comment.score || 0),
    upvoteCount: Number(comment.upvoteCount || 0),
    depth: Number(comment.depth || 0),
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    canEdit: Boolean(viewer?.email && (canModerate(viewer) || comment.authorEmail === viewer.email)),
    canModerate: canModerate(viewer)
  };
}

function moderationChanges(targetType, moderationAction, payload, now) {
  const changes = { updatedAt: now };
  if (moderationAction === "hide") changes.status = "hidden";
  if (moderationAction === "unhide" || moderationAction === "restore") changes.status = "published";
  if (moderationAction === "delete") changes.status = "deleted";
  if (targetType === "thread") {
    if (moderationAction === "lock") changes.locked = true;
    if (moderationAction === "unlock") changes.locked = false;
    if (moderationAction === "pin") changes.pinned = true;
    if (moderationAction === "unpin") changes.pinned = false;
    if (moderationAction === "mark_staff_pick") changes.staffPick = true;
    if (moderationAction === "clear_staff_pick") changes.staffPick = false;
    if (moderationAction === "move") {
      const category = categoryBySlug(payload.categorySlug || payload.categoryId);
      if (!category) throw userError("Target category not found.", 404);
      changes.categoryId = category.id;
      changes.categorySlug = category.slug;
    }
  }
  return changes;
}

function findThread(events, idOrSlug) {
  const state = materializedForumState(events);
  return state.threads.find((thread) => thread.id === idOrSlug || thread.slug === idOrSlug) || null;
}

function findComment(events, id) {
  const state = materializedForumState(events);
  return state.comments.find((comment) => comment.id === id) || null;
}

function materializedForumState(events = [], now = new Date().toISOString()) {
  const state = initialForumState();
  for (const event of chronologicalEvents(events)) applyForumEvent(state, event);
  finalizeForumState(state, now);
  return state;
}

function chronologicalEvents(events = []) {
  return [...events].sort((left, right) => Date.parse(left?.createdAt || 0) - Date.parse(right?.createdAt || 0));
}

function assertOwnsOrModerates(item, viewer) {
  if (canModerate(viewer)) return;
  if (item.authorEmail && item.authorEmail === viewer?.email) return;
  throw userError("You can only edit your own forum content.", 403);
}

function canModerate(viewer) {
  return Boolean(viewer?.canScore || viewer?.canAdmin || viewer?.role === "sparklabs" || viewer?.role === "admin");
}

function categoryBySlug(value) {
  const slug = normalizeCategorySlug(value);
  return FORUM_CATEGORIES.find((category) => category.slug === slug) || null;
}

function normalizeCategorySlug(value) {
  return String(value || "")
    .replace(/^\/?p\//, "")
    .replace(/^forum-cat-/, "")
    .trim()
    .toLowerCase();
}

function allowedThreadType(value) {
  const type = normalizeToken(value || "discussion");
  const allowed = new Set(["discussion", "ask", "show", "ship", "connect", "outcome", "bounty_discussion", "launch_discussion", "ama", "announcement", "general", "bounty", "launch", "partner"]);
  return allowed.has(type) ? type : "discussion";
}

function optionalHttpsUrl(value) {
  const url = String(value || "").trim();
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw userError("URL must be valid.", 400);
  }
  if (parsed.protocol !== "https:") throw userError("URL must use HTTPS.", 400);
  parsed.hash = "";
  return parsed.toString();
}

function safeDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function requiredString(payload, key, maxLength) {
  const value = String(payload?.[key] || "").trim();
  if (!value) throw userError(`${key} is required.`, 400);
  if (value.length > maxLength) throw userError(`${key} must be ${maxLength} characters or fewer.`, 400);
  return value;
}

function optionalString(payload, key, maxLength) {
  if (payload?.[key] === null || payload?.[key] === undefined || payload?.[key] === "") return "";
  const value = String(payload[key]).trim();
  if (value.length > maxLength) throw userError(`${key} must be ${maxLength} characters or fewer.`, 400);
  return sanitizeForumMarkdown(value, maxLength);
}

function optionalId(value) {
  const id = String(value || "").trim();
  if (!id) return null;
  return id.slice(0, 120);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw userError(`Invalid ${label} payload.`, 400);
}

function forumVoterKey(viewer) {
  const value = String(viewer?.id || viewer?.email || "").trim().toLowerCase();
  if (!value) throw userError("Login required to vote.", 401);
  return value;
}

function authorDisplayName(viewer) {
  const email = String(viewer?.email || "");
  const local = email.split("@")[0] || "member";
  return local.replace(/[._-]+/g, " ").slice(0, 40);
}

function slugify(value) {
  return String(value || "thread")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "thread";
}

function uniqueSlug(base, existingSlugs) {
  const existing = new Set(existingSlugs);
  if (!existing.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function eventId(prefix, material, now) {
  return `${prefix}_${crypto.createHash("sha256").update(`${material}:${now}`).digest("hex").slice(0, 16)}`;
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) counts.set(item[key], (counts.get(item[key]) || 0) + 1);
  return counts;
}

function round4(value) {
  return Math.round(Number(value || 0) * 10_000) / 10_000;
}

function userError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}
