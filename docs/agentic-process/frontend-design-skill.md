# Frontend-design skill — viability test before adoption

The `frontend-design` skill ships with Claude Code. It's designed to produce distinctive, production-grade frontend code — gradient meshes, custom typography, asymmetric layouts, the works.

The brief's stack constraint was Material UI v6. A skill optimised for distinctive design and a stack optimised for consistency don't obviously play well together. So before committing the build to it, I ran a three-stage viability test.

## Test 1 — single-file output

Asked the skill to produce a single form component (`AssignQuoteForm.tsx`) with explicit prompting:

- Must use `@mui/material` imports only
- Must style via the `sx` prop
- No Tailwind, no shadcn, no custom CSS files

**Result:** clean MUI under steering. Every import from `@mui/material`. Every style on `sx`. Code quality shippable as-is.

## Test 2 — multi-file structure

Asked the skill to produce the full assignment dashboard: types, mock data, three sub-Selects, parent form, index barrel, page, theme, App, main, plus index.html. Eleven files.

**Result:** senior-quality composition. Single responsibility per file. Props-driven sub-components — none of them imported the mock data. Barrel exports only the public surface. Types extracted to their own file. The page was the only mock-data consumer.

## Test 3 — render in browser

Scaffolded a local Vite + React 18 + MUI v6 + Emotion app to render Test 2's output. Drove it end-to-end: empty form → fill technician → fill quote → fill time → submit → success Alert.

**Result:** renders cleanly. Design felt intentional — custom dark-teal primary, warm off-white background, 8px border-radius, two-line stacked menu items. Not generic Material.

One known a11y issue surfaced: MUI's `<Select>` doesn't add a `name` attribute to its underlying input by default. Documented in the frontend `CLAUDE.md` so all later Selects use `inputProps={{ name: "..." }}`.

## Decision

Use the skill for UI scaffolding. The steering prompt template that worked:

> Use MUI v6. All imports from `@mui/material`. All styling via the `sx` prop. No Tailwind, no shadcn, no inline `style={}`, no CSS files.

The skill complies when this is declared upfront.

## Acknowledged trade-off

The skill's natural design instinct (gradient meshes, custom typography pairings, asymmetric layouts) is suppressed when constrained to MUI. I'm trading aesthetic boldness for stack-fit. That's the right trade for this brief — MUI consistency was the explicit requirement — but it's worth naming.

## Where I diverged from the first design pass

The initial design pass produced an "industrial-editorial" aesthetic: A/B/C row tags next to field labels, mono ticket-ids ("WO-001", "Step 01") in section headers, uppercase eyebrows ("MANAGER · DISPATCH", "TECHNICIAN · READ-ONLY VIEW"), terracotta rules under hero headings, left-edge accent stripes on every card.

Live browser review made it clear: too much decoration. The decorative elements were competing with the actual labels and values; the hierarchy read as ugly because everything was shouting at once.

I stripped it back to plain, proportionate UI in `refactor(frontend): simplify UI - drop editorial flourishes, clean hierarchy`. The skill produced good code; the design judgment was mine to make.

This is the "AI generates the code, I make the call on what ships" loop, in concrete form.
