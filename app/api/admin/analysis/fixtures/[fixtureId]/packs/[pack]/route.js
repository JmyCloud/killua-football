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
      const entries = Array.isArray(rawData) ? rawData : [rawData];

      // Helper: extract value from SportMonks v3 details[] array
      const detail = (details, name) => {
        if (!Array.isArray(details)) return null;
        const lc = name.toLowerCase();
        const d = details.find(
          (x) =>
            x?.type?.name?.toLowerCase() === lc ||
            x?.type?.developer_name?.toLowerCase() === lc
        );
        return d?.value ?? null;
      };

      // SportMonks v3 returns a flat array of standing rows, each with
      // participant, details[], form[], stage, group, round, etc.
      const allRows = entries.map((s) => ({
        position: s.position ?? null,
        team_id: s.participant_id ?? s.participant?.id ?? null,
        team_name: s.participant?.name ?? s.participant?.short_code ?? null,
        points: s.points ?? null,
        result: s.result ?? null,
        played: detail(s.details, "games_played") ?? detail(s.details, "matches_played") ?? null,
        won: detail(s.details, "won") ?? detail(s.details, "wins") ?? null,
        draw: detail(s.details, "draw") ?? detail(s.details, "draws") ?? null,
        lost: detail(s.details, "lost") ?? detail(s.details, "losses") ?? null,
        goals_for: detail(s.details, "goals_for") ?? detail(s.details, "goals_scored") ?? null,
        goals_against: detail(s.details, "goals_against") ?? detail(s.details, "goals_conceded") ?? null,
        goal_diff: detail(s.details, "goal_difference") ?? detail(s.details, "goal_diff") ?? null,
        clean_sheets: detail(s.details, "clean_sheets") ?? null,
        form: Array.isArray(s.form) ? s.form : null,
        stage_name: s.stage?.name ?? null,
        group_name: s.group?.name ?? null,
        round_name: s.round?.name ?? null,
      }));

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
          total_entries: allRows.length,
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
        total_entries: allRows.length,
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

    // ── Standings by Round ──
    if (pack === "standings_round") {
      if (!actors.round_id) {
        return NextResponse.json({ ok: false, ...meta, error: "Round ID not found in fixture base data." }, { status: 404 });
      }
      const row = await getRoundStandings(actors.round_id);
      const rawData = row?.payload?.data ?? row?.payload ?? [];
      const entries = Array.isArray(rawData) ? rawData : [rawData];
      const detail = (details, name) => { if (!Array.isArray(details)) return null; const lc = name.toLowerCase(); const d = details.find((x) => x?.type?.name?.toLowerCase() === lc || x?.type?.developer_name?.toLowerCase() === lc); return d?.value ?? null; };
      const allRows = entries.map((s) => ({ position: s.position ?? null, team_id: s.participant_id ?? s.participant?.id ?? null, team_name: s.participant?.name ?? null, points: s.points ?? null, result: s.result ?? null, played: detail(s.details, "games_played") ?? detail(s.details, "matches_played") ?? null, won: detail(s.details, "won") ?? null, draw: detail(s.details, "draw") ?? null, lost: detail(s.details, "lost") ?? null, goals_for: detail(s.details, "goals_for") ?? null, goals_against: detail(s.details, "goals_against") ?? null, goal_diff: detail(s.details, "goal_difference") ?? null, form: Array.isArray(s.form) ? s.form : null, stage_name: s.stage?.name ?? null, group_name: s.group?.name ?? null, round_name: s.round?.name ?? null }));
      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(allRows, readParams.page, readParams.page_size);
        return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), round_id: actors.round_id, total_entries: allRows.length, paging: paginated.paging, data: paginated.items, fetched_at: row?.fetched_at ?? null });
      }
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), round_id: actors.round_id, total_entries: allRows.length, paging: null, data: allRows, fetched_at: row?.fetched_at ?? null });
    }

    // ── Standings Corrections ──
    if (pack === "standings_corrections") {
      if (!actors.season_id) {
        return NextResponse.json({ ok: false, ...meta, error: "Season ID not found." }, { status: 404 });
      }
      const row = await getStandingsCorrections(actors.season_id);
      const rawData = row?.payload?.data ?? row?.payload ?? [];
      const entries = Array.isArray(rawData) ? rawData : [rawData];
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, season_id: actors.season_id, total_entries: entries.length, data: entries, fetched_at: row?.fetched_at ?? null });
    }

    // ── Live Standings ──
    if (pack === "standings_live") {
      if (!actors.league_id) {
        return NextResponse.json({ ok: false, ...meta, error: "League ID not found." }, { status: 404 });
      }
      const row = await getLiveStandings(actors.league_id);
      const rawData = row?.payload?.data ?? row?.payload ?? [];
      const entries = Array.isArray(rawData) ? rawData : [rawData];
      const detail = (details, name) => { if (!Array.isArray(details)) return null; const lc = name.toLowerCase(); const d = details.find((x) => x?.type?.name?.toLowerCase() === lc || x?.type?.developer_name?.toLowerCase() === lc); return d?.value ?? null; };
      const allRows = entries.map((s) => ({ position: s.position ?? null, team_id: s.participant_id ?? s.participant?.id ?? null, team_name: s.participant?.name ?? null, points: s.points ?? null, result: s.result ?? null, played: detail(s.details, "games_played") ?? null, won: detail(s.details, "won") ?? null, draw: detail(s.details, "draw") ?? null, lost: detail(s.details, "lost") ?? null, goals_for: detail(s.details, "goals_for") ?? null, goals_against: detail(s.details, "goals_against") ?? null, goal_diff: detail(s.details, "goal_difference") ?? null, form: Array.isArray(s.form) ? s.form : null, stage_name: s.stage?.name ?? null, group_name: s.group?.name ?? null, round_name: s.round?.name ?? null }));
      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(allRows, readParams.page, readParams.page_size);
        return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), league_id: actors.league_id, total_entries: allRows.length, paging: paginated.paging, data: paginated.items, fetched_at: row?.fetched_at ?? null });
      }
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), league_id: actors.league_id, total_entries: allRows.length, paging: null, data: allRows, fetched_at: row?.fetched_at ?? null });
    }

    // ── Commentaries ──
    if (pack === "fixture_commentaries") {
      const row = await getFixtureCommentaries(id);
      const rawData = row?.payload?.data ?? [];
      const entries = Array.isArray(rawData) ? rawData : [];
      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(entries, readParams.page, readParams.page_size);
        return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), total_entries: entries.length, paging: paginated.paging, data: paginated.items, fetched_at: row?.fetched_at ?? null });
      }
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, total_entries: entries.length, data: entries, fetched_at: row?.fetched_at ?? null });
    }

    // ── Match Facts ──
    if (pack === "fixture_match_facts") {
      const row = await getFixtureMatchFacts(id);
      const rawData = row?.payload?.data ?? [];
      const entries = Array.isArray(rawData) ? rawData : [];
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, total_entries: entries.length, data: entries, fetched_at: row?.fetched_at ?? null });
    }

    // ── Home Team Squad ──
    if (pack === "home_team_squad") {
      if (!actors.season_id || !actors.home_team_id) {
        return NextResponse.json({ ok: false, ...meta, error: "Season or home team ID not found." }, { status: 404 });
      }
      const row = await getTeamSquad(actors.season_id, actors.home_team_id);
      const rawData = row?.payload?.data ?? [];
      const entries = Array.isArray(rawData) ? rawData : [];
      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(entries, readParams.page, readParams.page_size);
        return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), season_id: actors.season_id, team_id: actors.home_team_id, total_entries: entries.length, paging: paginated.paging, data: paginated.items, fetched_at: row?.fetched_at ?? null });
      }
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, season_id: actors.season_id, team_id: actors.home_team_id, total_entries: entries.length, data: entries, fetched_at: row?.fetched_at ?? null });
    }

    // ── Away Team Squad ──
    if (pack === "away_team_squad") {
      if (!actors.season_id || !actors.away_team_id) {
        return NextResponse.json({ ok: false, ...meta, error: "Season or away team ID not found." }, { status: 404 });
      }
      const row = await getTeamSquad(actors.season_id, actors.away_team_id);
      const rawData = row?.payload?.data ?? [];
      const entries = Array.isArray(rawData) ? rawData : [];
      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(entries, readParams.page, readParams.page_size);
        return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), season_id: actors.season_id, team_id: actors.away_team_id, total_entries: entries.length, paging: paginated.paging, data: paginated.items, fetched_at: row?.fetched_at ?? null });
      }
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, season_id: actors.season_id, team_id: actors.away_team_id, total_entries: entries.length, data: entries, fetched_at: row?.fetched_at ?? null });
    }

    // ── Home Team Schedule ──
    if (pack === "home_team_schedule") {
      if (!actors.season_id || !actors.home_team_id) {
        return NextResponse.json({ ok: false, ...meta, error: "Season or home team ID not found." }, { status: 404 });
      }
      const row = await getTeamSchedule(actors.season_id, actors.home_team_id);
      const rawData = row?.payload?.data ?? [];
      const entries = Array.isArray(rawData) ? rawData : [];
      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(entries, readParams.page, readParams.page_size);
        return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), season_id: actors.season_id, team_id: actors.home_team_id, total_entries: entries.length, paging: paginated.paging, data: paginated.items, fetched_at: row?.fetched_at ?? null });
      }
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, season_id: actors.season_id, team_id: actors.home_team_id, total_entries: entries.length, data: entries, fetched_at: row?.fetched_at ?? null });
    }

    // ── Away Team Schedule ──
    if (pack === "away_team_schedule") {
      if (!actors.season_id || !actors.away_team_id) {
        return NextResponse.json({ ok: false, ...meta, error: "Season or away team ID not found." }, { status: 404 });
      }
      const row = await getTeamSchedule(actors.season_id, actors.away_team_id);
      const rawData = row?.payload?.data ?? [];
      const entries = Array.isArray(rawData) ? rawData : [];
      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(entries, readParams.page, readParams.page_size);
        return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), season_id: actors.season_id, team_id: actors.away_team_id, total_entries: entries.length, paging: paginated.paging, data: paginated.items, fetched_at: row?.fetched_at ?? null });
      }
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, season_id: actors.season_id, team_id: actors.away_team_id, total_entries: entries.length, data: entries, fetched_at: row?.fetched_at ?? null });
    }

    // ── Home Team Squad Fallback (by team only) ──
    if (pack === "home_team_squad_fallback") {
      if (!actors.home_team_id) {
        return NextResponse.json({ ok: false, ...meta, error: "Home team ID not found." }, { status: 404 });
      }
      const row = await getTeamSquadFallback(actors.home_team_id);
      const rawData = row?.payload?.data ?? [];
      const entries = Array.isArray(rawData) ? rawData : [rawData];
      const slim = entries.map((p) => ({ id: p.id ?? null, player_id: p.player_id ?? null, player_name: p.player?.display_name ?? p.player?.name ?? null, team_id: p.team_id ?? null, position: p.position?.name ?? null, detailed_position: p.detailedPosition?.name ?? null, jersey_number: p.jersey_number ?? null, start: p.start ?? null, end: p.end ?? null, transfer_date: p.transfer?.date ?? null }));
      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(slim, readParams.page, readParams.page_size);
        return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), team_id: actors.home_team_id, total_entries: slim.length, paging: paginated.paging, data: paginated.items, fetched_at: row?.fetched_at ?? null });
      }
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, team_id: actors.home_team_id, total_entries: slim.length, data: slim, fetched_at: row?.fetched_at ?? null });
    }

    // ── Away Team Squad Fallback (by team only) ──
    if (pack === "away_team_squad_fallback") {
      if (!actors.away_team_id) {
        return NextResponse.json({ ok: false, ...meta, error: "Away team ID not found." }, { status: 404 });
      }
      const row = await getTeamSquadFallback(actors.away_team_id);
      const rawData = row?.payload?.data ?? [];
      const entries = Array.isArray(rawData) ? rawData : [rawData];
      const slim = entries.map((p) => ({ id: p.id ?? null, player_id: p.player_id ?? null, player_name: p.player?.display_name ?? p.player?.name ?? null, team_id: p.team_id ?? null, position: p.position?.name ?? null, detailed_position: p.detailedPosition?.name ?? null, jersey_number: p.jersey_number ?? null, start: p.start ?? null, end: p.end ?? null, transfer_date: p.transfer?.date ?? null }));
      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(slim, readParams.page, readParams.page_size);
        return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), team_id: actors.away_team_id, total_entries: slim.length, paging: paginated.paging, data: paginated.items, fetched_at: row?.fetched_at ?? null });
      }
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, team_id: actors.away_team_id, total_entries: slim.length, data: slim, fetched_at: row?.fetched_at ?? null });
    }

    // ── Season Topscorers ──
    if (pack === "season_topscorers") {
      if (!actors.season_id) {
        return NextResponse.json({ ok: false, ...meta, error: "Season ID not found." }, { status: 404 });
      }
      const row = await getSeasonTopscorers(actors.season_id);
      const rawData = row?.payload?.data ?? [];
      const entries = Array.isArray(rawData) ? rawData : [];
      const slim = entries.map((t) => ({ id: t.id ?? null, season_id: t.season_id ?? null, player_id: t.player_id ?? null, player_name: t.player?.display_name ?? t.player?.name ?? null, team_id: t.participant_id ?? null, team_name: t.participant?.name ?? null, type_name: t.type?.name ?? null, type_id: t.type_id ?? null, position: t.position ?? null, total: t.total ?? null, stage_name: t.stage?.name ?? null }));
      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(slim, readParams.page, readParams.page_size);
        return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), season_id: actors.season_id, total_entries: slim.length, paging: paginated.paging, data: paginated.items, fetched_at: row?.fetched_at ?? null });
      }
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, season_id: actors.season_id, total_entries: slim.length, data: slim, fetched_at: row?.fetched_at ?? null });
    }

    // ── Home Team Rankings ──
    if (pack === "home_team_rankings") {
      if (!actors.home_team_id) {
        return NextResponse.json({ ok: false, ...meta, error: "Home team ID not found." }, { status: 404 });
      }
      const row = await getTeamRankings(actors.home_team_id);
      const rawData = row?.payload?.data ?? [];
      const entries = Array.isArray(rawData) ? rawData : [];
      const slim = entries.map((r) => ({ id: r.id ?? null, team_id: r.team_id ?? null, team_name: r.team?.name ?? null, date: r.date ?? null, current_rank: r.current_rank ?? null, scaled_score: r.scaled_score ?? null }));
      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(slim, readParams.page, readParams.page_size);
        return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), team_id: actors.home_team_id, total_entries: slim.length, paging: paginated.paging, data: paginated.items, fetched_at: row?.fetched_at ?? null });
      }
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, team_id: actors.home_team_id, total_entries: slim.length, data: slim, fetched_at: row?.fetched_at ?? null });
    }

    // ── Away Team Rankings ──
    if (pack === "away_team_rankings") {
      if (!actors.away_team_id) {
        return NextResponse.json({ ok: false, ...meta, error: "Away team ID not found." }, { status: 404 });
      }
      const row = await getTeamRankings(actors.away_team_id);
      const rawData = row?.payload?.data ?? [];
      const entries = Array.isArray(rawData) ? rawData : [];
      const slim = entries.map((r) => ({ id: r.id ?? null, team_id: r.team_id ?? null, team_name: r.team?.name ?? null, date: r.date ?? null, current_rank: r.current_rank ?? null, scaled_score: r.scaled_score ?? null }));
      if (readParams.read_mode === "safe" && readParams.page_size) {
        const paginated = paginatePayloadArray(slim, readParams.page, readParams.page_size);
        return NextResponse.json({ ok: true, fixture_id: id, ...meta, ...buildSafeReadMeta(pack, readParams), team_id: actors.away_team_id, total_entries: slim.length, paging: paginated.paging, data: paginated.items, fetched_at: row?.fetched_at ?? null });
      }
      return NextResponse.json({ ok: true, fixture_id: id, ...meta, team_id: actors.away_team_id, total_entries: slim.length, data: slim, fetched_at: row?.fetched_at ?? null });
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