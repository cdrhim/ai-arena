import { getStore } from "@netlify/blobs";

const STORE_NAME = "sparklabs-ai-arena-forum";
const EVENTS_KEY = "events";
const MAX_EVENTS = 1000;
const MAX_WRITE_ATTEMPTS = 5;
const memoryEvents = [];

export function forumStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export async function loadForumEvents(options = {}) {
  const allowMemoryFallback = options.allowMemoryFallback ?? !isProductionNetlify(options.env);
  let store;
  try {
    store = options.store || forumStore();
    return parseForumEvents(await store.get(EVENTS_KEY, { type: "json" }));
  } catch (error) {
    if (allowMemoryFallback) return [...memoryEvents];
    throw forumStorageError(error);
  }
}

export async function appendForumEvent(event, options = {}) {
  const allowMemoryFallback = options.allowMemoryFallback ?? !isProductionNetlify(options.env);
  let store;
  try {
    store = options.store || forumStore();
  } catch (error) {
    if (allowMemoryFallback) return saveMemoryEvent(event);
    throw forumStorageError(error);
  }

  let candidateEvents = null;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    try {
      const current = await loadForumEventsWithMetadata(store);
      candidateEvents = mergeForumEvent(event, current.events);
      await store.set(EVENTS_KEY, JSON.stringify(candidateEvents), {
        ...(current.conditional ? (current.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true }) : {}),
        metadata: {
          updatedAt: event.createdAt || new Date().toISOString()
        }
      });
      return candidateEvents;
    } catch (error) {
      if (isWriteConflict(error) && attempt < MAX_WRITE_ATTEMPTS - 1) continue;
      if (allowMemoryFallback) return saveMemoryEvent(event, candidateEvents);
      throw forumStorageError(error);
    }
  }

  if (allowMemoryFallback) return saveMemoryEvent(event, candidateEvents);
  throw forumStorageError();
}

async function loadForumEventsWithMetadata(store) {
  if (typeof store.getWithMetadata === "function") {
    const current = await store.getWithMetadata(EVENTS_KEY, { type: "json" });
    return {
      events: parseForumEvents(current?.data),
      etag: current?.etag || null,
      conditional: true
    };
  }
  return {
    events: parseForumEvents(await store.get(EVENTS_KEY, { type: "json" })),
    etag: null,
    conditional: false
  };
}

function parseForumEvents(value) {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") throw new Error("Forum storage contains an invalid event collection.");
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Forum storage contains an invalid event collection.");
  return parsed;
}

function mergeForumEvent(event, events = []) {
  return [event, ...events.filter((item) => item?.id !== event?.id)].slice(0, MAX_EVENTS);
}

function saveMemoryEvent(event, preferredEvents = null) {
  const events = Array.isArray(preferredEvents) ? preferredEvents : mergeForumEvent(event, memoryEvents);
  memoryEvents.length = 0;
  memoryEvents.push(...events);
  return [...events];
}

function isWriteConflict(error) {
  return [409, 412].includes(Number(error?.status || error?.statusCode));
}

function isProductionNetlify(env = process.env) {
  const deployed = ["1", "true", "yes"].includes(String(env?.NETLIFY || "").trim().toLowerCase());
  const local = ["1", "true", "yes"].includes(String(env?.NETLIFY_DEV || "").trim().toLowerCase());
  return deployed && !local;
}

function forumStorageError(cause) {
  const error = new Error("Forum storage is temporarily unavailable. Please try again.");
  error.status = 503;
  if (cause) error.cause = cause;
  return error;
}
