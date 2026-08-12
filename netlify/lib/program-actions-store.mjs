import { getStore } from "@netlify/blobs";

const STORE_NAME = "sparkclaw-program-actions";
const EVENTS_KEY = "events";
const MAX_EVENTS = 10000;
const MAX_WRITE_ATTEMPTS = 5;
const memoryEvents = [];

export function programActionsStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export async function loadProgramActionEvents() {
  try {
    const events = await programActionsStore().get(EVENTS_KEY, { type: "json" });
    return Array.isArray(events) ? events : [];
  } catch {
    return [...memoryEvents];
  }
}

export async function appendProgramActionEvent(event) {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    try {
      const store = programActionsStore();
      const current = await store.getWithMetadata(EVENTS_KEY, { type: "json" });
      const existing = Array.isArray(current?.data) ? current.data : [];
      if (existing.some((item) => item?.id === event?.id)) return existing;
      const events = [event, ...existing].slice(0, MAX_EVENTS);
      await store.set(EVENTS_KEY, JSON.stringify(events), {
        ...(current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true }),
        metadata: { updatedAt: event.createdAt || new Date().toISOString() }
      });
      return events;
    } catch (error) {
      if (isWriteConflict(error) && attempt < MAX_WRITE_ATTEMPTS - 1) continue;
      return appendMemoryEvent(event);
    }
  }
  return appendMemoryEvent(event);
}

function appendMemoryEvent(event) {
  if (!memoryEvents.some((item) => item?.id === event?.id)) memoryEvents.unshift(event);
  if (memoryEvents.length > MAX_EVENTS) memoryEvents.length = MAX_EVENTS;
  return [...memoryEvents];
}

function isWriteConflict(error) {
  return [409, 412].includes(Number(error?.status || error?.statusCode));
}
