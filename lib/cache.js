import { query } from "@/lib/db";
import { tryWithAdvisoryLock } from "@/lib/locks";

export const TTL = {
  fixtures: 15 * 60,
  fixtures_live: 10,
  fixtures_h2h: 24 * 60 * 60,
  team_season_stats: 6 * 60 * 60,
  referee_season_stats: 6 * 60 * 60,
  odds_prematch: 15 * 60,
  odds_inplay: 10,
};

const VALID_REFRESH_MODES = new Set([
  "swr",
  "fresh_if_stale",
  "force_fresh",
]);

export function isStale(fetchedAt, ttlSeconds) {
  if (!fetchedAt) return true;
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs > ttlSeconds * 1000;
}

export function normalizeRefreshMode(value, fallback = "swr") {
  const mode = String(value ?? "").trim().toLowerCase();
  return VALID_REFRESH_MODES.has(mode) ? mode : fallback;
}

export function parseRefreshMode(searchParams, fallback = "swr") {
  return normalizeRefreshMode(searchParams?.get?.("refresh_mode"), fallback);
}

export function getFreshnessMeta(type, fetchedAt) {
  const ttlSeconds = TTL[type];
  if (!ttlSeconds) {
    throw new Error(`Unknown cache type: ${type}`);
  }

  if (!fetchedAt) {
    return {
      fetched_at: null,
      ttl_seconds: ttlSeconds,
      age_seconds: null,
      stale: true,
      expires_at: null,
      expires_in_seconds: null,
    };
  }

  const fetchedMs = new Date(fetchedAt).getTime();
  const nowMs = Date.now();
  const ageSeconds = Math.max(0, Math.floor((nowMs - fetchedMs) / 1000));
  const expiresAtMs = fetchedMs + ttlSeconds * 1000;
  const expiresInSeconds = Math.floor((expiresAtMs - nowMs) / 1000);

  return {
    fetched_at: new Date(fetchedMs).toISOString(),
    ttl_seconds: ttlSeconds,
    age_seconds: ageSeconds,
    stale: ageSeconds > ttlSeconds,
    expires_at: new Date(expiresAtMs).toISOString(),
    expires_in_seconds: expiresInSeconds,
  };
}

export function filterOddsPayload(data, filterParam) {
  if (!filterParam) return data;

  const match = String(filterParam).match(/^markets:([\d,]+)$/);
  if (!match) return data;

  const marketIds = new Set(
    match[1]
      .split(",")
      .map((id) => Number(id.trim()))
      .filter(Boolean)
  );

  if (marketIds.size === 0) return data;

  const rawData = data?.data ?? data;

  if (!Array.isArray(rawData)) return data;

  const filtered = rawData.filter((item) => {
    const itemMarketId = item?.market_id ?? item?.market?.id ?? item?.id;
    return marketIds.has(Number(itemMarketId));
  });

  if (data?.data !== undefined) {
    return { ...data, data: filtered };
  }

  return filtered;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runRefreshWithLock({
  type,
  lockKey,
  getCached,
  refresh,
  force = false,
  waitMs = 15000,
  pollMs = 250,
}) {
  const ttlSeconds = TTL[type];
  if (!ttlSeconds) throw new Error(`Unknown cache type: ${type}`);

  const deadline = Date.now() + waitMs;
  let waitedForLock = false;

  while (Date.now() <= deadline) {
    const attempt = await tryWithAdvisoryLock(lockKey, async (dbQuery) => {
      const latest = await getCached(dbQuery);
      const latestStale = isStale(latest?.fetched_at ?? null, ttlSeconds);

      if (!force && latest && !latestStale) {
        return {
          executed: false,
          deduped: true,
          waited_for_lock: waitedForLock,
          timed_out: false,
          freshness: getFreshnessMeta(type, latest.fetched_at),
        };
      }

      await refresh(dbQuery);

      const after = await getCached(dbQuery);

      return {
        executed: true,
        deduped: false,
        waited_for_lock: waitedForLock,
        timed_out: false,
        freshness: getFreshnessMeta(type, after?.fetched_at ?? null),
      };
    });

    if (attempt.locked) {
      return attempt.value;
    }

    waitedForLock = true;
    await sleep(pollMs);
  }

  const finalCached = await getCached(query);

  return {
    executed: false,
    deduped: false,
    waited_for_lock: waitedForLock,
    timed_out: true,
    freshness: getFreshnessMeta(type, finalCached?.fetched_at ?? null),
  };
}

function triggerBackgroundRefresh(task, type, lockKey) {
  task()
    .then(() => {
      console.log("[cache] background refresh done", { type, lockKey });
    })
    .catch((err) => {
      console.error("[cache] background refresh failed", {
        type,
        lockKey,
        error: err?.message ?? "Unknown error",
      });
    });
}

export async function staleWhileRevalidate({
  type,
  getCached,
  refresh,
  mode = "swr",
  lockKey = `cache:${type}`,
  waitForFreshMs = 15000,
}) {
  const ttlSeconds = TTL[type];

  if (!ttlSeconds) throw new Error(`Unknown cache type: ${type}`);

  const resolvedMode = normalizeRefreshMode(mode, "swr");
  const cached = await getCached(query);
  const stale = isStale(cached?.fetched_at ?? null, ttlSeconds);

  if (cached && !stale) {
    return {
      data: cached.data,
      source: "cache",
      stale: false,
      mode: resolvedMode,
      freshness: getFreshnessMeta(type, cached.fetched_at),
      refresh: {
        strategy: resolvedMode,
        executed: false,
        scheduled: false,
        deduped: false,
        timed_out: false,
      },
    };
  }

  if (cached && stale && resolvedMode === "swr") {
    triggerBackgroundRefresh(
      () =>
        runRefreshWithLock({
          type,
          lockKey,
          getCached,
          refresh,
          force: false,
          waitMs: waitForFreshMs,
        }),
      type,
      lockKey
    );

    return {
      data: cached.data,
      source: "cache",
      stale: true,
      mode: resolvedMode,
      freshness: getFreshnessMeta(type, cached.fetched_at),
      refresh: {
        strategy: resolvedMode,
        executed: false,
        scheduled: true,
        deduped: false,
        timed_out: false,
      },
    };
  }

  const refreshResult = await runRefreshWithLock({
    type,
    lockKey,
    getCached,
    refresh,
    force: resolvedMode === "force_fresh" || !cached,
    waitMs: waitForFreshMs,
  });

  const latest = await getCached(query);

  if (latest) {
    return {
      data: latest.data,
      source: cached ? "cache_refreshed" : "sportmonks",
      stale: isStale(latest.fetched_at ?? null, ttlSeconds),
      mode: resolvedMode,
      freshness: getFreshnessMeta(type, latest.fetched_at),
      refresh: {
        strategy: resolvedMode,
        executed: refreshResult.executed,
        scheduled: false,
        deduped: refreshResult.deduped,
        timed_out: refreshResult.timed_out,
        waited_for_lock: refreshResult.waited_for_lock,
      },
    };
  }

  throw new Error(`Refresh completed but no cached data found for type: ${type}`);
}