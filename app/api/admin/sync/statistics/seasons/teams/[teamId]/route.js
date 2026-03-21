import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchAllSportMonksPages } from "@/lib/sportmonks";
import { staleWhileRevalidate, parseRefreshMode } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INCLUDE = "season;team";

function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");
  if (!expected) throw new Error("Missing PROXY_SHARED_SECRET");
  return provided === expected;
}

async function getCached(teamId, dbQuery = query) {
  const result = await dbQuery(
    `select payload as data, fetched_at
     from cache.statistics_seasons_teams_raw
     where team_id = $1
     order by fetched_at desc
     limit 1`,
    [teamId]
  );
  return result.rows[0] ?? null;
}

async function refresh(teamId, dbQuery = query) {
  const syncResult = await dbQuery(
    `insert into cache.sync_runs (target_table, scope_key, status)
     values ($1, $2, 'running') returning id`,
    ["statistics_seasons_teams_raw", `team:${teamId}`]
  );
  const syncId = syncResult.rows[0]?.id;
  if (!syncId) throw new Error("Failed to create sync run");

  try {
    const pages = await fetchAllSportMonksPages(
      `statistics/seasons/teams/${teamId}`,
      { include: INCLUDE, per_page: 50, page: 1 }
    );

    for (const page of pages) {
      await query(
        `insert into cache.statistics_seasons_teams_raw
           (team_id, page_number, payload, pagination, fetched_at, sync_run_id)
         values ($1, $2, $3::jsonb, $4::jsonb, now(), $5)
         on conflict (team_id, page_number) do update set
           payload     = excluded.payload,
           pagination  = excluded.pagination,
           fetched_at  = excluded.fetched_at,
           sync_run_id = excluded.sync_run_id,
           updated_at  = now()`,
        [
          teamId,
          page.page_number,
          JSON.stringify(page.payload),
          JSON.stringify(page.pagination),
          syncId,
        ]
      );
    }

    await query(
      `update cache.sync_runs set status = 'done', finished_at = now() where id = $1`,
      [syncId]
    );

    await query(
      `select cache.rebuild_team_stats_index($1)`,
      [teamId]
    );
  } catch (err) {
    await query(
      `update cache.sync_runs set status = 'failed', notes = $1, finished_at = now() where id = $2`,
      [err.message?.slice(0, 4000), syncId]
    );
    throw err;
  }
}

export async function POST(request, context) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { teamId } = await context.params;
  if (!/^\d+$/.test(String(teamId))) {
    return NextResponse.json({ ok: false, error: "Invalid teamId" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const refreshMode = parseRefreshMode(searchParams, "swr");

  try {
    const id = Number(teamId);

    const result = await staleWhileRevalidate({
      type: "team_season_stats",
      getCached: (dbQuery) => getCached(id, dbQuery),
      refresh: (dbQuery) => refresh(id, dbQuery),
      mode: refreshMode,
      lockKey: `sync:team_stats:${id}`,
    });

    return NextResponse.json({
      ok: true,
      team_id: id,
      source: result.source,
      stale: result.stale,
      synced: true,
      refresh_mode: result.mode,
      freshness: result.freshness,
      refresh: result.refresh,
      next: {
        read_from: `/api/admin/index/statistics/teams/${teamId}?season_id=current`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}