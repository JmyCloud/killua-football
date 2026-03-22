// lib/route-handler.js
// Shared route handler wrappers for consistent error handling

import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin";
import { logger } from "@/lib/logger";

/**
 * Wraps an admin route handler with auth check and error handling.
 * Usage:
 *   export const GET = adminHandler(async (request, context) => { ... });
 */
export function adminHandler(handler) {
  return async function (request, context) {
    if (!isAuthorized(request)) return unauthorized();

    try {
      return await handler(request, context);
    } catch (error) {
      const url = new URL(request.url);
      logger.exception("Unhandled route error", error, {
        path: url.pathname,
        method: request.method,
      });
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Internal server error" },
        { status: 500 }
      );
    }
  };
}
