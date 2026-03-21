import { query } from "@/lib/db";

export const ANALYSIS_PACKS = Object.freeze([
  "fixture_context",
  "fixture_squads",
  "fixture_events_scores",
  "fixture_statistics",
  "fixture_periods",
  "h2h_context",
  "h2h_events",
  "h2h_statistics",
  "h2h_referees",
  "home_team_all",
  "away_team_all",
  "referee_all",
  "odds_prematch_summary",
  "odds_inplay_summary",
]);

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

  return {
    fixture_id: Number(fixtureId),
    home_team_id: home ? Number(home.id ?? home.team_id ?? home.participant_id) : null,
    away_team_id: away ? Number(away.id ?? away.team_id ?? away.participant_id) : null,
    referee_id: mainRef ? Number(mainRef.referee_id ?? mainRef.id) : null,
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
    `select market_id, market_description, jsonb_array_length(odds) as odds_count, fetched_at
     from ${table}
     where fixture_id = $1
     order by market_id`,
    [fixtureId]
  );

  return result.rows;
}

export function getPackChunks(pack) {
  return FIXTURE_PACK_CHUNKS[pack] ?? null;
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