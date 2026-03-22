import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {};
  let allOk = true;

  // DB connectivity check
  try {
    const start = Date.now();
    const result = await pool.query("select 1 as ping");
    checks.database = {
      ok: result.rows[0]?.ping === 1,
      latency_ms: Date.now() - start,
    };
  } catch (err) {
    checks.database = { ok: false, error: err?.message ?? "Unknown" };
    allOk = false;
  }

  // Environment check
  const requiredEnvs = [
    "DATABASE_URL",
    "SPORTMONKS_API_KEY",
    "PROXY_SHARED_SECRET",
    "CRON_SECRET",
  ];
  const missingEnvs = requiredEnvs.filter((key) => !process.env[key]);
  checks.environment = {
    ok: missingEnvs.length === 0,
    missing: missingEnvs.length > 0 ? missingEnvs : undefined,
  };
  if (missingEnvs.length > 0) allOk = false;

  return NextResponse.json(
    {
      ok: allOk,
      service: "killua-football",
      time: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}