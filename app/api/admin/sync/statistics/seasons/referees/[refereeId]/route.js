import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchAllSportMonksPages } from "@/lib/sportmonks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INCLUDE = "season;referee";

function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");

  if (!expected) {
    throw new Error("Missing PROXY_SHARED_SECRET");
  }

  return provided === expected;
}

async function startSync(refereeId) {
  const result = await query(
    `select cache.start_sync($1, $2) as sync_id`,
    [
      "statistics_seasons_referees_raw",
      `referee:${refereeId}`,
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

async function finishSync(refereeId, syncId) {
  await query(
    `select cache.finish_sync_referee_stats($1, $2)`,
    [refereeId, syncId]
  );
}

async function upsertRefereeStatsPage(syncId, refereeId, page) {
  await query(
    `
    insert into cache.statistics_seasons_referees_raw (
      referee_id,
      page_number,
      payload,
      pagination,
      fetched_at,
      sync_run_id
    )
    values ($1, $2, $3::jsonb, $4::jsonb, now(), $5)
    on conflict (referee_id, page_number)
    do update set
      payload = excluded.payload,
      pagination = excluded.pagination,
      fetched_at = excluded.fetched_at,
      sync_run_id = excluded.sync_run_id,
      updated_at = now()
    `,
    [
      refereeId,
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

  const { refereeId } = await context.params;

  if (!/^\d+$/.test(String(refereeId))) {
    return NextResponse.json(
      { ok: false, error: "Invalid refereeId" },
      { status: 400 }
    );
  }

  let syncId = null;

  try {
    syncId = await startSync(refereeId);

    if (!syncId) {
      throw new Error("Failed to create sync run");
    }

    const pages = await fetchAllSportMonksPages(
      `statistics/seasons/referees/${refereeId}`,
      {
        include: INCLUDE,
        per_page: 50,
        page: 1,
      }
    );

    for (const page of pages) {
      await upsertRefereeStatsPage(syncId, Number(refereeId), page);
    }

    await finishSync(Number(refereeId), syncId);

    const totalRows = pages.reduce((sum, page) => {
      const count = Array.isArray(page?.payload?.data)
        ? page.payload.data.length
        : 0;
      return sum + count;
    }, 0);

    return NextResponse.json({
      ok: true,
      endpoint: `/statistics/seasons/referees/${refereeId}`,
      referee_id: Number(refereeId),
      sync_run_id: syncId,
      includes_used: INCLUDE,
      pages_saved: pages.length,
      total_rows_saved: totalRows,
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