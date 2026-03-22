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
  getFixtureXg,
  getFixturePredictions,
  getFixtureNews,
  getFixtureExpectedLineups,
  getFixtureTransferRumours,
  getSeasonStandings,
  resolveFixtureActors,
  parsePackReadParams,
  applySafeFixturePackRead,
  applySafeH2HPackRead,
  getPackSafeReadConfig,
  getPackDetails,
  summarizeChunkCoverage,
  paginatePayloadArray,
} from "@/lib/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseLimit(searchParams) {
  const raw = searchParams.get("limit");
  if (!raw) return 5;
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return 5;
  return Math.min(n, 20);
}

function buildSafeReadMeta(pack, readParams) {
  const safe = getPackSafeReadConfig(pack);

  return {
    read_mode: readParams.read_mode,
    safe_read: {
      enabled: safe.enabled,
      strategy: safe.strategy,
      default_page_size: safe.default_page_size,
      max_page_size: safe.max_page_size,
    },
  };
}

function basePackMeta(pack) {
  const details = getPackDetails(pack);
  return {
    pack,
    family: details?.family ?? null,
    label: details?.label ?? null,
    contains: details?.contains ?? [],
    analysis_focus: details?.analysis_focus ?? [],
  };
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
    const readParams = parsePackReadParams(searchParams, pack);
    const meta = basePackMeta(pack);

    if (
      pack === "fixture_context" ||
      pack === "fixture_squads" ||
      pack === "fixture_events_scores" ||
      pack === "fixture_statistics" ||
      pack === "fixture_periods"
    ) {
      const chunks = getPackChunks(pack);
      const data = await getFixtureChunksMap(id, chunks);

      const safeResult =
        readParams.read_mode === "safe"
          ? applySafeFixturePackRead(pack, data, readParams.page, readParams.page_size)
          : { data, paging: null };

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
        ...buildSafeReadMeta(pack, readParams),
        coverage: summarizeChunkCoverage(chunks, data),
        paging: safeResult.paging,
        data: safeResult.data,
      });
    }

    if (pack === "fixture_xg") {
      const row = await getFixtureXg(id);
      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
        data: row?.payload ?? { data: [] },
        fetched_at: row?.fetched_at ?? null,
      });
    }

    if (pack === "fixture_predictions") {
      const row = await getFixturePredictions(id);
      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
        data: row?.payload ?? { probabilities: [], value_bets: [] },
        fetched_at: row?.fetched_at ?? null,
      });
    }

    if (pack === "fixture_news") {
      const row = await getFixtureNews(id);
      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
        data: row?.payload ?? { data: [] },
        fetched_at: row?.fetched_at ?? null,
      });
    }

    if (pack === "fixture_expected_lineups") {
      const row = await getFixtureExpectedLineups(id);
      const items = row?.payload?.data ?? [];

      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(items, readParams.page, readParams.page_size);
        return NextResponse.json({
          ok: true,
          fixture_id: id,
          ...meta,
          ...buildSafeReadMeta(pack, readParams),
          paging: paginated.paging,
          data: paginated.items,
          fetched_at: row?.fetched_at ?? null,
        });
      }

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
        ...buildSafeReadMeta(pack, readParams),
        paging: null,
        data: items,
        fetched_at: row?.fetched_at ?? null,
      });
    }

    if (pack === "fixture_transfer_rumours") {
      const row = await getFixtureTransferRumours(id);
      const rawItems = row?.payload?.data ?? [];
      const sorted = [...rawItems].sort((a, b) =>
        String(b.updated_at ?? b.created_at ?? "").localeCompare(
          String(a.updated_at ?? a.created_at ?? "")
        )
      );
      const slim = sorted.map((r) => ({
        id: r.id ?? null,
        player_name: r.player?.data?.display_name ?? r.player?.data?.name ?? r.player_name ?? null,
        player_id: r.player_id ?? r.player?.data?.id ?? null,
        from_team: r.fromTeam?.data?.name ?? r.from_team_name ?? null,
        to_team: r.toTeam?.data?.name ?? r.to_team_name ?? null,
        position: r.position?.data?.name ?? r.position_name ?? null,
        type: r.type?.data?.name ?? r.type_name ?? null,
        season_id: r.season_id ?? null,
        status: r.status ?? null,
        is_completed: r.is_completed ?? null,
        fee: r.fee ?? null,
        updated_at: r.updated_at ?? r.created_at ?? null,
      }));

      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(slim, readParams.page, readParams.page_size);
        return NextResponse.json({
          ok: true,
          fixture_id: id,
          ...meta,
          ...buildSafeReadMeta(pack, readParams),
          total_rumours: slim.length,
          paging: paginated.paging,
          data: paginated.items,
          fetched_at: row?.fetched_at ?? null,
        });
      }

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
        ...buildSafeReadMeta(pack, readParams),
        total_rumours: slim.length,
        paging: null,
        data: slim,
        fetched_at: row?.fetched_at ?? null,
      });
    }

    if (pack === "h2h_context") {
      if (!actors.home_team_id || !actors.away_team_id) {
        return NextResponse.json({
          ok: false,
          ...meta,
          error: "Missing home/away team IDs from participants chunk.",
        }, { status: 404 });
      }

      const [summary, participants, scores] = await Promise.all([
        getH2HChunkRows(actors.home_team_id, actors.away_team_id, "summary", limit, id),
        getH2HChunkRows(actors.home_team_id, actors.away_team_id, "participants", limit, id),
        getH2HChunkRows(actors.home_team_id, actors.away_team_id, "scores", limit, id),
      ]);

      const rawData = { summary, participants, scores };
      const safeResult =
        readParams.read_mode === "safe"
          ? applySafeH2HPackRead(rawData, readParams.page, readParams.page_size)
          : { data: rawData, paging: null };

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
        ...buildSafeReadMeta(pack, readParams),
        limit,
        excluded_fixture_id: id,
        sort: "starting_at_desc_then_fixture_id_desc",
        discovered: {
          home_team_id: actors.home_team_id,
          away_team_id: actors.away_team_id,
        },
        paging: safeResult.paging,
        data: safeResult.data,
      });
    }

    if (pack === "h2h_events") {
      if (!actors.home_team_id || !actors.away_team_id) {
        return NextResponse.json({
          ok: false,
          ...meta,
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

      const rawData = { events };
      const safeResult =
        readParams.read_mode === "safe"
          ? applySafeH2HPackRead(rawData, readParams.page, readParams.page_size)
          : { data: rawData, paging: null };

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
        ...buildSafeReadMeta(pack, readParams),
        limit,
        excluded_fixture_id: id,
        sort: "starting_at_desc_then_fixture_id_desc",
        discovered: {
          home_team_id: actors.home_team_id,
          away_team_id: actors.away_team_id,
        },
        paging: safeResult.paging,
        data: safeResult.data,
      });
    }

    if (pack === "h2h_statistics") {
      if (!actors.home_team_id || !actors.away_team_id) {
        return NextResponse.json({
          ok: false,
          ...meta,
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

      const rawData = { statistics };
      const safeResult =
        readParams.read_mode === "safe"
          ? applySafeH2HPackRead(rawData, readParams.page, readParams.page_size)
          : { data: rawData, paging: null };

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
        ...buildSafeReadMeta(pack, readParams),
        limit,
        excluded_fixture_id: id,
        sort: "starting_at_desc_then_fixture_id_desc",
        discovered: {
          home_team_id: actors.home_team_id,
          away_team_id: actors.away_team_id,
        },
        paging: safeResult.paging,
        data: safeResult.data,
      });
    }

    if (pack === "h2h_referees") {
      if (!actors.home_team_id || !actors.away_team_id) {
        return NextResponse.json({
          ok: false,
          ...meta,
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

      const rawData = { referees };
      const safeResult =
        readParams.read_mode === "safe"
          ? applySafeH2HPackRead(rawData, readParams.page, readParams.page_size)
          : { data: rawData, paging: null };

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
        ...buildSafeReadMeta(pack, readParams),
        limit,
        excluded_fixture_id: id,
        sort: "starting_at_desc_then_fixture_id_desc",
        discovered: {
          home_team_id: actors.home_team_id,
          away_team_id: actors.away_team_id,
        },
        paging: safeResult.paging,
        data: safeResult.data,
      });
    }

    if (pack === "home_team_all") {
      if (!actors.home_team_id) {
        return NextResponse.json({
          ok: false,
          ...meta,
          error: "Home team not found in participants chunk.",
        }, { status: 404 });
      }

      const row = await getCurrentTeamStats(actors.home_team_id);
      if (!row) {
        return NextResponse.json({
          ok: false,
          ...meta,
          error: `No team stats found for team ${actors.home_team_id}.`,
        }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
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
          ...meta,
          error: "Away team not found in participants chunk.",
        }, { status: 404 });
      }

      const row = await getCurrentTeamStats(actors.away_team_id);
      if (!row) {
        return NextResponse.json({
          ok: false,
          ...meta,
          error: `No team stats found for team ${actors.away_team_id}.`,
        }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
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
          ...meta,
          missing: true,
          error: "Referee not found in fixture referees chunk.",
        }, { status: 404 });
      }

      const row = await getCurrentRefereeStats(actors.referee_id);
      if (!row) {
        return NextResponse.json({
          ok: false,
          ...meta,
          error: `No referee stats found for referee ${actors.referee_id}.`,
        }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
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
    

    if (pack === "league_standings") {
      if (!actors.season_id) {
        return NextResponse.json({
          ok: false,
          ...meta,
          error: "Season ID not found in fixture base data.",
        }, { status: 404 });
      }

      const row = await getSeasonStandings(actors.season_id);
      const rawData = row?.payload?.data ?? row?.payload ?? [];
      const groups = Array.isArray(rawData) ? rawData : [rawData];

      const slimRow = (s) => ({
        position: s.position ?? s.rank ?? null,
        team_id: s.team_id ?? s.participant_id ?? s.participant?.data?.id ?? null,
        team_name: s.team_name ?? s.participant?.data?.name ?? s.participant?.data?.short_code ?? null,
        points: s.points ?? s.overall?.points ?? null,
        played: s.overall?.games_played ?? s.games_played ?? null,
        won: s.overall?.won ?? s.won ?? null,
        draw: s.overall?.draw ?? s.draw ?? null,
        lost: s.overall?.lost ?? s.lost ?? null,
        goals_for: s.overall?.goals_scored ?? s.goals_scored ?? null,
        goals_against: s.overall?.goals_against ?? s.goals_against ?? null,
        goal_diff: s.overall?.goal_difference ?? s.goal_difference ?? s.goal_diff ?? null,
        form: s.form ?? s.recent_form ?? null,
        result: s.result ?? null,
      });

      const allRows = [];
      const groupsMeta = [];
      for (const group of groups) {
        const standings = group?.standings?.data ?? group?.standings ?? group?.data ?? [];
        const rows = Array.isArray(standings) ? standings : [standings];
        const gMeta = {
          id: group?.id ?? null,
          name: group?.name ?? group?.league?.data?.name ?? null,
          type: group?.type ?? null,
        };
        groupsMeta.push({ ...gMeta, count: rows.length });
        for (const s of rows) {
          allRows.push({ ...slimRow(s), group_name: gMeta.name });
        }
      }

      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(allRows, readParams.page, readParams.page_size);
        return NextResponse.json({
          ok: true,
          fixture_id: id,
          ...meta,
          ...buildSafeReadMeta(pack, readParams),
          season_id: actors.season_id,
          league_id: actors.league_id,
          home_team_id: actors.home_team_id,
          away_team_id: actors.away_team_id,
          groups: groupsMeta,
          paging: paginated.paging,
          data: paginated.items,
          fetched_at: row?.fetched_at ?? null,
        });
      }

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
        ...buildSafeReadMeta(pack, readParams),
        season_id: actors.season_id,
        league_id: actors.league_id,
        home_team_id: actors.home_team_id,
        away_team_id: actors.away_team_id,
        groups: groupsMeta,
        paging: null,
        data: allRows,
        fetched_at: row?.fetched_at ?? null,
      });
    }

    if (pack === "odds_prematch_summary") {
      const rows = await getOddsSummary(id, "prematch");

      return NextResponse.json({
        ok: true,
        fixture_id: id,
        ...meta,
        mode: "prematch",
        markets_available: rows.length,
        usage_hint: "Use /markets?search=keyword then /index/odds/pre-match/{fixture_id}?market_id={id} for a specific market.",
        data: rows.map((r) => ({
          market_id: r.market_id,
          market_name: r.market_name,
          developer_name: r.developer_name,
          legacy_id: r.legacy_id,
          has_winning_calculations: r.has_winning_calculations,
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
        ...meta,
        mode: "inplay",
        markets_available: rows.length,
        usage_hint: "Use /markets?search=keyword then /index/odds/inplay/{fixture_id}?market_id={id} for a specific market.",
        data: rows.map((r) => ({
          market_id: r.market_id,
          market_name: r.market_name,
          developer_name: r.developer_name,
          legacy_id: r.legacy_id,
          has_winning_calculations: r.has_winning_calculations,
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