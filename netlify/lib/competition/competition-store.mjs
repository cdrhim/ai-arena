import { getStore } from "@netlify/blobs";

const STORE_NAME = "sparklabs-ai-arena-competition";
const EVENTS_KEY = "competition-events";

export function competitionStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export async function loadCompetitionEvents() {
  try {
    const events = await competitionStore().get(EVENTS_KEY, { type: "json" });
    return Array.isArray(events) ? events : [];
  } catch (error) {
    if (process.env.NETLIFY_DEV) throw error;
    return [];
  }
}

export async function appendCompetitionEvent(event) {
  const events = await loadCompetitionEvents();
  const nextEvents = [event, ...events].slice(0, 1000);
  await competitionStore().set(EVENTS_KEY, JSON.stringify(nextEvents), {
    metadata: {
      updatedAt: event.createdAt || new Date().toISOString()
    }
  });
  return nextEvents;
}
