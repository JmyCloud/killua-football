import { query } from "@/lib/db";

export const ANALYSIS_PACKS = Object.freeze([
  "fixture_context",
  "fixture_squads",
  "fixture_events_scores",
  "fixture_statistics",
  "fixture_periods",
  "fixture_xg",
  "fixture_predictions",
  "fixture_news",
  "fixture_expected_lineups",
  "h2h_context",
  "h2h_events",
  "h2h_statistics",
  "h2h_referees",
  "home_team_all",
  "away_team_all",
  "referee_all",
  "league_standings",
  "odds_prematch_summary",
  "odds_inplay_summary",
]);

export const PACK_DETAILS = Object.freeze({
  fixture_context: {
    family: "fixture",
    label: "Fixture Context",
    contains: [
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
    ],
    analysis_focus: [
      "competition context",
      "match importance",
      "venue and weather",
      "macro match conditions",
    ],
  },
  fixture_squads: {
    family: "fixture",
    label: "Fixture Squads",
    contains: [
      "participants",
      "formations",
      "lineups",
      "referees",
      "coaches",
      "sidelined",
    ],
    analysis_focus: [
      "lineup structure",
      "absences",
      "coach impact",
      "role fit",
    ],
  },
  fixture_events_scores: {
    family: "fixture",
    label: "Fixture Events & Scores",
    contains: [
      "scores",
      "events",
    ],
    analysis_focus: [
      "match flow",
      "goal timing",
      "event pattern",
    ],
  },
  fixture_statistics: {
    family: "fixture",
    label: "Fixture Statistics",
    contains: [
      "statistics",
    ],
    analysis_focus: [
      "performance profile",
      "dominance",
      "shot and control indicators",
    ],
  },
  fixture_periods: {
    family: "fixture",
    label: "Fixture Periods",
    contains: [
      "periods",
    ],
    analysis_focus: [
      "phase-by-phase pattern",
      "timing splits",
      "period momentum",
    ],
  },
  fixture_xg: {
    family: "fixture",
    label: "Fixture xG (Expected Goals)",
    contains: [
      "expected_goals",
    ],
    analysis_focus: [
      "xG per team",
      "attacking quality",
      "chance conversion expectation",
    ],
  },
  fixture_predictions: {
    family: "fixture",
    label: "Fixture Predictions & Value Bets",
    contains: [
      "probabilities",
      "value_bets",
    ],
    analysis_focus: [
      "score probabilities",
      "result likelihood",
      "value bet opportunities",
      "fair odds comparison",
    ],
  },
  fixture_news: {
    family: "fixture",
    label: "Pre-Match News",
    contains: [
      "news_articles",
    ],
    analysis_focus: [
      "team news",
      "injury updates",
      "tactical previews",
    ],
  },
  fixture_expected_lineups: {
    family: "fixture",
    label: "Expected Lineups",
    contains: [
      "predicted_lineups",
    ],
    analysis_focus: [
      "predicted starting XI",
      "formation expectation",
      "key player availability",
    ],
  },
  h2h_context: {
    family: "h2h",
    label: "H2H Context",
    contains: [
      "summary",
      "participants",
      "scores",
    ],
    analysis_focus: [
      "recent H2H pattern",
      "scoreline tendency",
      "pair interaction",
    ],
  },
  h2h_events: {
    family: "h2h",
    label: "H2H Events",
    contains: [
      "events",
    ],
    analysis_focus: [
      "event pattern across meetings",
      "timing and discipline trend",
    ],
  },
  h2h_statistics: {
    family: "h2h",
    label: "H2H Statistics",
    contains: [
      "statistics",
    ],
    analysis_focus: [
      "recurring statistical edge",
      "style matchup pattern",
    ],
  },
  h2h_referees: {
    family: "h2h",
    label: "H2H Referees",
    contains: [
      "referees",
    ],
    analysis_focus: [
      "officiating context in recent meetings",
    ],
  },
  home_team_all: {
    family: "team",
    label: "Home Team Season Stats",
    contains: [
      "attacking",
      "defending",
      "passing",
      "form",
      "physical",
      "advanced",
    ],
    analysis_focus: [
      "home team season profile",
      "strengths and weaknesses",
      "trend quality",
    ],
  },
  away_team_all: {
    family: "team",
    label: "Away Team Season Stats",
    contains: [
      "attacking",
      "defending",
      "passing",
      "form",
      "physical",
      "advanced",
    ],
    analysis_focus: [
      "away team season profile",
      "strengths and weaknesses",
      "trend quality",
    ],
  },
  referee_all: {
    family: "referee",
    label: "Referee Season Stats",
    contains: [
      "matches_officiated",
      "fouls",
      "yellowcards",
      "redcards",
      "yellowred_cards",
      "penalties",
      "var_reviews",
    ],
    analysis_focus: [
      "discipline tendency",
      "foul tolerance",
      "penalty and VAR profile",
    ],
  },
  league_standings: {
    family: "standings",
    label: "League Standings",
    contains: [
      "table_rows",
      "form",
      "home_away_split",
      "goals",
    ],
    analysis_focus: [
      "league position and points gap",
      "motivation context (title race, relegation, mid-table)",
      "home vs away form in table",
      "goals scored/conceded pattern",
      "recent form string (W/D/L)",
    ],
  },
  odds_prematch_summary: {
    family: "odds",
    label: "Prematch Odds Summary",
    contains: [
      "market summary",
    ],
    analysis_focus: [
      "market availability",
      "prematch market map",
    ],
  },
  odds_inplay_summary: {
    family: "odds",
    label: "Inplay Odds Summary",
    contains: [
      "market summary",
    ],
    analysis_focus: [
      "live market availability",
      "inplay market map",
    ],
  },
});

