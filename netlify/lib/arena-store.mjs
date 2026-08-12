import { getStore } from "@netlify/blobs";

const STORE_NAME = "sparklabs-ai-arena";
const EVENTS_KEY = "events";

export function arenaStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export async function loadArenaEvents() {
  try {
    const events = await arenaStore().get(EVENTS_KEY, { type: "json" });
    return Array.isArray(events) ? events : [];
  } catch (error) {
    if (process.env.NETLIFY_DEV) throw error;
    return [];
  }
}

export async function appendArenaEvent(event) {
  const events = await loadArenaEvents();
  const nextEvents = [event, ...events].slice(0, 500);
  await arenaStore().set(EVENTS_KEY, JSON.stringify(nextEvents), {
    metadata: {
      updatedAt: event.createdAt || new Date().toISOString()
    }
  });
  return nextEvents;
}
