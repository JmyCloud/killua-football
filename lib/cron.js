// lib/cron.js
import { NextResponse } from "next/server";
import { safeEqualString, getHeaderToken } from "@/lib/http";

export function isCronAuthorized(request) {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    throw new Error("Missing CRON_SECRET");
  }

  const provided = getHeaderToken(request);
  return safeEqualString(expected, provided);
}

export function cronUnauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401 }
  );
}
