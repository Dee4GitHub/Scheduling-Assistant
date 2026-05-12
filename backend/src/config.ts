import { config as loadEnv } from "dotenv";
import { z } from "zod";

// Load .env from repo root first (one above backend/), then backend-local if present.
loadEnv({ path: "../.env" });
loadEnv();

const EnvSchema = z.object({
  DB_HOST: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_DATABASE: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Comma-separated list of allowed cross-origin frontends. Read in
  // production by the CORS plugin; ignored in development where any
  // origin is allowed. Default empty string falls back to
  // http://localhost:3000 in server.ts.
  CORS_ORIGIN: z.string().default(""),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Use console.error here — logger isn't initialised yet.
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;

// Safe view of env for logging — never expose secrets.
export function redactedEnvForLogs(): Record<string, unknown> {
  return {
    DB_HOST: env.DB_HOST,
    DB_PORT: env.DB_PORT,
    DB_USER: env.DB_USER,
    DB_PASSWORD: "[REDACTED]",
    DB_DATABASE: env.DB_DATABASE,
    PORT: env.PORT,
    NODE_ENV: env.NODE_ENV,
    CORS_ORIGIN: env.CORS_ORIGIN === "" ? "(default: http://localhost:3000)" : env.CORS_ORIGIN,
  };
}
