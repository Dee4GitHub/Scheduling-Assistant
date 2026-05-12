# NEXT_TASKS_PR6.md — Resume PR #6 from here

**Read this file FIRST after `/clear`**, after MEMORY.md auto-loads.

Paired with: `C:\Users\deepa\.claude\projects\D--Personal-Resume-USJobs\memory\session_log_2026_05_11_to_12_brix_build.md` (UPDATE 2026-05-12 section is the rich history).

## State as of pause (2026-05-12 evening)

- **Branch:** `feature/frontend-and-readme` at commit `e3df509`
- **Commits ahead of main:** 10
- **Not yet pushed.** No PR opened on GitHub yet.
- **Main:** `1b1d46d` (PR #5 merged)
- **Submission deadline:** Friday 2026-05-15 10am Sydney

## Resume command

```bash
cd /d/Training/BrixAssessment
git status                                # Confirm on feature/frontend-and-readme, clean
git log --oneline main..HEAD              # Confirm 10 commits ahead
```

Expected: 10 commits from `1ba19bd` (TEST_CASES.md) through `e3df509` (notification panel + design pass).

## Outstanding bug — UI font hierarchy still not right

**Deepak's last message before clear:** *"still the UI is not correct, the font sizes look very ugly"*

The placeholder-vs-label fix went in (commit `e3df509`) but the **overall typography hierarchy still reads as ugly**. Things to investigate when resuming:

1. The mono "A B C D E" tag is `0.7rem` weight 600 — may be too thin and too small relative to the uppercase overline label.
2. The uppercase overline label is `0.7rem` with 0.12em tracking — visually competing with the tag rather than dominating.
3. Field-internal placeholder is normal MUI body text (whatever default Select uses) — may still feel bigger than the overline.
4. The H4 page heading (2rem, weight 700) is fine on its own but maybe disconnected from the form's small overline labels — a missing tier.
5. The "WO-001 WORK ORDER DRAFT" sub-header inside the manager card has the same overline-size as the field labels — not enough hierarchy.

**Suggested fixes to try (in order):**
1. Bump the field overline label from `overline` variant (~0.7rem) to a larger `subtitle2` (~0.875rem) with same tracking, so it dominates the placeholder text.
2. Make the mono A/B/C tag smaller, not larger — it's an annotation, not a primary element.
3. Add a `h6` "SECTION" header inside cards (e.g. "Work Order Draft") so there's a middle tier between page-H4 and field-overline.
4. Re-check the home page — same labels there, same issue.
5. Re-run browser self-check after each tweak — typography decisions only confirm in the browser.

**Don't redo the whole design pass.** It's broadly correct (industrial-editorial, mono+sans pair, document stripes). The issue is local — the field-label size relative to placeholder size. One-file fix in `AssignJobForm.tsx` + `RolePicker.tsx` should resolve it.

## Tasks completed in PR #6 so far (do NOT redo)

| # | Task | Commit |
|---|---|---|
| 31 | Plan frontend + final docs scope | (planning, no commit) |
| 32 | Create feature/frontend-and-readme branch | branch created from main |
| 33 | Scaffold Next.js 15 + MUI v6 in frontend/ | `efa55bd` |
| 34 | Type-safe API client + Zod-mirrored types + query keys | `505e61a` |
| 35 | Manager dashboard page + AssignJobForm + RolePicker + RoleStrip dropdown | `4622da1`, `bc4ac0b`, `dd093cf`, `db98bad` |
| 36 | Technician schedule page + ScheduleGrid + complete-job flow | `62de659` |
| 37 | Notification bell + panel | `e3df509` (bundled with design pass) |
| 44 | Design pass via frontend-design skill | `e3df509` |

Also done in branch:
- Acceptance test plan `docs/TEST_CASES.md` — `1ba19bd`
- Folder regroup into shell/role/notifications/manager/technician — `167060b`
- NEXT_TASKS_PR6.md (this file) — `6241274`

## Tasks remaining for PR #6

| # | Task | Notes |
|---|---|---|
| **NEW** | Fix font hierarchy ugliness | **TOP PRIORITY.** Per Deepak's last message before /clear: "still the UI is not correct, the font sizes look very ugly". See "Outstanding bug" section above for specific fixes to try. Use the `frontend-design` skill if you go deep; self-validate via Chrome DevTools MCP. Don't redo the whole design pass — bones are right, only typography sizing needs tuning. |
| 38 | Docker-compose frontend wiring | Add frontend service to `docker-compose.yml`, depends_on backend healthy, expose `:3000`. Dockerfile in `frontend/` if not yet present. |
| 39 | Manual UI test against TEST_CASES.md | Walk through `docs/TEST_CASES.md` end-to-end via browser (use Chrome DevTools MCP). Tick the boxes. |
| 40 | README.md | Single source of truth at repo root. Setup, run, test, architecture summary, trade-offs, AI/agentic notes. See `D:\Personal\Resume\AustraliaJobs\Brix\Assessment\README_NOTES.md` for accumulated content to distil. |
| 41 | docs/ARCHITECTURE.md | Data model, conflict-prevention design (PR #4 schema-authoritative UNIQUE + ER_DUP_ENTRY), ACID rationale, completion row-lock (PR #5 SELECT FOR UPDATE), notification builder/writer split. Distil from `docs/PLAN.md` + commit messages. |
| 42 | docs/agentic-process/* | CLAUDE.md hierarchy explanation, quick-review skill design (cheaper than official code-review), plan-before-execute discipline, frontend-design skill use, browser-driven self-validation pattern. Multiple short MD files matching the folder structure already referenced in docs/PLAN.md. |
| 43 | Commit, push, open PR, run quick-review, merge | Final PR. Address ≥80 findings. Squash-merge. Sync local main. Branch already pushed at commit `6241274` — opening the PR is just `gh pr create ...`. |

## Decision context — read session_log_2026_05_11_to_12_brix_build.md for full detail

- Folder structure: Option B (feature folders) — locked
- State libs: TanStack Query yes, react-hook-form no — locked
- Date format: dual (ISO wire / DD/MM/YYYY display) — locked
- Home page picker + RoleStrip header dropdown — locked
- Industrial-editorial design direction — applied via frontend-design skill in `e3df509`

## Critical files

- `docs/TEST_CASES.md` — acceptance gate
- `frontend/CLAUDE.md` — frontend conventions (sx-only, useState for forms, sub-components prop-driven)
- `backend/CLAUDE.md` — backend conventions (Fastify decoration, transactional multi-writes, ER_DUP_ENTRY → 409)
- Root `CLAUDE.md` — cross-cutting (no em-dashes in UI strings, conventional commits, branch naming)
- `frontend/src/theme.ts` — design system tokens (IBM Plex Sans + Mono via next/font, terracotta accent, primary teal)

## Skill/tool reminders

- **Quick-review skill** installed at `~/.claude/skills/quick-review/` — use on PR #6 in Task 43.
- **Chrome DevTools MCP** — drive the live UI on `http://localhost:3000` for every UI slice. Tools surface via ToolSearch with `select:mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`.
- **Backend** runs at `http://localhost:4000` via `cd backend && npm run dev`. Or `docker compose up -d` for the full backend stack.
- **Frontend dev** is `cd frontend && npm run dev` on port 3000. If port held by stale process: `Get-NetTCPConnection -LocalPort 3000` to find PID, `Stop-Process -Id <pid> -Force` to kill (don't use bash `pkill` — unreliable on Windows for Node).
- **gh CLI** at `/c/Program Files/GitHub CLI/gh.exe`.

## Cost/context discipline

- Use sub-agents for code-review and exploration; cheaper than inline.
- Don't load entire files when grep + targeted reads work.
- Browser-drive every UI slice before claiming done — Deepak has explicitly asked for self-verification ("can you self-check the browser").
