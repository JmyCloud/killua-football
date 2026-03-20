import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchAllSportMonksPages } from "@/lib/sportmonks";
import { staleWhileRevalidate } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKMAKER_ID = 35;

function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");
  if (!expected) throw new Error("Missing PROXY_SHARED_SECRET");
  return provided === expected;
}

async function getCached(fixtureId) {
  const result = await query(
    `select payload as data, fetched_at
     from cache.odds_prematch_fixtures_bookmakers_35_raw
     where fixture_id = $1 and bookmaker_id = $2
     order by fetched_at desc
     limit 1`,
    [fixtureId, BOOKMAKER_ID]
  );
  return result.rows[0] ?? null;
}

async function refresh(fixtureId) {
  const syncResult = await query(
    `select cache.start_sync($1, $2) as sync_id`,
    ["odds_prematch_fixtures_bookmakers_35_raw", `fixture:${fixtureId}:bookmaker:${BOOKMAKER_ID}`]
  );
  const syncId = syncResult.rows[0]?.sync_id;
  if (!syncId) throw new Error("Failed to create sync run");

  try {
    const pages = await fetchAllSportMonksPages(
      `odds/pre-match/fixtures/${fixtureId}/bookmakers/${BOOKMAKER_ID}`,
      { per_page: 50, page: 1 }
    );

    for (const page of pages) {
      await query(
        `insert into cache.odds_prematch_fixtures_bookmakers_35_raw
           (fixture_id, bookmaker_id, page_number, payload, pagination, fetched_at, sync_run_id)
         values ($1, $2, $3, $4::jsonb, $5::jsonb, now(), $6)
         on conflict (fixture_id, bookmaker_id, page_number) do update set
           payload     = excluded.payload,
           pagination  = excluded.pagination,
           fetched_at  = excluded.fetched_at,
           sync_run_id = excluded.sync_run_id,
           updated_at  = now()`,
        [fixtureId, BOOKMAKER_ID, page.page_number, JSON.stringify(page.payload), JSON.stringify(page.pagination), syncId]
      );
    }

    await query(`select cache.finish_sync_odds_prematch($1, $2, $3)`, [fixtureId, BOOKMAKER_ID, syncId]);
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
      type:      "odds_prematch",
      getCached: () => getCached(Number(fixtureId)),
      refresh:   () => refresh(Number(fixtureId)),
    });

    return NextResponse.json({
      ok:          true,
      fixture_id:  Number(fixtureId),
      bookmaker_id: BOOKMAKER_ID,
      source:      result.source,
      stale:       result.stale,
      data:        result.data,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}