export const SCOPED_PACK_MAP = Object.freeze({
  full: ANALYSIS_PACKS,
  fixture_only: [
    "fixture_context",
    "fixture_squads",
    "fixture_events_scores",
    "fixture_statistics",
    "fixture_periods",
  ],
  premium_only: [
    "fixture_xg",
    "fixture_predictions",
    "fixture_news",
    "fixture_expected_lineups",
  ],
  h2h_only: [
    "h2h_context",
    "h2h_events",
    "h2h_statistics",
    "h2h_referees",
  ],
  team_stats_only: [
    "home_team_all",
    "away_team_all",
  ],
  referee_only: [
    "referee_all",
  ],
  standings_only: [
    "league_standings",
  ],
  odds_only: [
    "odds_prematch_summary",
    "odds_inplay_summary",
  ],
  lineups_only: [
    "fixture_squads",
  ],
  fixture_context_only: [
    "fixture_context",
  ],
});

export const PACK_SAFE_READ_CONFIG = Object.freeze({
  fixture_context: {
    enabled: false,
    strategy: null,
    default_page_size: null,
    max_page_size: null,
  },
  fixture_squads: {
    enabled: true,
    strategy: "array",
    default_page_size: 30,
    max_page_size: 120,
    slicers: [
      { chunk: "lineups", keys: ["lineups"] },
    ],
  },
  fixture_events_scores: {
    enabled: true,
    strategy: "array",
    default_page_size: 120,
    max_page_size: 400,
    slicers: [
      { chunk: "events", keys: ["events"] },
    ],
  },
  fixture_statistics: {
    enabled: true,
    strategy: "array",
    default_page_size: 120,
    max_page_size: 400,
    slicers: [
      { chunk: "statistics", keys: ["statistics"] },
    ],
  },
  fixture_periods: {
    enabled: true,
    strategy: "array",
    default_page_size: 12,
    max_page_size: 100,
    slicers: [
      { chunk: "periods", keys: ["periods"] },
    ],
  },
  fixture_xg: {
    enabled: false,
    strategy: null,
    default_page_size: null,
    max_page_size: null,
  },
  fixture_predictions: {
    enabled: false,
    strategy: null,
    default_page_size: null,
    max_page_size: null,
  },
  fixture_news: {
    enabled: false,
    strategy: null,
    default_page_size: null,
    max_page_size: null,
  },
  fixture_expected_lineups: {
    enabled: false,
    strategy: null,
    default_page_size: null,
    max_page_size: null,
  },
  h2h_context: {
    enabled: true,
    strategy: "match",
    default_page_size: 3,
    max_page_size: 10,
  },
  h2h_events: {
    enabled: true,
    strategy: "match",
    default_page_size: 2,
    max_page_size: 10,
  },
  h2h_statistics: {
    enabled: true,
    strategy: "match",
    default_page_size: 2,
    max_page_size: 10,
  },
  h2h_referees: {
    enabled: true,
    strategy: "match",
    default_page_size: 5,
    max_page_size: 10,
  },
  home_team_all: {
    enabled: false,
    strategy: null,
    default_page_size: null,
    max_page_size: null,
  },
  away_team_all: {
    enabled: false,
    strategy: null,
    default_page_size: null,
    max_page_size: null,
  },
  referee_all: {
    enabled: false,
    strategy: null,
    default_page_size: null,
    max_page_size: null,
  },
  league_standings: {
    enabled: false,
    strategy: null,
    default_page_size: null,
    max_page_size: null,
  },
  odds_prematch_summary: {
    enabled: false,
    strategy: null,
    default_page_size: null,
    max_page_size: null,
  },
  odds_inplay_summary: {
    enabled: false,
    strategy: null,
    default_page_size: null,
    max_page_size: null,
  },
});

