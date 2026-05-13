import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "mysql2/promise";
import { assignJob } from "../../src/domain/jobs.js";
import {
  NotFoundError,
  QuoteAlreadyScheduledError,
  TimeSlotConflictError,
} from "../../src/domain/errors.js";
import type { AssignJobInput } from "../../src/domain/types.js";
import {
  type CountRow,
  type Fixtures,
  type QuoteStatusRow,
  futureDate,
  makeFixtures,
  makeTestPool,
  uniqueNamespace,
} from "../helpers/db.js";

// Conflict prevention is schema-authoritative. The whole architectural claim
// in domain/jobs.ts is that InnoDB's UNIQUE index serialises two racing
// INSERTs at the index level, so we don't need a SELECT-FOR-UPDATE. This
// suite proves that claim — without it, the design is unproven and we
// might as well have written a SELECT-then-INSERT.

describe("assignJob — conflict prevention (integration)", () => {
  let pool: Pool;
  let fx: Fixtures | undefined;

  beforeAll(() => {
    pool = makeTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    fx = await makeFixtures(pool, uniqueNamespace("race"));
  });

  afterEach(async () => {
    // beforeEach may have thrown before assigning fx — skip cleanup in that
    // case so the original error surfaces instead of being masked by a
    // "Cannot read property cleanup of undefined" TypeError.
    if (fx) {
      await fx.cleanup();
      fx = undefined;
    }
  });

  // Helper: every test asserts on fx but TS sees it as Fixtures | undefined
  // because beforeEach assigns it. Narrow once at the top of each test.
  const requireFx = (): Fixtures => {
    if (!fx) throw new Error("fixtures not initialised — beforeEach failed");
    return fx;
  };

  // The novel test: two assignJob calls fired concurrently against the same
  // (technician, date, slot). Exactly one should win; the other should
  // surface as a typed TimeSlotConflictError. If both fulfil, the design
  // is broken — InnoDB isn't serialising the way we claimed it does.
  it("serialises concurrent same-slot assignments — exactly one wins, one rejects with TimeSlotConflictError", async () => {
    const f = requireFx();
    const [q0, q1] = takeTwo(f.quoteIds);
    const base: Omit<AssignJobInput, "quoteId"> = {
      technicianId: f.technicianId,
      managerId: f.managerId,
      scheduledDate: futureDate(30),
      slot: "09:00-11:00",
    };

    const results = await Promise.allSettled([
      assignJob(pool, { ...base, quoteId: q0 }),
      assignJob(pool, { ...base, quoteId: q1 }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const failure = rejected[0];
    if (!failure || failure.status !== "rejected") {
      throw new Error("unreachable — length assertion above");
    }
    expect(failure.reason).toBeInstanceOf(TimeSlotConflictError);

    // DB ground truth: exactly one jobs row exists for that slot.
    const [rows] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS c
         FROM jobs
        WHERE technician_id = ? AND scheduled_date = ? AND slot = ?`,
      [f.technicianId, base.scheduledDate, base.slot],
    );
    const first = rows[0];
    expect(first).toBeDefined();
    expect(Number(first?.c ?? -1)).toBe(1);
  });

  it("rejects a second assignment of the same quote with QuoteAlreadyScheduledError", async () => {
    const f = requireFx();
    const [q0] = takeOne(f.quoteIds);
    await assignJob(pool, {
      technicianId: f.technicianId,
      quoteId: q0,
      managerId: f.managerId,
      scheduledDate: futureDate(31),
      slot: "09:00-11:00",
    });

    // Different slot, same quote — uniq_quote should fire, not
    // uniq_tech_date_slot.
    await expect(
      assignJob(pool, {
        technicianId: f.technicianId,
        quoteId: q0,
        managerId: f.managerId,
        scheduledDate: futureDate(32),
        slot: "11:00-13:00",
      }),
    ).rejects.toBeInstanceOf(QuoteAlreadyScheduledError);
  });

  it("throws NotFoundError when the technician FK doesn't resolve", async () => {
    const f = requireFx();
    const [q0] = takeOne(f.quoteIds);
    await expect(
      assignJob(pool, {
        technicianId: 9_999_999,
        quoteId: q0,
        managerId: f.managerId,
        scheduledDate: futureDate(33),
        slot: "09:00-11:00",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rolls back the entire transaction on slot conflict — no quote flip, no orphan notification", async () => {
    const f = requireFx();
    const [q0, q1] = takeTwo(f.quoteIds);

    const rollbackDate = futureDate(34);
    const job1 = await assignJob(pool, {
      technicianId: f.technicianId,
      quoteId: q0,
      managerId: f.managerId,
      scheduledDate: rollbackDate,
      slot: "09:00-11:00",
    });

    // Second call collides on uniq_tech_date_slot. The whole transaction
    // must roll back — quote q1 stays 'unscheduled', no notification was
    // created for it, no second jobs row. Both calls use the same date so
    // the UNIQUE collision is the assertion under test.
    await expect(
      assignJob(pool, {
        technicianId: f.technicianId,
        quoteId: q1,
        managerId: f.managerId,
        scheduledDate: rollbackDate,
        slot: "09:00-11:00",
      }),
    ).rejects.toBeInstanceOf(TimeSlotConflictError);

    const [quoteRows] = await pool.query<QuoteStatusRow[]>(
      "SELECT status FROM quotes WHERE id = ?",
      [q1],
    );
    const quote = quoteRows[0];
    expect(quote).toBeDefined();
    expect(quote?.status).toBe("unscheduled");

    // Notifications for this technician should number exactly one — the one
    // tied to the successful job1. If the rollback was incomplete, we'd see
    // two.
    const [notifRows] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS c
         FROM notifications
        WHERE recipient_type = 'technician' AND recipient_id = ?`,
      [f.technicianId],
    );
    const notifFirst = notifRows[0];
    expect(notifFirst).toBeDefined();
    expect(Number(notifFirst?.c ?? -1)).toBe(1);

    // And exactly one jobs row for this fixture's technician.
    const [jobRows] = await pool.query<CountRow[]>(
      "SELECT COUNT(*) AS c FROM jobs WHERE technician_id = ?",
      [f.technicianId],
    );
    const jobFirst = jobRows[0];
    expect(jobFirst).toBeDefined();
    expect(Number(jobFirst?.c ?? -1)).toBe(1);
    expect(job1.id).toBeGreaterThan(0);
  });
});

// Small helpers to satisfy noUncheckedIndexedAccess without sprinkling
// non-null assertions through the tests. takeTwo / takeOne both throw a
// loud error rather than returning undefined — the fixture creates 4
// quotes, so failure here means a bug in makeFixtures, not in the test.
function takeOne(quoteIds: number[]): [number] {
  const a = quoteIds[0];
  if (a === undefined) throw new Error("fixture quoteIds is empty");
  return [a];
}

function takeTwo(quoteIds: number[]): [number, number] {
  const a = quoteIds[0];
  const b = quoteIds[1];
  if (a === undefined || b === undefined) {
    throw new Error("fixture quoteIds has fewer than 2 entries");
  }
  return [a, b];
}
