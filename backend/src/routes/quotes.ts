import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { QuoteSchema, QuoteStatusEnum } from "../domain/types.js";

interface QuoteRow extends RowDataPacket {
  id: number;
  reference: string;
  summary: string;
  status: "unscheduled" | "scheduled";
  created_at: string;
}

export async function quotesRoutes(
  app: FastifyInstance,
  pool: Pool,
): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/api/quotes",
    {
      schema: {
        tags: ["quotes"],
        summary: "List quotes, optionally filtered by status",
        querystring: z.object({
          status: QuoteStatusEnum.optional(),
        }),
        response: { 200: z.array(QuoteSchema) },
      },
    },
    async (request) => {
      const { status } = request.query;
      const sql = status
        ? "SELECT id, reference, summary, status, created_at FROM quotes WHERE status = ? ORDER BY id"
        : "SELECT id, reference, summary, status, created_at FROM quotes ORDER BY id";
      const params = status ? [status] : [];

      const [rows] = await pool.query<QuoteRow[]>(sql, params);
      return rows.map((r) => ({
        id: r.id,
        reference: r.reference,
        summary: r.summary,
        status: r.status,
        createdAt: r.created_at,
      }));
    },
  );
}
