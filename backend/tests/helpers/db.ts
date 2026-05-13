import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { env } from "../../src/config.js";

// Test fixtures own a namespaced manager, technician, and pool of unscheduled
// quotes. The namespace (e.g. "race_1715472000_a8f3") makes every row created
// by a single test isolatable, even when multiple test runs share one DB.
// cleanup() walks the FK chain in reverse (notifications → jobs → leaf rows).

export interface Fixtures {
  managerId: number;
  technicianId: number;
  quoteIds: number[];
  cleanup: () => Promise<void>;
}

export function makeTestPool(): Pool {
  return mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
    timezone: "Z",
  });
}

export function uniqueNamespace(prefix: string): string {
  // millisecond timestamp + 6 random base36 chars — collision-resistant enough
  // for a local dev DB without pulling in uuid.
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// YYYY-MM-DD string for today (UTC) plus offsetDays. Used by tests that need
// a guaranteed-future scheduledDate, so the suite stays valid as time advances
// past any hard-coded date. UTC matches the boundary check in
// AssignJobInputSchema; both sides agree on the same notion of "today".
export function futureDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// quotes.reference is VARCHAR(20). The full namespace blows past that, so for
// references we use a short token (timestamp tail + 4 base36 chars). The
// risk of two parallel test runs picking the same token is negligible for a
// single-developer take-home, and is bounded by the per-test cleanup() pass.
function shortToken(): string {
  return `${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function makeFixtures(
  pool: Pool,
  namespace: string,
  quoteCount = 4,
): Promise<Fixtures> {
  // managers.email and quotes.reference are UNIQUE per schema, so the
  // namespace prefix is what keeps every test's fixtures distinct.
  // All fixture INSERTs run inside one transaction — a partial failure
  // (e.g. an oversized value hitting a column limit) rolls back the rows
  // already created in this fixture, so beforeEach can't leak orphans.
  const conn = await pool.getConnection();
  let managerId: number;
  let technicianId: number;
  const quoteIds: number[] = [];
  try {
    await conn.beginTransaction();
    const [m] = await conn.query<ResultSetHeader>(
      "INSERT INTO managers (name, email) VALUES (?, ?)",
      [`Test Mgr ${namespace}`, `mgr_${namespace}@test.local`],
    );
    managerId = m.insertId;

    const [t] = await conn.query<ResultSetHeader>(
      "INSERT INTO technicians (name, trade) VALUES (?, ?)",
      [`Test Tech ${namespace}`, "HVAC"],
    );
    technicianId = t.insertId;

    const refToken = shortToken();
    for (let i = 0; i < quoteCount; i++) {
      // Reference format "T-<token>-<i>" fits in VARCHAR(20): 2 + 10 + 2 + 1 = 15.
      const [q] = await conn.query<ResultSetHeader>(
        "INSERT INTO quotes (reference, summary) VALUES (?, ?)",
        [`T-${refToken}-${i}`, `Test quote ${i} ${namespace}`],
      );
      quoteIds.push(q.insertId);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const cleanup = async (): Promise<void> => {
    // FK chain: notifications.job_id → jobs.id, jobs.{tech,quote,manager}_id →
    // their leaves. Delete notifications first, then jobs, then the leaves.
    // We scope by technician_id OR manager_id because a job created during
    // a partially-rolled-back transaction in test 4 may have failed before
    // the notification insert — covering both predicates is harmless.
    await pool.query(
      `DELETE n FROM notifications n
         JOIN jobs j ON n.job_id = j.id
        WHERE j.technician_id = ? OR j.manager_id = ?`,
      [technicianId, managerId],
    );
    await pool.query(
      "DELETE FROM jobs WHERE technician_id = ? OR manager_id = ?",
      [technicianId, managerId],
    );
    if (quoteIds.length > 0) {
      await pool.query("DELETE FROM quotes WHERE id IN (?)", [quoteIds]);
    }
    await pool.query("DELETE FROM technicians WHERE id = ?", [technicianId]);
    await pool.query("DELETE FROM managers WHERE id = ?", [managerId]);
  };

  return { managerId, technicianId, quoteIds, cleanup };
}

// Row shapes used for assertion queries in tests. Kept local to helpers so
// tests don't need to redeclare the same RowDataPacket extensions.
export interface CountRow extends RowDataPacket {
  c: number;
}

export interface QuoteStatusRow extends RowDataPacket {
  status: "unscheduled" | "scheduled";
}
