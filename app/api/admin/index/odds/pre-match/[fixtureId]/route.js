import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");
  if (!expected) throw new Error("Missing PROXY_SHARED_SECRET");
  return provided === expected;
}

export async function GET(request, context) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { fixtureId } = await context.params;
  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json({ ok: false, error: "Invalid fixtureId" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const marketId = searchParams.get("market_id");

  try {
    // لو طُلب market_id محدد
    if (marketId) {
      if (!/^\d+$/.test(String(marketId))) {
        return NextResponse.json({ ok: false, error: "Invalid market_id" }, { status: 400 });
      }

      const result = await query(
        `select market_id, market_description, odds, fetched_at
         from cache.odds_prematch_index
         where fixture_id = $1 and market_id = $2
         limit 1`,
        [Number(fixtureId), Number(marketId)]
      );

      if (!result.rows[0]) {
        return NextResponse.json({
          ok: false,
          error: `Market ${marketId} not found for fixture ${fixtureId}. Run syncOddsPrematch first.`,
        }, { status: 404 });
      }

      const row = result.rows[0];
      return NextResponse.json({
        ok:                 true,
        fixture_id:         Number(fixtureId),
        market_id:          row.market_id,
        market_description: row.market_description,
        fetched_at:         row.fetched_at,
        data:               row.odds,
      });
    }

    // بدون market_id → summary لكل الـ markets المتاحة
    const result = await query(
      `select market_id, market_description,
              jsonb_array_length(odds) as odds_count,
              fetched_at
       from cache.odds_prematch_index
       where fixture_id = $1
       order by market_id`,
      [Number(fixtureId)]
    );

    if (!result.rows.length) {
      return NextResponse.json({
        ok: false,
        error: `No prematch odds found for fixture ${fixtureId}. Run syncOddsPrematch first.`,
      }, { status: 404 });
    }

    return NextResponse.json({
      ok:         true,
      fixture_id: Number(fixtureId),
      markets_available: result.rows.length,
      usage_hint: "Add ?market_id={id} to get odds for a specific market",
      data: result.rows.map(r => ({
        market_id:          r.market_id,
        market_description: r.market_description,
        odds_count:         r.odds_count,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
