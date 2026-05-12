# Hierarchical `CLAUDE.md`

Three `CLAUDE.md` files live in this repo:

```
/CLAUDE.md             # Root: project-wide conventions
/backend/CLAUDE.md     # Backend stack-specific rules
/frontend/CLAUDE.md    # Frontend stack-specific rules
```

Each file is loaded into Claude's context only when relevant. When Claude edits a file under `backend/src/`, both `/CLAUDE.md` and `/backend/CLAUDE.md` are in scope. When it edits a file under `frontend/src/`, both `/CLAUDE.md` and `/frontend/CLAUDE.md` are in scope. The other app's rules aren't.

## Why split it

Single-file CLAUDE.md grows unbounded. By the time you're 200 lines in, every edit pulls in the whole document — including rules that don't apply.

A hierarchical split keeps context focused:

- When Claude is editing the conflict-prevention code (`backend/src/domain/jobs.ts`), it shouldn't have MUI `sx`-prop rules in scope.
- When Claude is scaffolding a form (`frontend/src/components/manager/AssignJobForm.tsx`), it shouldn't have MySQL transaction rules in scope.

Same principle as folder-scoped imports: bring in what you need, not everything.

## What each file contains

**Root `CLAUDE.md`** — cross-cutting:

- Branch naming conventions (`feature/X`, `bug/X-N`)
- Conventional-commit format
- No em-dashes in UI strings (style)
- Repo-wide directory layout

**`backend/CLAUDE.md`** — backend-only:

- Fastify decoration pattern (DB pool, not import)
- Every multi-write must be in a transaction
- `ER_DUP_ENTRY` (errno 1062) on `uniq_tech_date_slot` → 409 `TIME_SLOT_CONFLICT`
- Notification builders are pure functions of Job data; writer is separate
- Zod schemas at every route boundary
- No string-interpolated SQL; parameterised only

**`frontend/CLAUDE.md`** — frontend-only:

- All styling via `sx` prop. No CSS files. No utility classes.
- Forms use `useState` for the draft. No `react-hook-form`.
- Sub-components are prop-driven. They don't import mock data or call `fetch` directly.
- `<Select>` placeholders: italic-muted, smaller than the field label they sit under (typography hierarchy rule)
- Date format: ISO `YYYY-MM-DD` on the wire, `DD/MM/YYYY` in the UI

## Trade-off

It's three files to maintain instead of one. The cost is real but it's small at this scale.

I'd revisit if the repo grew past 20+ files of conventions per area. At that point a `docs/conventions/` folder linked from each `CLAUDE.md` would be cleaner.
