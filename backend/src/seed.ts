import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

// Idempotent seed. Runs on backend startup.
//
// Strategy: check if each table already has rows. If it does, skip seeding
// that table. INSERT IGNORE alone isn't enough because not every table has
// a UNIQUE column on a stable field (technicians, for example, identifies
// people by name and trade neither of which we want to constrain as UNIQUE
// in the schema — two Alice Chens could legitimately exist).

const MANAGERS: ReadonlyArray<{ name: string; email: string }> = [
  { name: "Aisha Khan",     email: "aisha.khan@brixco.test" },
  { name: "Marcus Lee",     email: "marcus.lee@brixco.test" },
  { name: "Priya Sharma",   email: "priya.sharma@brixco.test" },
  { name: "Owen Walsh",     email: "owen.walsh@brixco.test" },
  { name: "Sara Nguyen",    email: "sara.nguyen@brixco.test" },
];

const TECHNICIANS: ReadonlyArray<{ name: string; trade: string }> = [
  { name: "Alice Chen",     trade: "HVAC" },
  { name: "Ben Mitchell",   trade: "HVAC" },
  { name: "Carlos Reyes",   trade: "Refrigeration" },
  { name: "Dana Okafor",    trade: "HVAC" },
  { name: "Evan Park",      trade: "Ducting" },
];

const QUOTES: ReadonlyArray<{ reference: string; summary: string }> = [
  { reference: "Q-1042", summary: "Replace condenser, Smith residence" },
  { reference: "Q-1051", summary: "Annual service, Patel home" },
  { reference: "Q-1063", summary: "Ducting repair, Nguyen apartment" },
  { reference: "Q-1078", summary: "Install split system, O'Brien office" },
  { reference: "Q-1090", summary: "Refrigerant top-up, Walsh cafe" },
  { reference: "Q-1101", summary: "Compressor diagnostic, Harris warehouse" },
  { reference: "Q-1115", summary: "Thermostat replacement, Lee townhouse" },
  { reference: "Q-1128", summary: "Cool-room service, Singh deli" },
  { reference: "Q-1134", summary: "Heat-pump install, Tan duplex" },
  { reference: "Q-1147", summary: "Annual service, Garcia restaurant" },
];

export interface SeedLogger {
  info: (obj: object, msg: string) => void;
}

async function tableIsEmpty(
  conn: Awaited<ReturnType<Pool["getConnection"]>>,
  table: "managers" | "technicians" | "quotes",
): Promise<boolean> {
  // Whitelist-checked table names above; no SQL injection vector.
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM ${table}`,
  );
  const first = rows[0];
  if (!first) return true;
  return Number(first.c) === 0;
}

export async function seedDatabase(pool: Pool, logger: SeedLogger): Promise<void> {
  const conn = await pool.getConnection();
  try {
    let managersInserted = 0;
    if (await tableIsEmpty(conn, "managers")) {
      try {
        await conn.beginTransaction();
        for (const m of MANAGERS) {
          const [result] = await conn.query<ResultSetHeader>(
            "INSERT INTO managers (name, email) VALUES (?, ?)",
            [m.name, m.email],
          );
          managersInserted += result.affectedRows;
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    }

    let techniciansInserted = 0;
    if (await tableIsEmpty(conn, "technicians")) {
      try {
        await conn.beginTransaction();
        for (const t of TECHNICIANS) {
          const [result] = await conn.query<ResultSetHeader>(
            "INSERT INTO technicians (name, trade) VALUES (?, ?)",
            [t.name, t.trade],
          );
          techniciansInserted += result.affectedRows;
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    }

    let quotesInserted = 0;
    if (await tableIsEmpty(conn, "quotes")) {
      try {
        await conn.beginTransaction();
        for (const q of QUOTES) {
          const [result] = await conn.query<ResultSetHeader>(
            "INSERT INTO quotes (reference, summary) VALUES (?, ?)",
            [q.reference, q.summary],
          );
          quotesInserted += result.affectedRows;
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    }

    logger.info(
      { managersInserted, techniciansInserted, quotesInserted },
      "seed complete",
    );
  } finally {
    conn.release();
  }
}
