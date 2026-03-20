import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchSportMonksPage } from "@/lib/sportmonks";
import { staleWhileRevalidate } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXTURE_INCLUDE =
  "league;season;stage;round;group;aggregate;venue;state;weatherReport;participants;metadata;formations;lineups.player;lineups.detailedPosition;lineups.details.type;scores.type;events.type;statistics.type;periods.type;periods.statistics.type;referees.referee;referees.type;coaches;sidelined.sideline.player;sidelined.sideline.type";

function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");
  if (!expected) throw new Error("Missing PROXY_SHARED_SECRET");
  return provided === expected;
}

async function getCached(fixtureId) {
  const result = await query(
    `select payload as data, fetched_at
     from cache.fixtures_raw
     where fixture_id = $1
     order by fetched_at desc
     limit 1`,
    [fixtureId]
  );
  return result.rows[0] ?? null;
}

async function refresh(fixtureId) {
  const syncResult = await query(
    `select cache.start_sync($1, $2) as sync_id`,
    ["fixtures_raw", "football"]
  );
  const syncId = syncResult.rows[0]?.sync_id;
  if (!syncId) throw new Error("Failed to create sync run");

  try {
    const payload = await fetchSportMonksPage(`fixtures/${fixtureId}`, {
      include: FIXTURE_INCLUDE,
    });

    const resolvedFixtureId = Number(payload?.data?.id ?? fixtureId);
    if (!resolvedFixtureId) throw new Error("Fixture payload missing data.id");

    await query(
      `insert into cache.fixtures_raw (fixture_id, page_number, payload, pagination, fetched_at, sync_run_id)
       values ($1, $2, $3::jsonb, $4::jsonb, now(), $5)
       on conflict (fixture_id, page_number) do update set
         payload     = excluded.payload,
         pagination  = excluded.pagination,
         fetched_at  = excluded.fetched_at,
         sync_run_id = excluded.sync_run_id,
         updated_at  = now()`,
      [resolvedFixtureId, 1, JSON.stringify(payload), JSON.stringify(payload?.pagination ?? null), syncId]
    );

    await query(`select cache.finish_sync_fixtures($1, $2)`, [resolvedFixtureId, syncId]);
  } catch (err) {
    await query(`select cache.mark_sync_failed($1, $2)`, [syncId, err.message?.slice(0, 4000)]);
    throw err;
  }
}

export async function POST(request, context) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { fixtureId } = await context.params;

  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json({ ok: false, error: "Invalid fixtureId" }, { status: 400 });
  }

  try {
    const result = await staleWhileRevalidate({
      type:      "fixtures",
      getCached: () => getCached(Number(fixtureId)),
      refresh:   () => refresh(Number(fixtureId)),
    });

    return NextResponse.json({
      ok:         true,
      fixture_id: Number(fixtureId),
      source:     result.source,   // "cache" أو "sportmonks"
      stale:      result.stale,    // true = كانت قديمة وبيتجدد في الـ background
      data:       result.data,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}