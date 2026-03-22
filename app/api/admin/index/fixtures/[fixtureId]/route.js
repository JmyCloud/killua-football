import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized, unauthorized } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CHUNKS = new Set([
  "base","state","league","season","stage","round","group","aggregate",
  "venue","weatherreport","participants","lineups","formations","referees",
  "coaches","sidelined","events","scores","statistics","periods","metadata"
]);

export async function GET(request, context) {
  if (!isAuthorized(request)) return unauthorized();

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
