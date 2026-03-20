import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchAllSportMonksPages } from "@/lib/sportmonks";
import { staleWhileRevalidate, filterOddsPayload } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKMAKER_ID = 35;
const INCLUDE = "market";

function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");
  if (!expected) throw new Error("Missing PROXY_SHARED_SECRET");
  return provided === expected;
}

async function getCached(fixtureId) {
  const result = await query(
    `select payload as data, fetched_at
     from cache.odds_inplay_fixtures_bookmakers_35_raw
     where fixture_id = $1 and bookmaker_id = $2
     order by fetched_at desc
     limit 1`,
    [fixtureId, BOOKMAKER_ID]
  );
  return result.rows[0] ?? null;
}

async function refresh(fixtureId) {
  const syncResult = await query(
    `insert into cache.sync_runs (target_table, scope_key, status)
     values ($1, $2, 'running') returning id`,
    ["odds_inplay_fixtures_bookmakers_35_raw", `fixture:${fixtureId}:bookmaker:${BOOKMAKER_ID}`]
  );
  const syncId = syncResult.rows[0]?.id;
  if (!syncId) throw new Error("Failed to create sync run");

  try {
    const pages = await fetchAllSportMonksPages(
      `odds/inplay/fixtures/${fixtureId}/bookmakers/${BOOKMAKER_ID}`,
      { include: INCLUDE, per_page: 50, page: 1 }
    );

    for (const page of pages) {
      await query(
        `insert into cache.odds_inplay_fixtures_bookmakers_35_raw
           (fixture_id, bookmaker_id, page_number, payload, pagination, fetched_at, sync_run_id)
         values ($1, $2, $3, $4::jsonb, $5::jsonb, now(), $6)
         on conflict (fixture_id, bookmaker_id, page_number) do update set
           payload     = excluded.payload,
           pagination  = excluded.pagination,
           fetched_at  = excluded.fetched_at,
           sync_run_id = excluded.sync_run_id`,
        [
          fixtureId,
          BOOKMAKER_ID,
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
      `select cache.rebuild_odds_inplay_index($1)`,
      [fixtureId]
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

  const { fixtureId } = await context.params;
  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json({ ok: false, error: "Invalid fixtureId" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const filterParam = searchParams.get("filter") ?? null;

  try {
    const result = await staleWhileRevalidate({
      type: "odds_inplay",
      getCached: () => getCached(Number(fixtureId)),
      refresh: () => refresh(Number(fixtureId)),
    });

    const data = filterParam
      ? filterOddsPayload(result.data, filterParam)
      : result.data;

    return NextResponse.json({
      ok: true,
      fixture_id: Number(fixtureId),
      bookmaker_id: BOOKMAKER_ID,
      source: result.source,
      stale: result.stale,
      filtered_by: filterParam ?? null,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}