import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized, unauthorized } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMarketIds(searchParams) {
  const marketIdsParam = searchParams.get("market_ids");
  const filterParam = searchParams.get("filter");

  let raw = marketIdsParam?.trim() ?? "";

  if (!raw && filterParam) {
    const match = String(filterParam).match(/^markets?:([\d,]+)$/i);
    raw = match?.[1] ?? "";
  }

  if (!raw) return null;

  const ids = raw
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isInteger(x) && x > 0);

  return ids.length ? [...new Set(ids)] : null;
}

export async function GET(request, context) {
  if (!isAuthorized(request)) return unauthorized();

  const { fixtureId } = await context.params;
  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json({ ok: false, error: "Invalid fixtureId" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const marketIds = parseMarketIds(searchParams);

  try {
    const fixture = Number(fixtureId);

    if (marketIds?.length) {
      const result = await query(
        `select
           i.market_id,
           coalesce(m.name, i.market_description) as market_name,
           m.developer_name,
           m.legacy_id,
           m.has_winning_calculations,
           i.market_description,
           i.odds,
           i.fetched_at
         from cache.odds_inplay_index i
         left join cache.odds_markets_index m
           on m.market_id = i.market_id
         where i.fixture_id = $1
           and i.market_id = any($2::bigint[])
         order by i.market_id`,
        [fixture, marketIds]
      );

      return NextResponse.json({
        ok: true,
        fixture_id: fixture,
        mode: "inplay",
        market_ids: marketIds,
        markets_found: result.rows.length,
        data: result.rows.map((row) => ({
          market_id: row.market_id,
          market_name: row.market_name,
          developer_name: row.developer_name,
          legacy_id: row.legacy_id,
          has_winning_calculations: row.has_winning_calculations,
          market_description: row.market_description,
          fetched_at: row.fetched_at,
          odds: row.odds,
        })),
      });
    }

    const result = await query(
      `select
         i.market_id,
         coalesce(m.name, i.market_description) as market_name,
         m.developer_name,
         m.legacy_id,
         m.has_winning_calculations,
         i.market_description,
         jsonb_array_length(i.odds) as odds_count,
         i.fetched_at
       from cache.odds_inplay_index i
       left join cache.odds_markets_index m
         on m.market_id = i.market_id
       where i.fixture_id = $1
       order by i.market_id`,
      [fixture]
    );

    if (!result.rows.length) {
      return NextResponse.json({
        ok: false,
        error: `No inplay odds found for fixture ${fixtureId}. Run syncOddsInplay first.`,
      }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      fixture_id: fixture,
      mode: "inplay",
      markets_available: result.rows.length,
      usage_hint: "Add ?market_ids=1,2,5 or ?filter=market:1,2,5",
      data: result.rows.map((row) => ({
        market_id: row.market_id,
        market_name: row.market_name,
        developer_name: row.developer_name,
        legacy_id: row.legacy_id,
        has_winning_calculations: row.has_winning_calculations,
        market_description: row.market_description,
        odds_count: row.odds_count,
        fetched_at: row.fetched_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}