import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchAllSportMonksPages } from "@/lib/sportmonks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");

  if (!expected) {
    throw new Error("Missing PROXY_SHARED_SECRET");
  }

  return provided === expected;
}

async function startSync() {
  const result = await query(
    `select cache.start_sync($1, $2) as sync_id`,
    ["odds_markets_raw", "global"]
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

async function finishSync(syncId) {
  await query(
    `select cache.finish_sync_odds_markets($1)`,
    [syncId]
  );
}

async function upsertOddsMarketsPage(syncId, page) {
  await query(
    `
    insert into cache.odds_markets_raw (
      page_number,
      payload,
      pagination,
      fetched_at,
      sync_run_id
    )
    values ($1, $2::jsonb, $3::jsonb, now(), $4)
    on conflict (page_number)
    do update set
      payload = excluded.payload,
      pagination = excluded.pagination,
      fetched_at = excluded.fetched_at,
      sync_run_id = excluded.sync_run_id,
      updated_at = now()
    `,
    [
      page.page_number,
      JSON.stringify(page.payload),
      JSON.stringify(page.pagination),
      syncId
    ]
  );
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let syncId = null;

  try {
    syncId = await startSync();

    if (!syncId) {
      throw new Error("Failed to create sync run");
    }

const pages = await fetchAllSportMonksPages(
  "odds/markets",
  {
    per_page: 50,
    page: 1
  },
  {
    base: "global"
  }
);

    for (const page of pages) {
      await upsertOddsMarketsPage(syncId, page);
    }

    await finishSync(syncId);

    const totalMarkets = pages.reduce((sum, page) => {
      const count = Array.isArray(page?.payload?.data) ? page.payload.data.length : 0;
      return sum + count;
    }, 0);

    return NextResponse.json({
      ok: true,
      endpoint: "/odds/markets",
      sync_run_id: syncId,
      pages_saved: pages.length,
      total_markets_saved: totalMarkets
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