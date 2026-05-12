import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import type { AssignJobInput, Job } from "./types.js";
import {
  InvalidReferenceError,
  NotFoundError,
  QuoteAlreadyScheduledError,
  TimeSlotConflictError,
} from "./errors.js";

// Domain helper: assign a quote to a technician on a specific (date, slot).
// Three writes in one transaction:
//   1. INSERT into jobs           — guarded by uniq_tech_date_slot AND uniq_quote
//   2. UPDATE quotes status='scheduled'
//   3. INSERT into notifications  — recipient = the technician
//
// Atomicity comes from the transaction; conflict prevention comes from the
// schema's composite UNIQUE constraint. We don't SELECT-then-INSERT; we let
// InnoDB serialise concurrent writes at the index level and catch the second
// INSERT's ER_DUP_ENTRY (errno 1062). See docs/PLAN.md §13a.

// MySQL error identifiers we recognise. mysql2 surfaces these as `err.code`
// (string) and `err.errno` (number). We match on code first; errno is fallback.
const ER_DUP_ENTRY = "ER_DUP_ENTRY";              // errno 1062
const ER_NO_REFERENCED_ROW = "ER_NO_REFERENCED_ROW_2"; // errno 1452

// MySQL error shape, narrowed. mysql2 doesn't export this type directly,
// so we narrow inside catch blocks rather than typing the catch parameter.
interface MysqlError {
  code: string;
  errno: number;
  sqlMessage?: string;
}

function isMysqlError(err: unknown): err is MysqlError {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as MysqlError).code === "string" &&
    typeof (err as MysqlError).errno === "number"
  );
}

export async function assignJob(pool: Pool, input: AssignJobInput): Promise<Job> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const job = await insertJob(conn, input);
    await markQuoteScheduled(conn, input.quoteId);
    await insertAssignmentNotification(conn, job);
    await conn.commit();
    return job;
  } catch (err) {
    await conn.rollback();
    throw mapDriverError(err);
  } finally {
    conn.release();
  }
}

async function insertJob(conn: PoolConnection, input: AssignJobInput): Promise<Job> {
  const [result] = await conn.query<ResultSetHeader>(
    `INSERT INTO jobs
       (technician_id, quote_id, manager_id, scheduled_date, slot)
     VALUES (?, ?, ?, ?, ?)`,
    [input.technicianId, input.quoteId, input.managerId, input.scheduledDate, input.slot],
  );

  // Read the row back so we return canonical values (assigned_at, status
  // defaults) sourced from the DB rather than guessed in JS. One round trip
  // inside an already-open transaction — cheap and correct.
  const [rows] = await conn.query<JobRow[]>(
    `SELECT id, technician_id, quote_id, manager_id, scheduled_date,
            slot, status, assigned_at, completed_at
       FROM jobs WHERE id = ?`,
    [result.insertId],
  );
  const row = rows[0];
  if (!row) {
    // Defensive: the INSERT succeeded (we have insertId) but the row was not
    // readable. This shouldn't happen inside the same transaction with
    // REPEATABLE READ; if it does, throw rather than return a half-built Job.
    throw new Error(`job ${result.insertId} not readable after insert`);
  }

  return {
    id: row.id,
    technicianId: row.technician_id,
    quoteId: row.quote_id,
    managerId: row.manager_id,
    scheduledDate: row.scheduled_date,
    slot: row.slot,
    status: row.status,
    assignedAt: row.assigned_at,
    completedAt: row.completed_at,
  };
}

async function markQuoteScheduled(conn: PoolConnection, quoteId: number): Promise<void> {
  // The quote MUST exist (FK on jobs.quote_id already enforced it) AND its
  // status MUST become 'scheduled'. If affectedRows is 0 the row vanished
  // between the INSERT and the UPDATE — extremely unlikely inside a
  // transaction, but treat as transaction integrity failure rather than
  // silent success.
  const [result] = await conn.query<ResultSetHeader>(
    "UPDATE quotes SET status = 'scheduled' WHERE id = ?",
    [quoteId],
  );
  if (result.affectedRows === 0) {
    throw new NotFoundError("Quote", quoteId);
  }
}

async function insertAssignmentNotification(
  conn: PoolConnection,
  job: Job,
): Promise<void> {
  await conn.query<ResultSetHeader>(
    `INSERT INTO notifications
       (type, recipient_type, recipient_id, job_id, message)
     VALUES ('job_assigned', 'technician', ?, ?, ?)`,
    [
      job.technicianId,
      job.id,
      `New job assigned for ${job.scheduledDate} ${job.slot}`,
    ],
  );
}

// MySQL driver errors → typed domain errors. Distinguishes:
//   - uniq_tech_date_slot conflict → TimeSlotConflictError      (409)
//   - uniq_quote conflict           → QuoteAlreadyScheduledError (409)
//   - FK violation                  → NotFoundError              (404)
// Any other error passes through unmapped so the route handler returns 500.
function mapDriverError(err: unknown): unknown {
  if (!isMysqlError(err)) {
    return err;
  }
  if (err.code === ER_DUP_ENTRY) {
    const msg = err.sqlMessage ?? "";
    // mysql2 sqlMessage format:
    //   "Duplicate entry '...' for key 'jobs.uniq_tech_date_slot'"
    //   "Duplicate entry '...' for key 'jobs.uniq_quote'"
    // Substring match — stable across MySQL 8.x patch versions per the
    // server error reference (ER_DUP_ENTRY format frozen since 5.7).
    if (msg.includes("uniq_tech_date_slot")) {
      return new TimeSlotConflictError();
    }
    if (msg.includes("uniq_quote")) {
      return new QuoteAlreadyScheduledError();
    }
    // Unrecognised UNIQUE constraint — schema has only the two above, but
    // be honest about the unknown rather than guess.
    return new TimeSlotConflictError("Duplicate entry on an unexpected key");
  }
  if (err.code === ER_NO_REFERENCED_ROW) {
    // FK violation. sqlMessage contains the constraint name (fk_jobs_technician,
    // fk_jobs_quote, fk_jobs_manager). Map each to the right NotFoundError.
    const msg = err.sqlMessage ?? "";
    if (msg.includes("fk_jobs_technician")) {
      return new NotFoundError("Technician", "(referenced)");
    }
    if (msg.includes("fk_jobs_quote")) {
      return new NotFoundError("Quote", "(referenced)");
    }
    if (msg.includes("fk_jobs_manager")) {
      return new NotFoundError("Manager", "(referenced)");
    }
    return new InvalidReferenceError();
  }
  return err;
}

interface JobRow extends RowDataPacket {
  id: number;
  technician_id: number;
  quote_id: number;
  manager_id: number;
  scheduled_date: string;
  slot: "09:00-11:00" | "11:00-13:00" | "13:00-15:00" | "15:00-17:00";
  status: "scheduled" | "completed";
  assigned_at: string;
  completed_at: string | null;
}
