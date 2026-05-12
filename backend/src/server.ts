import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import { env, redactedEnvForLogs } from "./config.js";
import { closePool, getPool, pingDatabase, waitForDatabase } from "./db.js";
import { seedDatabase } from "./seed.js";
import { managersRoutes } from "./routes/managers.js";
import { techniciansRoutes } from "./routes/technicians.js";
import { quotesRoutes } from "./routes/quotes.js";
import { jobsRoutes } from "./routes/jobs.js";

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "DB_PASSWORD",
        "*.DB_PASSWORD",
        "password",
        "*.password",
      ],
      censor: "[REDACTED]",
    },
    transport:
      env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
        : undefined,
  },
}).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

await app.register(cors, {
  origin: env.NODE_ENV === "production" ? false : true,
  credentials: true,
});

await app.register(swagger, {
  openapi: {
    openapi: "3.1.0",
    info: {
      title: "Scheduling Assistant API",
      description:
        "Manager assigns quotes to technicians on fixed 2-hour slots. Backend-enforced conflict prevention via a composite UNIQUE constraint.",
      version: "0.1.0",
    },
    servers: [{ url: `http://localhost:${env.PORT}`, description: "Local dev" }],
    tags: [
      { name: "system", description: "Health and infra" },
      { name: "managers", description: "Manager directory" },
      { name: "technicians", description: "Technician directory and schedules" },
      { name: "quotes", description: "Quotes available for scheduling" },
      { name: "jobs", description: "Job assignment and lifecycle" },
      { name: "notifications", description: "DB-backed notification simulator" },
    ],
  },
  transform: jsonSchemaTransform,
});

await app.register(swaggerUi, {
  routePrefix: "/docs",
  uiConfig: { docExpansion: "list", deepLinking: false },
});

const pool = getPool();
app.decorate("mysql", pool);
await managersRoutes(app);
await techniciansRoutes(app);
await quotesRoutes(app);
await jobsRoutes(app);

app.get(
  "/health",
  {
    schema: {
      tags: ["system"],
      summary: "Liveness + database reachability",
      response: {
        200: z.object({
          status: z.literal("ok"),
          database: z.literal("reachable"),
          dbPingMs: z.number(),
        }),
        503: z.object({
          status: z.literal("degraded"),
          database: z.literal("unreachable"),
        }),
      },
    },
  },
  async (request, reply) => {
    const t0 = performance.now();
    try {
      await pingDatabase();
      const dbPingMs = Math.round(performance.now() - t0);
      if (dbPingMs > 100) {
        request.log.warn({ dbPingMs }, "slow database ping");
      }
      return reply.code(200).send({ status: "ok", database: "reachable", dbPingMs });
    } catch (err) {
      request.log.error({ err }, "database ping failed during healthcheck");
      return reply.code(503).send({ status: "degraded", database: "unreachable" });
    }
  },
);

// Process-level crash handlers — log structured AND flush before exiting.
// Pino's transport is async; calling process.exit synchronously after a fatal
// log can truncate the log itself. We flush (Pino API not on the public
// FastifyBaseLogger surface — narrow the type at the call site), then exit
// via setImmediate so any pending I/O drains for one tick.
function flushAndExit(code: number): void {
  const log = app.log as { flush?: () => void };
  log.flush?.();
  setImmediate(() => process.exit(code));
}

process.on("uncaughtException", (err) => {
  app.log.fatal({ err }, "uncaught exception, exiting");
  flushAndExit(1);
});

process.on("unhandledRejection", (reason) => {
  app.log.fatal({ reason }, "unhandled promise rejection, exiting");
  flushAndExit(1);
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "graceful shutdown initiated");
  try {
    await app.close();
    await closePool();
    app.log.info("shutdown complete");
    flushAndExit(0);
  } catch (err) {
    app.log.error({ err }, "error during shutdown");
    flushAndExit(1);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  app.log.info({ config: redactedEnvForLogs() }, "boot configuration");
  await waitForDatabase(app.log);
  await seedDatabase(pool, app.log);
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      openApiUi: `http://localhost:${env.PORT}/docs`,
      openApiJson: `http://localhost:${env.PORT}/docs/json`,
    },
    "server ready",
  );
} catch (err) {
  app.log.fatal({ err }, "failed to start server");
  flushAndExit(1);
}
