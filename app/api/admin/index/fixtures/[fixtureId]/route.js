import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CHUNKS = new Set([
  "base","state","league","season","stage","round","group","aggregate",
  "venue","weatherreport","participants","lineups","formations","referees",
  "coaches","sidelined","events","scores","statistics","periods","metadata"
]);

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
  const chunk = searchParams.get("chunk");

  if (!chunk || !VALID_CHUNKS.has(chunk)) {
    return NextResponse.json({
      ok: false,
      error: `Invalid chunk. Valid: ${[...VALID_CHUNKS].join(", ")}`,
    }, { status: 400 });
  }

  try {
    const result = await query(
      `select payload, fetched_at
       from cache.fixtures_index
       where fixture_id = $1 and chunk = $2
       limit 1`,
      [Number(fixtureId), chunk]
    );

    if (!result.rows[0]) {
      return NextResponse.json({
        ok: false,
        error: `Chunk '${chunk}' not found for fixture ${fixtureId}. Run syncFixture first.`,
      }, { status: 404 });
    }

    return NextResponse.json({
      ok:         true,
      fixture_id: Number(fixtureId),
      chunk,
      fetched_at: result.rows[0].fetched_at,
      data:       result.rows[0].payload,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
