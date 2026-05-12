import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { assignJob, completeJob } from "../domain/jobs.js";
import {
  DomainError,
  InvalidReferenceError,
  JobAlreadyCompletedError,
  NotFoundError,
  QuoteAlreadyScheduledError,
  TimeSlotConflictError,
  WrongTechnicianError,
} from "../domain/errors.js";
import {
  AssignJobRequestSchema,
  CompleteJobRequestSchema,
  JobSchema,
} from "../domain/types.js";
import { ErrorEnvelope } from "../domain/types.js";

export async function jobsRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/api/jobs",
    {
      schema: {
        tags: ["jobs"],
        summary: "Assign a quote to a technician on a specific date and slot",
        body: AssignJobRequestSchema,
        response: {
          201: JobSchema,
          400: ErrorEnvelope,
          404: ErrorEnvelope,
          409: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
    },
    async (request, reply) => {
      try {
        const job = await assignJob(app.mysql, request.body);
        return reply.code(201).send(job);
      } catch (err) {
        if (err instanceof TimeSlotConflictError || err instanceof QuoteAlreadyScheduledError) {
          return reply.code(409).send({ error: err.code, message: err.message });
        }
        if (err instanceof NotFoundError) {
          return reply.code(404).send({ error: err.code, message: err.message });
        }
        if (err instanceof InvalidReferenceError) {
          return reply.code(400).send({ error: err.code, message: err.message });
        }
        if (err instanceof DomainError) {
          request.log.error({ err }, "unmapped domain error");
          return reply.code(500).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    },
  );

  typed.post(
    "/api/jobs/:id/complete",
    {
      schema: {
        tags: ["jobs"],
        summary: "Mark an assigned job as completed (technician action)",
        params: z.object({
          id: z.coerce.number().int().positive(),
        }),
        body: CompleteJobRequestSchema,
        response: {
          200: JobSchema,
          400: ErrorEnvelope,
          403: ErrorEnvelope,
          404: ErrorEnvelope,
          409: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { technicianId } = request.body;
      try {
        const job = await completeJob(app.mysql, id, technicianId);
        return reply.code(200).send(job);
      } catch (err) {
        if (err instanceof WrongTechnicianError) {
          return reply.code(403).send({ error: err.code, message: err.message });
        }
        if (err instanceof JobAlreadyCompletedError) {
          return reply.code(409).send({ error: err.code, message: err.message });
        }
        if (err instanceof NotFoundError) {
          return reply.code(404).send({ error: err.code, message: err.message });
        }
        if (err instanceof InvalidReferenceError) {
          return reply.code(400).send({ error: err.code, message: err.message });
        }
        if (err instanceof DomainError) {
          request.log.error({ err }, "unmapped domain error");
          return reply.code(500).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    },
  );
}
