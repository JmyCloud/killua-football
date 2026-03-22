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

  try {
    const result = await adminJson(request, `/analysis/fixtures/${fixtureId}/manifest`);

    if (!result.ok) {
      return jsonError(
        requestId,
        result.status || 500,
        result.body?.error || "Manifest failed",
        "manifest_failed"
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
      "Manifest failed",
      "manifest_failed",
      error?.message ?? null
    );
  }
}