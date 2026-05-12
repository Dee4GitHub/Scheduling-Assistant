import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  ErrorEnvelope,
  ListNotificationsQuerySchema,
  NotificationSchema,
} from "../domain/types.js";

interface NotificationRow extends RowDataPacket {
  id: number;
  type: "job_assigned" | "job_completed";
  recipient_type: "technician" | "manager";
  recipient_id: number;
  job_id: number;
  message: string;
  created_at: string;
  read_at: string | null;
}

// Hard cap on list page size. There's no pagination in the brief, but an
// unbounded result set is a real risk once the system runs for any length of
// time — bell-icon panels show the last N, not all-time history. 50 is enough
// to back the unread-badge counter accurately for normal use and tight enough
// that an attacker can't make the API return MBs of rows.
const NOTIFICATION_PAGE_LIMIT = 50;

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/api/notifications",
    {
      schema: {
        tags: ["notifications"],
        summary: "List notifications for a specific recipient",
        querystring: ListNotificationsQuerySchema,
        response: {
          200: z.array(NotificationSchema),
        },
      },
    },
    async (request) => {
      const { recipientType, recipientId, unreadOnly } = request.query;

      // Two prepared statements rather than one with a dynamic clause —
      // parameterised SQL composition is fine but the conditional form is
      // easier to verify at a glance and the cost of duplication is two
      // strings. The composite index idx_recipient_unread on
      // (recipient_type, recipient_id, read_at) backs both queries.
      const sql = unreadOnly
        ? `SELECT id, type, recipient_type, recipient_id, job_id,
                  message, created_at, read_at
             FROM notifications
            WHERE recipient_type = ? AND recipient_id = ? AND read_at IS NULL
            ORDER BY created_at DESC
            LIMIT ?`
        : `SELECT id, type, recipient_type, recipient_id, job_id,
                  message, created_at, read_at
             FROM notifications
            WHERE recipient_type = ? AND recipient_id = ?
            ORDER BY created_at DESC
            LIMIT ?`;

      const [rows] = await app.mysql.query<NotificationRow[]>(sql, [
        recipientType,
        recipientId,
        NOTIFICATION_PAGE_LIMIT,
      ]);

      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        recipientType: r.recipient_type,
        recipientId: r.recipient_id,
        jobId: r.job_id,
        message: r.message,
        createdAt: r.created_at,
        readAt: r.read_at,
      }));
    },
  );

  typed.post(
    "/api/notifications/:id/read",
    {
      schema: {
        tags: ["notifications"],
        summary: "Mark a notification as read",
        params: z.object({
          id: z.coerce.number().int().positive(),
        }),
        response: {
          200: NotificationSchema,
          404: ErrorEnvelope,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      // Idempotent by design: if read_at is already non-null, the UPDATE
      // matches but changes nothing. We use affectedRows to distinguish
      // "row doesn't exist" (404) from "row found, value already set"
      // (still 200). mysql2's default is rows-matched, not rows-changed,
      // so affectedRows = 1 for both first-mark and re-mark.
      const [result] = await app.mysql.query<ResultSetHeader>(
        "UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ?",
        [id],
      );
      if (result.affectedRows === 0) {
        return reply.code(404).send({
          error: "NOT_FOUND",
          message: `Notification ${id} not found`,
        });
      }

      const [rows] = await app.mysql.query<NotificationRow[]>(
        `SELECT id, type, recipient_type, recipient_id, job_id,
                message, created_at, read_at
           FROM notifications WHERE id = ?`,
        [id],
      );
      const row = rows[0];
      if (!row) {
        // Race between UPDATE and SELECT — the row was deleted by something
        // else between our two statements. Vanishingly unlikely without a
        // separate admin tool, but surface honestly rather than 500.
        return reply.code(404).send({
          error: "NOT_FOUND",
          message: `Notification ${id} not found`,
        });
      }
      return reply.code(200).send({
        id: row.id,
        type: row.type,
        recipientType: row.recipient_type,
        recipientId: row.recipient_id,
        jobId: row.job_id,
        message: row.message,
        createdAt: row.created_at,
        readAt: row.read_at,
      });
    },
  );
}
