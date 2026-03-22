import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchAllSportMonksPages } from "@/lib/sportmonks";
import { isAuthorized, unauthorized } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isAuthorized(request)) return unauthorized();

  const syncResult = await query(
    `insert into cache.sync_runs (target_table, scope_key, status)
     values ($1, $2, 'running') returning id`,
    ["odds_markets_raw", "global"]
  );
  const syncId = syncResult.rows[0]?.id;
  if (!syncId) {
    return NextResponse.json({ ok: false, error: "Failed to create sync run" }, { status: 500 });
  }

  try {
    const pages = await fetchAllSportMonksPages(
      "odds/markets",
      { per_page: 50, page: 1 },
      { base: "global" }
    );

    for (const page of pages) {
      await query(
        `insert into cache.odds_markets_raw (page_number, payload, pagination, fetched_at, sync_run_id)
         values ($1, $2::jsonb, $3::jsonb, now(), $4)
         on conflict (page_number) do update set
           payload     = excluded.payload,
           pagination  = excluded.pagination,
           fetched_at  = excluded.fetched_at,
           sync_run_id = excluded.sync_run_id,
           updated_at  = now()`,
        [page.page_number, JSON.stringify(page.payload), JSON.stringify(page.pagination), syncId]
      );
    }

    // إعادة بناء الـ index بعد الـ sync
    await query(`select cache.rebuild_odds_markets_index()`);

    await query(
      `update cache.sync_runs set status = 'done', finished_at = now() where id = $1`,
      [syncId]
    );

    const totalMarkets = pages.reduce((sum, p) => {
      return sum + (Array.isArray(p?.payload?.data) ? p.payload.data.length : 0);
    }, 0);

    return NextResponse.json({
      ok:                  true,
      sync_run_id:         syncId,
      pages_saved:         pages.length,
      total_markets_saved: totalMarkets,
    });
  } catch (err) {
    await query(
      `update cache.sync_runs set status = 'failed', notes = $1, finished_at = now() where id = $2`,
      [err.message?.slice(0, 4000), syncId]
    );
    return NextResponse.json(
      { ok: false, error: err.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
