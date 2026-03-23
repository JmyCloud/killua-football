// ─── In-Memory TTL Cache ───────────────────────────────────────────────
// Reduces Supabase egress by caching DB query results in Node.js process
// memory. Warm Vercel functions serve repeat reads at zero egress cost.
// Default TTL: 5 minutes — covers a full GPT analysis session.
// ───────────────────────────────────────────────────────────────────────

const store = new Map();
const MISS = Symbol("MISS");
const DEFAULT_TTL = 5 * 60 * 1000;
const MAX_ENTRIES = 600;

function evict() {
  const now = Date.now();
  for (const [k, e] of store) {
    if (now > e.exp) store.delete(k);
  }
  if (store.size > MAX_ENTRIES * 0.8) {
    const keys = [...store.keys()];
    const half = Math.floor(keys.length / 2);
    for (let i = 0; i < half; i++) store.delete(keys[i]);
  }
}

export function memGet(key) {
  const entry = store.get(key);
  if (!entry) return MISS;
  if (Date.now() > entry.exp) {
    store.delete(key);
    return MISS;
  }
  return entry.v;
}

export function memSet(key, value, ttlMs = DEFAULT_TTL) {
  if (store.size >= MAX_ENTRIES) evict();
  store.set(key, { v: value, exp: Date.now() + ttlMs });
}

export function memDel(key) {
  store.delete(key);
}

export function memClear() {
  store.clear();
}

export function memStats() {
  return { size: store.size, max: MAX_ENTRIES };
}

/**
 * Cache-through helper. Returns cached value if fresh, otherwise
 * calls `fn()`, stores the result, and returns it.
 * Correctly caches `null` values (distinguishes from cache miss).
 */
export async function mc(key, ttlMs, fn) {
  const hit = memGet(key);
  if (hit !== MISS) return hit;
  const val = await fn();
  memSet(key, val, ttlMs);
  return val;
}
