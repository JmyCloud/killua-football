import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchAllSportMonksPages } from "@/lib/sportmonks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKMAKER_ID = 35;

function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");

  if (!expected) {
    throw new Error("Missing PROXY_SHARED_SECRET");
  }

  return provided === expected;
}

async function startSync(fixtureId) {
  const result = await query(
    `select cache.start_sync($1, $2) as sync_id`,
    [
      "odds_prematch_fixtures_bookmakers_35_raw",
      `fixture:${fixtureId}:bookmaker:${BOOKMAKER_ID}`
    ]
  );

  return result.rows[0]?.sync_id;
}

async function markSyncFailed(syncId, errorMessage) {
  if (!syncId) return;

  await query(
    `select cache.mark_sync_failed($1, $2)`,
    [syncId, errorMessage?.slice(0, 4000) ?? "Unknown sync error"]
  );
}

async function finishSync(fixtureId, syncId) {
  await query(
    `select cache.finish_sync_odds_prematch($1, $2, $3)`,
    [fixtureId, BOOKMAKER_ID, syncId]
  );
}

async function upsertOddsPrematchPage(syncId, fixtureId, page) {
  await query(
    `
    insert into cache.odds_prematch_fixtures_bookmakers_35_raw (
      fixture_id,
      bookmaker_id,
      page_number,
      payload,
      pagination,
      fetched_at,
      sync_run_id
    )
    values ($1, $2, $3, $4::jsonb, $5::jsonb, now(), $6)
    on conflict (fixture_id, bookmaker_id, page_number)
    do update set
      payload = excluded.payload,
      pagination = excluded.pagination,
      fetched_at = excluded.fetched_at,
      sync_run_id = excluded.sync_run_id,
      updated_at = now()
    `,
    [
      fixtureId,
      BOOKMAKER_ID,
      page.page_number,
      JSON.stringify(page.payload),
      JSON.stringify(page.pagination),
      syncId
    ]
  );
}

export async function POST(request, context) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { fixtureId } = await context.params;

  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json(
      { ok: false, error: "Invalid fixtureId" },
      { status: 400 }
    );
  }

  let syncId = null;

  try {
    syncId = await startSync(fixtureId);

    if (!syncId) {
      throw new Error("Failed to create sync run");
    }

    const pages = await fetchAllSportMonksPages(
      `odds/pre-match/fixtures/${fixtureId}/bookmakers/${BOOKMAKER_ID}`,
      {
        per_page: 50,
        page: 1
      }
    );

    for (const page of pages) {
      await upsertOddsPrematchPage(syncId, Number(fixtureId), page);
    }

    await finishSync(Number(fixtureId), syncId);

    const totalOdds = pages.reduce((sum, page) => {
      const count = Array.isArray(page?.payload?.data) ? page.payload.data.length : 0;
      return sum + count;
    }, 0);

    return NextResponse.json({
      ok: true,
      endpoint: `/odds/pre-match/fixtures/${fixtureId}/bookmakers/${BOOKMAKER_ID}`,
      fixture_id: Number(fixtureId),
      bookmaker_id: BOOKMAKER_ID,
      sync_run_id: syncId,
      pages_saved: pages.length,
      total_odds_saved: totalOdds
    });
  } catch (error) {
    await markSyncFailed(syncId, error.message);

    return NextResponse.json(
      {
        ok: false,
        error: error.message ?? "Unknown error"
      },
      { status: 500 }
    );
  }
}