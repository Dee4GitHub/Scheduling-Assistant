# Architecture

The technical-rigour reference for the build. Pair this with [`PLAN.md`](PLAN.md) (the trade-offs) and the [root `README.md`](../README.md) (the runnable surface).

## System shape

```
┌────────────────────┐      HTTP/JSON       ┌─────────────────────┐      mysql2/promise      ┌─────────────────┐
│  Next.js frontend  │  ──────────────────► │  Fastify backend    │  ──────────────────────► │   MySQL 8       │
│  Port 3000         │                       │  Port 4000          │                          │   Port 3306     │
│  React + MUI v6    │  ◄──────────────────  │  Zod-typed routes   │  ◄──────────────────────  │   InnoDB         │
│  TanStack Query    │      JSON / 4xx-5xx   │  OpenAPI at /docs   │      ResultSet / errno   │   utf8mb4       │
└────────────────────┘                       └─────────────────────┘                          └─────────────────┘
```

Three containers, one network, two published ports. The browser fetches the frontend from `:3000`, the frontend's JS fetches the API from `:4000`. Cross-origin in the browser, same machine on the host.

## Data model

Five tables. All identifiers are lowercase snake_case (Linux MySQL is case-sensitive on table names). All tables are InnoDB + utf8mb4.

### `managers`

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED PK` | auto-increment |
| `name` | `VARCHAR(120) NOT NULL` | |
| `email` | `VARCHAR(255) NOT NULL UNIQUE` | |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | |

### `technicians`

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED PK` | auto-increment |
| `name` | `VARCHAR(120) NOT NULL` | |
| `trade` | `VARCHAR(60) NOT NULL` | HVAC, Refrigeration, Ducting |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | |

### `quotes`

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED PK` | auto-increment |
| `reference` | `VARCHAR(20) NOT NULL UNIQUE` | e.g. `Q-1042` |
| `summary` | `VARCHAR(255) NOT NULL` | |
| `status` | `ENUM('unscheduled', 'scheduled')` | default `unscheduled` |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | |

### `jobs` — the conflict-prevention table

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED PK` | auto-increment |
| `technician_id` | `BIGINT UNSIGNED NOT NULL` | FK → `technicians(id)` |
| `quote_id` | `BIGINT UNSIGNED NOT NULL` | FK → `quotes(id)` |
| `manager_id` | `BIGINT UNSIGNED NOT NULL` | FK → `managers(id)` |
| `scheduled_date` | `DATE NOT NULL` | |
| `slot` | `ENUM('09:00-11:00', '11:00-13:00', '13:00-15:00', '15:00-17:00')` | fixed grid |
| `status` | `ENUM('scheduled', 'completed')` | default `scheduled` |
| `assigned_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | |
| `completed_at` | `TIMESTAMP NULL` | set on completion |

**Constraints:**

- `UNIQUE KEY uniq_tech_date_slot (technician_id, scheduled_date, slot)` — the conflict-prevention enforcer
- `UNIQUE KEY uniq_quote (quote_id)` — one job per quote
- `FK fk_jobs_technician` / `fk_jobs_quote` / `fk_jobs_manager` — no orphans

### `notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED PK` | auto-increment |
| `type` | `ENUM('job_assigned', 'job_completed')` | discriminant |
| `recipient_type` | `ENUM('technician', 'manager')` | |
| `recipient_id` | `BIGINT UNSIGNED NOT NULL` | not FK — recipient could be either table |
| `job_id` | `BIGINT UNSIGNED NOT NULL` | FK → `jobs(id)` |
| `message` | `VARCHAR(255) NOT NULL` | |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | |
| `read_at` | `TIMESTAMP NULL` | set when marked read |

Indexed by `(recipient_type, recipient_id, read_at)` for the unread-count query.

The full schema is in [`db/001_schema.sql`](../db/001_schema.sql) and applied to MySQL on container init via the compose volume mount.

## Conflict prevention

The brief's explicit ask:

> "Conflict prevention must be enforced on the backend."

### The race

Two managers click "Assign" for the same technician + date + slot simultaneously. Naive code does a read-then-write race:

```
read("is slot free?") -> yes
                                read("is slot free?") -> yes
write(slot)            -> ok
                                write(slot)            -> ok  ← double-booked
