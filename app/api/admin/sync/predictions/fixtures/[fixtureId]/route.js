import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchAllSportMonksPages } from "@/lib/sportmonks";
import { staleWhileRevalidate, parseRefreshMode } from "@/lib/cache";
import { isAuthorized, unauthorized } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function getCached(fixtureId, dbQuery = query) {
  const result = await dbQuery(
    `select payload as data, fetched_at
     from cache.fixture_predictions_raw
     where fixture_id = $1
     order by fetched_at desc
     limit 1`,
    [fixtureId]
  );
  return result.rows[0] ?? null;
}

async function refresh(fixtureId, dbQuery = query) {
  const syncResult = await dbQuery(
    `insert into cache.sync_runs (target_table, scope_key, status)
     values ($1, $2, 'running') returning id`,
    ["fixture_predictions_raw", `fixture:${fixtureId}`]
  );
  const syncId = syncResult.rows[0]?.id;
  if (!syncId) throw new Error("Failed to create sync run");

  try {
    let probabilities = [];
    let valueBets = [];
    try {
      const [probPages, vbPages] = await Promise.all([
        fetchAllSportMonksPages(
          `predictions/probabilities/fixtures/${fixtureId}`,
          { per_page: 50, page: 1 }
        ).catch(() => []),
        fetchAllSportMonksPages(
          `predictions/value-bets/fixtures/${fixtureId}`,
          { per_page: 50, page: 1 }
        ).catch(() => []),
      ]);
      probabilities = probPages.flatMap((p) => p.payload?.data ?? []);
      valueBets = vbPages.flatMap((p) => p.payload?.data ?? []);
    } catch {
      // Predictions may not be available for this fixture or plan
    }

    const combined = { probabilities, value_bets: valueBets };

    await dbQuery(
      `insert into cache.fixture_predictions_raw
         (fixture_id, payload, fetched_at, sync_run_id)
       values ($1, $2::jsonb, now(), $3)
       on conflict (fixture_id) do update set
         payload     = excluded.payload,
         fetched_at  = excluded.fetched_at,
         sync_run_id = excluded.sync_run_id,
         updated_at  = now()`,
      [fixtureId, JSON.stringify(combined), syncId]
    );

    await dbQuery(
      `update cache.sync_runs set status = 'done', finished_at = now() where id = $1`,
      [syncId]
    );
  } catch (err) {
    await dbQuery(
      `update cache.sync_runs set status = 'failed', notes = $1, finished_at = now() where id = $2`,
      [err.message?.slice(0, 4000), syncId]
    );
    throw err;
  }
}

export async function POST(request, context) {
  if (!isAuthorized(request)) return unauthorized();

  const { fixtureId } = await context.params;
  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json({ ok: false, error: "Invalid fixtureId" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const refreshMode = parseRefreshMode(searchParams, "swr");

  try {
    const id = Number(fixtureId);

    const result = await staleWhileRevalidate({
      type: "fixture_predictions",
      getCached: (dbQuery) => getCached(id, dbQuery),
      refresh: (dbQuery) => refresh(id, dbQuery),
      mode: refreshMode,
      lockKey: `sync:predictions:${id}`,
    });

    return NextResponse.json({
      ok: true,
      fixture_id: id,
      source: result.source,
      stale: result.stale,
      synced: true,
      refresh_mode: result.mode,
      freshness: result.freshness,
      refresh: result.refresh,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
