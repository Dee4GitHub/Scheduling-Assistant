# CLAUDE.md — project memory (root)

This file is the root project memory for Scheduling-Assistant. It captures cross-cutting conventions that apply to both the frontend and the backend. Per-app conventions live in `frontend/CLAUDE.md` and `backend/CLAUDE.md`.

## Project context

Service scheduling and notification system. Managers assign quotes to technicians on fixed 2-hour time slots; backend enforces conflict prevention via a composite UNIQUE constraint; notifications are DB-backed and surfaced in the UI.

Take-home for a Full-Stack Developer (Agentic) role. See `docs/PLAN.md` for the design and decision rationale; see `README.md` (added later) for setup and how to run.

## Stack

- Frontend: Next.js 15 (App Router) + Material UI v6 + TypeScript
- Backend: Node 22 + TypeScript + Fastify + Zod
- Database: MySQL 8 (via Docker Compose locally)
- Driver: `mysql2/promise` (raw SQL with prepared statements; no ORM by design — see `docs/PLAN.md`)
- Tests: Vitest

## Cross-cutting conventions

- TypeScript strict mode on. No `any`. No `// @ts-ignore`. Casts only at Zod boundaries or where MUI's `SelectChangeEvent` requires.
- ESM modules across both workspaces.
- All files UTF-8. No smart quotes, no Unicode arrows, no em-dashes in code (printing to PowerShell breaks on cp1252).
- All filesystem paths in scripts and docs use forward slashes for cross-shell portability.
- Commit messages: conventional commits format (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- Branch naming: `feature/<name>` for new features, `bug/<name>-<n>` for fixes. Per the form Q3 answer.

## How AI is used in this project

Claude Code is the primary interface. CLAUDE.md files at root + per-app for project memory. Custom code-review skill run against AI-generated output before each commit — see `docs/agentic-process/review-checklist.md` (added during build).

The plan-review-before-execute discipline applies: before any non-trivial change, write the plan to a markdown note, review it, then execute. AI generates the code; the human makes the call on what ships.

## Where to find things

- Design and decisions: `docs/PLAN.md`
- Data model and conflict-prevention design: `docs/ARCHITECTURE.md` (added during build)
- Agentic process artifacts: `docs/agentic-process/`
- Frontend conventions: `frontend/CLAUDE.md`
- Backend conventions: `backend/CLAUDE.md`
