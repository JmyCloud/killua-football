import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized, unauthorized } from "@/lib/admin";
import {
  normalizeWatchlistMode,
  normalizePriority,
  normalizeBoolean,
  normalizeNullableTimestamp,
  normalizeMetadata,
} from "@/lib/watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, context) {
  if (!isAuthorized(request)) return unauthorized();

  const { fixtureId } = await context.params;
  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json({ ok: false, error: "Invalid fixtureId" }, { status: 400 });
  }

  try {
    const result = await query(
      `select * from cache.fixture_watchlist where fixture_id = $1`,
      [Number(fixtureId)]
    );

    const row = result.rows[0];
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "Watchlist item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: row });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request, context) {
  if (!isAuthorized(request)) return unauthorized();

  const { fixtureId } = await context.params;
  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json({ ok: false, error: "Invalid fixtureId" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(fixtureId);

    const existing = await query(
      `select * from cache.fixture_watchlist where fixture_id = $1`,
      [id]
    );

    if (!existing.rows[0]) {
      return NextResponse.json(
        { ok: false, error: "Watchlist item not found" },
        { status: 404 }
      );
    }

    const current = existing.rows[0];

    const next = {
      mode: body.mode !== undefined ? normalizeWatchlistMode(body.mode, current.mode) : current.mode,
      priority: body.priority !== undefined ? normalizePriority(body.priority, current.priority) : current.priority,
      enabled: body.enabled !== undefined ? normalizeBoolean(body.enabled, current.enabled) : current.enabled,
      starts_at: body.starts_at !== undefined ? normalizeNullableTimestamp(body.starts_at) : current.starts_at,
      expires_at: body.expires_at !== undefined ? normalizeNullableTimestamp(body.expires_at) : current.expires_at,
      notes: body.notes !== undefined ? (body.notes != null ? String(body.notes) : null) : current.notes,
      metadata: body.metadata !== undefined ? normalizeMetadata(body.metadata) : current.metadata,
    };

    const result = await query(
      `
      update cache.fixture_watchlist
      set
        mode = $2,
        priority = $3,
        enabled = $4,
        starts_at = $5,
        expires_at = $6,
        notes = $7,
        metadata = $8::jsonb,
        updated_at = now()
      where fixture_id = $1
      returning *
      `,
      [
        id,
        next.mode,
        next.priority,
        next.enabled,
        next.starts_at,
        next.expires_at,
        next.notes,
        JSON.stringify(next.metadata),
      ]
    );

    return NextResponse.json({ ok: true, data: result.rows[0] });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request, context) {
  if (!isAuthorized(request)) return unauthorized();

  const { fixtureId } = await context.params;
  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json({ ok: false, error: "Invalid fixtureId" }, { status: 400 });
  }

  try {
    const result = await query(
      `delete from cache.fixture_watchlist where fixture_id = $1 returning fixture_id`,
      [Number(fixtureId)]
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { ok: false, error: "Watchlist item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      deleted_fixture_id: Number(fixtureId),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}