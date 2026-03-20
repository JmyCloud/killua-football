import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CHUNKS = new Set([
  "summary","participants","events","scores","statistics","referees"
]);

const DEFAULT_LIMIT = 5;
const MAX_LIMIT     = 50;

function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");
  if (!expected) throw new Error("Missing PROXY_SHARED_SECRET");
  return provided === expected;
}

function parseLimit(searchParams) {
  const raw = searchParams.get("limit");
  if (!raw) return DEFAULT_LIMIT;
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export async function GET(request, context) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { homeTeamId, awayTeamId } = await context.params;
  if (!/^\d+$/.test(String(homeTeamId)) || !/^\d+$/.test(String(awayTeamId))) {
    return NextResponse.json({ ok: false, error: "Invalid team IDs" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const chunk = searchParams.get("chunk");
  const limit = parseLimit(searchParams);

  if (!chunk || !VALID_CHUNKS.has(chunk)) {
    return NextResponse.json({
      ok: false,
      error: `Invalid chunk. Valid: ${[...VALID_CHUNKS].join(", ")}`,
    }, { status: 400 });
  }

  try {
    // جيب أحدث N fixture_ids لهذا الـ pair
    const fixtureIds = await query(
      `select distinct fixture_id
       from cache.fixtures_h2h_index
       where home_team_id = $1 and away_team_id = $2 and chunk = 'summary'
       order by fixture_id desc
       limit $3`,
      [Number(homeTeamId), Number(awayTeamId), limit]
    );

    if (!fixtureIds.rows.length) {
      return NextResponse.json({
        ok: false,
        error: `No H2H data found for ${homeTeamId} vs ${awayTeamId}. Run syncH2H first.`,
      }, { status: 404 });
    }

    const ids = fixtureIds.rows.map(r => r.fixture_id);

    // جيب الـ chunk المطلوب لكل fixture
    const result = await query(
      `select fixture_id, payload, fetched_at
       from cache.fixtures_h2h_index
       where home_team_id = $1
         and away_team_id = $2
         and chunk = $3
         and fixture_id = ANY($4::bigint[])
       order by fixture_id desc`,
      [Number(homeTeamId), Number(awayTeamId), chunk, ids]
    );

    return NextResponse.json({
      ok:           true,
      home_team_id: Number(homeTeamId),
      away_team_id: Number(awayTeamId),
      chunk,
      limit,
      total_returned: result.rows.length,
      data: result.rows.map(r => ({
        fixture_id: r.fixture_id,
        fetched_at: r.fetched_at,
        ...r.payload,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
