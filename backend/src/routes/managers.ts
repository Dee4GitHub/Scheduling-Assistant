import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ManagerSchema } from "../domain/types.js";

interface ManagerRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export async function managersRoutes(
  app: FastifyInstance,
  pool: Pool,
): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/api/managers",
    {
      schema: {
        tags: ["managers"],
        summary: "List all managers",
        response: { 200: z.array(ManagerSchema) },
      },
    },
    async () => {
      const [rows] = await pool.query<ManagerRow[]>(
        "SELECT id, name, email, created_at FROM managers ORDER BY id",
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        createdAt: r.created_at,
      }));
    },
  );
}
