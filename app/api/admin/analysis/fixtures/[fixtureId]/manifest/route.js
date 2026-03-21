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
  getPackSafeReadConfig,
  getPackDetails,
  summarizeChunkCoverage,
  buildAnalysisBlueprint,
  buildCoverageSummary,
} from "@/lib/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function hasAny(dataMap, ...chunkNames) {
  return chunkNames.some((name) => Boolean(dataMap?.[name]));
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
        ready: fixtureEventsScoresCoverage.found_count > 0,
        coverage: fixtureEventsScoresCoverage,
      }),
      withSafeReadMeta("fixture_statistics", {
        name: "fixture_statistics",
        family: "fixture",
        label: getPackDetails("fixture_statistics")?.label ?? null,
        analysis_focus: getPackDetails("fixture_statistics")?.analysis_focus ?? [],
        ready: fixtureStatisticsCoverage.found_count > 0,
        coverage: fixtureStatisticsCoverage,
      }),
      withSafeReadMeta("fixture_periods", {
        name: "fixture_periods",
        family: "fixture",
        label: getPackDetails("fixture_periods")?.label ?? null,
        analysis_focus: getPackDetails("fixture_periods")?.analysis_focus ?? [],
        ready: fixturePeriodsCoverage.found_count > 0,
        coverage: fixturePeriodsCoverage,
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