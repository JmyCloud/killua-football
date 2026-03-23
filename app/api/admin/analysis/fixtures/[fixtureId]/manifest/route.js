import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin";
import {
  ANALYSIS_PACKS,
  resolveFixtureActors,
  getFixtureChunksMap,
  getCurrentTeamStats,
  getCurrentRefereeStats,
  getOddsSummary,
  getFixtureXg,
  getFixturePredictions,
  getFixtureNews,
  getFixtureExpectedLineups,
  getFixtureTransferRumours,
  getSeasonStandings,
  getRoundStandings,
  getStandingsCorrections,
  getLiveStandings,
  getFixtureCommentaries,
  getFixtureMatchFacts,
  getTeamSquad,
  getTeamSchedule,
  getTeamSquadFallback,
  getSeasonTopscorers,
  getTeamRankings,
  isFixtureLiveLike,
  getPackSafeReadConfig,
  getPackDetails,
  summarizeChunkCoverage,
  buildAnalysisBlueprint,
  buildCoverageSummary,
  hasContentfulChunk,
} from "@/lib/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function withSafeReadMeta(name, payload) {
  const safe = getPackSafeReadConfig(name);

  return {
    ...payload,
    safe_read: {
      enabled: safe.enabled,
      strategy: safe.strategy,
      default_page_size: safe.default_page_size,
      max_page_size: safe.max_page_size,
      recommended_read_mode: safe.enabled ? "safe" : "full",
    },
  };
}

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

    const [
      prematchOdds,
      xgData,
      predictionsData,
      newsData,
      expectedLineupsData,
      transferRumoursData,
      standingsData,
      roundStandingsData,
      correctionsData,
      commentariesData,
      matchFactsData,
    ] = await Promise.all([
      getOddsSummary(id, "prematch"),
      getFixtureXg(id),
      getFixturePredictions(id),
      getFixtureNews(id),
      getFixtureExpectedLineups(id),
      getFixtureTransferRumours(id),
      actors.season_id ? getSeasonStandings(actors.season_id) : null,
      actors.round_id ? getRoundStandings(actors.round_id) : null,
      actors.season_id ? getStandingsCorrections(actors.season_id) : null,
      getFixtureCommentaries(id),
      getFixtureMatchFacts(id),
    ]);
    const liveLike = isFixtureLiveLike(actors.state);
    const inplayOdds = liveLike ? await getOddsSummary(id, "inplay") : [];
    const liveStandingsData = liveLike && actors.league_id ? await getLiveStandings(actors.league_id) : null;
    const [
      homeSquadData,
      awaySquadData,
      homeScheduleData,
      awayScheduleData,
      homeSquadFallbackData,
      awaySquadFallbackData,
      topscorersData,
      homeRankingsData,
      awayRankingsData,
    ] = await Promise.all([
      actors.season_id && actors.home_team_id ? getTeamSquad(actors.season_id, actors.home_team_id) : null,
      actors.season_id && actors.away_team_id ? getTeamSquad(actors.season_id, actors.away_team_id) : null,
      actors.season_id && actors.home_team_id ? getTeamSchedule(actors.season_id, actors.home_team_id) : null,
      actors.season_id && actors.away_team_id ? getTeamSchedule(actors.season_id, actors.away_team_id) : null,
      actors.home_team_id ? getTeamSquadFallback(actors.home_team_id) : null,
      actors.away_team_id ? getTeamSquadFallback(actors.away_team_id) : null,
      actors.season_id ? getSeasonTopscorers(actors.season_id) : null,
      actors.home_team_id ? getTeamRankings(actors.home_team_id) : null,
      actors.away_team_id ? getTeamRankings(actors.away_team_id) : null,
    ]);

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
      withSafeReadMeta("fixture_context", {
        name: "fixture_context",
        family: "fixture",
        label: getPackDetails("fixture_context")?.label ?? null,
        analysis_focus: getPackDetails("fixture_context")?.analysis_focus ?? [],
        ready: fixtureContextCoverage.found_count > 0,
        coverage: fixtureContextCoverage,
      }),
      withSafeReadMeta("fixture_squads", {
        name: "fixture_squads",
        family: "fixture",
        label: getPackDetails("fixture_squads")?.label ?? null,
        analysis_focus: getPackDetails("fixture_squads")?.analysis_focus ?? [],
        ready: fixtureSquadsCoverage.found_count > 0,
        coverage: fixtureSquadsCoverage,
      }),
      withSafeReadMeta("fixture_events_scores", {
        name: "fixture_events_scores",
        family: "fixture",
        label: getPackDetails("fixture_events_scores")?.label ?? null,
        analysis_focus: getPackDetails("fixture_events_scores")?.analysis_focus ?? [],
        ready:
          fixtureEventsScoresCoverage.found_count > 0 &&
          (hasContentfulChunk(fixtureChunks, "events") ||
            hasContentfulChunk(fixtureChunks, "scores")),
        coverage: fixtureEventsScoresCoverage,
      }),
      withSafeReadMeta("fixture_statistics", {
        name: "fixture_statistics",
        family: "fixture",
        label: getPackDetails("fixture_statistics")?.label ?? null,
        analysis_focus: getPackDetails("fixture_statistics")?.analysis_focus ?? [],
        ready:
          fixtureStatisticsCoverage.found_count > 0 &&
          hasContentfulChunk(fixtureChunks, "statistics"),
        coverage: fixtureStatisticsCoverage,
      }),
      withSafeReadMeta("fixture_periods", {
        name: "fixture_periods",
        family: "fixture",
        label: getPackDetails("fixture_periods")?.label ?? null,
        analysis_focus: getPackDetails("fixture_periods")?.analysis_focus ?? [],
        ready:
          fixturePeriodsCoverage.found_count > 0 &&
          hasContentfulChunk(fixtureChunks, "periods"),
        coverage: fixturePeriodsCoverage,
      }),
      withSafeReadMeta("fixture_xg", {
        name: "fixture_xg",
        family: "fixture",
        label: getPackDetails("fixture_xg")?.label ?? null,
        analysis_focus: getPackDetails("fixture_xg")?.analysis_focus ?? [],
        ready: Boolean(xgData?.payload?.data?.length),
      }),
      withSafeReadMeta("fixture_predictions", {
        name: "fixture_predictions",
        family: "fixture",
        label: getPackDetails("fixture_predictions")?.label ?? null,
        analysis_focus: getPackDetails("fixture_predictions")?.analysis_focus ?? [],
        ready: Boolean(
          predictionsData?.payload?.probabilities?.length ||
            predictionsData?.payload?.value_bets?.length
        ),
      }),
      withSafeReadMeta("fixture_news", {
        name: "fixture_news",
        family: "fixture",
        label: getPackDetails("fixture_news")?.label ?? null,
        analysis_focus: getPackDetails("fixture_news")?.analysis_focus ?? [],
        ready: Boolean(newsData?.payload?.data?.length),
      }),
      withSafeReadMeta("fixture_expected_lineups", {
        name: "fixture_expected_lineups",
        family: "fixture",
        label: getPackDetails("fixture_expected_lineups")?.label ?? null,
        analysis_focus: getPackDetails("fixture_expected_lineups")?.analysis_focus ?? [],
        ready: Boolean(expectedLineupsData?.payload?.data?.length),
      }),
      withSafeReadMeta("fixture_transfer_rumours", {
        name: "fixture_transfer_rumours",
        family: "fixture",
        label: getPackDetails("fixture_transfer_rumours")?.label ?? null,
        analysis_focus: getPackDetails("fixture_transfer_rumours")?.analysis_focus ?? [],
        ready: Boolean(transferRumoursData?.payload?.data?.length),
      }),
      withSafeReadMeta("h2h_context", {
        name: "h2h_context",
        family: "h2h",
        label: getPackDetails("h2h_context")?.label ?? null,
        analysis_focus: getPackDetails("h2h_context")?.analysis_focus ?? [],
        ready: Boolean(actors.home_team_id && actors.away_team_id),
      }),
      withSafeReadMeta("h2h_events", {
        name: "h2h_events",
        family: "h2h",
        label: getPackDetails("h2h_events")?.label ?? null,
        analysis_focus: getPackDetails("h2h_events")?.analysis_focus ?? [],
        ready: Boolean(actors.home_team_id && actors.away_team_id),
      }),
      withSafeReadMeta("h2h_statistics", {
        name: "h2h_statistics",
        family: "h2h",
        label: getPackDetails("h2h_statistics")?.label ?? null,
        analysis_focus: getPackDetails("h2h_statistics")?.analysis_focus ?? [],
        ready: Boolean(actors.home_team_id && actors.away_team_id),
      }),
      withSafeReadMeta("h2h_referees", {
        name: "h2h_referees",
        family: "h2h",
        label: getPackDetails("h2h_referees")?.label ?? null,
        analysis_focus: getPackDetails("h2h_referees")?.analysis_focus ?? [],
        ready: Boolean(actors.home_team_id && actors.away_team_id),
      }),
      withSafeReadMeta("home_team_all", {
        name: "home_team_all",
        family: "team",
        label: getPackDetails("home_team_all")?.label ?? null,
        analysis_focus: getPackDetails("home_team_all")?.analysis_focus ?? [],
        ready: Boolean(homeStats),
      }),
      withSafeReadMeta("away_team_all", {
        name: "away_team_all",
        family: "team",
        label: getPackDetails("away_team_all")?.label ?? null,
        analysis_focus: getPackDetails("away_team_all")?.analysis_focus ?? [],
        ready: Boolean(awayStats),
      }),
      withSafeReadMeta("referee_all", {
        name: "referee_all",
        family: "referee",
        label: getPackDetails("referee_all")?.label ?? null,
        analysis_focus: getPackDetails("referee_all")?.analysis_focus ?? [],
        ready: Boolean(refereeStats),
      }),
      withSafeReadMeta("odds_prematch_summary", {
        name: "odds_prematch_summary",
        family: "odds",
        label: getPackDetails("odds_prematch_summary")?.label ?? null,
        analysis_focus: getPackDetails("odds_prematch_summary")?.analysis_focus ?? [],
        ready: prematchOdds.length > 0,
      }),
      withSafeReadMeta("odds_inplay_summary", {
        name: "odds_inplay_summary",
        family: "odds",
        label: getPackDetails("odds_inplay_summary")?.label ?? null,
        analysis_focus: getPackDetails("odds_inplay_summary")?.analysis_focus ?? [],
        ready: liveLike && inplayOdds.length > 0,
        conditional: true,
      }),
      withSafeReadMeta("league_standings", {
        name: "league_standings",
        family: "standings",
        label: getPackDetails("league_standings")?.label ?? null,
        analysis_focus: getPackDetails("league_standings")?.analysis_focus ?? [],
        ready: Boolean(standingsData),
      }),
      withSafeReadMeta("standings_round", {
        name: "standings_round",
        family: "standings",
        label: getPackDetails("standings_round")?.label ?? null,
        analysis_focus: getPackDetails("standings_round")?.analysis_focus ?? [],
        ready: Boolean(roundStandingsData),
      }),
      withSafeReadMeta("standings_corrections", {
        name: "standings_corrections",
        family: "standings",
        label: getPackDetails("standings_corrections")?.label ?? null,
        analysis_focus: getPackDetails("standings_corrections")?.analysis_focus ?? [],
        ready: Boolean(correctionsData?.payload?.data?.length),
      }),
      withSafeReadMeta("standings_live", {
        name: "standings_live",
        family: "standings",
        label: getPackDetails("standings_live")?.label ?? null,
        analysis_focus: getPackDetails("standings_live")?.analysis_focus ?? [],
        ready: liveLike && Boolean(liveStandingsData),
        conditional: true,
      }),
      withSafeReadMeta("fixture_commentaries", {
        name: "fixture_commentaries",
        family: "fixture",
        label: getPackDetails("fixture_commentaries")?.label ?? null,
        analysis_focus: getPackDetails("fixture_commentaries")?.analysis_focus ?? [],
        ready: Boolean(commentariesData?.payload?.data?.length),
      }),
      withSafeReadMeta("fixture_match_facts", {
        name: "fixture_match_facts",
        family: "fixture",
        label: getPackDetails("fixture_match_facts")?.label ?? null,
        analysis_focus: getPackDetails("fixture_match_facts")?.analysis_focus ?? [],
        ready: Boolean(matchFactsData?.payload?.data?.length),
      }),
      withSafeReadMeta("home_team_squad", {
        name: "home_team_squad",
        family: "team",
        label: getPackDetails("home_team_squad")?.label ?? null,
        analysis_focus: getPackDetails("home_team_squad")?.analysis_focus ?? [],
        ready: Boolean(homeSquadData?.payload?.data?.length),
      }),
      withSafeReadMeta("away_team_squad", {
        name: "away_team_squad",
        family: "team",
        label: getPackDetails("away_team_squad")?.label ?? null,
        analysis_focus: getPackDetails("away_team_squad")?.analysis_focus ?? [],
        ready: Boolean(awaySquadData?.payload?.data?.length),
      }),
      withSafeReadMeta("home_team_schedule", {
        name: "home_team_schedule",
        family: "team",
        label: getPackDetails("home_team_schedule")?.label ?? null,
        analysis_focus: getPackDetails("home_team_schedule")?.analysis_focus ?? [],
        ready: Boolean(homeScheduleData?.payload?.data?.length),
      }),
      withSafeReadMeta("away_team_schedule", {
        name: "away_team_schedule",
        family: "team",
        label: getPackDetails("away_team_schedule")?.label ?? null,
        analysis_focus: getPackDetails("away_team_schedule")?.analysis_focus ?? [],
        ready: Boolean(awayScheduleData?.payload?.data?.length),
      }),
      withSafeReadMeta("home_team_squad_fallback", {
        name: "home_team_squad_fallback",
        family: "team",
        label: getPackDetails("home_team_squad_fallback")?.label ?? null,
        analysis_focus: getPackDetails("home_team_squad_fallback")?.analysis_focus ?? [],
        ready: Boolean(homeSquadFallbackData?.payload?.data?.length),
      }),
      withSafeReadMeta("away_team_squad_fallback", {
        name: "away_team_squad_fallback",
        family: "team",
        label: getPackDetails("away_team_squad_fallback")?.label ?? null,
        analysis_focus: getPackDetails("away_team_squad_fallback")?.analysis_focus ?? [],
        ready: Boolean(awaySquadFallbackData?.payload?.data?.length),
      }),
      withSafeReadMeta("season_topscorers", {
        name: "season_topscorers",
        family: "standings",
        label: getPackDetails("season_topscorers")?.label ?? null,
        analysis_focus: getPackDetails("season_topscorers")?.analysis_focus ?? [],
        ready: Boolean(topscorersData?.payload?.data?.length),
      }),
      withSafeReadMeta("home_team_rankings", {
        name: "home_team_rankings",
        family: "team",
        label: getPackDetails("home_team_rankings")?.label ?? null,
        analysis_focus: getPackDetails("home_team_rankings")?.analysis_focus ?? [],
        ready: Boolean(homeRankingsData?.payload?.data?.length),
      }),
      withSafeReadMeta("away_team_rankings", {
        name: "away_team_rankings",
        family: "team",
        label: getPackDetails("away_team_rankings")?.label ?? null,
        analysis_focus: getPackDetails("away_team_rankings")?.analysis_focus ?? [],
        ready: Boolean(awayRankingsData?.payload?.data?.length),
      }),
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
        season_id: actors.season_id,
        league_id: actors.league_id,
        round_id: actors.round_id,
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
        "Use market search + market_id only after odds summary packs if a specific odds market is needed.",
        "For packs with safe_read.enabled=true, read_mode=safe provides exact non-lossy pagination.",
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}