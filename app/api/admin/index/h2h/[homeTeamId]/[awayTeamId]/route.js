import { NextResponse } from "next/server";
import {
  getH2HChunkRows,
  normalizeH2HPair,
} from "@/lib/analysis";
import { isAuthorized, unauthorized } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CHUNKS = new Set([
  "summary",
  "participants",
  "events",
  "scores",
  "statistics",
  "referees",
]);

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

function parseLimit(searchParams) {
  const raw = searchParams.get("limit");
  if (!raw) return DEFAULT_LIMIT;
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseExcludeFixtureId(searchParams) {
  const raw = searchParams.get("exclude_fixture_id");
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export async function GET(request, context) {
  if (!isAuthorized(request)) return unauthorized();

  const { homeTeamId, awayTeamId } = await context.params;
  if (!/^\d+$/.test(String(homeTeamId)) || !/^\d+$/.test(String(awayTeamId))) {
    return NextResponse.json({ ok: false, error: "Invalid team IDs" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const chunk = searchParams.get("chunk");
  const limit = parseLimit(searchParams);
  const excludeFixtureId = parseExcludeFixtureId(searchParams);

  if (!chunk || !VALID_CHUNKS.has(chunk)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid chunk. Valid: ${[...VALID_CHUNKS].join(", ")}`,
      },
      { status: 400 }
    );
  }

  try {
    const pair = normalizeH2HPair(Number(homeTeamId), Number(awayTeamId));

    const rows = await getH2HChunkRows(
      Number(homeTeamId),
      Number(awayTeamId),
      chunk,
      limit,
      excludeFixtureId
    );

    if (!rows.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `No H2H data found for ${homeTeamId} vs ${awayTeamId}. Run syncH2H first.`,
          requested_pair: {
            home_team_id: Number(homeTeamId),
            away_team_id: Number(awayTeamId),
          },
          normalized_pair: {
            home_team_id: pair.home_team_id,
            away_team_id: pair.away_team_id,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      requested_pair: {
        home_team_id: Number(homeTeamId),
        away_team_id: Number(awayTeamId),
      },
      normalized_pair: {
        home_team_id: pair.home_team_id,
        away_team_id: pair.away_team_id,
      },
      chunk,
      limit,
      exclude_fixture_id: excludeFixtureId,
      sort: "starting_at_desc_then_fixture_id_desc",
      total_returned: rows.length,
      data: rows,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}