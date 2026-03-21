import { NextResponse } from "next/server";
import { adminJson } from "@/lib/admin";
import { tryWithAdvisoryLock } from "@/lib/locks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCronAuthorized(request) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization");
  return Boolean(expected) && provided === `Bearer ${expected}`;
}

export async function GET(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const lockKey = "cron:maintenance";

  const lock = await tryWithAdvisoryLock(lockKey, async () => {
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
  });

  if (!lock.locked) {
    return NextResponse.json(
      { ok: false, error: "Maintenance already running" },
      { status: 409 }
    );
  }

  return lock.value;
}