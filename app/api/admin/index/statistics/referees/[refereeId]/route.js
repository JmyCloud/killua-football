import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized, unauthorized } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, context) {
  if (!isAuthorized(request)) return unauthorized();

  const { refereeId } = await context.params;
  if (!/^\d+$/.test(String(refereeId))) {
    return NextResponse.json({ ok: false, error: "Invalid refereeId" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const seasonParam = searchParams.get("season_id") ?? "current";

  try {
    let row;

    if (seasonParam === "current") {
      const result = await query(
        `select * from cache.statistics_seasons_referees_index
         where referee_id = $1 and season_is_current = true
         order by fetched_at desc limit 1`,
        [Number(refereeId)]
      );
      row = result.rows[0];

      // fallback: أحدث موسم
      if (!row) {
        const fallback = await query(
          `select * from cache.statistics_seasons_referees_index
           where referee_id = $1
           order by fetched_at desc limit 1`,
          [Number(refereeId)]
        );
        row = fallback.rows[0];
      }
    } else {
      const result = await query(
        `select * from cache.statistics_seasons_referees_index
         where referee_id = $1 and season_id = $2
         limit 1`,
        [Number(refereeId), Number(seasonParam)]
      );
      row = result.rows[0];
    }

    if (!row) {
      return NextResponse.json({
        ok: false,
        error: `No referee stats found for ${refereeId}. Run syncRefereeStats first.`,
      }, { status: 404 });
    }

    return NextResponse.json({
      ok:               true,
      referee_id:       Number(refereeId),
      referee_name:     row.referee_name,
      referee_common_name: row.referee_common_name,
      season_id:        row.season_id,
      season_name:      row.season_name,
      season_is_current: row.season_is_current,
      fetched_at:       row.fetched_at,
      data: {
        matches_officiated: row.matches_officiated,
        fouls:              row.fouls,
        yellowcards:        row.yellowcards,
        redcards:           row.redcards,
        yellowred_cards:    row.yellowred_cards,
        penalties:          row.penalties,
        var_reviews:        row.var_reviews,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
