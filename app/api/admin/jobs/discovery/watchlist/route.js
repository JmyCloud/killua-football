import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized, unauthorized } from "@/lib/admin";
import { parsePositiveInt } from "@/lib/watchlist";
import { fetchAllSportMonksPages, FIXTURE_LEAGUES_FILTER } from "@/lib/sportmonks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_LIMIT = 20;
const DEFAULT_LOOKAHEAD_HOURS = 36;
const DEFAULT_LOOKBACK_HOURS = 6;
const DEFAULT_PREMATCH_EXPIRE_AFTER_HOURS = 12;
const DEFAULT_LIVE_EXPIRE_AFTER_HOURS = 6;

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function parseIdCsv(value) {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
  );
}

function getDiscoveryLeagueIds() {
  return parseIdCsv(process.env.AUTO_DISCOVERY_LEAGUE_IDS);
}

function getStateText(fixture) {
  const state = fixture?.state ?? {};
  return [
    state.developer_name,
    state.name,
    state.short_name,
    fixture?.result_info,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isFinishedLike(fixture) {
  const text = getStateText(fixture);
  return /(finished|ended|ft|final|after penalties|after extra time|postpon|cancel|abandon|deleted|walkover)/i.test(
    text
  );
}

function isLiveLike(fixture) {
  const text = getStateText(fixture);
  if (/(live|half|break|extra time|penalt)/i.test(text)) return true;

  const startsAtMs = Date.parse(fixture?.starting_at ?? "");
  if (!Number.isFinite(startsAtMs)) return false;

  const nowMs = Date.now();
  return !isFinishedLike(fixture) && startsAtMs <= nowMs && startsAtMs >= nowMs - 8 * 60 * 60 * 1000;
}

function resolveFixtureName(fixture) {
  if (fixture?.name) return String(fixture.name);

  const participants = Array.isArray(fixture?.participants) ? fixture.participants : [];
  if (participants.length >= 2) {
    return `${participants[0]?.name ?? "Team A"} vs ${participants[1]?.name ?? "Team B"}`;
  }

  return `Fixture ${fixture?.id ?? "unknown"}`;
}

function scoreFixture(fixture, priorityLeagueIds) {
  let score = 0;
  const reasons = [];

  if (fixture?.placeholder === true) return { score: -999999, reasons: ["placeholder"] };
  if (!fixture?.has_odds) return { score: -999999, reasons: ["no_odds"] };
  if (isFinishedLike(fixture)) return { score: -999999, reasons: ["finished_like"] };

  const liveLike = isLiveLike(fixture);
  const startsAtMs = Date.parse(fixture?.starting_at ?? "");
  const nowMs = Date.now();

  if (liveLike) {
    score += 400;
    reasons.push("live_like");
  }

  if (Number.isFinite(startsAtMs)) {
    const diffHours = (startsAtMs - nowMs) / (1000 * 60 * 60);

    if (diffHours <= 2 && diffHours >= -3) {
      score += 220;
      reasons.push("starts_within_2h");
    } else if (diffHours <= 6 && diffHours >= -6) {
      score += 140;
      reasons.push("starts_within_6h");
    } else if (diffHours <= 24 && diffHours >= -6) {
      score += 80;
      reasons.push("starts_within_24h");
    } else if (diffHours <= 48 && diffHours >= -6) {
      score += 30;
      reasons.push("starts_within_48h");
    }
  }

  if (fixture?.has_premium_odds) {
    score += 30;
    reasons.push("has_premium_odds");
  }

  const leagueId = Number(fixture?.league_id ?? fixture?.league?.id ?? 0);
  if (priorityLeagueIds.includes(leagueId)) {
    score += 120;
    reasons.push("priority_league");
  }

  return { score, reasons };
}

function scoreToPriority(score) {
  return Math.max(1, 1000 - Math.round(score));
}

function buildCandidate(fixture, priorityLeagueIds) {
  const fixtureId = Number(fixture?.id);
  if (!Number.isInteger(fixtureId) || fixtureId < 1) return null;

  const { score, reasons } = scoreFixture(fixture, priorityLeagueIds);
  if (score < 0) return null;

  const liveLike = isLiveLike(fixture);
  const startsAt = fixture?.starting_at ? new Date(fixture.starting_at) : null;

  const expiresAt = liveLike
    ? addHours(new Date(), DEFAULT_LIVE_EXPIRE_AFTER_HOURS)
    : startsAt
      ? addHours(startsAt, DEFAULT_PREMATCH_EXPIRE_AFTER_HOURS)
      : addHours(new Date(), DEFAULT_PREMATCH_EXPIRE_AFTER_HOURS);

  const leagueId = Number(fixture?.league_id ?? fixture?.league?.id ?? 0);

  return {
    fixture_id: fixtureId,
    name: resolveFixtureName(fixture),
    league_id: leagueId || null,
    league_name: fixture?.league?.name ?? null,
    starts_at: startsAt ? startsAt.toISOString() : null,
    expires_at: expiresAt.toISOString(),
    mode: liveLike ? "live" : "prematch",
    score,
    priority: scoreToPriority(score),
    reasons,
    metadata: {
      auto_discovery: true,
      source: "date_range",
      discovery_score: score,
      discovery_reasons: reasons,
      league_id: leagueId || null,
      league_name: fixture?.league?.name ?? null,
      fixture_name: resolveFixtureName(fixture),
      discovered_at: new Date().toISOString(),
    },
  };
}

async function fetchWindowFixtures({ lookaheadHours, lookbackHours }) {
  const now = new Date();
  const startDate = toDateOnly(addHours(now, -lookbackHours));
  const endDate = toDateOnly(addHours(now, lookaheadHours));

  const pages = await fetchAllSportMonksPages(
    `fixtures/between/${startDate}/${endDate}`,
    {
      include: "league;state;participants",
      per_page: 50,
      filters: FIXTURE_LEAGUES_FILTER,
    }
  );

  const all = [];
  for (const page of pages) {
    const data = Array.isArray(page?.payload?.data) ? page.payload.data : [];
    all.push(...data);
  }

  return {
    start_date: startDate,
    end_date: endDate,
    fixtures: all,
  };
}

function dedupeCandidates(candidates) {
  const map = new Map();
  for (const item of candidates) {
    const prev = map.get(item.fixture_id);
    if (!prev || item.score > prev.score) {
      map.set(item.fixture_id, item);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.fixture_id - b.fixture_id;
  });
}

async function upsertAutoDiscoveryItems(items) {
  const saved = [];

  for (const item of items) {
    const result = await query(
      `
      insert into cache.fixture_watchlist (
        fixture_id,
        mode,
        priority,
        enabled,
        starts_at,
        expires_at,
        notes,
        metadata,
        updated_at
      )
      values ($1, $2, $3, true, $4, $5, $6, $7::jsonb, now())
      on conflict (fixture_id) do update
      set
        mode = excluded.mode,
        priority = excluded.priority,
        enabled = true,
        starts_at = excluded.starts_at,
        expires_at = excluded.expires_at,
        notes = excluded.notes,
        metadata = excluded.metadata,
        updated_at = now()
      where coalesce(cache.fixture_watchlist.metadata->>'auto_discovery', 'false') = 'true'
      returning fixture_id, mode, priority, starts_at, expires_at, metadata
      `,
      [
        item.fixture_id,
        item.mode,
        item.priority,
        item.starts_at,
        item.expires_at,
        "auto-discovery",
        JSON.stringify(item.metadata),
      ]
    );

    if (result.rows[0]) {
      saved.push(result.rows[0]);
    } else {
      const exists = await query(
        `select fixture_id, metadata from cache.fixture_watchlist where fixture_id = $1`,
        [item.fixture_id]
      );

      if (!exists.rows[0]) {
        throw new Error(`Failed to insert fixture ${item.fixture_id}`);
      }
    }
  }

  return saved;
}

function parseInputs(request) {
  const { searchParams } = new URL(request.url);

  return {
    limit: parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT, 100),
    lookaheadHours: parsePositiveInt(
      searchParams.get("lookahead_hours"),
      DEFAULT_LOOKAHEAD_HOURS,
      168
    ),
    lookbackHours: parsePositiveInt(
      searchParams.get("lookback_hours"),
      DEFAULT_LOOKBACK_HOURS,
      72
    ),
  };
}

async function buildDiscoveryPreview(input) {
  const priorityLeagueIds = getDiscoveryLeagueIds();

  const windowData = await fetchWindowFixtures({
    lookaheadHours: input.lookaheadHours,
    lookbackHours: input.lookbackHours,
  });

  const candidates = dedupeCandidates(
    windowData.fixtures
      .map((fixture) => buildCandidate(fixture, priorityLeagueIds))
      .filter(Boolean)
  ).slice(0, input.limit);

  return {
    strategy: {
      limit: input.limit,
      lookahead_hours: input.lookaheadHours,
      lookback_hours: input.lookbackHours,
      priority_league_ids: priorityLeagueIds,
    },
    source_window: {
      start_date: windowData.start_date,
      end_date: windowData.end_date,
      fetched_fixtures: windowData.fixtures.length,
    },
    candidates,
  };
}

export async function GET(request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const input = parseInputs(request);
    const preview = await buildDiscoveryPreview(input);

    return NextResponse.json({
      ok: true,
      ...preview,
      summary: {
        candidate_count: preview.candidates.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const input = parseInputs(request);
    const preview = await buildDiscoveryPreview(input);

    const saved = await upsertAutoDiscoveryItems(preview.candidates);

    return NextResponse.json({
      ok: true,
      strategy: preview.strategy,
      source_window: preview.source_window,
      summary: {
        candidate_count: preview.candidates.length,
        saved_or_updated_count: saved.length,
      },
      saved,
      candidates: preview.candidates,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}