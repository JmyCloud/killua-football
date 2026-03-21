import { withDbClient } from "@/lib/db";

export async function tryWithAdvisoryLock(lockKey, worker) {
  return withDbClient(async (client) => {
    const dbQuery = (text, params = []) => client.query(text, params);

    const lockResult = await dbQuery(
      `select pg_try_advisory_lock(hashtextextended($1, 0)) as locked`,
      [lockKey]
    );

    if (!lockResult.rows[0]?.locked) {
      return { locked: false, value: null };
    }

    try {
      const value = await worker(dbQuery, client);
      return { locked: true, value };
    } finally {
      await dbQuery(
        `select pg_advisory_unlock(hashtextextended($1, 0))`,
        [lockKey]
      ).catch(() => {});
    }
  });
}