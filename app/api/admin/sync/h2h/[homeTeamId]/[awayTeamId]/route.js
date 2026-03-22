import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchAllSportMonksPages } from "@/lib/sportmonks";
import { staleWhileRevalidate, parseRefreshMode } from "@/lib/cache";
import { normalizeH2HPair } from "@/lib/analysis";
import { isAuthorized, unauthorized } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INCLUDE =
  "league;season;stage;round;group;aggregate;venue;state;participants;scores.type;events.type;statistics.type;periods.type;referees.referee;referees.type;formations;coaches";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

function parseLimit(searchParams) {
  const raw = searchParams.get("limit");
  if (!raw) return DEFAULT_LIMIT;
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

async function getCached(homeTeamId, awayTeamId, dbQuery = query) {
  const pair = normalizeH2HPair(homeTeamId, awayTeamId);

  const result = await dbQuery(
    `select payload as data, fetched_at
     from cache.fixtures_head_to_head_raw
     where home_team_id = $1 and away_team_id = $2
     order by fetched_at desc
     limit 1`,
    [pair.home_team_id, pair.away_team_id]
  );

  return result.rows[0] ?? null;
}

async function refresh(homeTeamId, awayTeamId, limit, dbQuery = query) {
  const pair = normalizeH2HPair(homeTeamId, awayTeamId);

  const syncResult = await dbQuery(
    `insert into cache.sync_runs (target_table, scope_key, status)
     values ($1, $2, 'running') returning id`,
    ["fixtures_head_to_head_raw", `h2h:${pair.home_team_id}:${pair.away_team_id}`]
  );

  const syncId = syncResult.rows[0]?.id;
  if (!syncId) throw new Error("Failed to create sync run");

  try {
    const pages = await fetchAllSportMonksPages(
      `fixtures/head-to-head/${homeTeamId}/${awayTeamId}`,
      {
        include: INCLUDE,
        per_page: Math.min(limit, 50),
        sortBy: "starting_at",
        order: "desc",
      }
    );

    for (const page of pages) {
      await dbQuery(
        `insert into cache.fixtures_head_to_head_raw
           (home_team_id, away_team_id, page_number, payload, pagination, fetched_at, sync_run_id)
         values ($1, $2, $3, $4::jsonb, $5::jsonb, now(), $6)
         on conflict (home_team_id, away_team_id, page_number) do update set
           payload     = excluded.payload,
           pagination  = excluded.pagination,
           fetched_at  = excluded.fetched_at,
           sync_run_id = excluded.sync_run_id,
           updated_at  = now()`,
        [
          pair.home_team_id,
          pair.away_team_id,
          page.page_number,
          JSON.stringify(page.payload),
          JSON.stringify(page.pagination),
          syncId,
        ]
      );
    }

    await dbQuery(
      `delete from cache.fixtures_head_to_head_raw
       where home_team_id = $1
         and away_team_id = $2
         and page_number > $3`,
      [pair.home_team_id, pair.away_team_id, pages.length]
    );

    await dbQuery(
      `select cache.rebuild_h2h_index($1, $2)`,
      [pair.home_team_id, pair.away_team_id]
    );

    await dbQuery(
      `update cache.sync_runs
       set status = 'done', finished_at = now()
       where id = $1`,
      [syncId]
    );
  } catch (err) {
    await dbQuery(
      `update cache.sync_runs
       set status = 'failed', notes = $1, finished_at = now()
       where id = $2`,
      [err.message?.slice(0, 4000), syncId]
    );
    throw err;
  }
}

export async function POST(request, context) {
  if (!isAuthorized(request)) return unauthorized();

  const { homeTeamId, awayTeamId } = await context.params;
  if (!/^\d+$/.test(String(homeTeamId)) || !/^\d+$/.test(String(awayTeamId))) {
    return NextResponse.json({ ok: false, error: "Invalid team IDs" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams);
  const refreshMode = parseRefreshMode(searchParams, "swr");
  const pair = normalizeH2HPair(Number(homeTeamId), Number(awayTeamId));

  try {
    const result = await staleWhileRevalidate({
      type: "fixtures_h2h",
      getCached: (dbQuery) =>
        getCached(Number(homeTeamId), Number(awayTeamId), dbQuery),
      refresh: (dbQuery) =>
        refresh(Number(homeTeamId), Number(awayTeamId), limit, dbQuery),
      mode: refreshMode,
      lockKey: `sync:h2h:${pair.home_team_id}:${pair.away_team_id}`,
    });

    return NextResponse.json({
      ok: true,
      requested_pair: {
        home_team_id: Number(homeTeamId),
        away_team_id: Number(awayTeamId),
      },
      normalized_pair: {
        home_team_id: pair.home_team_id,
        away_team_id: pair.away_team_id,
      },
      source: result.source,
      stale: result.stale,
      synced: true,
      requested_limit: limit,
      refresh_mode: result.mode,
      freshness: result.freshness,
      refresh: result.refresh,
      next: {
        read_from: `/api/admin/index/h2h/${homeTeamId}/${awayTeamId}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}