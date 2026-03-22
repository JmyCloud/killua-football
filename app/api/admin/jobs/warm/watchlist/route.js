import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized, unauthorized, adminJson } from "@/lib/admin";
import {
  getWatchlistConfig,
  parseFixtureIdList,
  parsePositiveInt,
} from "@/lib/watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_LIMIT = 25;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_H2H_LIMIT = 5;
const DEFAULT_LOOKAHEAD_HOURS = 36;
const DEFAULT_LOOKBACK_HOURS = 6;

function mergeUnique(a, b) {
  return Array.from(new Set([...(a ?? []), ...(b ?? [])]));
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length || 1)) },
    () => runner()
  );

  await Promise.all(workers);
  return results;
}

async function loadWatchlistRows({ limit, lookaheadHours, lookbackHours }) {
  const result = await query(
    `
    select *
    from cache.fixture_watchlist
    where enabled = true
      and (expires_at is null or expires_at > now())
      and (
        starts_at is null
        or starts_at between now() - ($1 || ' hours')::interval
                         and now() + ($2 || ' hours')::interval
        or mode = 'live'
      )
    order by priority asc, starts_at asc nulls last, fixture_id asc
    limit $3
    `,
    [lookbackHours, lookaheadHours, limit]
  );

  return result.rows;
}

async function saveWarmResult(fixtureId, payload) {
  await query(
    `
    update cache.fixture_watchlist
    set
      last_warmed_at = now(),
      last_warm_status = $2,
      last_warm_error = $3,
      last_match_is_live_like = $4,
      updated_at = now()
    where fixture_id = $1
    `,
    [
      fixtureId,
      payload.last_warm_status,
      payload.last_warm_error,
      payload.last_match_is_live_like,
    ]
  );
}

function buildResolvedJobs({ dbRows, envConfig, manualPrematch, manualLive }) {
  const mergedMap = new Map();

  for (const row of dbRows) {
    mergedMap.set(Number(row.fixture_id), {
      fixture_id: Number(row.fixture_id),
      source: "watchlist_db",
      mode: row.mode ?? "auto",
      priority: row.priority ?? 100,
      starts_at: row.starts_at ?? null,
      expires_at: row.expires_at ?? null,
    });
  }

  for (const fixtureId of envConfig.prematchFixtureIds) {
    if (!mergedMap.has(fixtureId)) {
      mergedMap.set(fixtureId, {
        fixture_id: fixtureId,
        source: "env_prematch",
        mode: "prematch",
        priority: 999900,
        starts_at: null,
        expires_at: null,
      });
    }
  }

  for (const fixtureId of envConfig.liveFixtureIds) {
    if (!mergedMap.has(fixtureId)) {
      mergedMap.set(fixtureId, {
        fixture_id: fixtureId,
        source: "env_live",
        mode: "live",
        priority: 999800,
        starts_at: null,
        expires_at: null,
      });
    }
  }

  for (const fixtureId of manualPrematch) {
    mergedMap.set(fixtureId, {
      fixture_id: fixtureId,
      source: "manual_prematch",
      mode: "prematch",
      priority: 1,
      starts_at: null,
      expires_at: null,
    });
  }

  for (const fixtureId of manualLive) {
    mergedMap.set(fixtureId, {
      fixture_id: fixtureId,
      source: "manual_live",
      mode: "live",
      priority: 1,
      starts_at: null,
      expires_at: null,
    });
  }

  return Array.from(mergedMap.values()).sort((a, b) => {
    if ((a.priority ?? 999999) !== (b.priority ?? 999999)) {
      return (a.priority ?? 999999) - (b.priority ?? 999999);
    }
    return a.fixture_id - b.fixture_id;
  });
}

