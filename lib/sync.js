// lib/sync.js
// Shared helpers for sync route patterns

/**
 * Wraps a sync operation with automatic sync_run lifecycle management.
 *
 * Creates a sync_run record with status 'running', executes the task,
 * then marks it 'done' on success or 'failed' on error.
 *
 * @param {Function} dbQuery - Database query function (from advisory lock or global)
 * @param {string} targetTable - The cache table being synced
 * @param {string} scopeKey - Unique scope key for this sync run
 * @param {Function} task - async (syncId, dbQuery) => void
 * @returns {Promise<number>} The sync run ID
 */
export async function withSyncRun(dbQuery, targetTable, scopeKey, task) {
  const syncResult = await dbQuery(
    `insert into cache.sync_runs (target_table, scope_key, status)
     values ($1, $2, 'running') returning id`,
    [targetTable, scopeKey]
  );

  const syncId = syncResult.rows[0]?.id;
  if (!syncId) throw new Error("Failed to create sync run");

  try {
    await task(syncId, dbQuery);

    await dbQuery(
      `update cache.sync_runs
       set status = 'done', finished_at = now()
       where id = $1`,
      [syncId]
    );
  } catch (err) {
    await dbQuery(
      `update cache.sync_runs
       set status = 'failed', notes = $1, finished_at = now()
       where id = $2`,
      [err.message?.slice(0, 4000), syncId]
    );
    throw err;
  }

  return syncId;
}
