import { NextResponse } from "next/server";
import { adminJson } from "@/lib/admin";
import { isGptAuthorized, gptUnauthorized } from "@/lib/gpt";
import { GPT_READ_MODES, isValidGptPack } from "@/lib/gpt-contract";
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

export async function GET(request, context) {
  const requestId = getRequestId(request);
  if (!isGptAuthorized(request)) return gptUnauthorized(requestId);

  const { fixtureId: rawFixtureId, pack: rawPack } = await context.params;
  const fixtureId = parseFixtureId(rawFixtureId);
  const pack = String(rawPack ?? "");

  if (!fixtureId) {
    return jsonError(requestId, 400, "Invalid fixtureId", "invalid_fixture_id");
  }

  if (!isValidGptPack(pack)) {
    return jsonError(requestId, 400, "Invalid pack", "invalid_pack");
  }

  const url = new URL(request.url);
  const limit = parsePositiveIntParam(url.searchParams.get("limit"), 5, 1, 20);
  const readMode = parseEnumParam(url.searchParams.get("read_mode"), GPT_READ_MODES, "full");
  const page = parsePositiveIntParam(url.searchParams.get("page"), 1, 1, 9999);
  const pageSizeRaw = url.searchParams.get("page_size");
  const pageSize =
    pageSizeRaw == null || pageSizeRaw === ""
      ? null
      : parsePositiveIntParam(pageSizeRaw, 25, 1, 400);

  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  qs.set("read_mode", readMode);
  qs.set("page", String(page));
  if (pageSize != null) qs.set("page_size", String(pageSize));

  try {
    const result = await adminJson(
      request,
      `/analysis/fixtures/${fixtureId}/packs/${pack}?${qs.toString()}`
    );

    if (!result.ok) {
      return jsonError(
        requestId,
        result.status || 500,
        result.body?.error || "Pack read failed",
        "pack_failed"
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
      "Pack read failed",
      "pack_failed",
      error?.message ?? null
    );
  }
}