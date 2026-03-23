import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized, unauthorized, adminJson } from "@/lib/admin";
import { parsePositiveInt } from "@/lib/watchlist";
import { fetchAllSportMonksPages } from "@/lib/sportmonks";
import { fetchFixturesLatest } from "@/lib/sync-direct";
import { tryWithAdvisoryLock } from "@/lib/locks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_LIMIT = 10;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_H2H_LIMIT = 5;
const DEFAULT_EXPIRE_AFTER_HOURS = 6;

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
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

function getPriorityLeagueIds() {
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
  return /(live|inplay|in-play|1st half|2nd half|half time|halftime|extra time|penalt|break)/i.test(
    text
  );
}

function resolveFixtureName(fixture) {
  if (fixture?.name) return String(fixture.name);

  const participants = Array.isArray(fixture?.participants) ? fixture.participants : [];
  if (participants.length >= 2) {
    return `${participants[0]?.name ?? "Team A"} vs ${participants[1]?.name ?? "Team B"}`;
  }

  return `Fixture ${fixture?.id ?? "unknown"}`;
}

function scoreFixture(fixture, priorityLeagueIds, source) {
  let score = 0;
  const reasons = [];

  if (fixture?.placeholder === true) return { score: -999999, reasons: ["placeholder"] };
  if (!fixture?.has_odds) return { score: -999999, reasons: ["no_odds"] };
  if (isFinishedLike(fixture)) return { score: -999999, reasons: ["finished_like"] };
  if (!isLiveLike(fixture)) return { score: -999999, reasons: ["not_live_like"] };

  score += 300;
  reasons.push("live_like");

  if (source === "latest") {
    score += 120;
    reasons.push("latest_updated");
  }

  if (fixture?.has_premium_odds) {
    score += 20;
    reasons.push("has_premium_odds");
  }

  const leagueId = Number(fixture?.league_id ?? fixture?.league?.id ?? 0);
  if (priorityLeagueIds.includes(leagueId)) {
    score += 100;
    reasons.push("priority_league");
  }

  return { score, reasons };
}

function scoreToPriority(score) {
  return Math.max(1, 300 - Math.round(score));
}

function buildCandidate(fixture, priorityLeagueIds, source) {
  const fixtureId = Number(fixture?.id);
  if (!Number.isInteger(fixtureId) || fixtureId < 1) return null;

  const { score, reasons } = scoreFixture(fixture, priorityLeagueIds, source);
  if (score < 0) return null;

  const leagueId = Number(fixture?.league_id ?? fixture?.league?.id ?? 0);

  return {
    fixture_id: fixtureId,
    mode: "live",
    priority: scoreToPriority(score),
    starts_at: fixture?.starting_at ? new Date(fixture.starting_at).toISOString() : null,
    expires_at: addHours(new Date(), DEFAULT_EXPIRE_AFTER_HOURS).toISOString(),
    score,
    source,
    metadata: {
      auto_discovery: true,
      live_booster: true,
      source,
      discovery_score: score,
      discovery_reasons: reasons,
      fixture_name: resolveFixtureName(fixture),
      league_id: leagueId || null,
      league_name: fixture?.league?.name ?? null,
      discovered_at: new Date().toISOString(),
    },
  };
}

