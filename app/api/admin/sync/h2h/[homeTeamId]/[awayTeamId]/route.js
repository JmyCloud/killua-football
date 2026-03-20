import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchAllSportMonksPages } from "@/lib/sportmonks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INCLUDE =
  "league;season;stage;round;group;aggregate;venue;state;participants;scores.type;events.type;statistics.type;referees.referee;referees.type";

function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");

  if (!expected) {
    throw new Error("Missing PROXY_SHARED_SECRET");
  }

  return provided === expected;
}

async function startSync(homeTeamId, awayTeamId) {
  const result = await query(
    `select cache.start_sync($1, $2) as sync_id`,
    [
      "fixtures_head_to_head_raw",
      `home:${homeTeamId}:away:${awayTeamId}`,
    ]
  );

  return result.rows[0]?.sync_id;
}

async function markSyncFailed(syncId, errorMessage) {
  if (!syncId) return;

  await query(
    `select cache.mark_sync_failed($1, $2)`,
    [syncId, errorMessage?.slice(0, 4000) ?? "Unknown sync error"]
  );
}

async function finishSync(homeTeamId, awayTeamId, syncId) {
  await query(
    `select cache.finish_sync_h2h($1, $2, $3)`,
    [homeTeamId, awayTeamId, syncId]
  );
}

async function upsertH2HPage(syncId, homeTeamId, awayTeamId, page) {
  await query(
    `
    insert into cache.fixtures_head_to_head_raw (
      home_team_id,
      away_team_id,
      page_number,
      payload,
      pagination,
      fetched_at,
      sync_run_id
    )
    values ($1, $2, $3, $4::jsonb, $5::jsonb, now(), $6)
    on conflict (home_team_id, away_team_id, page_number)
    do update set
      payload = excluded.payload,
      pagination = excluded.pagination,
      fetched_at = excluded.fetched_at,
      sync_run_id = excluded.sync_run_id,
      updated_at = now()
    `,
    [
      homeTeamId,
      awayTeamId,
      page.page_number,
      JSON.stringify(page.payload),
      JSON.stringify(page.pagination),
      syncId,
    ]
  );
}

export async function POST(request, context) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { homeTeamId, awayTeamId } = await context.params;

  if (!/^\d+$/.test(String(homeTeamId))) {
    return NextResponse.json(
      { ok: false, error: "Invalid homeTeamId" },
      { status: 400 }
    );
  }

  if (!/^\d+$/.test(String(awayTeamId))) {
    return NextResponse.json(
      { ok: false, error: "Invalid awayTeamId" },
      { status: 400 }
    );
  }

  let syncId = null;

  try {
    syncId = await startSync(homeTeamId, awayTeamId);

    if (!syncId) {
      throw new Error("Failed to create sync run");
    }

    const pages = await fetchAllSportMonksPages(
      `fixtures/head-to-head/${homeTeamId}/${awayTeamId}`,
      {
        include: INCLUDE,
        per_page: 50,
        page: 1,
      }
    );

    for (const page of pages) {
      await upsertH2HPage(
        syncId,
        Number(homeTeamId),
        Number(awayTeamId),
        page
      );
    }

    await finishSync(Number(homeTeamId), Number(awayTeamId), syncId);

    const totalFixtures = pages.reduce((sum, page) => {
      const count = Array.isArray(page?.payload?.data)
        ? page.payload.data.length
        : 0;
      return sum + count;
    }, 0);

    return NextResponse.json({
      ok: true,
      endpoint: `/fixtures/head-to-head/${homeTeamId}/${awayTeamId}`,
      home_team_id: Number(homeTeamId),
      away_team_id: Number(awayTeamId),
      sync_run_id: syncId,
      includes_used: INCLUDE,
      pages_saved: pages.length,
      total_fixtures_saved: totalFixtures,
    });
  } catch (error) {
    await markSyncFailed(syncId, error.message);

    return NextResponse.json(
      {
        ok: false,
        error: error.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}