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

    const result = await query(
      `select
         (lg.payload->'league'->>'id')::bigint as league_id,
         lg.payload->'league'->>'name' as league_name,
         sn.payload->'season'->>'name' as season_name,
         count(distinct w.fixture_id)::int as fixture_count,
         min(w.starts_at) as next_kickoff
       from cache.fixture_watchlist w
       left join cache.fixtures_index lg
         on lg.fixture_id = w.fixture_id and lg.chunk = 'league'
       left join cache.fixtures_index sn
         on sn.fixture_id = w.fixture_id and sn.chunk = 'season'
       where w.enabled = true
         and w.starts_at > now() - interval '2 hours'
         ${search ? "and lg.payload->'league'->>'name' ilike $1" : ""}
       group by lg.payload->'league'->>'id', lg.payload->'league'->>'name', sn.payload->'season'->>'name'
       order by min(w.starts_at) asc nulls last, lg.payload->'league'->>'name' asc
       limit 30`,
      search ? [`%${search}%`] : []
    );

    return NextResponse.json(
      {
        ok: true,
        request_id: requestId,
        search: search || null,
        total: result.rows.length,
        leagues: result.rows,
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
      "Failed to list leagues",
      "list_leagues_failed",
      error?.message ?? null
    );
  }
}
