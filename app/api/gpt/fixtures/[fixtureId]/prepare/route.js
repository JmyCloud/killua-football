import { NextResponse } from "next/server";
import { adminJson } from "@/lib/admin";
import { isGptAuthorized, gptUnauthorized } from "@/lib/gpt";
import {
  getRequestId,
  jsonError,
  parseEnumParam,
  parseFixtureId,
  parsePositiveIntParam,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request, context) {
  const requestId = getRequestId(request);
  if (!isGptAuthorized(request)) return gptUnauthorized(requestId);

  const { fixtureId: rawFixtureId } = await context.params;
  const fixtureId = parseFixtureId(rawFixtureId);

  if (!fixtureId) {
    return jsonError(requestId, 400, "Invalid fixtureId", "invalid_fixture_id");
  }

  const url = new URL(request.url);
  const h2hLimit = parsePositiveIntParam(url.searchParams.get("h2h_limit"), 5, 1, 20);
  const refreshMode = parseEnumParam(
    url.searchParams.get("refresh_mode"),
    ["swr", "fresh_if_stale", "force_fresh"],
    "fresh_if_stale"
  );
const liveRefreshMode = parseEnumParam(
  url.searchParams.get("live_refresh_mode"),
  ["swr", "fresh_if_stale", "force_fresh"],
  "fresh_if_stale"
);

  const qs = new URLSearchParams();
  qs.set("h2h_limit", String(h2hLimit));
  qs.set("refresh_mode", refreshMode);
  qs.set("live_refresh_mode", liveRefreshMode);

  try {
    const result = await adminJson(
      request,
      `/sync/analysis/fixtures/${fixtureId}?${qs.toString()}`,
      { method: "POST", timeout: 55000 }
    );

    if (!result.ok) {
      return jsonError(
        requestId,
        result.status || 500,
        result.body?.error || "Prepare failed",
        "prepare_failed"
      );
    }

    return NextResponse.json(
      {
        ...(result.body ?? { ok: true }),
        request_id: requestId,
      },
      {
        status: result.status || 200,
        headers: {
          "x-request-id": requestId,
          "cache-control": "no-store",
        },
      }
    );
  } catch (error) {
    return jsonError(
      requestId,
      500,
      "Prepare failed",
      "prepare_failed",
      error?.message ?? null
    );
  }
}