export function getPackDetails(pack) {
  return PACK_DETAILS[pack] ?? null;
}

export function hasContentfulChunk(dataMap, chunkName) {
  const val = dataMap?.[chunkName];
  if (val == null) return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === "object") return Object.keys(val).length > 0;
  return Boolean(val);
}

export function summarizeChunkCoverage(expectedChunks, dataMap) {
  const found_chunks = expectedChunks.filter((chunk) => Boolean(dataMap?.[chunk]));
  const missing_chunks = expectedChunks.filter((chunk) => !dataMap?.[chunk]);
  return {
    expected_count: expectedChunks.length,
    found_count: found_chunks.length,
    missing_count: missing_chunks.length,
    found_chunks,
    missing_chunks,
    coverage_pct: expectedChunks.length
      ? Math.round((found_chunks.length / expectedChunks.length) * 100)
      : 0,
  };
}

export function buildAnalysisBlueprint(liveLike = false) {
  const default_read_order = liveLike
    ? ANALYSIS_PACKS
    : ANALYSIS_PACKS.filter((pack) => pack !== "odds_inplay_summary");
  return {
    full_mode: {
      default_read_order,
      conditional_packs: liveLike ? ["odds_inplay_summary"] : [],
      notes: [
        "Read all ready packs in default_read_order before concluding.",
        "Use odds summaries only as market availability maps, not as evidence direction.",
      ],
    },
    scoped_modes: SCOPED_PACK_MAP,
  };
}

const FIXTURE_PACK_CHUNKS = {
  fixture_context: [
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
  ],
  fixture_squads: [
    "participants",
    "formations",
    "lineups",
    "referees",
    "coaches",
    "sidelined",
  ],
  fixture_events_scores: [
    "scores",
    "events",
  ],
  fixture_statistics: [
    "statistics",
  ],
  fixture_periods: [
    "periods",
  ],
};

export function getPackSafeReadConfig(pack) {
  return (
    PACK_SAFE_READ_CONFIG[pack] ?? {
      enabled: false,
      strategy: null,
      default_page_size: null,
      max_page_size: null,
    }
  );
}

export function normalizePositiveInt(value, fallback, maxValue = 1000) {
  const n = parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, maxValue);
}

export function parsePackReadParams(searchParams, pack) {
  const config = getPackSafeReadConfig(pack);
  const rawMode = String(searchParams.get("read_mode") ?? "full").toLowerCase();
  const read_mode =
    rawMode === "safe" && config.enabled
      ? "safe"
      : "full";

  const page = normalizePositiveInt(searchParams.get("page"), 1, 100000);
  const page_size = config.enabled
    ? normalizePositiveInt(
        searchParams.get("page_size"),
        config.default_page_size ?? 50,
        config.max_page_size ?? 500
      )
    : null;

  return {
    read_mode,
    page,
    page_size,
    safe_config: config,
  };
}

function paginateArray(items, page, pageSize) {
  const total_items = Array.isArray(items) ? items.length : 0;
  const total_pages =
    total_items > 0 ? Math.ceil(total_items / pageSize) : 1;

  const safePage = Math.min(Math.max(page, 1), total_pages);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: Array.isArray(items) ? items.slice(start, end) : [],
    paging: {
      page: safePage,
      page_size: pageSize,
      total_items,
      total_pages,
      has_next_page: safePage < total_pages,
      has_prev_page: safePage > 1,
    },
  };
}

