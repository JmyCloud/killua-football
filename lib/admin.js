// lib/admin.js
import { NextResponse } from "next/server";

export function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");

  if (!expected) {
    throw new Error("Missing PROXY_SHARED_SECRET");
  }

  return provided === expected;
}

export function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401 }
  );
}

export function buildAdminUrl(request, path) {
  return new URL(`/api/admin${path}`, request.url).toString();
}

export async function adminJson(request, path, init = {}) {
  const url = buildAdminUrl(request, path);

  const response = await fetch(url, {
    ...init,
    method: init.method ?? "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "x-admin-secret": process.env.PROXY_SHARED_SECRET,
      ...(init.headers ?? {}),
    },
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}