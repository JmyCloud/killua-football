import { NextResponse } from "next/server";
import { isAuthorized, unauthorized, adminJson } from "@/lib/admin";
import { isFixtureLiveLike } from "@/lib/analysis";
import { normalizeRefreshMode } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    "force_fresh"
  );

  const h2hLimit = parseH2HLimit(searchParams);

  try {
    const id = Number(fixtureId);

    const fixtureSync = await adminJson(
      request,
      `/sync/fixtures/${id}?refresh_mode=${refreshMode}`,
      { method: "POST" }
    );

    if (!fixtureSync.ok) {
      return NextResponse.json({
        ok: false,
        step: "sync_fixture",
        error: fixtureSync.body?.error ?? "syncFixture failed",
      }, { status: fixtureSync.status || 500 });
    }

    const manifest1 = await adminJson(
      request,
      `/analysis/fixtures/${id}/manifest`
    );

    if (!manifest1.ok) {
      return NextResponse.json({
        ok: false,
        step: "manifest_after_fixture",
        error: manifest1.body?.error ?? "manifest failed",
      }, { status: manifest1.status || 500 });
    }

    const discovered = manifest1.body?.discovered ?? {};
    const homeTeamId = discovered.home_team_id ?? null;
    const awayTeamId = discovered.away_team_id ?? null;
    const refereeId = discovered.referee_id ?? null;

    const stateRead = await adminJson(
      request,
      `/index/fixtures/${id}?chunk=state`
    );

    const statePayload = stateRead.ok
      ? (stateRead.body?.data?.state ?? stateRead.body?.data ?? null)
      : null;

    const shouldSyncInplay = isFixtureLiveLike(statePayload);

    const jobs = [];

    if (homeTeamId && awayTeamId) {
      jobs.push(
        adminJson(
          request,
          `/sync/h2h/${homeTeamId}/${awayTeamId}?limit=${h2hLimit}&refresh_mode=${refreshMode}`,
          { method: "POST" }
        ).then((r) => ({ step: "sync_h2h", ...r }))
      );
    }

    if (homeTeamId) {
      jobs.push(
        adminJson(
          request,
          `/sync/statistics/seasons/teams/${homeTeamId}?refresh_mode=${refreshMode}`,
          { method: "POST" }
        ).then((r) => ({ step: "sync_home_team_stats", ...r }))
      );
    }

    if (awayTeamId) {
      jobs.push(
        adminJson(
          request,
          `/sync/statistics/seasons/teams/${awayTeamId}?refresh_mode=${refreshMode}`,
          { method: "POST" }
        ).then((r) => ({ step: "sync_away_team_stats", ...r }))
      );
    }

    if (refereeId) {
      jobs.push(
        adminJson(
          request,
          `/sync/statistics/seasons/referees/${refereeId}?refresh_mode=${refreshMode}`,
          { method: "POST" }
        ).then((r) => ({ step: "sync_referee_stats", ...r }))
      );
    }

    jobs.push(
      adminJson(
        request,
        `/sync/odds/pre-match/fixtures/${id}/bookmakers/35?refresh_mode=${refreshMode}`,
        { method: "POST" }
      ).then((r) => ({ step: "sync_odds_prematch", ...r }))
    );

    if (shouldSyncInplay) {
      jobs.push(
        adminJson(
          request,
          `/sync/odds/inplay/fixtures/${id}/bookmakers/35?refresh_mode=${liveRefreshMode}`,
          { method: "POST" }
        ).then((r) => ({ step: "sync_odds_inplay", ...r }))
      );
    }

    const results = await Promise.allSettled(jobs);

    const sync_results = results.map((r) => {
      if (r.status === "fulfilled") {
        return {
          step: r.value.step,
          ok: r.value.ok,
          status: r.value.status,
          source: r.value.body?.source ?? null,
          stale: r.value.body?.stale ?? null,
          refresh_mode: r.value.body?.refresh_mode ?? null,
          freshness: r.value.body?.freshness ?? null,
          refresh: r.value.body?.refresh ?? null,
          error: r.value.body?.error ?? null,
        };
      }

      return {
        step: "unknown",
        ok: false,
        status: 500,
        error: r.reason?.message ?? "Unknown sync error",
      };
    });

    const failed_steps = sync_results.filter((item) => !item.ok).map((item) => item.step);

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
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}