function sliceEnvelopeArray(envelope, keys, page, pageSize) {
  if (!envelope) return null;

  const payload = envelope.data;

  if (Array.isArray(payload)) {
    const sliced = paginateArray(payload, page, pageSize);
    return {
      envelope: {
        ...envelope,
        data: sliced.items,
      },
      paging: sliced.paging,
      target: "root_array",
    };
  }

  if (!payload || typeof payload !== "object") return null;

  for (const key of keys) {
    if (Array.isArray(payload[key])) {
      const sliced = paginateArray(payload[key], page, pageSize);

      return {
        envelope: {
          ...envelope,
          data: {
            ...payload,
            [key]: sliced.items,
          },
        },
        paging: sliced.paging,
        target: key,
      };
    }

    if (payload.data && typeof payload.data === "object" && Array.isArray(payload.data[key])) {
      const sliced = paginateArray(payload.data[key], page, pageSize);

      return {
        envelope: {
          ...envelope,
          data: {
            ...payload,
            data: {
              ...payload.data,
              [key]: sliced.items,
            },
          },
        },
        paging: sliced.paging,
        target: key,
      };
    }
  }

  return null;
}

export function applySafeFixturePackRead(pack, dataMap, page, pageSize) {
  const config = getPackSafeReadConfig(pack);
  if (!config.enabled || config.strategy !== "array") {
    return {
      data: dataMap,
      paging: null,
    };
  }

  const slicers = config.slicers ?? [];

  for (const slicer of slicers) {
    const envelope = dataMap?.[slicer.chunk];
    const sliced = sliceEnvelopeArray(envelope, slicer.keys ?? [], page, pageSize);

    if (sliced) {
      return {
        data: {
          ...dataMap,
          [slicer.chunk]: sliced.envelope,
        },
        paging: {
          strategy: "array",
          target_chunk: slicer.chunk,
          target_key: sliced.target,
          ...sliced.paging,
        },
      };
    }
  }

  return {
    data: dataMap,
    paging: null,
  };
}

export function applySafeH2HPackRead(data, page, pageSize) {
  const keys = Object.keys(data ?? {}).filter((key) => Array.isArray(data?.[key]));
  if (!keys.length) {
    return {
      data,
      paging: null,
    };
  }

  const reference = data[keys[0]] ?? [];
  const sliced = paginateArray(reference, page, pageSize);

  const nextData = { ...data };
  for (const key of keys) {
    nextData[key] = (data[key] ?? []).slice(
      (sliced.paging.page - 1) * sliced.paging.page_size,
      (sliced.paging.page - 1) * sliced.paging.page_size + sliced.paging.page_size
    );
  }

  return {
    data: nextData,
    paging: {
      strategy: "match",
      ...sliced.paging,
    },
  };
}

export async function getFixtureChunksMap(fixtureId, chunks) {
  const result = await query(
    `select chunk, payload, fetched_at
     from cache.fixtures_index
     where fixture_id = $1 and chunk = any($2::text[])`,
    [fixtureId, chunks]
  );

  const map = {};
  for (const row of result.rows) {
    map[row.chunk] = {
      fetched_at: row.fetched_at,
      data: row.payload,
    };
  }

  return map;
}

export async function resolveFixtureActors(fixtureId) {
  const chunks = await getFixtureChunksMap(fixtureId, ["participants", "referees", "state", "base"]);

  const participants =
    chunks.participants?.data?.participants ??
    [];

  const home = participants.find((p) => {
    const location =
      p?.meta?.location ??
      p?.location ??
      null;
    return String(location).toLowerCase() === "home";
  }) ?? null;

  const away = participants.find((p) => {
    const location =
      p?.meta?.location ??
      p?.location ??
      null;
    return String(location).toLowerCase() === "away";
  }) ?? null;

  const referees =
    chunks.referees?.data?.referees ??
    [];

  const mainRef =
    referees.find((r) => {
      const typeName = String(
        r?.type?.name ??
        r?.type?.developer_name ??
        ""
      ).toLowerCase();

      return (
        typeName.includes("referee") ||
        typeName.includes("main")
      );
    }) ??
    referees[0] ??
    null;

  const baseData = chunks.base?.data ?? {};
  const seasonId = Number(baseData.season_id ?? baseData.base?.season_id ?? 0) || null;
  const leagueId = Number(baseData.league_id ?? baseData.base?.league_id ?? 0) || null;

  return {
    fixture_id: Number(fixtureId),
    home_team_id: home ? Number(home.id ?? home.team_id ?? home.participant_id) : null,
    away_team_id: away ? Number(away.id ?? away.team_id ?? away.participant_id) : null,
    referee_id: mainRef ? Number(mainRef.referee_id ?? mainRef.id) : null,
    season_id: seasonId,
    league_id: leagueId,
    state: chunks.state?.data?.state ?? chunks.state?.data ?? null,
    base: chunks.base?.data ?? null,
  };
}

