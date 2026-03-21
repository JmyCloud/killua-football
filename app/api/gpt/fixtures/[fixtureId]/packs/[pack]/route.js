import { NextResponse } from "next/server";
import { adminJson } from "@/lib/admin";
import { isGptAuthorized, gptUnauthorized } from "@/lib/gpt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, context) {
  if (!isGptAuthorized(request)) return gptUnauthorized();

  const { fixtureId, pack } = await context.params;

  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json(
      { ok: false, error: "Invalid fixtureId" },
      { status: 400 }
    );
  }

  if (!pack || typeof pack !== "string") {
    return NextResponse.json(
      { ok: false, error: "Invalid pack" },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const qs = url.searchParams.toString();

  const result = await adminJson(
    request,
    `/analysis/fixtures/${fixtureId}/packs/${pack}${qs ? `?${qs}` : ""}`
  );

  return NextResponse.json(
    result.body ?? { ok: result.ok },
    { status: result.status || (result.ok ? 200 : 500) }
  );
}