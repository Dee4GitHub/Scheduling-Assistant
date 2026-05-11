# CLAUDE.md — backend conventions

Companion to the root `CLAUDE.md`. Conventions specific to the Node + TypeScript + Fastify backend.

## Stack

- Node 22 + TypeScript (ESM)
- Fastify HTTP server
- Zod for request/response validation and TypeScript type inference
- `mysql2/promise` for database access (no ORM)
- Vitest for tests

## Architecture rules

- **Route handlers do HTTP only:** parse, validate (Zod), call a domain helper, respond, map errors.
- **Domain helpers do logic only:** no HTTP framework imports, no global state. They receive the DB connection or pool as a parameter.
- **`db.ts` only manages the pool.** No queries live here.
- **Notification builders are pure functions of `Job` data.** They return shapes; they do not write to the database.
- **Dependency inversion:** route handlers get the DB pool via Fastify decoration (`fastify.mysql`), not via direct import.

## ACID / transactions

- Every multi-write operation runs in a transaction. The pattern is:
  ```typescript
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // ... writes
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  ```
- ROLLBACK in catch, connection release in finally. No exceptions.
- Conflict path: catch `ER_DUP_ENTRY` (errno 1062) on `uniq_tech_date_slot`, map to 409 Conflict response.

## SQL rules

- All queries use parameterised placeholders. No string interpolation into SQL, ever.
- Prepared statements via `mysql2/promise`'s `?` placeholders.
- Schema lives in `db/001_schema.sql` — runs on backend startup if tables don't exist.
- Invariants live in the schema (FKs, UNIQUE, ENUMs, NOT NULL). The app cannot violate them by accident.

## SQL naming conventions (lowercase + snake_case, always)

MySQL is case-sensitive on Linux for database and table names, case-insensitive on Windows. To avoid the dev/prod trap, all database object names use lowercase + snake_case without exception:

- Database: `scheduling`
- Tables: `managers`, `technicians`, `quotes`, `jobs`, `notifications`
- Columns: `technician_id`, `scheduled_date`, `created_at`
- Indexes: `idx_recipient_unread`
- Unique keys: `uniq_tech_date_slot`, `uniq_quote`
- Foreign keys: `fk_jobs_technician_id` (if explicitly named)
- ENUM values: lowercase with hyphens or underscores (`'09:00-11:00'`, `'job_assigned'`)

Belt-and-braces: the docker-compose `mysql:8` container is configured with `lower_case_table_names=1` so any accidental uppercase identifier gets folded to lowercase at create time. This makes the dev/prod behaviour identical.

**Reject any SQL that uses CamelCase or PascalCase for tables/columns.** Even if it would work locally, it breaks production on Linux.

## Validation

- Zod schemas at every route boundary. Reject malformed requests with 400 + structured error envelope `{ error: 'CODE', message: '...' }`.
- TypeScript types inferred from Zod schemas via `z.infer<typeof Schema>` — no duplicate definitions.

## Error envelope

All API errors follow:
```json
{ "error": "ERROR_CODE", "message": "Human-readable message" }
```

Known codes: `VALIDATION_FAILED` (400), `TIME_SLOT_CONFLICT` (409), `NOT_AUTHORIZED` (403), `NOT_FOUND` (404).

## File naming

- Source files: `camelCase.ts`
- Test files: `*.test.ts`
- Directory grouping: `routes/`, `domain/`, `tests/`

## What Claude should default to

- ESM imports/exports.
- `async/await` everywhere. No raw promise chains.
- Throw typed errors from domain helpers; let the route handler map them to HTTP responses.
- Log structured (key=value pairs or JSON). Avoid `console.log` in production code paths.
