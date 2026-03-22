import { query } from "@/lib/db";

export async function tryWithAdvisoryLock(lockKey, worker) {
  // pg_advisory_lock is incompatible with Supabase Transaction Mode pooler
  // (port 6543). Advisory locks are session-level and leak server connections
  // in PgBouncer transaction mode. Instead, run the worker directly using
  // pool.query. Deduplication is handled by staleWhileRevalidate staleness
  // checks + the orchestrator concurrency limiter.
  const dbQuery = (text, params = []) => query(text, params);
  const value = await worker(dbQuery);
  return { locked: true, value };
}