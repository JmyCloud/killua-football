import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchSportMonksPage } from "@/lib/sportmonks";
import { staleWhileRevalidate, parseRefreshMode } from "@/lib/cache";
import { isAuthorized, unauthorized } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXTURE_INCLUDE =
  "league;season;stage;round;group;aggregate;venue;state;weatherReport;participants;metadata;formations;lineups.player;lineups.detailedPosition;lineups.details.type;scores.type;events.type;statistics.type;periods.type;periods.statistics.type;referees.referee;referees.type;coaches;sidelined.sideline.player;sidelined.sideline.type";

async function getCached(fixtureId, dbQuery = query) {
  const result = await dbQuery(
    `select payload as data, fetched_at
     from cache.fixtures_raw
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
    ["fixtures_raw", `fixture:${fixtureId}`]
  );

  const syncId = syncResult.rows[0]?.id;
  if (!syncId) throw new Error("Failed to create sync run");

  try {
    const payload = await fetchSportMonksPage(`fixtures/${fixtureId}`, {
      include: FIXTURE_INCLUDE,
    });

    const resolvedFixtureId = Number(payload?.data?.id ?? fixtureId);
    if (!resolvedFixtureId) throw new Error("Fixture payload missing data.id");

    await dbQuery(
      `insert into cache.fixtures_raw (
         fixture_id, page_number, payload, pagination, fetched_at, sync_run_id
       )
       values ($1, $2, $3::jsonb, $4::jsonb, now(), $5)
       on conflict (fixture_id, page_number) do update set
         payload     = excluded.payload,
         pagination  = excluded.pagination,
         fetched_at  = excluded.fetched_at,
         sync_run_id = excluded.sync_run_id,
         updated_at  = now()`,
      [
        resolvedFixtureId,
        1,
        JSON.stringify(payload),
        JSON.stringify(payload?.pagination ?? null),
        syncId,
      ]
    );

    await dbQuery(
      `select cache.rebuild_fixture_index($1)`,
      [resolvedFixtureId]
    );

    await dbQuery(
      `update cache.sync_runs
       set status = 'done', finished_at = now()
       where id = $1`,
      [syncId]
    );
  } catch (err) {
    await dbQuery(
      `update cache.sync_runs
       set status = 'failed', notes = $1, finished_at = now()
       where id = $2`,
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
  const isLive = searchParams.get("live") === "true";

  try {
    const id = Number(fixtureId);

    const result = await staleWhileRevalidate({
      type: isLive ? "fixtures_live" : "fixtures",
      getCached: (dbQuery) => getCached(id, dbQuery),
      refresh: (dbQuery) => refresh(id, dbQuery),
      mode: refreshMode,
      lockKey: `sync:fixtures:${id}`,
      waitForFreshMs: isLive ? 8000 : 15000,
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
      next: {
        read_from: `/api/admin/index/fixtures/${fixtureId}`,
        manifest_from: `/api/admin/analysis/fixtures/${fixtureId}/manifest`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}