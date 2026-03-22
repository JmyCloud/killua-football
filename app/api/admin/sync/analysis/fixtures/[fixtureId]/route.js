import { NextResponse } from "next/server";
import { isAuthorized, unauthorized, adminJson } from "@/lib/admin";
import { normalizeRefreshMode } from "@/lib/cache";
import { logger } from "@/lib/logger";
import {
  syncFixture,
  syncH2H,
  syncTeamStats,
  syncRefereeStats,
  syncStandings,
  syncXG,
  syncPredictions,
  syncNews,
  syncExpectedLineups,
  syncTransferRumours,
  syncOddsPrematch,
  syncOddsInplay,
} from "@/lib/sync-direct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseH2HLimit(searchParams) {
  const raw = searchParams.get("h2h_limit");
  if (!raw) return 5;
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return 5;
  return Math.min(n, 20);
}

export async function POST(request, context) {
  if (!isAuthorized(request)) return unauthorized();

  const { fixtureId } = await context.params;
  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json(
      { ok: false, error: "Invalid fixtureId" },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const searchParams = url.searchParams;

  const refreshMode = normalizeRefreshMode(
    searchParams.get("refresh_mode"),
    "fresh_if_stale"
  );

  const liveRefreshMode = normalizeRefreshMode(
    searchParams.get("live_refresh_mode"),
    "fresh_if_stale"
  );

  const h2hLimit = parseH2HLimit(searchParams);

  try {
    const id = Number(fixtureId);
    const isLive = liveRefreshMode === "force_fresh";

    // ── Step 1: sync fixture (must complete first — other syncs depend on it) ──
    let fixtureSyncResult;
    try {
      fixtureSyncResult = await syncFixture(id, refreshMode, isLive);
    } catch (err) {
      return NextResponse.json(
        { ok: false, step: "sync_fixture", error: err.message ?? "syncFixture failed" },
        { status: 500 }
      );
    }

    // ── Step 2: read manifest to discover team/referee/season IDs ──
    const manifest1 = await adminJson(request, `/analysis/fixtures/${id}/manifest`);
    if (!manifest1.ok) {
      return NextResponse.json(
        { ok: false, step: "manifest_after_fixture", error: manifest1.body?.error ?? "manifest failed" },
        { status: manifest1.status || 500 }
      );
    }

    const discovered = manifest1.body?.discovered ?? {};
    const homeTeamId = discovered.home_team_id ?? null;
    const awayTeamId = discovered.away_team_id ?? null;
    const refereeId = discovered.referee_id ?? null;
    const seasonId = discovered.season_id ?? null;
    const shouldSyncInplay = Boolean(manifest1.body?.match_is_live_like);

    // ── Step 3: ALL syncs in ONE parallel batch — direct calls, shared DB pool ──
    const tasks = [];

    if (homeTeamId && awayTeamId) {
      tasks.push({ step: "sync_h2h", fn: () => syncH2H(homeTeamId, awayTeamId, h2hLimit, refreshMode) });
    }
    if (homeTeamId) {
      tasks.push({ step: "sync_home_team_stats", fn: () => syncTeamStats(homeTeamId, refreshMode) });
    }
    if (awayTeamId) {
      tasks.push({ step: "sync_away_team_stats", fn: () => syncTeamStats(awayTeamId, refreshMode) });
    }
    if (refereeId) {
      tasks.push({ step: "sync_referee_stats", fn: () => syncRefereeStats(refereeId, refreshMode) });
    }
    if (seasonId) {
      tasks.push({ step: "sync_standings", fn: () => syncStandings(seasonId, refreshMode) });
    }

    tasks.push({ step: "sync_xg", fn: () => syncXG(id, refreshMode) });
    tasks.push({ step: "sync_predictions", fn: () => syncPredictions(id, refreshMode) });
    tasks.push({ step: "sync_news", fn: () => syncNews(id, seasonId, refreshMode) });
    tasks.push({ step: "sync_expected_lineups", fn: () => syncExpectedLineups(id, refreshMode) });
    tasks.push({ step: "sync_transfer_rumours", fn: () => syncTransferRumours(id, refreshMode) });
    tasks.push({ step: "sync_odds_prematch", fn: () => syncOddsPrematch(id, refreshMode) });

    if (shouldSyncInplay) {
      tasks.push({ step: "sync_odds_inplay", fn: () => syncOddsInplay(id, liveRefreshMode) });
    }

    const settled = await Promise.allSettled(
      tasks.map(async (task) => {
        try {
          const result = await task.fn();
          return { step: task.step, ok: true, ...result };
        } catch (error) {
          logger.exception("Sync step failed", error, { step: task.step, fixture_id: id });
          return { step: task.step, ok: false, error: error?.message ?? "Unknown sync error" };
        }
      })
    );

    const sync_results = settled.map((s) =>
      s.status === "fulfilled"
        ? s.value
        : { step: "unknown", ok: false, error: s.reason?.message ?? "Promise rejected" }
    );

    const failed_steps = sync_results.filter((r) => !r.ok).map((r) => r.step);

    // ── Step 4: final manifest ──
    const manifest2 = await adminJson(request, `/analysis/fixtures/${id}/manifest`);

    return NextResponse.json({
      ok: failed_steps.length === 0,
      fixture_id: id,
      discovered: {
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        referee_id: refereeId,
        season_id: seasonId,
      },
      match_is_live_like: shouldSyncInplay,
      refresh_policy: {
        default_refresh_mode: refreshMode,
        live_refresh_mode: liveRefreshMode,
        h2h_limit: h2hLimit,
      },
      sync_results,
      failed_steps,
      next: manifest2.ok
        ? {
            manifest_ready: true,
            default_read_order: manifest2.body?.default_read_order ?? [],
          }
        : {
            manifest_ready: false,
          },
    });
  } catch (error) {
    logger.exception("Analysis sync failed", error, { fixture_id: Number(fixtureId) });
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}