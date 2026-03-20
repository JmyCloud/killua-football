import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL");
}

const globalForPg = globalThis;

export const pool =
  globalForPg.__killuaPgPool ??
  new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    },
    max: 3
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.__killuaPgPool = pool;
}

export async function query(text, params = []) {
  return pool.query(text, params);
}