export function normalizeH2HPair(teamAId, teamBId) {
  const a = Number(teamAId);
  const b = Number(teamBId);

  if (!Number.isInteger(a) || a < 1 || !Number.isInteger(b) || b < 1) {
    throw new Error("Invalid H2H team IDs");
  }

  if (a <= b) {
    return {
      requested_home_team_id: a,
      requested_away_team_id: b,
      home_team_id: a,
      away_team_id: b,
      normalized: false,
    };
  }

  return {
    requested_home_team_id: a,
    requested_away_team_id: b,
    home_team_id: b,
    away_team_id: a,
    normalized: true,
  };
}

export async function getOrderedH2HFixtures(
  homeTeamId,
  awayTeamId,
  limit = 5,
  excludeFixtureId = null
) {
  const pair = normalizeH2HPair(homeTeamId, awayTeamId);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 50));
  const excluded = excludeFixtureId ? Number(excludeFixtureId) : null;

  const result = await query(
    `
    with summary_rows as (
      select distinct on (fixture_id)
        fixture_id,
        fetched_at,
        payload,
        case
          when nullif(payload->>'starting_at', '') is not null
          then (payload->>'starting_at')::timestamptz
          else null
        end as starting_at
      from cache.fixtures_h2h_index
      where home_team_id = $1
        and away_team_id = $2
        and chunk = 'summary'
        and ($3::bigint is null or fixture_id <> $3)
      order by fixture_id, fetched_at desc
    )
    select
      fixture_id,
      starting_at
    from summary_rows
    order by
      starting_at desc nulls last,
      fixture_id desc
    limit $4
    `,
    [pair.home_team_id, pair.away_team_id, excluded, safeLimit]
  );

  return {
    pair,
    rows: result.rows.map((r, index) => ({
      order: index + 1,
      fixture_id: Number(r.fixture_id),
      starting_at: r.starting_at,
    })),
  };
}

export async function getH2HChunkRows(
  homeTeamId,
  awayTeamId,
  chunk,
  limit = 5,
  excludeFixtureId = null
) {
  const ordered = await getOrderedH2HFixtures(
    homeTeamId,
    awayTeamId,
    limit,
    excludeFixtureId
  );

  const ids = ordered.rows.map((r) => r.fixture_id);
  if (!ids.length) return [];

  const result = await query(
    `
    with chunk_rows as (
      select distinct on (fixture_id)
        fixture_id,
        payload,
        fetched_at
      from cache.fixtures_h2h_index
      where home_team_id = $1
        and away_team_id = $2
        and chunk = $3
        and fixture_id = any($4::bigint[])
      order by fixture_id, fetched_at desc
    )
    select fixture_id, payload, fetched_at
    from chunk_rows
    `,
    [ordered.pair.home_team_id, ordered.pair.away_team_id, chunk, ids]
  );

  const byId = new Map(
    result.rows.map((r) => [
      Number(r.fixture_id),
      {
        fixture_id: Number(r.fixture_id),
        fetched_at: r.fetched_at,
        ...r.payload,
      },
    ])
  );

  return ordered.rows
    .map((item) => {
      const row = byId.get(item.fixture_id);
      if (!row) return null;

      return {
        order: item.order,
        starting_at: item.starting_at,
        ...row,
      };
    })
    .filter(Boolean);
}

export async function getCurrentTeamStats(teamId) {
  let row;

  const current = await query(
    `select *
     from cache.statistics_seasons_teams_index
     where team_id = $1 and season_is_current = true
     order by fetched_at desc
     limit 1`,
    [teamId]
  );

  row = current.rows[0];

  if (!row) {
    const fallback = await query(
      `select *
       from cache.statistics_seasons_teams_index
       where team_id = $1
       order by fetched_at desc
       limit 1`,
      [teamId]
    );
    row = fallback.rows[0];
  }

  return row ?? null;
}

