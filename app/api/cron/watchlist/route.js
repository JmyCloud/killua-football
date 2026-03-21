import { NextResponse } from "next/server";
import { adminJson } from "@/lib/admin";
import { tryWithAdvisoryLock } from "@/lib/locks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const DEFAULT_LOOKAHEAD_HOURS = 36;
const DEFAULT_LOOKBACK_HOURS = 6;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_H2H_LIMIT = 5;

function isCronAuthorized(request) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization");
  return Boolean(expected) && provided === `Bearer ${expected}`;
}

function intParam(searchParams, key, fallback, max) {
  const raw = parseInt(searchParams.get(key) ?? "", 10);
  if (!Number.isInteger(raw) || raw < 1) return fallback;
  return Math.min(raw, max);
}

export async function GET(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const lockKey = "cron:watchlist";

  const lock = await tryWithAdvisoryLock(lockKey, async () => {
    const { searchParams } = new URL(request.url);

    const limit = intParam(searchParams, "limit", DEFAULT_LIMIT, 100);
    const lookaheadHours = intParam(searchParams, "lookahead_hours", DEFAULT_LOOKAHEAD_HOURS, 168);
    const lookbackHours = intParam(searchParams, "lookback_hours", DEFAULT_LOOKBACK_HOURS, 72);
    const concurrency = intParam(searchParams, "concurrency", DEFAULT_CONCURRENCY, 5);
    const h2hLimit = intParam(searchParams, "h2h_limit", DEFAULT_H2H_LIMIT, 20);

    const discovery = await adminJson(
      request,
      `/jobs/discovery/watchlist?limit=${limit}&lookahead_hours=${lookaheadHours}&lookback_hours=${lookbackHours}`,
      { method: "POST" }
    );

    if (!discovery.ok) {
      return NextResponse.json(
        {
          ok: false,
          step: "discovery",
          status: discovery.status,
          error: discovery.body?.error ?? "Discovery failed",
          body: discovery.body ?? null,
        },
        { status: discovery.status || 500 }
      );
    }

    const warm = await adminJson(
      request,
      `/jobs/warm/watchlist?limit=${limit}&concurrency=${concurrency}&h2h_limit=${h2hLimit}&lookahead_hours=${lookaheadHours}&lookback_hours=${lookbackHours}`,
      { method: "POST" }
    );

    return NextResponse.json(
      {
        ok: warm.ok,
        strategy: {
          limit,
          lookahead_hours: lookaheadHours,
          lookback_hours: lookbackHours,
          concurrency,
          h2h_limit: h2hLimit,
        },
        discovery: {
          status: discovery.status,
          summary: discovery.body?.summary ?? null,
        },
        warm: {
          status: warm.status,
          summary: warm.body?.summary ?? null,
        },
      },
      { status: warm.ok ? 200 : warm.status || 500 }
    );
  });

  if (!lock.locked) {
    return NextResponse.json(
      { ok: false, error: "Cron already running" },
      { status: 409 }
    );
  }

  return lock.value;
}