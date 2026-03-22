// lib/admin.js
import { NextResponse } from "next/server";
import { safeEqualString } from "@/lib/http";
import { logger } from "@/lib/logger";

export function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");

  if (!expected) {
    throw new Error("Missing PROXY_SHARED_SECRET");
  }

  return safeEqualString(expected, provided ?? "");
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(url, {
      ...init,
      method: init.method ?? "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "x-admin-secret": process.env.PROXY_SHARED_SECRET,
        "x-request-id": request.headers.get("x-request-id") || "",
        ...(init.headers ?? {}),
      },
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      logger.warn("adminJson non-ok response", {
        path,
        status: response.status,
        error: body?.error ?? null,
      });
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  } catch (err) {
    if (err?.name === "AbortError") {
      logger.error("adminJson timeout", { path, timeout_ms: 25000 });
      throw new Error(`adminJson timeout after 25s: ${path}`);
    }
    logger.exception("adminJson fetch failed", err, { path });
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}