import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import type { AssignJobInput, Job } from "./types.js";
import {
  InvalidReferenceError,
  JobAlreadyCompletedError,
  NotFoundError,
  QuoteAlreadyScheduledError,
  TimeSlotConflictError,
  WrongTechnicianError,
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
    await insertNotification(conn, buildAssignmentNotification(job));
    await conn.commit();
    return job;
  } catch (err) {
    await conn.rollback();
    throw mapDriverError(err);
  } finally {
    conn.release();
  }
}

// Pure: shape of a notification row, derived from Job data alone. No I/O.
// Per backend/CLAUDE.md: "Notification builders are pure functions of Job
// data. They return shapes; they do not write to the database." Splitting
// the build from the write keeps the message-formatting logic testable in
// isolation and gives the future job-completion path a single builder
// surface to mirror.
export interface NotificationRow {
  type: "job_assigned" | "job_completed";
  recipientType: "technician" | "manager";
  recipientId: number;
  jobId: number;
  message: string;
}

export function buildAssignmentNotification(job: Job): NotificationRow {
  return {
    type: "job_assigned",
    recipientType: "technician",
    recipientId: job.technicianId,
    jobId: job.id,
    message: `New job assigned for ${job.scheduledDate} ${job.slot}`,
  };
}

// Pure: shape of the manager-facing completion notification. Mirrors
// buildAssignmentNotification but flips recipient — the manager who created
// the assignment is the one who wants to know it's done.
export function buildCompletionNotification(job: Job): NotificationRow {
  return {
    type: "job_completed",
    recipientType: "manager",
    recipientId: job.managerId,
    jobId: job.id,
    message: `Job completed for ${job.scheduledDate} ${job.slot}`,
  };
}

// Domain helper: technician marks their own job complete.
// Two writes in one transaction:
//   1. UPDATE jobs SET status='completed', completed_at=NOW() WHERE id=?
//   2. INSERT into notifications  — recipient = the manager
//
// Authorisation: the actor (technician) claims their identity in the body.
// No auth in scope for this brief; we verify the claim against the row's
// technician_id and 403 on mismatch. SELECT...FOR UPDATE locks the row at
// the start of the transaction so two concurrent completes can't both pass
// the status check and double-fire the notification — InnoDB serialises on
// the row lock the same way it serialised on the UNIQUE index in assignJob.
export async function completeJob(
  pool: Pool,
  jobId: number,
  actorTechnicianId: number,
): Promise<Job> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const current = await lockAndReadJob(conn, jobId);
    authoriseCompletion(current, actorTechnicianId);
    await markJobCompleted(conn, jobId);
    const updated = await readJob(conn, jobId);
    await insertNotification(conn, buildCompletionNotification(updated));
    await conn.commit();
    return updated;
  } catch (err) {
    await conn.rollback();
    throw mapDriverError(err);
  } finally {
    conn.release();
  }
}

async function lockAndReadJob(conn: PoolConnection, jobId: number): Promise<Job> {
  // FOR UPDATE: acquire a row-level X lock so concurrent completeJob calls on
  // the same row serialise here. Without it, both callers could read
  // status='scheduled', both UPDATE, both INSERT a notification — racing past
  // the status guard. The lock makes the second caller block until the first
  // commits, then see status='completed' and short-circuit with
  // JobAlreadyCompletedError. Same arbitration pattern as assignJob's UNIQUE
  // index, just at a different InnoDB layer.
  const [rows] = await conn.query<JobRow[]>(
    `SELECT id, technician_id, quote_id, manager_id, scheduled_date,
            slot, status, assigned_at, completed_at
       FROM jobs WHERE id = ?
       FOR UPDATE`,
    [jobId],
  );
  const row = rows[0];
  if (!row) {
    throw new NotFoundError("Job", jobId);
  }
  return rowToJob(row);
}

function authoriseCompletion(job: Job, actorTechnicianId: number): void {
  if (job.technicianId !== actorTechnicianId) {
    throw new WrongTechnicianError();
  }
  if (job.status === "completed") {
    throw new JobAlreadyCompletedError(job.id);
  }
}

async function markJobCompleted(conn: PoolConnection, jobId: number): Promise<void> {
  const [result] = await conn.query<ResultSetHeader>(
    "UPDATE jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
    [jobId],
  );
  if (result.affectedRows === 0) {
    // The row was locked at lockAndReadJob, so it can't have vanished mid-tx.
    // If this fires the DB is in an unexpected state — surface loudly rather
    // than fall through with stale data.
    throw new Error(`job ${jobId} not updated despite lock — transaction integrity failure`);
  }
}

async function readJob(conn: PoolConnection, jobId: number): Promise<Job> {
  const [rows] = await conn.query<JobRow[]>(
    `SELECT id, technician_id, quote_id, manager_id, scheduled_date,
            slot, status, assigned_at, completed_at
       FROM jobs WHERE id = ?`,
    [jobId],
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`job ${jobId} not readable after update`);
  }
  return rowToJob(row);
}

function rowToJob(row: JobRow): Job {
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

// Thin writer: takes the pure NotificationRow shape and persists it. The
// only side-effect here is the INSERT — no message formatting, no Job-shape
// transformation, no business rules. Mirror writer for `buildAssignmentNotification`.
async function insertNotification(
  conn: PoolConnection,
  row: NotificationRow,
): Promise<void> {
  await conn.query<ResultSetHeader>(
    `INSERT INTO notifications
       (type, recipient_type, recipient_id, job_id, message)
     VALUES (?, ?, ?, ?, ?)`,
    [row.type, row.recipientType, row.recipientId, row.jobId, row.message],
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
    // Unrecognised UNIQUE constraint — schema has only the two above today.
    // Pass the original driver error through so the route handler's catch
    // chain falls past `instanceof DomainError` and Fastify returns 500.
    // Lying to the client with a 409 TIME_SLOT_CONFLICT for an unknown
    // constraint would mask the schema drift, not surface it.
    return err;
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
