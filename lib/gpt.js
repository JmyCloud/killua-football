import { NextResponse } from "next/server";

function extractToken(request) {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (/^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, "").trim();
  }

  return (
    request.headers.get("x-gpt-secret") ??
    request.headers.get("x-api-key") ??
    ""
  ).trim();
}

export function isGptAuthorized(request) {
  const expected = process.env.GPT_SHARED_SECRET;
  if (!expected) {
    throw new Error("Missing GPT_SHARED_SECRET");
  }

  return extractToken(request) === expected;
}

export function gptUnauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401 }
  );
}