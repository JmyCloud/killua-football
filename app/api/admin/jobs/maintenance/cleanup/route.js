import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized, unauthorized } from "@/lib/admin";
import { parsePositiveInt } from "@/lib/watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_STALE_RUNNING_MINUTES = 30;
const DEFAULT_DELETE_SYNC_RUNS_DAYS = 14;
const DEFAULT_DELETE_DISABLED_WATCHLIST_DAYS = 90;

async function previewCounts({
  staleRunningMinutes,
  deleteSyncRunsDays,
  deleteDisabledWatchlistDays,
}) {
  const staleRunning = await query(
    `
    select count(*)::int as count
    from cache.sync_runs
    where status = 'running'
      and started_at < now() - ($1 || ' minutes')::interval
    `,
    [staleRunningMinutes]
  );

  const oldSyncRuns = await query(
    `
    select count(*)::int as count
    from cache.sync_runs
    where status in ('done', 'failed')
      and coalesce(finished_at, started_at) < now() - ($1 || ' days')::interval
    `,
    [deleteSyncRunsDays]
  );

  const expiredWatchlist = await query(
    `
    select count(*)::int as count
    from cache.fixture_watchlist
    where enabled = true
      and expires_at is not null
      and expires_at < now()
    `
  );

  const oldDisabledWatchlist = await query(
    `
    select count(*)::int as count
    from cache.fixture_watchlist
    where enabled = false
      and updated_at < now() - ($1 || ' days')::interval
    `,
    [deleteDisabledWatchlistDays]
  );

  return {
    stale_running_sync_runs: staleRunning.rows[0]?.count ?? 0,
    old_sync_runs: oldSyncRuns.rows[0]?.count ?? 0,
    expired_enabled_watchlist: expiredWatchlist.rows[0]?.count ?? 0,
    old_disabled_watchlist: oldDisabledWatchlist.rows[0]?.count ?? 0,
  };
}

export async function GET(request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);

    const staleRunningMinutes = parsePositiveInt(
      searchParams.get("stale_running_minutes"),
      DEFAULT_STALE_RUNNING_MINUTES,
      1440
    );

    const deleteSyncRunsDays = parsePositiveInt(
      searchParams.get("delete_sync_runs_days"),
      DEFAULT_DELETE_SYNC_RUNS_DAYS,
      365
    );

    const deleteDisabledWatchlistDays = parsePositiveInt(
      searchParams.get("delete_disabled_watchlist_days"),
      DEFAULT_DELETE_DISABLED_WATCHLIST_DAYS,
      3650
    );

    const preview = await previewCounts({
      staleRunningMinutes,
      deleteSyncRunsDays,
      deleteDisabledWatchlistDays,
    });

    return NextResponse.json({
      ok: true,
      strategy: {
        stale_running_minutes: staleRunningMinutes,
        delete_sync_runs_days: deleteSyncRunsDays,
        delete_disabled_watchlist_days: deleteDisabledWatchlistDays,
      },
      preview,
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
    const { searchParams } = new URL(request.url);

    const staleRunningMinutes = parsePositiveInt(
      searchParams.get("stale_running_minutes"),
      DEFAULT_STALE_RUNNING_MINUTES,
      1440
    );

    const deleteSyncRunsDays = parsePositiveInt(
      searchParams.get("delete_sync_runs_days"),
      DEFAULT_DELETE_SYNC_RUNS_DAYS,
      365
    );

    const deleteDisabledWatchlistDays = parsePositiveInt(
      searchParams.get("delete_disabled_watchlist_days"),
      DEFAULT_DELETE_DISABLED_WATCHLIST_DAYS,
      3650
    );

    const markRunning = await query(
      `
      update cache.sync_runs
      set
        status = 'failed',
        notes = coalesce(notes, 'Marked failed by cleanup job: stale running sync'),
        finished_at = now()
      where status = 'running'
        and started_at < now() - ($1 || ' minutes')::interval
      returning id
      `,
      [staleRunningMinutes]
    );

    const disableExpiredWatchlist = await query(
      `
      update cache.fixture_watchlist
      set
        enabled = false,
        updated_at = now()
      where enabled = true
        and expires_at is not null
        and expires_at < now()
      returning fixture_id
      `
    );

    const deleteOldSyncRuns = await query(
      `
      delete from cache.sync_runs
      where status in ('done', 'failed')
        and coalesce(finished_at, started_at) < now() - ($1 || ' days')::interval
      returning id
      `,
      [deleteSyncRunsDays]
    );

    const deleteOldDisabledWatchlist = await query(
      `
      delete from cache.fixture_watchlist
      where enabled = false
        and updated_at < now() - ($1 || ' days')::interval
      returning fixture_id
      `,
      [deleteDisabledWatchlistDays]
    );

    return NextResponse.json({
      ok: true,
      strategy: {
        stale_running_minutes: staleRunningMinutes,
        delete_sync_runs_days: deleteSyncRunsDays,
        delete_disabled_watchlist_days: deleteDisabledWatchlistDays,
      },
      actions: {
        marked_stale_running_sync_runs_failed: markRunning.rows.length,
        disabled_expired_watchlist: disableExpiredWatchlist.rows.length,
        deleted_old_sync_runs: deleteOldSyncRuns.rows.length,
        deleted_old_disabled_watchlist: deleteOldDisabledWatchlist.rows.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}