# Plan — Service Scheduling & Notification System

> This file is committed first, before any code. It captures the decisions I'm making and the trade-offs behind them, so the rest of the repo reads as a deliberate build rather than a code dump.

## What this is

A scheduling system where multiple managers assign quotes to technicians on fixed 2-hour time slots, with backend-enforced conflict prevention and notifications. Built as a take-home for the Full-Stack Developer (Agentic) role at brix.

## How to read this repo

If you only have ten minutes:

1. This file — the decisions
2. `docs/ARCHITECTURE.md` — data model + conflict-prevention design
3. `README.md` — setup + how it runs
4. `backend/src/domain/jobs.ts` — the transaction wrapper (the load-bearing code)
5. `backend/tests/integration/conflict.test.ts` — the race-tested conflict prevention

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) + Material UI v6 + TypeScript |
| Backend | Node 22 + TypeScript + Fastify + Zod |
| API docs | OpenAPI / Swagger UI via `@fastify/swagger` + `@fastify/swagger-ui` (generated from Zod schemas — no duplication) |
| Database | MySQL 8 |
| Driver | `mysql2/promise` (no ORM — raw SQL with prepared statements) |
| Tests | Vitest |
| Local infra | Docker Compose for MySQL |
| Editor / dev workflow | Claude Code + custom code-review skill + `frontend-design` Claude Code plugin |

### Why OpenAPI / Swagger

The role description says *"Build APIs that agents can actually use. Our Golang APIs need to be structured, self-documenting (OpenAPI/Swagger)."* Same expectation applies regardless of backend language.

Each route declares its Zod schema for validation. `@fastify/swagger` serialises those same schemas into an OpenAPI 3 spec, so the docs are generated from the validators — no duplication, no manual sync.

`/docs` serves the interactive Swagger UI. `/docs/json` serves the raw spec for tooling (clients, agents, Postman imports).

### Why Node + TypeScript, not Go

The role description says *"Golang experience, or a genuinely strong backend foundation with the hunger to pick it up fast."*

My Golang coding experience is at zero. I could have generated Go with AI, but I couldn't have reviewed it at Senior level — and reviewing the code is what the role asks for. Submitting code I can't defend wouldn't be an honest demo.

Node + TypeScript with Fastify lets me ship code I can defend line by line. Same language across the full stack also keeps the demo cohesive — one type system, one tooling chain.

If you'd have preferred Go regardless, that's a fair call. The forward plan for Go is in *What I'd build next at brix scale*.

### Why no ORM

No Prisma, Drizzle, or TypeORM. Raw parameterised SQL via `mysql2/promise`. This is deliberate, not a gap.

The conflict-prevention design lives in the schema — the composite UNIQUE constraint and the `ER_DUP_ENTRY` handling are the load-bearing logic. An ORM would abstract that away. Raw SQL keeps it visible.

At five tables and eight endpoints, the ORM tax (setup, migration tooling, learning the query API) outweighs the benefits. ORMs earn their keep on larger schemas with complex relationship navigation. This isn't that.

At brix scale I'd evaluate Drizzle — a strong TypeScript-native option that stays close to SQL — once the schema grows or relationship navigation gets complex. Until then, raw SQL with prepared statements is the simpler, more direct choice.

## Clarifications I asked Jasmine before starting

Two things in the brief that genuinely affected the build:

1. **Time window — fixed grid or free-floating 2-hour duration?** → Fixed grid (9–11, 11–13, 13–15, 15–17). This collapsed the conflict-detection problem to uniqueness, which MySQL handles natively.
2. **Multi-manager — real auth or simulator?** → Simulator. "Acting as: [Manager dropdown]" sets the actor id on API calls.

The defaults I proposed in the email matched both her answers, so the design didn't shift.

## Conflict prevention — the headline decision

**The race condition:** two managers click "Assign" for the same technician + date + slot simultaneously.

**Naive approach (broken):**
```
SELECT id FROM jobs WHERE technician_id=? AND scheduled_date=? AND slot=?
-- both reads return empty
INSERT INTO jobs ...
-- both inserts succeed; conflict allowed
```

**This implementation:**
```sql
UNIQUE KEY uniq_tech_date_slot (technician_id, scheduled_date, slot)
```
The INSERT goes straight in. MySQL accepts the first transaction, rejects the second with errno 1062 (`ER_DUP_ENTRY`). The API maps that to 409 Conflict. **The race is decided by the storage engine, not the application.**

I considered `SELECT ... FOR UPDATE` and optimistic concurrency. Both work; both add complexity for the same outcome. For fixed grid slots, UNIQUE-on-composite-key is the simplest correct answer.

For free-floating intervals I'd have reached for Postgres's exclusion constraints (`EXCLUDE USING gist`). Fixed slots make MySQL the right fit.

## Transactions and ACID

Job assignment is three writes: insert the job, mark the quote scheduled, insert the assignment notification. They succeed or fail together.

- **Atomic:** wrapped in `beginTransaction` / `commit` / `rollback` in `backend/src/domain/jobs.ts`
- **Consistent:** schema-enforced invariants (FKs, UNIQUE constraints, ENUMs) — the app can't violate them by accident
- **Isolated:** InnoDB `REPEATABLE READ` default; UNIQUE index gives implicit row locks during INSERT
- **Durable:** InnoDB WAL with default `innodb_flush_log_at_trx_commit = 1`

The conflict path's `ER_DUP_ENTRY` triggers ROLLBACK — no partial state survives a failed assignment. Test #1 in `backend/tests/integration/conflict.test.ts` asserts this directly.

## Design principles — SOLID

