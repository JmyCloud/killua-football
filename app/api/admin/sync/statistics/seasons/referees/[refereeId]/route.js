import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchAllSportMonksPages } from "@/lib/sportmonks";
import { staleWhileRevalidate } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INCLUDE = "season;referee";

function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");
  if (!expected) throw new Error("Missing PROXY_SHARED_SECRET");
  return provided === expected;
}

async function getCached(refereeId) {
  const result = await query(
    `select payload as data, fetched_at
     from cache.statistics_seasons_referees_raw
     where referee_id = $1
     order by fetched_at desc
     limit 1`,
    [refereeId]
  );
  return result.rows[0] ?? null;
}

async function refresh(refereeId) {
  const syncResult = await query(
    `insert into cache.sync_runs (target_table, scope_key, status)
     values ($1, $2, 'running') returning id`,
    ["statistics_seasons_referees_raw", `referee:${refereeId}`]
  );
  const syncId = syncResult.rows[0]?.id;
  if (!syncId) throw new Error("Failed to create sync run");

  try {
    const pages = await fetchAllSportMonksPages(
      `statistics/seasons/referees/${refereeId}`,
      { include: INCLUDE, per_page: 50, page: 1 }
    );

    for (const page of pages) {
      await query(
        `insert into cache.statistics_seasons_referees_raw
           (referee_id, page_number, payload, pagination, fetched_at, sync_run_id)
         values ($1, $2, $3::jsonb, $4::jsonb, now(), $5)
         on conflict (referee_id, page_number) do update set
           payload     = excluded.payload,
           pagination  = excluded.pagination,
           fetched_at  = excluded.fetched_at,
           sync_run_id = excluded.sync_run_id,
           updated_at  = now()`,
        [
          refereeId,
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
      `select cache.rebuild_referee_stats_index($1)`,
      [refereeId]
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

  const { refereeId } = await context.params;
  if (!/^\d+$/.test(String(refereeId))) {
    return NextResponse.json({ ok: false, error: "Invalid refereeId" }, { status: 400 });
  }

  try {
    const result = await staleWhileRevalidate({
      type: "referee_season_stats",
      getCached: () => getCached(Number(refereeId)),
      refresh: () => refresh(Number(refereeId)),
    });

    return NextResponse.json({
      ok: true,
      referee_id: Number(refereeId),
      source: result.source,
      stale: result.stale,
      synced: true,
      next: {
        read_from: `/api/admin/index/statistics/referees/${refereeId}?season_id=current`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}