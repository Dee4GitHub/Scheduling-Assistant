# Scheduling Assistant

A small full-stack take-home for the brix Full-Stack Developer (Agentic) role. A scheduling system where multiple managers assign quotes to technicians on fixed 2-hour time slots, with backend-enforced conflict prevention and DB-backed notifications.

> The brief said "include a README explaining your decisions and trade-offs." This is graded as much as the code. I've kept it scannable and honest.

## How to read this repo

If you only have ten minutes:

1. This file — what was built and why
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data model, conflict prevention, ACID, design principles
3. [`docs/PLAN.md`](docs/PLAN.md) — the decisions and trade-offs I made before writing code (committed first, on purpose)
4. [`backend/src/domain/jobs.ts`](backend/src/domain/jobs.ts) — the transaction wrapper, the load-bearing code
5. [`backend/tests/integration/conflict.test.ts`](backend/tests/integration/conflict.test.ts) — proves the conflict prevention works under race

## Run it

You need Docker (compose v2). One command from a clean clone:

```bash
docker compose up -d --build
```

That brings up MySQL 8, the backend on `:4000`, and the frontend on `:3000`. Seed data is inserted idempotently on backend startup (5 managers, 5 technicians, 10 unscheduled quotes).

Open <http://localhost:3000> and pick a role to view the app as.

- Frontend: <http://localhost:3000>
- Backend: <http://localhost:4000>
- API docs (Swagger UI): <http://localhost:4000/docs>
- OpenAPI JSON: <http://localhost:4000/docs/json>
- Health: <http://localhost:4000/health>

Tear down: `docker compose down -v` (the `-v` drops the seed data; omit to keep it).

### Dev mode (without Docker for the apps)

