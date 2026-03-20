import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchAllSportMonksPages } from "@/lib/sportmonks";
import { staleWhileRevalidate } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INCLUDE =
  "league;season;stage;round;group;aggregate;venue;state;participants;scores.type;events.type;statistics.type;referees.referee;referees.type";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT     = 50;

function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");
  if (!expected) throw new Error("Missing PROXY_SHARED_SECRET");
  return provided === expected;
}

// ─── parse ?limit=N ───────────────────────────────────────────────────────────
function parseLimit(searchParams) {
  const raw = searchParams.get("limit");
  if (!raw) return DEFAULT_LIMIT;
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

// ─── فلترة أحدث N مباراة من كل الـ pages ─────────────────────────────────────
function applyLimit(cachedData, limit) {
  // cachedData هو payload كامل من Supabase (page واحدة أو أكثر محتملة)
  const raw = cachedData?.data ?? cachedData;

  // لو فيه data array مباشرة
  const matches = Array.isArray(raw?.data) ? raw.data : [];

  // البيانات جاية مرتبة desc من SportMonks → أخد أول N فقط
  const sliced = matches.slice(0, limit);

  return {
    ...raw,
    data:  sliced,
    _meta: {
      total_available: matches.length,
      returned:        sliced.length,
      limit,
    },
  };
}

async function getCached(homeTeamId, awayTeamId) {
  const result = await query(
    `select payload as data, fetched_at
     from cache.fixtures_head_to_head_raw
     where home_team_id = $1 and away_team_id = $2
     order by fetched_at desc
     limit 1`,
    [homeTeamId, awayTeamId]
  );
  return result.rows[0] ?? null;
}

async function refresh(homeTeamId, awayTeamId) {
  const syncResult = await query(
    `insert into cache.sync_runs (target_table, scope_key, status)
     values ($1, $2, 'running') returning id`,
    ["fixtures_head_to_head_raw", `home:${homeTeamId}:away:${awayTeamId}`]
  );
  const syncId = syncResult.rows[0]?.id;
  if (!syncId) throw new Error("Failed to create sync run");

  try {
    const pages = await fetchAllSportMonksPages(
      `fixtures/head-to-head/${homeTeamId}/${awayTeamId}`,
      {
        include:  INCLUDE,
        per_page: 50,
        page:     1,
        sort:   "-starting_at",   // ← أحدث مباراة أولاً
        order:    "desc",
      }
    );

    for (const page of pages) {
      await query(
        `insert into cache.fixtures_head_to_head_raw
           (home_team_id, away_team_id, page_number, payload, pagination, fetched_at, sync_run_id)
         values ($1, $2, $3, $4::jsonb, $5::jsonb, now(), $6)
         on conflict (home_team_id, away_team_id, page_number) do update set
           payload     = excluded.payload,
           pagination  = excluded.pagination,
           fetched_at  = excluded.fetched_at,
           sync_run_id = excluded.sync_run_id,
           updated_at  = now()`,
        [homeTeamId, awayTeamId, page.page_number,
         JSON.stringify(page.payload), JSON.stringify(page.pagination), syncId]
      );
    }

    await query(
      `update cache.sync_runs set status = 'done', finished_at = now() where id = $1`,
      [syncId]
    );
  } catch (err) {
    await query(
      `update cache.sync_runs set status = 'failed', notes = $1, finished_at = now() where id = $2`,
      [err.message?.slice(0, 4000), syncId]
    );
    throw err;
  }
}

export async function POST(request, context) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { homeTeamId, awayTeamId } = await context.params;
  if (!/^\d+$/.test(String(homeTeamId)) || !/^\d+$/.test(String(awayTeamId))) {
    return NextResponse.json({ ok: false, error: "Invalid team IDs" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams);

  try {
    const result = await staleWhileRevalidate({
      type:      "fixtures_h2h",
      getCached: () => getCached(Number(homeTeamId), Number(awayTeamId)),
      refresh:   () => refresh(Number(homeTeamId), Number(awayTeamId)),
    });

    const data = applyLimit(result.data, limit);

    return NextResponse.json({
      ok:           true,
      home_team_id: Number(homeTeamId),
      away_team_id: Number(awayTeamId),
      source:       result.source,
      stale:        result.stale,
      limit,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
