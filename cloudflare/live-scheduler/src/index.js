import { DurableObject } from "cloudflare:workers";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getControlToken(request) {
  const auth = request.headers.get("authorization") || "";
  if (/^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }
  return (request.headers.get("x-control-token") || "").trim();
}

function isAuthorized(request, env) {
  const expected = String(env.CONTROL_TOKEN || "").trim();
  if (!expected) return false;
  const provided = getControlToken(request);
  if (!provided) return false;
  if (expected.length !== provided.length) return false;

  const enc = new TextEncoder();
  const a = enc.encode(expected);
  const b = enc.encode(provided);

  // constant-time comparison
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function readJsonSafe(response) {
  const raw = await response.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function hitVercel(env) {
  const url = new URL("/api/admin/jobs/discovery/live-booster", env.TARGET_BASE_URL);

  url.searchParams.set("limit", String(env.TARGET_LIMIT || "10"));
  url.searchParams.set("concurrency", String(env.TARGET_CONCURRENCY || "2"));
  url.searchParams.set("h2h_limit", String(env.TARGET_H2H_LIMIT || "5"));
  url.searchParams.set(
    "fallback_inplay",
    String(env.TARGET_FALLBACK_INPLAY || "true")
  );

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "accept": "application/json",
      "x-admin-secret": String(env.TARGET_ADMIN_SECRET || "")
    }
  });

  const body = await readJsonSafe(response);

  if (!response.ok) {
    throw new Error(body?.error || `HTTP ${response.status}`);
  }

  return body;
}

async function hitVercelCron(env, path) {
  const cronSecret = String(env.TARGET_CRON_SECRET || "").trim();
  if (!cronSecret) throw new Error("Missing TARGET_CRON_SECRET");

  const url = new URL(path, env.TARGET_BASE_URL);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "accept": "application/json",
      "authorization": `Bearer ${cronSecret}`
    }
  });

  const body = await readJsonSafe(response);

  if (!response.ok) {
    throw new Error(body?.error || `HTTP ${response.status}`);
  }

  return body;
}

const WATCHLIST_INTERVAL_HOURS = 4;
const MAINTENANCE_INTERVAL_HOURS = 24;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "killua-live-scheduler" });
    }

    if (!isAuthorized(request, env)) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const stub = env.LIVE_LOOP.getByName("singleton");
    return stub.fetch(request);
  },

  async scheduled(event, env, ctx) {
    const nowHour = new Date(event.scheduledTime).getUTCHours();
    const results = {};

    if (nowHour % WATCHLIST_INTERVAL_HOURS === 0) {
      try {
        results.watchlist = await hitVercelCron(env, "/api/cron/watchlist");
      } catch (err) {
        results.watchlist = { ok: false, error: err?.message ?? "Unknown" };
        console.error("[cron] watchlist failed:", err?.message);
      }
    }

    if (nowHour % MAINTENANCE_INTERVAL_HOURS === 0) {
      try {
        results.maintenance = await hitVercelCron(env, "/api/cron/maintenance");
      } catch (err) {
        results.maintenance = { ok: false, error: err?.message ?? "Unknown" };
        console.error("[cron] maintenance failed:", err?.message);
      }
    }

    if (Object.keys(results).length > 0) {
      console.log("[cron] scheduled results:", JSON.stringify(results));
    }
  }
};

export class LiveLoop extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.storage = ctx.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/status") {
      return this.handleStatus();
    }

    if (method === "POST" && path === "/start") {
      return this.handleStart(url);
    }

    if (method === "POST" && path === "/stop") {
      return this.handleStop();
    }

    if (method === "POST" && path === "/run-once") {
      return this.handleRunOnce("manual");
    }

    return json({ ok: false, error: "Not found" }, 404);
  }

  async handleStart(url) {
    const current = await this.storage.get("running");
    const currentInterval = await this.storage.get("interval_ms");

    const intervalMs = clampInt(
      url.searchParams.get("interval_ms") ?? currentInterval ?? this.env.LOOP_INTERVAL_MS,
      8000,
      5000,
      60000
    );

    await this.storage.put("running", true);
    await this.storage.put("interval_ms", intervalMs);
    await this.storage.put("started_at", new Date().toISOString());

    const existingAlarm = await this.storage.getAlarm();
    if (existingAlarm == null) {
      await this.storage.setAlarm(Date.now() + 1000);
    }

    return this.handleStatus();
  }

  async handleStop() {
    await this.storage.put("running", false);
    await this.storage.deleteAlarm();

    return this.handleStatus();
  }

  async handleRunOnce(trigger) {
    const started = Date.now();
    const nowIso = new Date().toISOString();

    try {
      const body = await hitVercel(this.env);

      const result = {
        ok: true,
        trigger,
        at: nowIso,
        took_ms: Date.now() - started,
        source: body?.source?.selected_source ?? null,
        summary: body?.summary ?? null
      };

      await this.storage.put("last_run_at", nowIso);
      await this.storage.put("last_ok_at", nowIso);
      await this.storage.put("last_error", null);
      await this.storage.put("last_result", result);

      return json(result);
    } catch (error) {
      const result = {
        ok: false,
        trigger,
        at: nowIso,
        took_ms: Date.now() - started,
        error: error?.message ?? "Unknown error"
      };

      await this.storage.put("last_run_at", nowIso);
      await this.storage.put("last_error", result);
      await this.storage.put("last_result", result);

      return json(result, 500);
    }
  }

  async handleStatus() {
    const [
      running,
      intervalMs,
      startedAt,
      lastRunAt,
      lastOkAt,
      lastError,
      lastResult,
      nextAlarm
    ] = await Promise.all([
      this.storage.get("running"),
      this.storage.get("interval_ms"),
      this.storage.get("started_at"),
      this.storage.get("last_run_at"),
      this.storage.get("last_ok_at"),
      this.storage.get("last_error"),
      this.storage.get("last_result"),
      this.storage.getAlarm()
    ]);

    return json({
      ok: true,
      running: Boolean(running),
      interval_ms: intervalMs ?? Number(this.env.LOOP_INTERVAL_MS || 8000),
      started_at: startedAt ?? null,
      next_alarm_at: nextAlarm ? new Date(nextAlarm).toISOString() : null,
      last_run_at: lastRunAt ?? null,
      last_ok_at: lastOkAt ?? null,
      last_error: lastError ?? null,
      last_result: lastResult ?? null
    });
  }

  async alarm() {
    const running = await this.storage.get("running");
    const intervalMs = clampInt(
      await this.storage.get("interval_ms"),
      Number(this.env.LOOP_INTERVAL_MS || 8000),
      5000,
      60000
    );

    if (!running) {
      return;
    }

    try {
      await this.handleRunOnce("alarm");
    } catch (error) {
      await this.storage.put("last_error", {
        ok: false,
        trigger: "alarm",
        at: new Date().toISOString(),
        error: error?.message ?? "Unknown error"
      });
    } finally {
      const stillRunning = await this.storage.get("running");
      if (stillRunning) {
        await this.storage.setAlarm(Date.now() + intervalMs);
      }
    }
  }
}