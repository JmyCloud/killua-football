import { NextResponse } from "next/server";
import { isAuthorized, unauthorized, adminJson } from "@/lib/admin";
import { normalizeRefreshMode } from "@/lib/cache";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseH2HLimit(searchParams) {
  const raw = searchParams.get("h2h_limit");
  if (!raw) return 5;
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return 5;
  return Math.min(n, 20);
}

function toStepResult(step, response) {
  return {
    step,
    ok: response.ok,
    status: response.status,
    source: response.body?.source ?? null,
    stale: response.body?.stale ?? null,
    refresh_mode: response.body?.refresh_mode ?? null,
    freshness: response.body?.freshness ?? null,
    refresh: response.body?.refresh ?? null,
    error: response.body?.error ?? null,
  };
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

    const liveHint = liveRefreshMode === "force_fresh" ? "&live=true" : "";
    const fixtureSync = await adminJson(
      request,
      `/sync/fixtures/${id}?refresh_mode=${refreshMode}${liveHint}`,
      { method: "POST" }
    );

    if (!fixtureSync.ok) {
      return NextResponse.json(
        {
          ok: false,
          step: "sync_fixture",
          error: fixtureSync.body?.error ?? "syncFixture failed",
        },
        { status: fixtureSync.status || 500 }
      );
    }

    const manifest1 = await adminJson(
      request,
      `/analysis/fixtures/${id}/manifest`
    );

    if (!manifest1.ok) {
      return NextResponse.json(
        {
          ok: false,
          step: "manifest_after_fixture",
          error: manifest1.body?.error ?? "manifest failed",
        },
        { status: manifest1.status || 500 }
      );
    }

    const discovered = manifest1.body?.discovered ?? {};
    const homeTeamId = discovered.home_team_id ?? null;
    const awayTeamId = discovered.away_team_id ?? null;
    const refereeId = discovered.referee_id ?? null;
    const shouldSyncInplay = Boolean(manifest1.body?.match_is_live_like);

    // ── parallel batch 1: h2h + team stats + referee stats ──
    const parallelSteps = [];

    if (homeTeamId && awayTeamId) {
      parallelSteps.push({
        step: "sync_h2h",
        path:
          `/sync/h2h/${homeTeamId}/${awayTeamId}` +
          `?limit=${h2hLimit}&refresh_mode=${refreshMode}`,
      });
    }

    if (homeTeamId) {
      parallelSteps.push({
        step: "sync_home_team_stats",
        path: `/sync/statistics/seasons/teams/${homeTeamId}?refresh_mode=${refreshMode}`,
      });
    }

    if (awayTeamId) {
      parallelSteps.push({
        step: "sync_away_team_stats",
        path: `/sync/statistics/seasons/teams/${awayTeamId}?refresh_mode=${refreshMode}`,
      });
    }

    if (refereeId) {
      parallelSteps.push({
        step: "sync_referee_stats",
        path: `/sync/statistics/seasons/referees/${refereeId}?refresh_mode=${refreshMode}`,
      });
    }

    // ── parallel batch 2: odds (after batch 1) ──
    const oddsSteps = [];

    oddsSteps.push({
      step: "sync_odds_prematch",
      path:
        `/sync/odds/pre-match/fixtures/${id}/bookmakers/35` +
        `?refresh_mode=${refreshMode}`,
    });

    if (shouldSyncInplay) {
      oddsSteps.push({
        step: "sync_odds_inplay",
        path:
          `/sync/odds/inplay/fixtures/${id}/bookmakers/35` +
          `?refresh_mode=${liveRefreshMode}`,
      });
    }

    async function runStep(item) {
      try {
        const response = await adminJson(request, item.path, { method: "POST" });
        return toStepResult(item.step, response);
      } catch (error) {
        logger.exception("Sync step failed", error, { step: item.step, fixture_id: id });
        return {
          step: item.step,
          ok: false,
          status: 500,
          error: error?.message ?? "Unknown sync error",
        };
      }
    }

    const sync_results = [
      ...(await Promise.all(parallelSteps.map(runStep))),
      ...(await Promise.all(oddsSteps.map(runStep))),
    ];

    const failed_steps = sync_results
      .filter((item) => !item.ok)
      .map((item) => item.step);

    const manifest2 = await adminJson(
      request,
      `/analysis/fixtures/${id}/manifest`
    );

    return NextResponse.json({
      ok: failed_steps.length === 0,
      fixture_id: id,
      discovered: {
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        referee_id: refereeId,
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