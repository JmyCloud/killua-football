import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized, unauthorized } from "@/lib/admin";
import {
  normalizeWatchlistItem,
  parsePositiveInt,
  normalizeWatchlistMode,
} from "@/lib/watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);

    const limit = parsePositiveInt(searchParams.get("limit"), 100, 500);
    const enabledRaw = searchParams.get("enabled");
    const modeRaw = searchParams.get("mode");

    const filters = [];
    const values = [];
    let i = 1;

    if (enabledRaw === "true" || enabledRaw === "false") {
      filters.push(`enabled = $${i++}`);
      values.push(enabledRaw === "true");
    }

    if (modeRaw) {
      filters.push(`mode = $${i++}`);
      values.push(normalizeWatchlistMode(modeRaw, "auto"));
    }

    const whereClause = filters.length ? `where ${filters.join(" and ")}` : "";

    const result = await query(
      `
      select
        fixture_id,
        mode,
        priority,
        enabled,
        starts_at,
        expires_at,
        notes,
        metadata,
        last_warmed_at,
        last_warm_status,
        last_warm_error,
        last_match_is_live_like,
        created_at,
        updated_at
      from cache.fixture_watchlist
      ${whereClause}
      order by priority asc, starts_at asc nulls last, fixture_id asc
      limit $${i}
      `,
      [...values, limit]
    );

    return NextResponse.json({
      ok: true,
      total_returned: result.rows.length,
      data: result.rows,
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
    const body = await request.json().catch(() => ({}));

    const rawItems = Array.isArray(body?.items)
      ? body.items
      : body?.fixture_id
        ? [body]
        : [];

    if (!rawItems.length) {
      return NextResponse.json(
        { ok: false, error: "Provide fixture_id or items[]" },
        { status: 400 }
      );
    }

    const items = rawItems.map(normalizeWatchlistItem);

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
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
        on conflict (fixture_id) do update set
          mode = excluded.mode,
          priority = excluded.priority,
          enabled = excluded.enabled,
          starts_at = excluded.starts_at,
          expires_at = excluded.expires_at,
          notes = excluded.notes,
          metadata = excluded.metadata,
          updated_at = now()
        returning *
        `,
        [
          item.fixture_id,
          item.mode,
          item.priority,
          item.enabled,
          item.starts_at,
          item.expires_at,
          item.notes,
          JSON.stringify(item.metadata),
        ]
      );

      saved.push(result.rows[0]);
    }

    return NextResponse.json({
      ok: true,
      total_saved: saved.length,
      data: saved,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}