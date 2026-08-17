import { appendForumEvent, loadForumEvents } from "../lib/forum-store.mjs";
import { buildForumSnapshot, createForumEvent } from "../lib/forum-core.mjs";
import { resolveProgramParticipantViewer } from "../lib/program-hub.mjs";
import { consumeRateLimit } from "../lib/rate-limit.mjs";
import { recordScArenaActivitySafely } from "../lib/sc-arena-activity.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

async function forum(req) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (!["GET", "POST"].includes(req.method)) return json({ error: "Method not allowed" }, 405);

  try {
    if (!forumEnabled()) {
      const previewAuth = await verifyArenaRequest(req);
      if (!previewAuth.ok || !previewAuth.viewer?.canScore) return json({ error: "Forum is not enabled." }, 404);
    }
    const auth = await verifyArenaRequest(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const viewerContext = await communityViewerContext(auth.viewer);
    const viewer = viewerContext.viewer;
    if (req.method === "GET") {
      const events = await loadForumEvents();
      const url = new URL(req.url);
      return json(buildForumSnapshot(events, {
        viewer,
        demo: isExplicitDemo(url),
        authorDisplayNames: viewerContext.communityDisplayNames
      }));
    }

    const body = await readJson(req);
    const eventsBefore = await loadForumEvents();
    await enforceForumRateLimit(body.action, viewer);
    const event = createForumEvent(body.action, body.payload || {}, viewer, eventsBefore);
    const events = await appendForumEvent(event);
    const snapshot = buildForumSnapshot(events, {
      viewer,
      authorDisplayNames: viewerContext.communityDisplayNames
    });
    await recordScArenaActivitySafely({
      sourceSystem: "forum",
      event,
      viewer,
      context: {
        viewerTeamId: viewerContext.viewerTeamId,
        viewerTeam: viewerContext.viewerTeamId
          ? { id: viewerContext.viewerTeamId, name: viewer?.communityDisplayName || viewer?.organization || "" }
          : null,
        forumSnapshot: forumActivitySnapshot(snapshot, events)
      }
    });
    return json({
      ok: true,
      event,
      snapshot
    });
  } catch (error) {
    return json({ error: error.message }, error.status || 400, error.headers || {});
  }
}

export default withScArenaDevelopmentLogging("forum", forum);

async function communityViewerContext(viewer) {
  if (!viewer) return { viewer, viewerTeamId: null, communityDisplayNames: new Map() };
  try {
    const resolved = await resolveProgramParticipantViewer(viewer);
    return {
      viewer: resolved?.viewer || viewer,
      viewerTeamId: resolved?.viewerTeamId || null,
      communityDisplayNames: resolved?.communityDisplayNames || new Map()
    };
  } catch {
    return { viewer, viewerTeamId: null, communityDisplayNames: new Map() };
  }
}

function forumActivitySnapshot(snapshot, events) {
  const threadAuthors = new Map();
  const commentAuthors = new Map();
  for (const event of events) {
    if (event?.type === "forum_thread_created" && event.thread?.id) {
      threadAuthors.set(event.thread.id, event.thread.authorUserId || null);
    }
    if (event?.type === "forum_comment_created" && event.comment?.id) {
      commentAuthors.set(event.comment.id, event.comment.authorUserId || null);
    }
  }
  return {
    ...snapshot,
    threads: (snapshot.threads || []).map((thread) => ({
      ...thread,
      authorUserId: threadAuthors.get(thread.id) || null
    })),
    comments: (snapshot.comments || []).map((comment) => ({
      ...comment,
      authorUserId: commentAuthors.get(comment.id) || null
    }))
  };
}

function forumEnabled(env = process.env) {
  const value = env.SPARKCLAW_ENABLE_FORUM;
  if (value === undefined || value === null || String(value).trim() === "") return true;
  return ["1", "true", "yes", "on", "enabled"].includes(String(value).trim().toLowerCase());
}

async function enforceForumRateLimit(action, viewer) {
  if (viewer?.canScore) return;
  const rateLimit = await consumeRateLimit(`forum:${action}:${viewer?.id || viewer?.email || "anonymous"}`, {
    max: action === "createForumComment" ? 40 : action === "createForumCategory" ? 8 : 20,
    windowMs: 60 * 60 * 1000
  });
  if (rateLimit.allowed) return;
  const error = new Error("Forum rate limit exceeded. Please try again after the reset time.");
  error.status = 429;
  error.headers = { "retry-after": String(rateLimit.retryAfterSeconds) };
  throw error;
}

function isExplicitDemo(url) {
  return ["1", "true", "forum"].includes(String(url.searchParams.get("demo") || "").toLowerCase());
}

async function readJson(req) {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function json(payload, status = 200, headers = {}) {
  return corsResponse(JSON.stringify(payload), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
}

function corsResponse(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      ...headers
    }
  });
}
import { withScArenaDevelopmentLogging } from "../lib/sc-arena-operational-logs.mjs";
