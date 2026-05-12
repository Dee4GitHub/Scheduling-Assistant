# Plan before execute

`docs/PLAN.md` was committed first, before any code. The first commit on `main` is the plan. Every PR was scoped against it.

## Why this matters

Take-home assessments under time pressure are a perfect environment for code drift: it feels productive to be writing code, so you start writing code, and the trade-off decisions happen retroactively in the README rather than up front in the design.

Committing the plan first inverts that. The conversation about trade-offs happens in writing, before any line is locked in. The rest of the repo then reads as a deliberate build, not a code dump that needs after-the-fact justification.

It also gives Claude a stable target. When a question like "should we add reassignment support?" comes up mid-build, the answer is in the plan — not re-derived from scratch.

## What the plan contains

- The brief, re-read and summarised in my own words
- Stack call with explicit reasoning for each layer
- Data model (entities, relationships, constraint design)
- Conflict prevention design — the load-bearing part, including approaches rejected
- Notifications design — DB-backed simulator vs alternatives
- Assumptions — calls I made where the brief was silent
- Scope decisions — things deliberately left out, with the reason
- Tests — what gets covered, what doesn't, why
- "What I'd build next at brix scale" — production-readiness roadmap

## How it interacted with the build

Every PR was scoped against a numbered section of the plan. The conflict-prevention test came directly from the section that defined the constraint. The notification design in the schema came from the section that called the trade-off.

When something new came up mid-build (the "Assigned by" dropdown felt wrong after the form-design pass), the decision went into the conversation, and the plan was updated to match before code was changed. The plan is the contract; the code follows.

## What it isn't

Not a Gantt chart. Not a 30-day roadmap. Not a fake "before code" document written after the fact — git history confirms the plan was committed first.

It's the same document I'd write before writing code on a real ticket. The take-home format just makes it visible.
