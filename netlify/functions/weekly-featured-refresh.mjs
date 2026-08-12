import { buildWeeklyFeaturedSnapshot, loadWeeklyFeaturedSource } from "../lib/weekly-featured-companies.mjs";
import { publishWeeklyFeaturedSnapshot } from "../lib/weekly-featured-store.mjs";

export default async function weeklyFeaturedRefresh(_req, _context, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || new Date();
  try {
    const source = await (options.loadSource || loadWeeklyFeaturedSource)(env, fetchImpl);
    const snapshot = (options.buildSnapshot || buildWeeklyFeaturedSnapshot)(source, { now, limit: 4 });
    if (!snapshot) {
      console.log("[weekly-featured] no completed weekly updates; keeping the previous spotlight");
      return new Response(null, { status: 204 });
    }
    const stored = await (options.publishSnapshot || publishWeeklyFeaturedSnapshot)(snapshot, env, fetchImpl);
    console.log("[weekly-featured] spotlight refreshed", {
      cycleKey: snapshot.cycleKey,
      itemCount: snapshot.items.length,
      stored: stored.stored
    });
    return Response.json({ ok: true, cycleKey: snapshot.cycleKey, itemCount: snapshot.items.length });
  } catch (error) {
    console.error("[weekly-featured] refresh failed", { message: error?.message || "unknown" });
    return Response.json({ error: "Weekly spotlight refresh failed." }, { status: error?.status || 500 });
  }
}

// Monday 09:00 KST. Netlify cron expressions are evaluated in UTC.
export const config = { schedule: "0 0 * * 1" };
