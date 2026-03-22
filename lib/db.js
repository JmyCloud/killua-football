import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL");
}

const globalForPg = globalThis;

function createPool() {
  const parsedMax = Number.parseInt(process.env.PG_POOL_MAX ?? "5", 10);

  return new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
    max:
      Number.isInteger(parsedMax) && parsedMax > 0
        ? Math.min(parsedMax, 10)
        : 5,
    min: 0,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 30000,
    allowExitOnIdle: true,
    maxUses: 7500,
  });
}

export const pool = globalForPg.__killuaPgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForPg.__killuaPgPool = pool;
}

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withDbClient(worker) {
  const client = await pool.connect();

  try {
    return await worker(client);
  } finally {
    client.release();
  }
}