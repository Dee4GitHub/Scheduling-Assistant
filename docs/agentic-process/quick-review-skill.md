# Quick-review skill

I wrote a custom `quick-review` Claude Code skill for this build, installed at `~/.claude/skills/quick-review/`. It's a stripped-down code-review pipeline scoped to small, short-lived repos — roughly 70% cheaper in tokens than the full `code-review` skill that ships with Claude Code.

## Why a custom skill

The bundled `code-review` skill runs a multi-agent pipeline that fans out across git history, prior PRs, and the whole change surface in parallel. It's the right tool for a long-running production repo with months of context. For a take-home with <30 days of history and no prior PRs to mine, two of those agents (git-blame archaeology and prior-PR review) have nothing to find.

The bundled skill also re-fetches the change context for each sub-agent, which doubles the token cost when the same diff is being reviewed from multiple angles.

The quick-review skill:

- Pre-digests the diff once and passes the digest to every sub-reviewer
- Drops the git-archaeology agent
- Drops the prior-PR agent
- Keeps the design/correctness/security reviewers
- Accepts a customisation prompt via `$ARGUMENTS` for steering ("focus on the transaction wrapper", "ignore typography churn")

End result: the same actionable review findings, at a fraction of the cost. Suitable for any repo that's <30 days old or any PR where archaeology adds no signal.

## When it's right vs the bundled skill

| Situation | Use |
|---|---|
| Take-home assessment | quick-review |
| Prototype or spike | quick-review |
| Production repo, established CODEOWNERS | bundled `code-review` |
| Multi-month feature branch with many prior PRs in the area | bundled `code-review` |
| Last-pass review before submission | either |

## What it checks

Same review checklist as the bundled skill, minus the archaeology-dependent items:

- **Design** — SRP per file, no growing if/else chains, prop-driven sub-components, DI via Fastify decoration
- **Correctness** — every job-creation path goes through the UNIQUE constraint, `ER_DUP_ENTRY` → 409, completion endpoint checks technician identity
- **ACID** — every multi-write in a transaction, ROLLBACK on conflict, connection released in `finally`
- **TypeScript** — no `any`, no `@ts-ignore`, strict mode, no unused locals
- **Frontend** — `sx` prop only, prop-driven sub-components, accessible Select inputs (`inputProps={{ name }}`)
- **Backend** — Zod at every boundary, no string-interpolated SQL, no secrets in code, pool-only DB access

## Trade-off

The skill is opinionated about what to skip. Running it on a repo that *does* have meaningful git archaeology means missing findings that the bundled skill would catch.

I used it on this repo because none of the dropped agents had signal here. I'd use the bundled `code-review` for the real PR review at brix scale.

The skill is going to run on this repo as the last pass before submission, so the agentic-process loop is end-to-end: Claude wrote the code, I wrote the rules in `CLAUDE.md` and `PLAN.md`, the skill checks the output against the rules.
