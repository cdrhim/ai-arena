import crypto from "node:crypto";

import { getStore } from "@netlify/blobs";

const DEFAULT_STORE_NAME = "sparklabs-ai-arena-rate-limits";
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX = 20;
const memoryFallbackStore = createMemoryRateLimitStore();

export function createMemoryRateLimitStore() {
  const buckets = new Map();
  return {
    async get(key) {
      return buckets.get(key) || null;
    },
    async set(key, value) {
      buckets.set(key, typeof value === "string" ? JSON.parse(value) : value);
    }
  };
}

export async function consumeRateLimit(identity, options = {}) {
  const nowMs = Date.parse(options.now || new Date().toISOString());
  const windowMs = positiveNumber(options.windowMs, DEFAULT_WINDOW_MS);
  const max = positiveNumber(options.max, DEFAULT_MAX);
  const storeName = options.storeName || DEFAULT_STORE_NAME;
  const key = rateLimitStorageKey(identity);
  const store = options.store || safeNetlifyStore(storeName);
  let bucket = await readBucket(store, key);

  if (!bucket || !Number.isFinite(Date.parse(bucket.resetAt)) || Date.parse(bucket.resetAt) <= nowMs) {
    bucket = {
      count: 0,
      resetAt: new Date(nowMs + windowMs).toISOString()
    };
  }

  bucket.count = Number(bucket.count || 0) + 1;
  await writeBucket(store, key, bucket);

  const allowed = bucket.count <= max;
  return {
    allowed,
    limit: max,
    remaining: Math.max(0, max - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(bucket.resetAt) - nowMs) / 1000))
  };
}

function safeNetlifyStore(storeName) {
  try {
    return getStore({ name: storeName, consistency: "strong" });
  } catch {
    return memoryFallbackStore;
  }
}

async function readBucket(store, key) {
  try {
    return await store.get(key, { type: "json" });
  } catch {
    return memoryFallbackStore.get(key);
  }
}

async function writeBucket(store, key, bucket) {
  const payload = JSON.stringify(bucket);
  try {
    await store.set(key, payload, { metadata: { resetAt: bucket.resetAt } });
  } catch {
    await memoryFallbackStore.set(key, payload);
  }
}

function rateLimitStorageKey(identity) {
  const stableIdentity = String(identity || "anonymous").trim().toLowerCase();
  return `rate-${crypto.createHash("sha256").update(stableIdentity).digest("hex").slice(0, 32)}`;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
