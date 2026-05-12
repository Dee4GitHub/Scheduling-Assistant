import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { assignJob } from "../domain/jobs.js";
import {
  DomainError,
  InvalidReferenceError,
  NotFoundError,
  QuoteAlreadyScheduledError,
  TimeSlotConflictError,
} from "../domain/errors.js";
import { AssignJobRequestSchema, JobSchema } from "../domain/types.js";
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
}
