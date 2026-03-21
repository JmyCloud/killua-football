import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin";
import {
  ANALYSIS_PACKS,
  getFixtureChunksMap,
  getPackChunks,
  getH2HChunkRows,
  getCurrentTeamStats,
  getCurrentRefereeStats,
  getOddsSummary,
  resolveFixtureActors,
} from "@/lib/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLimit(searchParams) {
  const raw = searchParams.get("limit");
  if (!raw) return 5;
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return 5;
  return Math.min(n, 20);
}

export async function GET(request, context) {
  if (!isAuthorized(request)) return unauthorized();

  const { fixtureId, pack } = await context.params;

  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json(
      { ok: false, error: "Invalid fixtureId" },
      { status: 400 }
    );
  }

  if (!ANALYSIS_PACKS.includes(pack)) {
    return NextResponse.json(
      { ok: false, error: `Invalid pack. Valid: ${ANALYSIS_PACKS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const id = Number(fixtureId);
    const actors = await resolveFixtureActors(id);
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams);

    if (
      pack === "fixture_context" ||
      pack === "fixture_squads" ||
      pack === "fixture_events_scores" ||
      pack === "fixture_statistics" ||
      pack === "fixture_periods"
    ) {
      const chunks = getPackChunks(pack);
      const data = await getFixtureChunksMap(id, chunks);

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        pack,
        completeness: {
          expected_chunks: chunks,
          found_chunks: Object.keys(data),
        },
        data,
      });
    }

    if (pack === "h2h_context") {
      if (!actors.home_team_id || !actors.away_team_id) {
        return NextResponse.json({
          ok: false,
          pack,
          error: "Missing home/away team IDs from participants chunk.",
        }, { status: 404 });
      }

      const [summary, participants, scores] = await Promise.all([
        getH2HChunkRows(actors.home_team_id, actors.away_team_id, "summary", limit, id),
        getH2HChunkRows(actors.home_team_id, actors.away_team_id, "participants", limit, id),
        getH2HChunkRows(actors.home_team_id, actors.away_team_id, "scores", limit, id),
      ]);

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        pack,
        limit,
        excluded_fixture_id: id,
        sort: "starting_at_desc_then_fixture_id_desc",
        discovered: {
          home_team_id: actors.home_team_id,
          away_team_id: actors.away_team_id,
        },
        data: {
          summary,
          participants,
          scores,
        },
      });
    }

    if (pack === "h2h_events") {
      if (!actors.home_team_id || !actors.away_team_id) {
        return NextResponse.json({
          ok: false,
          pack,
          error: "Missing home/away team IDs from participants chunk.",
        }, { status: 404 });
      }

      const events = await getH2HChunkRows(
        actors.home_team_id,
        actors.away_team_id,
        "events",
        limit,
        id
      );

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        pack,
        limit,
        excluded_fixture_id: id,
        sort: "starting_at_desc_then_fixture_id_desc",
        discovered: {
          home_team_id: actors.home_team_id,
          away_team_id: actors.away_team_id,
        },
        data: {
          events,
        },
      });
    }

    if (pack === "h2h_statistics") {
      if (!actors.home_team_id || !actors.away_team_id) {
        return NextResponse.json({
          ok: false,
          pack,
          error: "Missing home/away team IDs from participants chunk.",
        }, { status: 404 });
      }

      const statistics = await getH2HChunkRows(
        actors.home_team_id,
        actors.away_team_id,
        "statistics",
        limit,
        id
      );

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        pack,
        limit,
        excluded_fixture_id: id,
        sort: "starting_at_desc_then_fixture_id_desc",
        discovered: {
          home_team_id: actors.home_team_id,
          away_team_id: actors.away_team_id,
        },
        data: {
          statistics,
        },
      });
    }

    if (pack === "h2h_referees") {
      if (!actors.home_team_id || !actors.away_team_id) {
        return NextResponse.json({
          ok: false,
          pack,
          error: "Missing home/away team IDs from participants chunk.",
        }, { status: 404 });
      }

      const referees = await getH2HChunkRows(
        actors.home_team_id,
        actors.away_team_id,
        "referees",
        limit,
        id
      );

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        pack,
        limit,
        excluded_fixture_id: id,
        sort: "starting_at_desc_then_fixture_id_desc",
        discovered: {
          home_team_id: actors.home_team_id,
          away_team_id: actors.away_team_id,
        },
        data: {
          referees,
        },
      });
    }

    if (pack === "home_team_all") {
      if (!actors.home_team_id) {
        return NextResponse.json({
          ok: false,
          pack,
          error: "Home team not found in participants chunk.",
        }, { status: 404 });
      }

      const row = await getCurrentTeamStats(actors.home_team_id);
      if (!row) {
        return NextResponse.json({
          ok: false,
          pack,
          error: `No team stats found for team ${actors.home_team_id}.`,
        }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        pack,
        team_id: row.team_id,
        team_name: row.team_name,
        season_id: row.season_id,
        season_name: row.season_name,
        data: {
          attacking: row.attacking,
          defending: row.defending,
          passing: row.passing,
          form: row.form,
          physical: row.physical,
          advanced: row.advanced,
        },
      });
    }

    if (pack === "away_team_all") {
      if (!actors.away_team_id) {
        return NextResponse.json({
          ok: false,
          pack,
          error: "Away team not found in participants chunk.",
        }, { status: 404 });
      }

      const row = await getCurrentTeamStats(actors.away_team_id);
      if (!row) {
        return NextResponse.json({
          ok: false,
          pack,
          error: `No team stats found for team ${actors.away_team_id}.`,
        }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        pack,
        team_id: row.team_id,
        team_name: row.team_name,
        season_id: row.season_id,
        season_name: row.season_name,
        data: {
          attacking: row.attacking,
          defending: row.defending,
          passing: row.passing,
          form: row.form,
          physical: row.physical,
          advanced: row.advanced,
        },
      });
    }

    if (pack === "referee_all") {
      if (!actors.referee_id) {
        return NextResponse.json({
          ok: false,
          pack,
          missing: true,
          error: "Referee not found in fixture referees chunk.",
        }, { status: 404 });
      }

      const row = await getCurrentRefereeStats(actors.referee_id);
      if (!row) {
        return NextResponse.json({
          ok: false,
          pack,
          error: `No referee stats found for referee ${actors.referee_id}.`,
        }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        pack,
        referee_id: row.referee_id,
        referee_name: row.referee_name,
        season_id: row.season_id,
        season_name: row.season_name,
        data: {
          matches_officiated: row.matches_officiated,
          fouls: row.fouls,
          yellowcards: row.yellowcards,
          redcards: row.redcards,
          yellowred_cards: row.yellowred_cards,
          penalties: row.penalties,
          var_reviews: row.var_reviews,
        },
      });
    }

    if (pack === "odds_prematch_summary") {
      const rows = await getOddsSummary(id, "prematch");

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        pack,
        mode: "prematch",
        markets_available: rows.length,
        usage_hint: "Use /markets?search=keyword then /index/odds/pre-match/{fixture_id}?market_id={id} for a specific market.",
        data: rows.map((r) => ({
          market_id: r.market_id,
          market_description: r.market_description,
          odds_count: r.odds_count,
          fetched_at: r.fetched_at,
        })),
      });
    }

    if (pack === "odds_inplay_summary") {
      const rows = await getOddsSummary(id, "inplay");

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        pack,
        mode: "inplay",
        markets_available: rows.length,
        usage_hint: "Use /markets?search=keyword then /index/odds/inplay/{fixture_id}?market_id={id} for a specific market.",
        data: rows.map((r) => ({
          market_id: r.market_id,
          market_description: r.market_description,
          odds_count: r.odds_count,
          fetched_at: r.fetched_at,
        })),
      });
    }

    return NextResponse.json(
      { ok: false, error: "Unhandled pack" },
      { status: 500 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}