```bash
docker compose up -d mysql      # MySQL only
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

### Tests

```bash
cd backend && npm test    # 8 integration tests against a real MySQL via the compose
cd frontend && npm test   # 11 unit tests (Vitest + RTL + jsdom)
```

19 tests total. Both green at the time of writing.

### Reset the demo data

If you exercise the assignment flow and run out of unscheduled quotes, reset the transactional data back to the post-seed state without rebuilding anything:

```bash
cd backend && npm run db:reset
```

Wipes `jobs` and `notifications`, flips every quote's status back to `unscheduled`. The managers, technicians, and quote references (Q-1042, Q-1051, ...) are preserved so you always start from the same seed. The SQL it runs lives in [`db/002_reset.sql`](db/002_reset.sql).

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) + Material UI v6 + TanStack Query |
| Backend | Node 22 + TypeScript + Fastify + Zod |
| API docs | OpenAPI / Swagger UI via `@fastify/swagger` (generated from Zod schemas — no duplicated definitions) |
| Database | MySQL 8 (InnoDB) |
| Driver | `mysql2/promise` (no ORM — raw SQL with prepared statements) |
| Tests | Vitest (backend integration + frontend unit) |
| Local infra | Docker Compose: mysql + backend + frontend |
| Dev workflow | Claude Code with hierarchical `CLAUDE.md`, custom skills, plan-before-execute |

**Fastify** is a schema-driven Node HTTP framework — faster and more TypeScript-native than Express. Its plugin ecosystem (`@fastify/cors`, `@fastify/swagger`) is mature and the Zod integration is first-class.

**Zod** is a TypeScript-first runtime validator. One schema declaration gives both runtime validation and inferred static types. Eliminates the duplicate-schema-and-type problem.

### Why Node + TypeScript

The brief said "API stack flexible — Go, Node/TS, or Python all fine, judgement is the job." I picked Node + TypeScript for three reasons:

1. **Same language full-stack.** Cohesive demo; one mental model.
2. **TypeScript reads as a strong-typing language to a .NET background.** 17 years of .NET translates to Node patterns at Senior level; the design choices and the code quality are genuinely mine to defend.
3. **The conflict-prevention design is the load-bearing part of the brief.** That's a SQL + schema question, not a language question. Putting it in a stack I read fluently keeps the reviewer's eye on the right thing.

### Why no ORM

No Prisma, Drizzle, or TypeORM. Raw parameterised SQL via `mysql2/promise`. Deliberate, not a gap.

The conflict-prevention design lives in the schema — the composite UNIQUE constraint and the `ER_DUP_ENTRY` handling are the load-bearing logic the brief is grading. Wrapping that behind an ORM's abstraction would weaken the demo; raw SQL keeps the reviewer's eye on the thing that matters.

At five tables and eight endpoints the ORM tax (setup, migrations, learning the query API) outweighs the benefits. ORMs earn their keep on 15+ table schemas with complex relationship navigation. This isn't that. At brix scale I'd evaluate Drizzle (closest-to-SQL of the modern options, TypeScript-native) once the schema grows.

## Data model

Five tables. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full schema diagram, FK directions, and constraint catalogue.

- `managers` (id, name, email)
- `technicians` (id, name, trade)
- `quotes` (id, reference, summary, status: `unscheduled` | `scheduled`)
- `jobs` (id, technician_id, quote_id, manager_id, scheduled_date, slot, status, assigned_at, completed_at)
- `notifications` (id, type, recipient_type, recipient_id, job_id, message, created_at, read_at)

Constraints worth pointing at:

- `jobs (technician_id, scheduled_date, slot)` — composite UNIQUE. The conflict-prevention enforcer.
- `jobs (quote_id)` — UNIQUE. One job per quote.
- All FK references are NOT NULL. No orphan rows possible.
- `slot` is an ENUM of `'09:00-11:00'`, `'11:00-13:00'`, `'13:00-15:00'`, `'15:00-17:00'`.

## Conflict prevention

The brief's most explicit ask:

> "Conflict prevention must be enforced on the backend."

**Two managers click "Assign" for the same technician + date + slot simultaneously.** Naive code does a read-then-write race (check the slot is free, then insert) — under concurrency, both reads see "free", both inserts succeed, you've double-booked.

My design pushes the race down to the storage engine:

1. **Composite UNIQUE constraint** on `(technician_id, scheduled_date, slot)`.
2. The assign-job code does a single `INSERT`. No prior `SELECT`.
3. The losing request gets `ER_DUP_ENTRY` (MySQL errno 1062) from the driver.
4. The route handler translates `errno 1062` on `uniq_tech_date_slot` into HTTP **409 Conflict** with `{ error: "TIME_SLOT_CONFLICT", message: "..." }`.

The race is decided by InnoDB's index serialisation, not by application code. This is **provably correct** — the storage engine cannot insert two rows that violate the UNIQUE constraint, period.

The integration test (`backend/tests/integration/conflict.test.ts`) fires two `INSERT`s in flight in parallel and asserts exactly one wins, one gets 409, and the data ends up consistent. Real backing store, no mocks.

For free-floating time intervals I'd reach for Postgres's `EXCLUDE USING gist (... WITH &&)` exclusion constraints; for the fixed 2-hour grid you confirmed, the problem collapses to uniqueness — which MySQL handles atomically with a composite UNIQUE key.

### Approaches rejected (briefly)

- **`SELECT ... FOR UPDATE` pessimistic locking** — more complex, holds row locks across the request, hurts concurrency, same outcome.
- **Optimistic concurrency with a version column** — overkill for a single-table conflict.
- **Application-level mutex** — broken under multi-instance scaling.
- **Read-then-write check** — the naive bug pattern; called out for contrast.

The completion path uses `SELECT ... FOR UPDATE` deliberately — it's a state transition (`scheduled → completed`) where two concurrent completions need to serialise. Different problem, different tool.

## Transactions and ACID

Job assignment is a three-write operation: insert the job, mark the quote scheduled, insert the assignment notification. These succeed or fail together.

- **Atomicity** — wrapped in `beginTransaction` / `commit` / `rollback`. The conflict path rolls back the transaction before throwing.
- **Consistency** — invariants live in the schema. FKs, UNIQUE constraints, ENUMs, NOT NULL. The application cannot violate them even by accident.
- **Isolation** — InnoDB default `REPEATABLE READ`. The UNIQUE index gives implicit row locks during `INSERT`; concurrent inserts for the same `(technician, date, slot)` serialise at the index level — the second one fails with errno 1062.
- **Durability** — InnoDB WAL with `innodb_flush_log_at_trx_commit = 1` (default). Not overridden.

The transaction wrapper shape is `getConnection` → `try { beginTransaction … commit }` → `catch { rollback }` → `finally { release }`. Every multi-write goes through this shape.

## Notifications

DB-backed simulator. The brief said "can be simulated (DB or logs)" — I picked DB because it's the contract surface a real system would wrap.

- A `notifications` row is inserted in the same transaction as the job change that emitted it.
- The frontend's bell icon polls (and refetches on focus) for unread count, scoped to the current viewer's `recipientType + recipientId`.
- Production would replace this with an outbox pattern → message broker → real channels (email/SMS/push). The contract surface (the typed `Notification` shape) is what would be wrapped.

## Assumptions

The brief didn't specify these. I made calls and documented them up front:

- **Date scope:** jobs can be scheduled on any future date, not just today. Manager picks technician, date, slot.
- **Quote model:** minimal — id, reference, summary, status. A real product would have customer details, line items, totals; out of scope.
- **Seed dataset:** 5 managers, 5 technicians, 10 unscheduled quotes. Enough to demo the flow without overwhelming the reviewer. Seed runs idempotently on backend startup.
- **Notification UX:** bell icon in the AppBar with a red unread badge that clears as items are viewed.
- **Manager scope:** managers can view any technician's schedule. They need to in order to make sensible assignment decisions.
- **Technician scope:** technicians see only their own schedule.
- **Job completion authority:** only the assigned technician can mark a job complete. The complete endpoint checks the actor's id matches the job's `technician_id` and returns 403 if not.
- **Conflict scope:** per-technician slot collision only. No travel-time-between-jobs, no shared-equipment, no overlap with other technicians.

## Scope decisions

Things deliberately not built, with the reason:

- **No authentication.** Confirmed with Jasmine. The role-picker on the home page sets the viewer for the demo. A real auth flow would have eaten hours and added no scoring signal.
- **Fixed time slots.** Confirmed with Jasmine. Windows are a fixed grid: 9–11, 11–13, 13–15, 15–17. Collapses the conflict problem to uniqueness (MySQL's strength) rather than interval overlap.
- **No job reassignment or cancellation.** Brief's lifecycle is `scheduled → completed` only.
- **No deployment pipeline.** Local Docker compose only. Brief said not production-ready.

## Tests

What's covered:

- **Backend (8 tests, Vitest + real MySQL):**
  - Conflict path under parallel inserts — UNIQUE constraint wins, one request gets 409, data stays consistent.
  - Job completion row-locking — concurrent completions serialise; only one succeeds.
  - Notification side-effects fire transactionally.
- **Frontend (11 tests, Vitest + React Testing Library + jsdom):**
  - `AssignJobForm`: submit emits the correct payload, the `isComplete` guard works, `resetCounter` clears the draft on success, the stale-id guard drops a vanished quote, submitting state disables the button.
  - `api.ts`: error envelope parses to `ApiError` with code/status, network failure becomes `INTERNAL_ERROR` status 0, 200 returns the parsed body, `unreadOnly` is sent as the literal string the backend's `z.enum` expects.

What's not covered: full UI flows (no Playwright/Cypress), no contract tests between frontend and backend, no load tests on the conflict path. These are listed under "What I'd build next" below.

## AI tooling — how I built this

The role description says *"AI agents generate the code. You review it for security, performance, and quality. If it's rubbish, you say so and fix it. That judgment is the job."* This section describes how I worked.

I used Claude Code as the primary author and reviewer. The workflow had three pieces:

1. **Hierarchical `CLAUDE.md` as project memory.** A root `CLAUDE.md` for cross-cutting conventions, a `backend/CLAUDE.md` for stack-specific backend rules (Fastify decoration, transactional multi-writes, ER_DUP_ENTRY mapping), a `frontend/CLAUDE.md` for frontend rules (MUI `sx`-only styling, useState for form drafts, sub-components prop-driven). When Claude edits the conflict-prevention code, MUI rules aren't in scope; when scaffolding a form, MySQL transaction rules aren't in scope. Keeps the context focused.

2. **Plan-before-execute.** `docs/PLAN.md` was committed first, before any code. It captures the decisions and the trade-offs so the rest of the repo reads as a deliberate build rather than a code dump. Every PR was scoped against the plan.

3. **Custom skills and self-review.** I used the `frontend-design` skill for the initial UI scaffolding (after running a viability test to confirm it produces clean MUI under steering — documented in `docs/agentic-process/`). I built a custom `quick-review` skill — a stripped-down code-review pipeline for small, short-lived repos that skips the git-archaeology agents the full code-review skill would run.

The frontend was developed alongside Chrome DevTools MCP — I drove the live browser to verify every UI slice before committing. Typecheck and curl aren't enough for UI feedback; the browser is.

See [`docs/agentic-process/`](docs/agentic-process/) for the longer-form notes on each: the hierarchical CLAUDE.md design, the quick-review skill, the plan-review-before-execute discipline, the frontend-design skill evaluation, and the browser-driven self-validation pattern.

### Branch and commit conventions

- Feature branches: `feature/<short-name>`. Bug fix branches: `bug/<short-name>-<number>`.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `style:`, `chore:`).
- Each commit is reviewable on its own — small, atomic, with a why-not-what message body.

## What I'd build next at brix scale

Forward plan, not regret:

- **Real-time schedule updates.** Server-sent events from the backend; when a manager assigns a job, the technician's open schedule page picks up the new row in place, no refresh. Same channel updates the bell-icon badge.
- **Automated PR review routine.** Claude Code routine on `pull_request.opened` running a custom review skill.
- **Real auth + RBAC.** Session cookies or JWT; manager/technician/admin roles; harden the GET endpoints.
- **Real notification channels.** Outbox pattern → message broker → email/SMS/push.
- **Observability.** Structured logging (pino, already in place), request tracing, metrics on conflict-rejection rate as a production signal.
- **Frontend e2e tests.** Playwright on the assignment flow.
- **Contract tests.** Schema-driven for the API surface.
- **Pagination.** Once unscheduled quote counts grow past ~50.

## What's missing

Honest gaps:

- **No frontend e2e tests.** Unit tests cover the form's pure logic; UI flows are verified by hand (via Chrome DevTools MCP, but not automated).
- **No accessibility audit.** MUI gives a lot for free; nothing custom verified.
- **No CI/CD.** A brix-scale repo would have GitHub Actions: lint, typecheck, test, build-on-PR.
- **Single-author repo.** No code review by another human. The custom quick-review skill is the substitute.

## Repo layout

```
.
├── README.md                       # This file
├── CLAUDE.md                       # Root: project memory, conventions
├── docker-compose.yml              # mysql + backend + frontend
├── docs/
│   ├── PLAN.md                     # Decisions and trade-offs, committed first
│   ├── ARCHITECTURE.md             # Data model, conflict prevention, ACID, design principles
│   ├── TEST_CASES.md               # Acceptance test plan
│   └── agentic-process/            # How I worked with Claude Code
├── backend/
│   ├── CLAUDE.md                   # Backend stack-specific rules
│   ├── Dockerfile
│   ├── src/                        # Fastify routes + domain helpers + db pool
│   └── tests/integration/          # Vitest against real MySQL
└── frontend/
    ├── CLAUDE.md                   # Frontend stack-specific rules
    ├── Dockerfile
    ├── src/                        # Next.js App Router pages + MUI components
    └── src/**/*.test.{ts,tsx}      # Vitest + RTL + jsdom
```
