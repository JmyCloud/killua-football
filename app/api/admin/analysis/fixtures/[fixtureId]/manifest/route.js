import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin";
import {
  resolveFixtureActors,
  getFixtureChunksMap,
  getCurrentTeamStats,
  getCurrentRefereeStats,
  getOddsSummary,
  isFixtureLiveLike,
  getPackDetails,
  summarizeChunkCoverage,
  buildAnalysisBlueprint,
  buildCoverageSummary,
} from "@/lib/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, context) {
  if (!isAuthorized(request)) return unauthorized();

  const { fixtureId } = await context.params;
  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json(
      { ok: false, error: "Invalid fixtureId" },
      { status: 400 }
    );
  }

  try {
    const id = Number(fixtureId);
    const actors = await resolveFixtureActors(id);

    const fixtureChunks = await getFixtureChunksMap(id, [
      "base",
      "state",
      "league",
      "season",
      "stage",
      "round",
      "group",
      "aggregate",
      "venue",
      "weatherreport",
      "metadata",
      "participants",
      "formations",
      "lineups",
      "referees",
      "coaches",
      "sidelined",
      "scores",
      "events",
      "statistics",
      "periods",
    ]);

    const homeStats = actors.home_team_id
      ? await getCurrentTeamStats(actors.home_team_id)
      : null;

    const awayStats = actors.away_team_id
      ? await getCurrentTeamStats(actors.away_team_id)
      : null;

    const refereeStats = actors.referee_id
      ? await getCurrentRefereeStats(actors.referee_id)
      : null;

    const prematchOdds = await getOddsSummary(id, "prematch");
    const liveLike = isFixtureLiveLike(actors.state);
    const inplayOdds = liveLike ? await getOddsSummary(id, "inplay") : [];

    const fixtureContextCoverage = summarizeChunkCoverage(
      getPackDetails("fixture_context").contains,
      fixtureChunks
    );

    const fixtureSquadsCoverage = summarizeChunkCoverage(
      getPackDetails("fixture_squads").contains,
      fixtureChunks
    );

    const fixtureEventsScoresCoverage = summarizeChunkCoverage(
      getPackDetails("fixture_events_scores").contains,
      fixtureChunks
    );

    const fixtureStatisticsCoverage = summarizeChunkCoverage(
      getPackDetails("fixture_statistics").contains,
      fixtureChunks
    );

    const fixturePeriodsCoverage = summarizeChunkCoverage(
      getPackDetails("fixture_periods").contains,
      fixtureChunks
    );

    const packs = [
      {
        name: "fixture_context",
        family: "fixture",
        ready: fixtureContextCoverage.found_count > 0,
        coverage: fixtureContextCoverage,
        analysis_focus: getPackDetails("fixture_context").analysis_focus,
      },
      {
        name: "fixture_squads",
        family: "fixture",
        ready: fixtureSquadsCoverage.found_count > 0,
        coverage: fixtureSquadsCoverage,
        analysis_focus: getPackDetails("fixture_squads").analysis_focus,
      },
      {
        name: "fixture_events_scores",
        family: "fixture",
        ready: fixtureEventsScoresCoverage.found_count > 0,
        coverage: fixtureEventsScoresCoverage,
        analysis_focus: getPackDetails("fixture_events_scores").analysis_focus,
      },
      {
        name: "fixture_statistics",
        family: "fixture",
        ready: fixtureStatisticsCoverage.found_count > 0,
        coverage: fixtureStatisticsCoverage,
        analysis_focus: getPackDetails("fixture_statistics").analysis_focus,
      },
      {
        name: "fixture_periods",
        family: "fixture",
        ready: fixturePeriodsCoverage.found_count > 0,
        coverage: fixturePeriodsCoverage,
        analysis_focus: getPackDetails("fixture_periods").analysis_focus,
      },
      {
        name: "h2h_context",
        family: "h2h",
        ready: Boolean(actors.home_team_id && actors.away_team_id),
        analysis_focus: getPackDetails("h2h_context").analysis_focus,
      },
      {
        name: "h2h_events",
        family: "h2h",
        ready: Boolean(actors.home_team_id && actors.away_team_id),
        analysis_focus: getPackDetails("h2h_events").analysis_focus,
      },
      {
        name: "h2h_statistics",
        family: "h2h",
        ready: Boolean(actors.home_team_id && actors.away_team_id),
        analysis_focus: getPackDetails("h2h_statistics").analysis_focus,
      },
      {
        name: "h2h_referees",
        family: "h2h",
        ready: Boolean(actors.home_team_id && actors.away_team_id),
        analysis_focus: getPackDetails("h2h_referees").analysis_focus,
      },
      {
        name: "home_team_all",
        family: "team",
        ready: Boolean(homeStats),
        analysis_focus: getPackDetails("home_team_all").analysis_focus,
      },
      {
        name: "away_team_all",
        family: "team",
        ready: Boolean(awayStats),
        analysis_focus: getPackDetails("away_team_all").analysis_focus,
      },
      {
        name: "referee_all",
        family: "referee",
        ready: Boolean(refereeStats),
        analysis_focus: getPackDetails("referee_all").analysis_focus,
      },
      {
        name: "odds_prematch_summary",
        family: "odds",
        ready: prematchOdds.length > 0,
        analysis_focus: getPackDetails("odds_prematch_summary").analysis_focus,
      },
      {
        name: "odds_inplay_summary",
        family: "odds",
        ready: liveLike && inplayOdds.length > 0,
        conditional: true,
        analysis_focus: getPackDetails("odds_inplay_summary").analysis_focus,
      },
    ];

    const blueprint = buildAnalysisBlueprint(liveLike);
    const coverage = buildCoverageSummary(packs);

    return NextResponse.json({
      ok: true,
      fixture_id: id,
      default_mode: "full",
      discovered: {
        home_team_id: actors.home_team_id,
        away_team_id: actors.away_team_id,
        referee_id: actors.referee_id,
      },
      state: actors.state ?? null,
      match_is_live_like: liveLike,
      default_read_order: blueprint.full_mode.default_read_order,
      packs,
      analysis_blueprint: blueprint,
      coverage,
      notes: [
        "Read every ready pack unless the user explicitly requested a narrower scope.",
        "Do not analyze raw sync responses.",
        "Use specific market reads only after odds summary packs when needed.",
        "If a fixture pack is partially covered, analyze what exists and explicitly mention missing chunks.",
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}