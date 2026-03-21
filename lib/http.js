import crypto from "node:crypto";
import { NextResponse } from "next/server";

export function getRequestId(request) {
  const headerValue = request.headers.get("x-request-id");
  if (headerValue && headerValue.trim()) {
    return headerValue.trim().slice(0, 100);
  }
  return crypto.randomUUID();
}

export function safeEqualString(expected, provided) {
  const a = Buffer.from(String(expected ?? ""), "utf8");
  const b = Buffer.from(String(provided ?? ""), "utf8");

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getHeaderToken(request, extraHeaders = []) {
  const auth = request.headers.get("authorization")?.trim() ?? "";

  if (/^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, "").trim();
  }

  for (const name of extraHeaders) {
    const value = request.headers.get(name)?.trim();
    if (value) return value;
  }

  return "";
}

export function jsonError(requestId, status, error, code = "error", details = null) {
  const body = {
    ok: false,
    request_id: requestId,
    error,
    code,
  };

  if (details && process.env.NODE_ENV !== "production") {
    body.details = details;
  }

  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
      "cache-control": "no-store",
    },
  });
}

export function parseFixtureId(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function parsePositiveIntParam(value, fallback, min, max) {
  if (value == null || value === "") return fallback;

  const n = Number.parseInt(String(value), 10);
  if (!Number.isInteger(n) || n < min) return fallback;

  return Math.min(n, max);
}

export function parseEnumParam(value, allowed, fallback) {
  if (!value) return fallback;
  return allowed.includes(value) ? value : fallback;
}