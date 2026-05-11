import mysql, { type Pool } from "mysql2/promise";
import { env } from "./config.js";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      timezone: "Z",
      dateStrings: ["DATE"],
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/**
 * Pings the database via a real connection acquire + ping.
 * Used by /health. Throws on failure so the route handler can map to 503.
 */
export async function pingDatabase(): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

/**
 * Attempts DB connection up to `maxAttempts` times with linear backoff.
 * Used at server boot to give MySQL time to come up (e.g. when started via
 * docker-compose in parallel with the backend).
 *
 * Logs each attempt via the provided logger so the operator sees retry
 * context, not a silent hang.
 */
export async function waitForDatabase(
  logger: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void },
  maxAttempts = 10,
  delayMs = 2000,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pingDatabase();
      logger.info({ attempt, maxAttempts }, "database reachable");
      return;
    } catch (err) {
      const isLast = attempt === maxAttempts;
      logger.warn(
        { attempt, maxAttempts, err, willRetry: !isLast, delayMs },
        "database not reachable yet",
      );
      if (isLast) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