```

Under any concurrency at all, this is broken.

### The design

1. Composite `UNIQUE` constraint on `(technician_id, scheduled_date, slot)` — the storage engine refuses to insert two rows that collide.
2. The assign-job code does a single `INSERT`. No prior `SELECT`.
3. The losing request gets `ER_DUP_ENTRY` (MySQL errno 1062) on the constraint name `uniq_tech_date_slot` from the driver.
4. The route handler translates that into HTTP **409 Conflict** with a typed envelope: `{ error: "TIME_SLOT_CONFLICT", message: "..." }`.

The race is decided by InnoDB's index serialisation, not by application code. The integration test (`backend/tests/integration/conflict.test.ts`) fires two parallel inserts and asserts exactly one wins, one gets 409, no double-booking.

### Why MySQL and not Postgres

For free-floating time intervals I'd reach for Postgres's `EXCLUDE USING gist (... WITH &&)` exclusion constraints — they handle interval overlap natively. For the fixed 2-hour grid Jasmine confirmed, the problem collapses to uniqueness, which MySQL handles atomically with a composite UNIQUE key. Right tool for the actual constraint shape.

### Approaches rejected

| Approach | Why not |
|---|---|
| `SELECT ... FOR UPDATE` pessimistic locking | More complex, holds row locks across the request, hurts concurrency, same outcome |
| Optimistic concurrency with a version column | Overkill for a single-table conflict |
| Application-level mutex | Broken under multi-instance scaling |
| Read-then-write check | The naive bug pattern — illustrated above for contrast |

### Where pessimistic locking IS used

The completion path uses `SELECT ... FOR UPDATE` deliberately. Marking a job complete is a state transition (`scheduled → completed`) where two concurrent completions need to serialise — without the row lock, both could read `status='scheduled'` then both write `completed`, with the second one stomping the first one's `completed_at`. The lock holds for the duration of the transaction so the second request sees `completed` and returns `JOB_ALREADY_COMPLETED` (409).

Different problem (state machine vs uniqueness), different tool (row lock vs index constraint).

## Transactions and ACID

Job assignment is a three-write operation:

1. `INSERT INTO jobs (...)` — guarded by `uniq_tech_date_slot` and `uniq_quote`
2. `UPDATE quotes SET status='scheduled' WHERE id = ?`
3. `INSERT INTO notifications (...)` — recipient is the technician

These succeed or fail together. The wrapper shape:

```typescript
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  const job = await insertJob(conn, input);
  await markQuoteScheduled(conn, input.quoteId);
  await insertNotification(conn, buildAssignmentNotification(job));
  await conn.commit();
  return job;
} catch (err) {
  await conn.rollback();
  throw mapDriverError(err);
} finally {
  conn.release();
}
```

The four ACID properties, with how each is satisfied here:

- **Atomicity** — the `beginTransaction` / `commit` / `rollback` wrapper. The conflict path rolls back before throwing the typed error.
- **Consistency** — invariants live in the schema: FKs, UNIQUE constraints, ENUMs, NOT NULL. The application cannot violate them even by accident.
- **Isolation** — InnoDB default `REPEATABLE READ`. The UNIQUE index gives implicit row locks during `INSERT`; concurrent inserts for the same `(technician, date, slot)` serialise at the index level — the second one fails with errno 1062 before reaching READ-COMMITTED-style visibility issues.
- **Durability** — InnoDB WAL with `innodb_flush_log_at_trx_commit = 1` (default). Not overridden.

Every multi-write operation in the backend goes through this wrapper shape. See `backend/src/domain/jobs.ts`.

## Permissions matrix

The demo has no authentication — the role-picker on the home page sets the viewer for the demo. This table documents what the API surface allows in principle.

| Actor | Action | Allowed? | Enforced by |
|---|---|---|---|
| Manager | View any technician's schedule | Yes | API: no filter on viewer |
| Manager | Assign quote to technician | Yes | `POST /api/jobs` accepts any `managerId` in the body |
| Manager | Mark a job complete on technician's behalf | No | `POST /api/jobs/:id/complete` requires `technicianId` matching the job |
| Manager | Cancel or reassign a job | No | Endpoint doesn't exist |
| Technician | View own schedule | Yes | Frontend filters by viewing technician id |
| Technician | View another technician's schedule | No | Frontend doesn't expose; API not hardened (out of scope) |
| Technician | Mark own job complete | Yes | API checks `technicianId` matches the job's assigned technician |
| Technician | Mark another technician's job complete | No | `POST /api/jobs/:id/complete` returns 403 `WRONG_TECHNICIAN` |
| Multiple managers assigning to same technician simultaneously | — | Allowed; resolved by DB UNIQUE constraint | See Conflict Prevention above |

## API surface

Eight endpoints. Full interactive docs at `http://localhost:4000/docs` (Swagger UI), JSON spec at `/docs/json`. Schemas are Zod, validators and OpenAPI definitions both generated from the same source — no duplication.

| Method | Path | Purpose | Errors |
|---|---|---|---|
| GET | `/health` | Liveness + DB ping | 503 if DB unreachable |
| GET | `/api/managers` | List all managers | — |
| GET | `/api/technicians` | List all technicians | — |
| GET | `/api/quotes?status=...` | List quotes (filterable by status) | — |
| POST | `/api/jobs` | Assign a quote to a technician on a slot | 400 validation (including past `scheduledDate`), 404 not found, 409 conflict, 409 quote-already-scheduled |
| POST | `/api/jobs/:id/complete` | Mark job complete (technician only) | 403 wrong technician, 404 not found, 409 already completed |
| GET | `/api/technicians/:id/schedule?date=...` | A technician's schedule for a date | 404 if technician not found |
| GET | `/api/notifications?recipientType=...&recipientId=...&unreadOnly=...` | Notifications for a recipient | — |
| POST | `/api/notifications/:id/read` | Mark a notification read | 404 if not found |