export async function getCurrentRefereeStats(refereeId) {
  let row;

  const current = await query(
    `select *
     from cache.statistics_seasons_referees_index
     where referee_id = $1 and season_is_current = true
     order by fetched_at desc
     limit 1`,
    [refereeId]
  );

  row = current.rows[0];

  if (!row) {
    const fallback = await query(
      `select *
       from cache.statistics_seasons_referees_index
       where referee_id = $1
       order by fetched_at desc
       limit 1`,
      [refereeId]
    );
    row = fallback.rows[0];
  }

  return row ?? null;
}

export async function getOddsSummary(fixtureId, mode = "prematch") {
  const table =
    mode === "inplay"
      ? "cache.odds_inplay_index"
      : "cache.odds_prematch_index";

  const result = await query(
    `select
       i.market_id,
       coalesce(m.name, i.market_description) as market_name,
       m.developer_name,
       m.legacy_id,
       m.has_winning_calculations,
       i.market_description,
       jsonb_array_length(i.odds) as odds_count,
       i.fetched_at
     from ${table} i
     left join cache.odds_markets_index m
       on m.market_id = i.market_id
     where i.fixture_id = $1
     order by i.market_id`,
    [fixtureId]
  );

  return result.rows;
}

export async function getFixtureXg(fixtureId) {
  const result = await query(
    `select payload, fetched_at
     from cache.fixture_xg_raw
     where fixture_id = $1
     order by fetched_at desc
     limit 1`,
    [fixtureId]
  );
  return result.rows[0] ?? null;
}

export async function getFixturePredictions(fixtureId) {
  const result = await query(
    `select payload, fetched_at
     from cache.fixture_predictions_raw
     where fixture_id = $1
     order by fetched_at desc
     limit 1`,
    [fixtureId]
  );
  return result.rows[0] ?? null;
}

export async function getFixtureNews(fixtureId) {
  const result = await query(
    `select payload, fetched_at
     from cache.fixture_news_raw
     where fixture_id = $1
     order by fetched_at desc
     limit 1`,
    [fixtureId]
  );
  return result.rows[0] ?? null;
}

export async function getFixtureExpectedLineups(fixtureId) {
  const result = await query(
    `select payload, fetched_at
     from cache.fixture_expected_lineups_raw
     where fixture_id = $1
     order by fetched_at desc
     limit 1`,
    [fixtureId]
  );
  return result.rows[0] ?? null;
}

export async function getSeasonStandings(seasonId) {
  try {
    const result = await query(
      `select payload, fetched_at
       from cache.standings_seasons_raw
       where season_id = $1
       order by fetched_at desc
       limit 1`,
      [seasonId]
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export function getPackChunks(pack) {
  return FIXTURE_PACK_CHUNKS[pack] ?? null;
}

export function buildCoverageSummary(packs) {
  const byFamily = {
    fixture: packs.filter((p) => getPackDetails(p.name)?.family === "fixture"),
    h2h: packs.filter((p) => getPackDetails(p.name)?.family === "h2h"),
    team: packs.filter((p) => getPackDetails(p.name)?.family === "team"),
    referee: packs.filter((p) => getPackDetails(p.name)?.family === "referee"),
    standings: packs.filter((p) => getPackDetails(p.name)?.family === "standings"),
    odds: packs.filter((p) => getPackDetails(p.name)?.family === "odds"),
  };

  const summarize = (items) => ({
    ready: items.filter((p) => p.ready).length,
    total: items.length,
  });

  return {
    fixture: summarize(byFamily.fixture),
    h2h: summarize(byFamily.h2h),
    team: summarize(byFamily.team),
    referee: summarize(byFamily.referee),
    standings: summarize(byFamily.standings),
    odds: summarize(byFamily.odds),
    overall: {
      ready: packs.filter((p) => p.ready).length,
      total: packs.length,
    },
  };
}

export function isFixtureLiveLike(state) {
  const text = [
    state?.name,
    state?.short_name,
    state?.developer_name,
    state?.state?.name,
    state?.state?.short_name,
    state?.state?.developer_name,
    state?.status,
    state?.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!text) return false;

  return [
    "live",
    "inplay",
    "in-play",
    "1st half",
    "2nd half",
    "half time",
    "halftime",
    "extra time",
    "penalties",
    "penalty",
    "break",
  ].some((token) => text.includes(token));
}