Followed concretely, not by ceremony. Each principle's concrete manifestation is in `docs/ARCHITECTURE.md`. During build I ran a custom code-review skill against AI-generated output with a SOLID-focused prompt — see `docs/agentic-process/review-checklist.md` for the actual checklist used.

## Data model — summary

Five tables: `managers`, `technicians`, `quotes`, `jobs`, `notifications`. Full DDL in `docs/ARCHITECTURE.md` and `db/001_schema.sql`. Key decisions:

- `jobs` has a composite UNIQUE on `(technician_id, scheduled_date, slot)` — the conflict-prevention mechanism
- `jobs` has a UNIQUE on `quote_id` — one job per quote
- `notifications` has an index on `(recipient_type, recipient_id, read_at)` for the unread-badge query
- ENUMs on `slot` and `status` push enum invariants into the DB

## Tests

Five tests, focused on Brix's stated and implied business rules:

| # | Type | What it proves |
|---|---|---|
| 1 | Integration | Conflict race condition (concurrent INSERTs) — exactly one succeeds, one returns 409. Also asserts no partial state survives the rollback. |
| 2 | Integration | Job completion lifecycle + manager notification fires. Wrong technicianId → 403. |
| 3 | Integration | Assignment → technician notification fires. All three writes (job, quote, notification) land together. |
| 4 | Unit | Conflict-detection helper functions (error-code detection, 409 payload builder). |
| 5 | Unit | Notification message templating. |

I deliberately skipped frontend snapshot tests and end-to-end browser tests. Playwright on the assignment flow would be the production move; not where the time should go for a solo 5-7 hour build. Test count isn't the signal; testing the load-bearing logic is.

## Assumptions

Where the brief was silent and I made a call:

- **Date scope** — any date, not just today
- **Quote model** — minimal (id, reference, summary, status). No customer/line-items/totals
- **Seed data** — 5 managers, 5 technicians, 10 unscheduled quotes
- **Notification UX** — bell icon + unread-count badge in the AppBar
- **Manager scope** — managers can view any technician's schedule (needed to make sensible assignments)
- **Technician scope** — technicians see only their own schedule
- **Job completion authority** — only the assigned technician can complete a job; endpoint returns 403 otherwise
- **Conflict prevention scope** — per-technician slot collision only; no travel-time or shared-equipment conflicts

Full reasoning for each in `README.md` under Assumptions.

## Scope decisions

Deliberately not built, with reasons:

- **No authentication** (Jasmine confirmed dropdown simulator is fine)
- **No reassignment or cancellation** (brief lifecycle is `scheduled → completed` only)
- **No deployment** (brief said not production-ready)
- **Notifications are DB-backed simulations** (brief explicitly allowed DB or logs)

## How AI was used

Per the role's "AI generates the code, you make the call on what ships" framing:

- Claude Code in the terminal as the primary interface. CLAUDE.md files at the repo root and per-app for project memory.
- `frontend-design` Claude Code plugin skill for MUI component scaffolding. I evaluated it against MUI requirements before committing to it — it produced clean MUI under explicit prompting. See `docs/agentic-process/tooling-decisions.md`.
- Custom code-review skill run against AI-generated output before each commit. The checklist is in `docs/agentic-process/review-checklist.md`. SOLID adherence, ACID compliance, and the conflict-prevention path are checked there.
- Sub-agents used for parallel research tasks (e.g. evaluating routines vs. local Claude Code workflow).
- No agentic features in the product itself. Adding them would have been forced; the brief grades scheduling, not AI demos.

## What I'd build next at brix scale

Sketches, not commitments — what would change if this were going to production:

- **Real-time schedule updates** — when a manager assigns a job, push a server-sent event to the technician's open schedule page; the new job appears in place without a refresh. Same channel updates the bell-icon badge. About an hour's work — out of scope here, but the right production answer.
- **Automated PR review routine** — a Claude Code routine triggered on `pull_request.opened` running the code-review skill (`code.claude.com/docs/en/routines`).
- **Real auth + RBAC** — session cookies or JWT; manager/technician/admin roles; harden the GET endpoints.
- **Notifications: real channels** — outbox pattern → message broker → email/SMS/push.
- **Observability** — structured logging (pino), request tracing, metrics on conflict-rejection rate as a production signal.
- **Frontend e2e tests** — Playwright on the assignment flow.
- **Contract tests** — schema-driven for the API.
- **Pagination** — when unscheduled quote count grows.
- **My own Go ramp** — on joining, I'd take a small internal-tooling endpoint as a first build under a Go-fluent reviewer's eye, before touching customer-path code. Two-week target to being independently productive in the Go codebase.

## Time spent

About 7 hours of focused work over Tuesday–Thursday, including planning, build, tests, and documentation. Past the brief's 3–5 hour suggestion — I went over on the test rigor side because the conflict-prevention path is the load-bearing logic and was worth proving rather than asserting.

## What I'd do differently

- The notification panel doesn't have a snooze or mute feature — those are real product affordances that didn't fit the budget.

## Where to look

| You want to see... | Look at... |
|---|---|
| The conflict-prevention design | `docs/ARCHITECTURE.md` + `db/001_schema.sql` |
| The transaction wrapper | `backend/src/domain/jobs.ts` |
| The race-tested integration test | `backend/tests/integration/conflict.test.ts` |
| The assign-form UI | `frontend/src/features/scheduling/components/AssignQuoteForm.tsx` |
| The code-review checklist I used | `docs/agentic-process/review-checklist.md` |
| Tooling decisions (why frontend-design skill, why not routines) | `docs/agentic-process/tooling-decisions.md` |
| Setup instructions | `README.md` |
