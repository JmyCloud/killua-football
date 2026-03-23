import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin";
import { buildDigest } from "@/lib/build-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request, context) {
  if (!isAuthorized(request)) return unauthorized();

  const { fixtureId } = await context.params;
  if (!/^\d+$/.test(String(fixtureId))) {
    return NextResponse.json({ ok: false, error: "Invalid fixtureId" }, { status: 400 });
  }

  try {
    const digest = await buildDigest(fixtureId);
    return NextResponse.json(digest, {
      headers: { "cache-control": "public, s-maxage=120, stale-while-revalidate=60" },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
