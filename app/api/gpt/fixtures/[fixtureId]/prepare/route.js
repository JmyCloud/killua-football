import { NextResponse } from "next/server";
import { adminJson } from "@/lib/admin";
import { isGptAuthorized, gptUnauthorized } from "@/lib/gpt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, context) {
  if (!isGptAuthorized(request)) return gptUnauthorized();

  const { fixtureId } = await context.params;
  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json(
      { ok: false, error: "Invalid fixtureId" },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  const path = `/sync/analysis/fixtures/${fixtureId}${qs ? `?${qs}` : ""}`;

  const result = await adminJson(request, path, { method: "POST" });

  return NextResponse.json(
    result.body ?? { ok: result.ok },
    { status: result.status || (result.ok ? 200 : 500) }
  );
}