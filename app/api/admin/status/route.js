import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized, unauthorized } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!isAuthorized(request)) return unauthorized();

  const [recentRuns, failedRuns, watchlistStats] = await Promise.all([
    query(
      `select target_table, status, count(*)::int as count,
              max(finished_at) as last_finished
       from cache.sync_runs
       where started_at > now() - interval '24 hours'
       group by target_table, status
       order by target_table, status`
    ),
    query(
      `select id, target_table, scope_key, notes,
              started_at, finished_at
       from cache.sync_runs
       where status = 'failed'
         and started_at > now() - interval '24 hours'
       order by started_at desc
       limit 10`
    ),
    query(
      `select
         count(*)::int as total,
         count(*) filter (where enabled)::int as enabled,
         count(*) filter (where not enabled)::int as disabled
       from cache.watchlist`
    ),
  ]);

  const staleRunning = await query(
    `select count(*)::int as count
     from cache.sync_runs
     where status = 'running'
       and started_at < now() - interval '30 minutes'`
  );

  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    sync_runs_24h: recentRuns.rows,
    recent_failures: failedRuns.rows,
    stale_running: staleRunning.rows[0]?.count ?? 0,
    watchlist: watchlistStats.rows[0] ?? null,
  });
}
