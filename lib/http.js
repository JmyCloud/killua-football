import { NextResponse } from "next/server";
import { getHeaderToken, safeEqualString } from "@/lib/http";

export function isGptAuthorized(request) {
  const expected = process.env.GPT_SHARED_SECRET;
  if (!expected) {
    throw new Error("Missing GPT_SHARED_SECRET");
  }

  const provided = getHeaderToken(request, ["x-gpt-secret", "x-api-key"]);
  return safeEqualString(expected, provided);
}

export function gptUnauthorized(requestId = "") {
  return NextResponse.json(
    {
      ok: false,
      ...(requestId ? { request_id: requestId } : {}),
      error: "Unauthorized",
      code: "unauthorized",
    },
    {
      status: 401,
      headers: {
        ...(requestId ? { "x-request-id": requestId } : {}),
        "cache-control": "no-store",
      },
    }
  );
}