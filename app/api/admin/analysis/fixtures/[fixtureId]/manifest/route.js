import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin";
import {
  ANALYSIS_PACKS,
  resolveFixtureActors,
  getFixtureChunksMap,
  getCurrentTeamStats,
  getCurrentRefereeStats,
  getOddsSummary,
  isFixtureLiveLike,
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

    const fixtureRequired = await getFixtureChunksMap(id, [
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

    const hasAny = (...chunkNames) => chunkNames.some((name) => Boolean(fixtureRequired[name]));

    const packs = [
      {
        name: "fixture_context",
        ready: hasAny(
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
          "metadata"
        ),
      },
      {
        name: "fixture_squads",
        ready: hasAny(
          "participants",
          "formations",
          "lineups",
          "referees",
          "coaches",
          "sidelined"
        ),
      },
      {
        name: "fixture_events_scores",
        ready: hasAny("scores", "events"),
      },
      {
        name: "fixture_statistics",
        ready: hasAny("statistics"),
      },
      {
        name: "fixture_periods",
        ready: hasAny("periods"),
      },
      {
        name: "h2h_context",
        ready: Boolean(actors.home_team_id && actors.away_team_id),
      },
      {
        name: "h2h_events",
        ready: Boolean(actors.home_team_id && actors.away_team_id),
      },
      {
        name: "h2h_statistics",
        ready: Boolean(actors.home_team_id && actors.away_team_id),
      },
      {
        name: "h2h_referees",
        ready: Boolean(actors.home_team_id && actors.away_team_id),
      },
      {
        name: "home_team_all",
        ready: Boolean(homeStats),
      },
      {
        name: "away_team_all",
        ready: Boolean(awayStats),
      },
      {
        name: "referee_all",
        ready: Boolean(refereeStats),
      },
      {
        name: "odds_prematch_summary",
        ready: prematchOdds.length > 0,
      },
      {
        name: "odds_inplay_summary",
        ready: liveLike && inplayOdds.length > 0,
      },
    ];

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
      default_read_order: ANALYSIS_PACKS,
      packs,
      notes: [
        "Read every ready pack unless the user explicitly requested a narrower scope.",
        "Do not analyze raw sync responses.",
        "Use market search + market_id only after odds summary packs if a specific odds market is needed.",
        "Read odds_inplay_summary only when it is ready or the user explicitly asks for live odds.",
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}