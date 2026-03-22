import { NextResponse } from "next/server";
import { adminJson } from "@/lib/admin";
import { isGptAuthorized, gptUnauthorized } from "@/lib/gpt";
import { getRequestId, jsonError, parseFixtureId } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request, context) {
  const requestId = getRequestId(request);
  if (!isGptAuthorized(request)) return gptUnauthorized(requestId);

  const { fixtureId: rawFixtureId } = await context.params;
  const fixtureId = parseFixtureId(rawFixtureId);

  if (!fixtureId) {
    return jsonError(requestId, 400, "Invalid fixtureId", "invalid_fixture_id");
  }

  const url = new URL(request.url);
  const marketIds = url.searchParams.get("market_ids") ?? "";
  const filter = url.searchParams.get("filter") ?? "";

  const qs = new URLSearchParams();
  if (marketIds) qs.set("market_ids", marketIds);
  if (filter) qs.set("filter", filter);

  try {
    const result = await adminJson(
      request,
      `/index/odds/pre-match/${fixtureId}?${qs.toString()}`
    );

    if (!result.ok) {
      return jsonError(
        requestId,
        result.status || 500,
        result.body?.error || "Prematch odds read failed",
        "prematch_odds_failed"
      );
    }

    return NextResponse.json(
      { ...(result.body ?? { ok: true }), request_id: requestId },
      {
        status: result.status || 200,
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      }
    );
  } catch (error) {
    return jsonError(
      requestId,
      500,
      "Prematch odds read failed",
      "prematch_odds_failed",
      error?.message ?? null
    );
  }
}