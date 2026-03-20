import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CATEGORIES = new Set([
  "attacking","defending","passing","form","physical","advanced"
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

  const { teamId } = await context.params;
  if (!/^\d+$/.test(String(teamId))) {
    return NextResponse.json({ ok: false, error: "Invalid teamId" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const seasonParam = searchParams.get("season_id") ?? "current";
  const category    = searchParams.get("category") ?? null;

  if (category && !VALID_CATEGORIES.has(category)) {
    return NextResponse.json({
      ok: false,
      error: `Invalid category. Valid: ${[...VALID_CATEGORIES].join(", ")}`,
    }, { status: 400 });
  }

  try {
    let row;

    if (seasonParam === "current") {
      const result = await query(
        `select * from cache.statistics_seasons_teams_index
         where team_id = $1 and season_is_current = true
         order by fetched_at desc limit 1`,
        [Number(teamId)]
      );
      row = result.rows[0];

      // fallback: أحدث موسم لو مافيش current
      if (!row) {
        const fallback = await query(
          `select * from cache.statistics_seasons_teams_index
           where team_id = $1
           order by fetched_at desc limit 1`,
          [Number(teamId)]
        );
        row = fallback.rows[0];
      }
    } else {
      const result = await query(
        `select * from cache.statistics_seasons_teams_index
         where team_id = $1 and season_id = $2
         limit 1`,
        [Number(teamId), Number(seasonParam)]
      );
      row = result.rows[0];
    }

    if (!row) {
      return NextResponse.json({
        ok: false,
        error: `No team stats found for team ${teamId}. Run syncTeamStats first.`,
      }, { status: 404 });
    }

    // بناء الـ data بناءً على الـ category المطلوب
    let data;
    if (category) {
      data = { [category]: row[category] };
    } else {
      data = {
        attacking: row.attacking,
        defending: row.defending,
        passing:   row.passing,
        form:      row.form,
        physical:  row.physical,
        advanced:  row.advanced,
      };
    }

    return NextResponse.json({
      ok:               true,
      team_id:          Number(teamId),
      team_name:        row.team_name,
      team_short_code:  row.team_short_code,
      season_id:        row.season_id,
      season_name:      row.season_name,
      season_league_id: row.season_league_id,
      season_is_current: row.season_is_current,
      category:         category ?? "all",
      fetched_at:       row.fetched_at,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
