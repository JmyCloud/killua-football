import { NextResponse } from "next/server";
import { adminJson } from "@/lib/admin";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCronAuthorized(request) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization");
  return Boolean(expected) && provided === `Bearer ${expected}`;
}

async function tryLock(lockKey) {
  const result = await query(
    `select pg_try_advisory_lock(hashtextextended($1, 0)) as locked`,
    [lockKey]
  );
  return result.rows[0]?.locked === true;
}

async function releaseLock(lockKey) {
  await query(
    `select pg_advisory_unlock(hashtextextended($1, 0))`,
    [lockKey]
  );
}

export async function GET(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const lockKey = "cron:maintenance";
  const locked = await tryLock(lockKey);

  if (!locked) {
    return NextResponse.json(
      { ok: false, error: "Maintenance already running" },
      { status: 409 }
    );
  }

  try {
    const cleanup = await adminJson(
      request,
      `/jobs/maintenance/cleanup`,
      { method: "POST" }
    );

    return NextResponse.json(
      {
        ok: cleanup.ok,
        cleanup: cleanup.body ?? null,
      },
      { status: cleanup.ok ? 200 : cleanup.status || 500 }
    );
  } finally {
    await releaseLock(lockKey);
  }
}