import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  ErrorEnvelope,
  ScheduledJobSchema,
  TechnicianSchema,
} from "../domain/types.js";

interface TechnicianRow extends RowDataPacket {
  id: number;
  name: string;
  trade: string;
  created_at: string;
}

interface ScheduledJobRow extends RowDataPacket {
  id: number;
  technician_id: number;
  quote_id: number;
  manager_id: number;
  scheduled_date: string;
  slot: "09:00-11:00" | "11:00-13:00" | "13:00-15:00" | "15:00-17:00";
  status: "scheduled" | "completed";
  assigned_at: string;
  completed_at: string | null;
  quote_reference: string;
  quote_summary: string;
  manager_name: string;
}

export async function techniciansRoutes(
  app: FastifyInstance,
  pool: Pool,
): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/api/technicians",
    {
      schema: {
        tags: ["technicians"],
        summary: "List all technicians",
        response: { 200: z.array(TechnicianSchema) },
      },
    },
    async () => {
      const [rows] = await pool.query<TechnicianRow[]>(
        "SELECT id, name, trade, created_at FROM technicians ORDER BY id",
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        trade: r.trade,
        createdAt: r.created_at,
      }));
    },
  );

  typed.get(
    "/api/technicians/:id/schedule",
    {
      schema: {
        tags: ["technicians"],
        summary: "Get a technician's schedule, optionally filtered by date",
        params: z.object({
          id: z.coerce.number().int().positive(),
        }),
        querystring: z.object({
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
            .optional(),
        }),
        response: {
          200: z.array(ScheduledJobSchema),
          404: ErrorEnvelope,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { date } = request.query;

      // Confirm the technician exists - 404 if not, rather than returning an
      // empty schedule that the caller might confuse with "no jobs today".
      const [techRows] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM technicians WHERE id = ?",
        [id],
      );
      if (techRows.length === 0) {
        return reply.code(404).send({
          error: "NOT_FOUND",
          message: `Technician ${id} not found`,
        });
      }

      const params: (number | string)[] = [id];
      let sql = `
        SELECT
          j.id, j.technician_id, j.quote_id, j.manager_id,
          j.scheduled_date, j.slot, j.status,
          j.assigned_at, j.completed_at,
          q.reference AS quote_reference,
          q.summary   AS quote_summary,
          m.name      AS manager_name
        FROM jobs j
        JOIN quotes   q ON q.id = j.quote_id
        JOIN managers m ON m.id = j.manager_id
        WHERE j.technician_id = ?
      `;
      if (date) {
        sql += " AND j.scheduled_date = ?";
        params.push(date);
      }
      sql += " ORDER BY j.scheduled_date, j.slot";

      const [rows] = await pool.query<ScheduledJobRow[]>(sql, params);
      return rows.map((r) => ({
        id: r.id,
        technicianId: r.technician_id,
        quoteId: r.quote_id,
        managerId: r.manager_id,
        scheduledDate: r.scheduled_date,
        slot: r.slot,
        status: r.status,
        assignedAt: r.assigned_at,
        completedAt: r.completed_at,
        quoteReference: r.quote_reference,
        quoteSummary: r.quote_summary,
        managerName: r.manager_name,
      }));
    },
  );
}
