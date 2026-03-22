import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isGptAuthorized, gptUnauthorized } from "@/lib/gpt";
import { getRequestId, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const requestId = getRequestId(request);
  if (!isGptAuthorized(request)) return gptUnauthorized(requestId);

  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") ?? "").trim();
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1),
      50
    );
    const status = url.searchParams.get("status") ?? "upcoming";

    let timeFilter = "";
    if (status === "upcoming") {
      timeFilter = "and w.starts_at > now() - interval '1 hour'";
    } else if (status === "live") {
      timeFilter =
        "and w.starts_at <= now() and w.starts_at > now() - interval '4 hours' and w.last_match_is_live_like = true";
    } else if (status === "recent") {
      timeFilter = "and w.starts_at > now() - interval '24 hours'";
    }

    const searchFilter = search
      ? `and (
           pt.payload->'participants'->0->>'name' ilike $2
           or pt.payload->'participants'->1->>'name' ilike $2
           or lg.payload->'league'->>'name' ilike $2
         )`
      : "";

    const params = [limit];
    if (search) params.push(`%${search}%`);

    const result = await query(
      `select
         w.fixture_id,
         w.starts_at,
         w.priority,
         w.mode,
         w.last_match_is_live_like as is_live,
         w.last_warmed_at,
         pt.payload->'participants'->0->>'name' as home_team,
         pt.payload->'participants'->1->>'name' as away_team,
         lg.payload->'league'->>'name' as league_name,
         sn.payload->'season'->>'name' as season_name,
         st.payload->'state'->>'short_name' as match_state
       from cache.fixture_watchlist w
       left join cache.fixtures_index pt
         on pt.fixture_id = w.fixture_id and pt.chunk = 'participants'
       left join cache.fixtures_index lg
         on lg.fixture_id = w.fixture_id and lg.chunk = 'league'
       left join cache.fixtures_index sn
         on sn.fixture_id = w.fixture_id and sn.chunk = 'season'
       left join cache.fixtures_index st
         on st.fixture_id = w.fixture_id and st.chunk = 'state'
       where w.enabled = true
         ${timeFilter}
         ${searchFilter}
       order by w.starts_at asc nulls last, w.priority asc
       limit $1`,
      params
    );

    return NextResponse.json(
      {
        ok: true,
        request_id: requestId,
        status_filter: status,
        search: search || null,
        total: result.rows.length,
        fixtures: result.rows.map((row) => ({
          fixture_id: row.fixture_id,
          home_team: row.home_team ?? "Unknown",
          away_team: row.away_team ?? "Unknown",
          league: row.league_name ?? "Unknown",
          season: row.season_name ?? null,
          starts_at: row.starts_at,
          match_state: row.match_state ?? null,
          is_live: row.is_live ?? false,
          priority: row.priority,
          data_ready: Boolean(row.last_warmed_at),
        })),
      },
      {
        headers: {
          "x-request-id": requestId,
          "cache-control": "no-store",
        },
      }
    );
  } catch (error) {
    return jsonError(
      requestId,
      500,
      "Failed to list fixtures",
      "list_fixtures_failed",
      error?.message ?? null
    );
  }
}
