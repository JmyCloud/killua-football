import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin";
import { slimBundle, extractFinalScore } from "@/lib/slim-bundle";
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
} from "@/lib/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safe(v) {
  return v?.payload ?? v?.data ?? v ?? null;
}

/* ═══════════════════════════════════════════════════════════
   PART 1  –  Core match data  (~30-50 KB after slim)
   fixture context, squads/lineups, events, scores, stats,
   periods, xG, predictions, expected lineups, match facts, odds
   ═══════════════════════════════════════════════════════════ */
async function buildPart1(id, actors, liveLike, fixtureChunks, matchSummary) {
  const chunk = (n) => fixtureChunks[n]?.data ?? null;

  const [
    prematchOdds, xgData, predictionsData,
    expectedLineupsData, matchFactsData, inplayOdds,
  ] = await Promise.all([
    getOddsSummary(id, "prematch"),
    getFixtureXg(id),
    getFixturePredictions(id),
    getFixtureExpectedLineups(id),
    getFixtureMatchFacts(id),
    liveLike ? getOddsSummary(id, "inplay") : [],
  ]);

  return {
    ok: true,
    fixture_id: id,
    bundle_version: 3,
    total_parts: 2,
    current_part: 1,
    match_summary: matchSummary,
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
    fixture_expected_lineups: safe(expectedLineupsData),
    fixture_match_facts: safe(matchFactsData),

    odds: {
      prematch: prematchOdds,
      inplay: inplayOdds,
    },

    notes: [
      "Part 1/2: Core match data (lineups, events, stats, xG, predictions, odds).",
      "IMPORTANT: Call this endpoint with ?part=2 to get H2H, standings, team stats, news, commentaries.",
      "Analyze each section; do not dump raw JSON to the user.",
      "If a section is null, that data is unavailable.",
    ],
  };
}

/* ═══════════════════════════════════════════════════════════
   PART 2  –  Context & history  (~30-50 KB after slim)
   H2H, team stats/squads/schedules, referee, standings,
   topscorers, news, commentaries, transfer rumours
   ═══════════════════════════════════════════════════════════ */
