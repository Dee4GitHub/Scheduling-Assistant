import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "mysql2/promise";
import { assignJob, completeJob } from "../../src/domain/jobs.js";
import {
  JobAlreadyCompletedError,
  NotFoundError,
  WrongTechnicianError,
} from "../../src/domain/errors.js";
import type { AssignJobInput, Job } from "../../src/domain/types.js";
import {
  type CountRow,
  type Fixtures,
  makeFixtures,
  makeTestPool,
  uniqueNamespace,
} from "../helpers/db.js";

// Job lifecycle: scheduled → completed. The completion path mutates two
// tables (jobs UPDATE, notifications INSERT) and must hold the same ACID
// guarantees as assignment. Authorisation is enforced inside the domain
// helper, not the route, so the test exercises completeJob directly — same
// pattern as the conflict suite.

describe("completeJob — lifecycle + authorisation (integration)", () => {
  let pool: Pool;
  let fx: Fixtures | undefined;

  beforeAll(() => {
    pool = makeTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    fx = await makeFixtures(pool, uniqueNamespace("complete"));
  });

  afterEach(async () => {
    if (fx) {
      await fx.cleanup();
      fx = undefined;
    }
  });

  const requireFx = (): Fixtures => {
    if (!fx) throw new Error("fixtures not initialised — beforeEach failed");
    return fx;
  };

  // Each test starts with a freshly-assigned job so completeJob has a real
  // scheduled row to operate on. Wrapping this in a helper keeps the test
  // bodies focused on the completion behaviour, not the assignment setup.
  async function assignFreshJob(
    f: Fixtures,
    quoteIdx: number,
    date: string,
    slot: AssignJobInput["slot"],
  ): Promise<Job> {
    const quoteId = f.quoteIds[quoteIdx];
    if (quoteId === undefined) {
      throw new Error(`fixture quoteIds[${quoteIdx}] missing`);
    }
    return assignJob(pool, {
      technicianId: f.technicianId,
      quoteId,
      managerId: f.managerId,
      scheduledDate: date,
      slot,
    });
  }

  it("flips a scheduled job to completed and inserts a manager-recipient notification", async () => {
    const f = requireFx();
    const job = await assignFreshJob(f, 0, "2026-07-01", "09:00-11:00");

    const result = await completeJob(pool, job.id, f.technicianId);

    expect(result.status).toBe("completed");
    expect(result.completedAt).not.toBeNull();
    // Same job, just mutated — the surrogate key and inputs stay stable.
    expect(result.id).toBe(job.id);
    expect(result.technicianId).toBe(f.technicianId);

    // The manager notification was inserted alongside the technician's
    // assignment notification, so this technician now has 1 notification
    // (assigned) and this manager has 1 notification (completed).
    const [techNotifs] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS c FROM notifications
        WHERE recipient_type = 'technician' AND recipient_id = ? AND type = 'job_assigned'`,
      [f.technicianId],
    );
    expect(Number(techNotifs[0]?.c ?? -1)).toBe(1);

    const [mgrNotifs] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS c FROM notifications
        WHERE recipient_type = 'manager' AND recipient_id = ? AND type = 'job_completed'`,
      [f.managerId],
    );
    expect(Number(mgrNotifs[0]?.c ?? -1)).toBe(1);
  });

  it("throws WrongTechnicianError (→403) when the actor isn't the assigned technician", async () => {
    const f = requireFx();
    const job = await assignFreshJob(f, 0, "2026-07-02", "09:00-11:00");
    const otherTechnicianId = f.technicianId + 999_999;

    await expect(completeJob(pool, job.id, otherTechnicianId))
      .rejects.toBeInstanceOf(WrongTechnicianError);

    // The job must NOT have been mutated. Authorisation runs before the
    // UPDATE, and the transaction rolls back on the throw — status stays
    // 'scheduled', no completion notification was created.
    const [rows] = await pool.query<{ status: string; completed_at: string | null }[] & CountRow[]>(
      "SELECT status, completed_at FROM jobs WHERE id = ?",
      [job.id],
    );
    const row = (rows as unknown as Array<{ status: string; completed_at: string | null }>)[0];
    expect(row?.status).toBe("scheduled");
    expect(row?.completed_at).toBeNull();

    const [mgrNotifs] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS c FROM notifications
        WHERE recipient_type = 'manager' AND type = 'job_completed' AND job_id = ?`,
      [job.id],
    );
    expect(Number(mgrNotifs[0]?.c ?? -1)).toBe(0);
  });

  it("throws JobAlreadyCompletedError (→409) on a second completion attempt", async () => {
    const f = requireFx();
    const job = await assignFreshJob(f, 0, "2026-07-03", "09:00-11:00");
    await completeJob(pool, job.id, f.technicianId);

    await expect(completeJob(pool, job.id, f.technicianId))
      .rejects.toBeInstanceOf(JobAlreadyCompletedError);

    // Still exactly one completion notification — the second call's
    // transaction rolled back before reaching the INSERT.
    const [mgrNotifs] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS c FROM notifications
        WHERE recipient_type = 'manager' AND type = 'job_completed' AND job_id = ?`,
      [job.id],
    );
    expect(Number(mgrNotifs[0]?.c ?? -1)).toBe(1);
  });

  it("throws NotFoundError (→404) when the job id doesn't exist", async () => {
    const f = requireFx();
    await expect(completeJob(pool, 9_999_999, f.technicianId))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});