function dedupeCandidates(items) {
  const map = new Map();

  for (const item of items) {
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

async function fetchLatestLivescores() {
  const pages = await fetchAllSportMonksPages("livescores/latest", {
    include: "league;state;participants",
    per_page: 50,
  });

  const items = [];
  for (const page of pages) {
    const data = Array.isArray(page?.payload?.data) ? page.payload.data : [];
    items.push(...data);
  }

  return items;
}

async function fetchInplayLivescores() {
  const pages = await fetchAllSportMonksPages("livescores/inplay", {
    include: "league;state;participants",
    per_page: 50,
  });

  const items = [];
  for (const page of pages) {
    const data = Array.isArray(page?.payload?.data) ? page.payload.data : [];
    items.push(...data);
  }

  return items;
}

async function upsertAutoLiveItems(items, dbQuery = query) {
  const saved = [];

  for (const item of items) {
    const result = await dbQuery(
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
      where
        coalesce(cache.fixture_watchlist.metadata->>'auto_discovery', 'false') = 'true'
        or coalesce(cache.fixture_watchlist.metadata->>'live_booster', 'false') = 'true'
      returning fixture_id, mode, priority, starts_at, expires_at, metadata
      `,
      [
        item.fixture_id,
        item.mode,
        item.priority,
        item.starts_at,
        item.expires_at,
        "live-booster",
        JSON.stringify(item.metadata),
      ]
    );

    if (result.rows[0]) {
      saved.push(result.rows[0]);
    }
  }

  return saved;
}

function parseInputs(request) {
  const { searchParams } = new URL(request.url);

  return {
    limit: parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT, 50),
    concurrency: parsePositiveInt(searchParams.get("concurrency"), DEFAULT_CONCURRENCY, 5),
    h2hLimit: parsePositiveInt(searchParams.get("h2h_limit"), DEFAULT_H2H_LIMIT, 20),
    fallbackInplay: searchParams.get("fallback_inplay") !== "false",
  };
}

async function buildPreview(input) {
  const priorityLeagueIds = getPriorityLeagueIds();

  const latest = await fetchLatestLivescores();

  let sourceUsed = "latest";
  let fixtures = latest;

  if (fixtures.length === 0 && input.fallbackInplay) {
    fixtures = await fetchInplayLivescores();
    sourceUsed = "inplay";
  }

  // Supplement with fixtures/latest for recently-updated fixtures
  let fixturesLatestCount = 0;
  try {
    const fixturesLatest = await fetchFixturesLatest();
    fixturesLatestCount = fixturesLatest.length;
    if (fixturesLatest.length > 0) {
      fixtures = [...fixtures, ...fixturesLatest];
    }
  } catch { /* non-critical — skip if unavailable */ }

  const candidates = dedupeCandidates(
    fixtures
      .map((fixture) => buildCandidate(fixture, priorityLeagueIds, sourceUsed))
      .filter(Boolean)
  ).slice(0, input.limit);

  return {
    strategy: {
      limit: input.limit,
      concurrency: input.concurrency,
      h2h_limit: input.h2hLimit,
      fallback_inplay: input.fallbackInplay,
      priority_league_ids: priorityLeagueIds,
    },
    source: {
      selected_source: sourceUsed,
      fetched_fixtures: fixtures.length,
      latest_count: latest.length,
      fixtures_latest_count: fixturesLatestCount,
    },
    candidates,
  };
}

export async function GET(request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const input = parseInputs(request);
    const preview = await buildPreview(input);

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

  const lockKey = "job:live-booster";

  try {
    const lock = await tryWithAdvisoryLock(lockKey, async (dbQuery) => {
      const input = parseInputs(request);
      const preview = await buildPreview(input);

      const saved = await upsertAutoLiveItems(preview.candidates, dbQuery);
      const liveFixtureIds = preview.candidates.map((x) => x.fixture_id);

      const warm =
        liveFixtureIds.length > 0
          ? await adminJson(
              request,
              `/jobs/warm/watchlist?limit=${input.limit}` +
                `&concurrency=${input.concurrency}` +
                `&h2h_limit=${input.h2hLimit}` +
                `&live_fixture_ids=${liveFixtureIds.join(",")}`,
              { method: "POST" }
            )
          : {
              ok: true,
              status: 200,
              body: { ok: true, summary: { total_jobs: 0, succeeded: 0, failed: 0 } },
            };

      return NextResponse.json({
        ok: warm.ok,
        strategy: preview.strategy,
        source: preview.source,
        summary: {
          candidate_count: preview.candidates.length,
          saved_or_updated_count: saved.length,
          warmed_count: liveFixtureIds.length,
        },
        saved,
        warm: warm.body ?? null,
        candidates: preview.candidates,
      });
    });

    if (!lock.locked) {
      return NextResponse.json(
        { ok: false, error: "Live booster already running" },
        { status: 409 }
      );
    }

    return lock.value;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}