async function buildPart2(id, actors, liveLike, matchSummary) {
  const h2hLimit = 5;

  const [
    homeStats, awayStats, refereeStats,
    standingsData, roundStandingsData, correctionsData,
    newsData, commentariesData, transferRumoursData,
    topscorersData,
  ] = await Promise.all([
    actors.home_team_id ? getCurrentTeamStats(actors.home_team_id) : null,
    actors.away_team_id ? getCurrentTeamStats(actors.away_team_id) : null,
    actors.referee_id ? getCurrentRefereeStats(actors.referee_id) : null,
    actors.season_id ? getSeasonStandings(actors.season_id) : null,
    actors.round_id ? getRoundStandings(actors.round_id) : null,
    actors.season_id ? getStandingsCorrections(actors.season_id) : null,
    getFixtureNews(id),
    getFixtureCommentaries(id),
    getFixtureTransferRumours(id),
    actors.season_id ? getSeasonTopscorers(actors.season_id) : null,
  ]);

  const [
    liveStandingsData,
    homeSquadData, awaySquadData,
    homeScheduleData, awayScheduleData,
    homeSquadFbData, awaySquadFbData,
    homeRankingsData, awayRankingsData,
  ] = await Promise.all([
    liveLike && actors.league_id ? getLiveStandings(actors.league_id) : null,
    actors.season_id && actors.home_team_id ? getTeamSquad(actors.season_id, actors.home_team_id) : null,
    actors.season_id && actors.away_team_id ? getTeamSquad(actors.season_id, actors.away_team_id) : null,
    actors.season_id && actors.home_team_id ? getTeamSchedule(actors.season_id, actors.home_team_id) : null,
    actors.season_id && actors.away_team_id ? getTeamSchedule(actors.season_id, actors.away_team_id) : null,
    actors.home_team_id ? getTeamSquadFallback(actors.home_team_id) : null,
    actors.away_team_id ? getTeamSquadFallback(actors.away_team_id) : null,
    actors.home_team_id ? getTeamRankings(actors.home_team_id) : null,
    actors.away_team_id ? getTeamRankings(actors.away_team_id) : null,
  ]);

  let h2hContext = [], h2hEvents = [], h2hStats = [], h2hRefs = [];
  if (actors.home_team_id && actors.away_team_id) {
    [h2hContext, h2hEvents, h2hStats, h2hRefs] = await Promise.all([
      getH2HChunkRows(actors.home_team_id, actors.away_team_id, "summary", h2hLimit, id),
      getH2HChunkRows(actors.home_team_id, actors.away_team_id, "events", h2hLimit, id),
      getH2HChunkRows(actors.home_team_id, actors.away_team_id, "statistics", h2hLimit, id),
      getH2HChunkRows(actors.home_team_id, actors.away_team_id, "referees", h2hLimit, id),
    ]);
  }

  const teamSlim = (row) => {
    if (!row) return null;
    return { team_id: row.team_id, season_id: row.season_id, data: row.payload ?? row, fetched_at: row.fetched_at };
  };
  const refSlim = (row) => {
    if (!row) return null;
    return { referee_id: row.referee_id, season_id: row.season_id, data: row.payload ?? row, fetched_at: row.fetched_at };
  };

  return {
    ok: true,
    fixture_id: id,
    bundle_version: 3,
    total_parts: 2,
    current_part: 2,
    match_summary: matchSummary,

    h2h: {
      context: h2hContext,
      events: h2hEvents,
      statistics: h2hStats,
      referees: h2hRefs,
    },

    home_team: {
      stats: teamSlim(homeStats),
      squad: safe(homeSquadData),
      schedule: safe(homeScheduleData),
      squad_fallback: safe(homeSquadFbData),
      rankings: safe(homeRankingsData),
    },

    away_team: {
      stats: teamSlim(awayStats),
      squad: safe(awaySquadData),
      schedule: safe(awayScheduleData),
      squad_fallback: safe(awaySquadFbData),
      rankings: safe(awayRankingsData),
    },

    referee: refSlim(refereeStats),

    standings: {
      league: safe(standingsData),
      round: safe(roundStandingsData),
      corrections: safe(correctionsData),
      live: safe(liveStandingsData),
    },

    topscorers: safe(topscorersData),
    fixture_news: safe(newsData),
    fixture_commentaries: safe(commentariesData),
    fixture_transfer_rumours: safe(transferRumoursData),

    notes: [
      "Part 2/2: Context & history (H2H, team stats, standings, news, commentaries).",
      "You now have ALL data. Combine Part 1 + Part 2 for full analysis.",
    ],
  };
}

/* ═══════════════════════════════════════════════════════════
   ROUTE HANDLER
   ═══════════════════════════════════════════════════════════ */
export async function GET(request, context) {
  if (!isAuthorized(request)) return unauthorized();

  const { fixtureId } = await context.params;
  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json({ ok: false, error: "Invalid fixtureId" }, { status: 400 });
  }

  try {
    const id = Number(fixtureId);
    const url = new URL(request.url);
    const part = Math.min(Math.max(Number(url.searchParams.get("part")) || 1, 1), 2);
    const wantRaw = url.searchParams.get("raw") === "1";

    const actors = await resolveFixtureActors(id);
    const liveLike = isFixtureLiveLike(actors.state);

    // Fixture chunks needed by both parts (for match_summary)
    const fixtureChunks = await getFixtureChunksMap(id, [
      "base", "state", "league", "season", "stage", "round",
      "group", "aggregate", "venue", "weatherreport", "metadata",
      "participants", "formations", "lineups", "referees",
      "coaches", "sidelined", "scores", "events", "statistics", "periods",
    ]);

    const chunk = (n) => fixtureChunks[n]?.data ?? null;

    // Build unambiguous match summary (included in EVERY part)
    const matchSummary = extractFinalScore(chunk("scores"), chunk("participants"));
    matchSummary.status = actors.state ?? null;
    matchSummary.date = chunk("base")?.starting_at ?? null;
    matchSummary.league = chunk("league")?.name ?? null;
    matchSummary.venue = chunk("venue")?.name ?? null;

    const body = part === 1
      ? await buildPart1(id, actors, liveLike, fixtureChunks, matchSummary)
      : await buildPart2(id, actors, liveLike, matchSummary);

    const final = wantRaw ? body : slimBundle(body);

    return NextResponse.json(final, {
      headers: { "cache-control": "public, s-maxage=120, stale-while-revalidate=60" },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
