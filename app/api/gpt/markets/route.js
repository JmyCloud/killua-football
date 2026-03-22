import { NextResponse } from "next/server";
import { adminJson } from "@/lib/admin";
import { isGptAuthorized, gptUnauthorized } from "@/lib/gpt";
import { getRequestId, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const requestId = getRequestId(request);
  if (!isGptAuthorized(request)) return gptUnauthorized(requestId);

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";

  try {
    const result = await adminJson(
      request,
      `/markets?search=${encodeURIComponent(search)}`
    );

    if (!result.ok) {
      return jsonError(
        requestId,
        result.status || 500,
        result.body?.error || "Market search failed",
        "market_search_failed"
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
      "Market search failed",
      "market_search_failed",
      error?.message ?? null
    );
  }
}