# Agentic process notes

How I worked with Claude Code on this build. Five short notes, each focused:

| File | Topic |
|---|---|
| [`hierarchical-claude-md.md`](hierarchical-claude-md.md) | Three-tier project memory: root + per-app `CLAUDE.md` files |
| [`plan-before-execute.md`](plan-before-execute.md) | Why `docs/PLAN.md` was committed before any code |
| [`quick-review-skill.md`](quick-review-skill.md) | The custom code-review skill — 70% cheaper than the full pipeline, scoped to small/short-lived repos |
| [`frontend-design-skill.md`](frontend-design-skill.md) | The viability test before committing to `frontend-design` for MUI work |
| [`browser-self-validation.md`](browser-self-validation.md) | Driving the live UI via Chrome DevTools MCP before claiming done |

These match the agentic-tooling questions from the brief and from the screening form, and they document the actual workflow rather than the marketing version of it.

## The short version

Claude generated the code. I directed, reviewed, and made every call about what shipped. The structure above is what I used to keep that loop tight on a 5-hour budget:

- `CLAUDE.md` files mean Claude reads the right rules for the file it's editing
- Planning first means the conversation about trade-offs happens in writing, where it's reviewable
- Custom skills mean the review pass is repeatable, not ad-hoc
- Browser self-validation means UI claims have evidence