### Error envelope

Every 4xx and 5xx returns `{ error: "STABLE_CODE", message: "Human-readable" }`. The frontend's `ApiError` class parses this and the UI switches on the stable code (not the message string) for inline alerts.

Stable codes used:

- `TIME_SLOT_CONFLICT`
- `QUOTE_ALREADY_SCHEDULED`
- `NOT_FOUND`
- `INVALID_REFERENCE`
- `WRONG_TECHNICIAN`
- `JOB_ALREADY_COMPLETED`
- `VALIDATION_FAILED` (Zod-rejected request body)
- `INTERNAL_ERROR` (anything else)

## Design principles

The code follows SOLID concretely, not by ceremony:

- **Single Responsibility** — route handlers do HTTP only, domain helpers (`backend/src/domain/jobs.ts`) do logic only, `db.ts` does connection pooling only. Notification builders are pure functions of job data, separate from the writer.
- **Open / Closed** — notification types are a discriminated union; adding `job_rescheduled` requires a new builder and a new handler, not a change to existing ones. Slot-equality conflict detection treats all slots uniformly — no per-slot branching.
- **Liskov Substitution** — the `Notification` union has a single structural contract every subtype satisfies. React prop interfaces give the frontend equivalent.
- **Interface Segregation** — each API endpoint returns the narrow shape its caller needs, not a universal mega-DTO. Each component accepts only the props it uses.
- **Dependency Inversion** — route handlers receive the DB pool via Fastify decoration (`app.decorate("mysql", pool)`) rather than importing it. Domain helpers are pure. Frontend sub-components receive callbacks, not concrete fetch logic — the page component is the composition root.

## Frontend architecture

- **Next.js 15 App Router** — routes are `/`, `/manager`, `/technician/[id]`. The home route is the role picker; the others are the per-role pages. AppShell renders the header (wordmark + role strip + notification bell), hidden on the home route since you haven't picked an identity yet.
- **TanStack Query** — every server fetch is wrapped in a `useQuery` (reads) or `useMutation` (writes). 30s stale time. Mutations invalidate the keys they affect (e.g. assigning a job invalidates `quotes`, the affected technician's `schedule`, and the technician's `notifications`).
- **Material UI v6** — all styling via the `sx` prop. No CSS files, no className utility classes, no Tailwind. A custom theme in `frontend/src/theme.ts` sets the dark-teal primary, warm off-white background, terracotta secondary, and 8px border radius.
- **Forms** — `useState` for the draft, no `react-hook-form`. The form sub-components are prop-driven and receive `onSubmit` callbacks from the page; they don't call `fetch` themselves.
- **Stale-id guard** — when a successful assignment refetches the unscheduled quote list, the just-assigned quote disappears. The form computes `effectiveQuoteId` during render so MUI's Select never sees an out-of-range value.
- **Reset-on-success** — the page bumps a `resetCounter` integer in state inside the mutation's `onSuccess`. The form watches the counter via `useEffect` and clears its draft. Counter (not boolean) so two successive submissions both fire the reset.

## Backend architecture

- **Fastify with the Zod type provider** — every route's body, params, query, and response are Zod schemas. Same schemas serialise into the OpenAPI spec.
- **`@fastify/cors`** — enabled. Dev mode allows any origin; production reads `CORS_ORIGIN` from env.
- **`mysql2/promise` pool** — single pool, decorated onto the Fastify instance. Handlers get connections from the pool, return them in `finally`.
- **Pino logger** — structured JSON logs in production, pino-pretty in development. Sensitive fields (`DB_PASSWORD`, `authorization` headers, `cookie` headers) are redacted at the logger level.
- **Idempotent seed** — `seed.ts` runs on backend startup and inserts the demo data only if the table is empty. Wrapped in a transaction so a partial seed can't happen.
- **Graceful shutdown** — `SIGINT` and `SIGTERM` trigger `app.close()` → `pool.end()` → exit. Process-level handlers on `uncaughtException` and `unhandledRejection` flush the logger before exit.
- **Healthcheck** — `GET /health` returns 200 with `dbPingMs` if MySQL responds inside 100ms, 503 otherwise. The Docker healthcheck calls this endpoint.

## Tests

| Layer | Framework | What | Count |
|---|---|---|---|
| Backend | Vitest | Integration against a real MySQL via docker compose. Conflict path under parallel inserts; completion row-locking under parallel completes; transactional notification side-effects. | 8 |
| Frontend | Vitest + RTL + jsdom | `AssignJobForm`: payload, `isComplete` guard, `resetCounter` reset, stale-id guard, submitting state. `api.ts`: error envelope parse, network failure → `INTERNAL_ERROR`, 200 body, `unreadOnly` query format. | 11 |

Run them:

```bash
cd backend && npm test
cd frontend && npm test
```

19 tests, all green. What's not covered: full UI flows (no Playwright), no contract tests between frontend and backend, no load tests on the conflict path. Listed under "What I'd build next" in the README.
