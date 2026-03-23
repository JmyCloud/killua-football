import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin";
import { slimBundle } from "@/lib/slim-bundle";
import {
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
  getH2HChunkRows,
  isFixtureLiveLike,
  buildCoverageSummary,
  getPackDetails,
} from "@/lib/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safe(v) {
  return v?.payload ?? v?.data ?? v ?? null;
}

function safeArr(v) {
  const d = v?.payload?.data ?? v?.payload ?? v?.data ?? v;
  return Array.isArray(d) ? d : d ? [d] : [];
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
    const url = new URL(request.url);
    const h2hLimit = Math.min(Math.max(Number(url.searchParams.get("h2h_limit")) || 5, 1), 20);

    const actors = await resolveFixtureActors(id);
    const liveLike = isFixtureLiveLike(actors.state);

    const fixtureChunks = await getFixtureChunksMap(id, [
      "base", "state", "league", "season", "stage", "round",
      "group", "aggregate", "venue", "weatherreport", "metadata",
      "participants", "formations", "lineups", "referees",
      "coaches", "sidelined", "scores", "events", "statistics", "periods",
    ]);

    const [
      homeStats, awayStats, refereeStats,
      prematchOdds, xgData, predictionsData, newsData,
      expectedLineupsData, transferRumoursData,
      standingsData, roundStandingsData, correctionsData,
      commentariesData, matchFactsData,
    ] = await Promise.all([
      actors.home_team_id ? getCurrentTeamStats(actors.home_team_id) : null,
      actors.away_team_id ? getCurrentTeamStats(actors.away_team_id) : null,
      actors.referee_id ? getCurrentRefereeStats(actors.referee_id) : null,
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

    const [
      inplayOdds, liveStandingsData,
      homeSquadData, awaySquadData,
      homeScheduleData, awayScheduleData,
      homeSquadFbData, awaySquadFbData,
      topscorersData,
      homeRankingsData, awayRankingsData,
    ] = await Promise.all([
      liveLike ? getOddsSummary(id, "inplay") : [],
      liveLike && actors.league_id ? getLiveStandings(actors.league_id) : null,
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

    let h2hContext = [];
    let h2hEvents = [];
    let h2hStats = [];
    let h2hRefs = [];
    if (actors.home_team_id && actors.away_team_id) {
      [h2hContext, h2hEvents, h2hStats, h2hRefs] = await Promise.all([
        getH2HChunkRows(actors.home_team_id, actors.away_team_id, "summary", h2hLimit, id),
        getH2HChunkRows(actors.home_team_id, actors.away_team_id, "events", h2hLimit, id),
        getH2HChunkRows(actors.home_team_id, actors.away_team_id, "statistics", h2hLimit, id),
        getH2HChunkRows(actors.home_team_id, actors.away_team_id, "referees", h2hLimit, id),
      ]);
    }

    const chunk = (name) => {
      const c = fixtureChunks[name];
      return c ? c.data : null;
    };

    const packReadiness = [
      { name: "fixture_context", ready: Boolean(chunk("base") || chunk("state")) },
      { name: "fixture_squads", ready: Boolean(chunk("lineups") || chunk("formations")) },
      { name: "fixture_events_scores", ready: Boolean(chunk("events") || chunk("scores")) },
      { name: "fixture_statistics", ready: Boolean(chunk("statistics")) },
      { name: "fixture_periods", ready: Boolean(chunk("periods")) },
      { name: "fixture_xg", ready: Boolean(xgData?.payload?.data?.length) },
      { name: "fixture_predictions", ready: Boolean(predictionsData?.payload?.probabilities?.length || predictionsData?.payload?.value_bets?.length) },
      { name: "fixture_news", ready: Boolean(newsData?.payload?.data?.length) },
      { name: "fixture_expected_lineups", ready: Boolean(expectedLineupsData?.payload?.data?.length) },
      { name: "fixture_transfer_rumours", ready: Boolean(transferRumoursData?.payload?.data?.length) },
      { name: "h2h_context", ready: h2hContext.length > 0 },
      { name: "h2h_events", ready: h2hEvents.length > 0 },
      { name: "h2h_statistics", ready: h2hStats.length > 0 },
      { name: "h2h_referees", ready: h2hRefs.length > 0 },
      { name: "home_team_all", ready: Boolean(homeStats) },
      { name: "away_team_all", ready: Boolean(awayStats) },
      { name: "referee_all", ready: Boolean(refereeStats) },
      { name: "league_standings", ready: Boolean(standingsData) },
      { name: "standings_round", ready: Boolean(roundStandingsData) },
      { name: "standings_corrections", ready: Boolean(correctionsData?.payload?.data?.length) },
      { name: "standings_live", ready: liveLike && Boolean(liveStandingsData) },
      { name: "fixture_commentaries", ready: Boolean(commentariesData?.payload?.data?.length) },
      { name: "fixture_match_facts", ready: Boolean(matchFactsData?.payload?.data?.length) },
      { name: "home_team_squad", ready: Boolean(homeSquadData?.payload?.data?.length) },
      { name: "away_team_squad", ready: Boolean(awaySquadData?.payload?.data?.length) },
      { name: "home_team_schedule", ready: Boolean(homeScheduleData?.payload?.data?.length) },
      { name: "away_team_schedule", ready: Boolean(awayScheduleData?.payload?.data?.length) },
      { name: "home_team_squad_fallback", ready: Boolean(homeSquadFbData?.payload?.data?.length) },
      { name: "away_team_squad_fallback", ready: Boolean(awaySquadFbData?.payload?.data?.length) },
      { name: "season_topscorers", ready: Boolean(topscorersData?.payload?.data?.length) },
      { name: "home_team_rankings", ready: Boolean(homeRankingsData?.payload?.data?.length) },
      { name: "away_team_rankings", ready: Boolean(awayRankingsData?.payload?.data?.length) },
      { name: "odds_prematch_summary", ready: prematchOdds.length > 0 },
      { name: "odds_inplay_summary", ready: liveLike && inplayOdds.length > 0 },
    ];

    const coverage = buildCoverageSummary(packReadiness);

    const teamStatsSlim = (row) => {
      if (!row) return null;
      const p = row.payload ?? row;
      return {
        team_id: row.team_id,
        season_id: row.season_id,
        season_is_current: row.season_is_current,
        data: p,
        fetched_at: row.fetched_at,
      };
    };

    const refStatsSlim = (row) => {
      if (!row) return null;
      const p = row.payload ?? row;
      return {
        referee_id: row.referee_id,
        season_id: row.season_id,
        data: p,
        fetched_at: row.fetched_at,
      };
    };

    const body = {
      ok: true,
      fixture_id: id,
      bundle_version: 2,
      match_is_live_like: liveLike,
      discovered: {
        home_team_id: actors.home_team_id,
        away_team_id: actors.away_team_id,
        referee_id: actors.referee_id,
        season_id: actors.season_id,
        league_id: actors.league_id,
        round_id: actors.round_id,
      },
      state: actors.state ?? null,

      fixture_context: {
        base: chunk("base"),
        state: chunk("state"),
        league: chunk("league"),
        season: chunk("season"),
        stage: chunk("stage"),
        round: chunk("round"),
        group: chunk("group"),
        aggregate: chunk("aggregate"),
        venue: chunk("venue"),
        weatherreport: chunk("weatherreport"),
        metadata: chunk("metadata"),
      },

      fixture_squads: {
        participants: chunk("participants"),
        formations: chunk("formations"),
        lineups: chunk("lineups"),
        referees: chunk("referees"),
        coaches: chunk("coaches"),
        sidelined: chunk("sidelined"),
      },

      fixture_events_scores: {
        scores: chunk("scores"),
        events: chunk("events"),
      },

      fixture_statistics: chunk("statistics"),
      fixture_periods: chunk("periods"),

      fixture_xg: safe(xgData),
      fixture_predictions: safe(predictionsData),
      fixture_news: safe(newsData),
      fixture_expected_lineups: safe(expectedLineupsData),
      fixture_transfer_rumours: safe(transferRumoursData),
      fixture_commentaries: safe(commentariesData),
      fixture_match_facts: safe(matchFactsData),

      h2h: {
        context: h2hContext,
        events: h2hEvents,
        statistics: h2hStats,
        referees: h2hRefs,
      },

      home_team: {
        stats: teamStatsSlim(homeStats),
        squad: safe(homeSquadData),
        schedule: safe(homeScheduleData),
        squad_fallback: safe(homeSquadFbData),
        rankings: safe(homeRankingsData),
      },

      away_team: {
        stats: teamStatsSlim(awayStats),
        squad: safe(awaySquadData),
        schedule: safe(awayScheduleData),
        squad_fallback: safe(awaySquadFbData),
        rankings: safe(awayRankingsData),
      },

      referee: refStatsSlim(refereeStats),

      standings: {
        league: safe(standingsData),
        round: safe(roundStandingsData),
        corrections: safe(correctionsData),
        live: safe(liveStandingsData),
      },

      topscorers: safe(topscorersData),

      odds: {
        prematch: prematchOdds,
        inplay: inplayOdds,
      },

      coverage,

      notes: [
        "This bundle contains ALL analysis data in one response.",
        "Analyze each section internally; do not dump raw JSON to the user.",
        "If a section is null, that data is unavailable for this fixture.",
        "For detailed odds prices, use GET /fixtures/{id}/odds/pre-match?filter=market:1,2,5",
      ],
    };

    const wantRaw = url.searchParams.get("raw") === "1";
    const final = wantRaw ? body : slimBundle(body);

    return NextResponse.json(final, {
      headers: {
        "cache-control": "public, s-maxage=120, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