function parseInputs(request) {
  const { searchParams } = new URL(request.url);

  return {
    limit: parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT, 200),
    concurrency: parsePositiveInt(searchParams.get("concurrency"), DEFAULT_CONCURRENCY, 5),
    h2hLimit: parsePositiveInt(searchParams.get("h2h_limit"), DEFAULT_H2H_LIMIT, 20),
    lookaheadHours: parsePositiveInt(searchParams.get("lookahead_hours"), DEFAULT_LOOKAHEAD_HOURS, 168),
    lookbackHours: parsePositiveInt(searchParams.get("lookback_hours"), DEFAULT_LOOKBACK_HOURS, 72),
    manualPrematch: parseFixtureIdList(searchParams.get("fixture_ids")),
    manualLive: parseFixtureIdList(searchParams.get("live_fixture_ids")),
  };
}

export async function GET(request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const input = parseInputs(request);
    const envConfig = getWatchlistConfig();

    const dbRows = await loadWatchlistRows({
      limit: input.limit,
      lookaheadHours: input.lookaheadHours,
      lookbackHours: input.lookbackHours,
    });

    const jobs = buildResolvedJobs({
      dbRows,
      envConfig,
      manualPrematch: input.manualPrematch,
      manualLive: input.manualLive,
    });

    return NextResponse.json({
      ok: true,
      strategy: {
        limit: input.limit,
        concurrency: input.concurrency,
        h2h_limit: input.h2hLimit,
        lookahead_hours: input.lookaheadHours,
        lookback_hours: input.lookbackHours,
      },
      sources: {
        db_watchlist_count: dbRows.length,
        env_prematch_fixture_ids: envConfig.prematchFixtureIds,
        env_live_fixture_ids: envConfig.liveFixtureIds,
        manual_prematch_fixture_ids: input.manualPrematch,
        manual_live_fixture_ids: input.manualLive,
      },
      summary: {
        total_jobs: jobs.length,
      },
      jobs,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const input = parseInputs(request);
    const envConfig = getWatchlistConfig();

    const dbRows = await loadWatchlistRows({
      limit: input.limit,
      lookaheadHours: input.lookaheadHours,
      lookbackHours: input.lookbackHours,
    });

    const jobs = buildResolvedJobs({
      dbRows,
      envConfig,
      manualPrematch: input.manualPrematch,
      manualLive: input.manualLive,
    });

    const results = await runWithConcurrency(
      jobs,
      input.concurrency,
      async (job) => {
        const refreshMode = "fresh_if_stale";
        const liveRefreshMode = job.mode === "live" ? "force_fresh" : "fresh_if_stale";

        const path =
          `/sync/analysis/fixtures/${job.fixture_id}` +
          `?refresh_mode=${refreshMode}` +
          `&live_refresh_mode=${liveRefreshMode}` +
          `&h2h_limit=${input.h2hLimit}`;

        const response = await adminJson(request, path, { method: "POST" });

        const failedSteps = response.body?.failed_steps ?? [];
        const ok = response.ok && failedSteps.length === 0;

        const status = ok
          ? "ok"
          : response.ok
            ? "partial"
            : "failed";

        if (job.source === "watchlist_db") {
          await saveWarmResult(job.fixture_id, {
            last_warm_status: status,
            last_warm_error:
              response.body?.error ??
              (failedSteps.length ? failedSteps.join(", ") : null),
            last_match_is_live_like: response.body?.match_is_live_like ?? null,
          });
        }

        return {
          fixture_id: job.fixture_id,
          source: job.source,
          mode: job.mode,
          ok,
          status: response.status,
          match_is_live_like: response.body?.match_is_live_like ?? null,
          failed_steps: failedSteps,
          sync_results: response.body?.sync_results ?? [],
          error: response.body?.error ?? null,
        };
      }
    );

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return NextResponse.json({
      ok: failed === 0,
      strategy: {
        limit: input.limit,
        concurrency: input.concurrency,
        h2h_limit: input.h2hLimit,
        lookahead_hours: input.lookaheadHours,
        lookback_hours: input.lookbackHours,
      },
      sources: {
        db_watchlist_count: dbRows.length,
        env_prematch_fixture_ids: envConfig.prematchFixtureIds,
        env_live_fixture_ids: envConfig.liveFixtureIds,
        manual_prematch_fixture_ids: input.manualPrematch,
        manual_live_fixture_ids: input.manualLive,
      },
      summary: {
        total_jobs: jobs.length,
        succeeded,
        failed,
      },
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}