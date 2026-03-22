import { NextResponse } from "next/server";
import { adminJson } from "@/lib/admin";
import { tryWithAdvisoryLock } from "@/lib/locks";
import { isCronAuthorized, cronUnauthorized } from "@/lib/cron";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  if (!isCronAuthorized(request)) return cronUnauthorized();

  const lockKey = "cron:maintenance";

  const lock = await tryWithAdvisoryLock(lockKey, async () => {
    const cleanup = await adminJson(
      request,
      `/jobs/maintenance/cleanup`,
      { method: "POST" }
    );

    let oddsMarkets = { ok: false, skipped: true };
    try {
      const res = await adminJson(
        request,
        `/sync/odds-markets`,
        { method: "POST" }
      );
      oddsMarkets = { ok: res.ok, status: res.status, body: res.body ?? null };
    } catch (err) {
      logger.exception("Cron maintenance: odds-markets sync failed", err);
      oddsMarkets = { ok: false, error: err?.message ?? "Unknown" };
    }

    const allOk = cleanup.ok && oddsMarkets.ok;
    if (!allOk) {
      logger.warn("Cron maintenance: partial failure", {
        cleanup_ok: cleanup.ok,
        odds_markets_ok: oddsMarkets.ok,
      });
    }

    return NextResponse.json(
      {
        ok: allOk,
        cleanup: cleanup.body ?? null,
        odds_markets_sync: oddsMarkets,
      },
      { status: allOk ? 200 : cleanup.status || 500 }
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