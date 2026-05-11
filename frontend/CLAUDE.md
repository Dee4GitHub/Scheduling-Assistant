# CLAUDE.md — frontend conventions

Companion to the root `CLAUDE.md`. Conventions specific to the Next.js + MUI frontend.

## Stack

- Next.js 15 (App Router) + React 18 + TypeScript
- Material UI v6 (`@mui/material`) with Emotion engine
- Custom theme in `src/theme.ts` (dark teal primary, warm off-white background, 10px border-radius)

## Styling rules

- **All styling via the MUI `sx` prop.** No Tailwind, no shadcn, no className utility classes, no inline `style={}`, no CSS files.
- Imports from `@mui/material` only. No third-party UI kits.
- Use MUI theme tokens (`color: 'primary.main'`, `bgcolor: 'background.default'`) rather than hard-coded hex where possible.
- Responsive props use the MUI breakpoint object form (e.g. `p: { xs: 3, sm: 4 }`).

## Component structure

- Single-responsibility per file. Sub-components live in `components/` next to their feature.
- Sub-components are prop-driven. They do not fetch data, do not import mock data, do not call API.
- `pages/*` and route-level files are the composition root. They fetch, then inject data down via props.
- Form state: local `useState` for drafts. Submission via `onSubmit(payload)` callback prop. The parent decides what to do with the payload.

## A11y

- MUI `<Select>` doesn't auto-add a `name` attribute to the underlying input. Add `inputProps={{ name: 'fieldName' }}` to every Select.
- `<InputLabel>` paired with `<Select labelId="...">` for label association.

## File naming

- React components: `PascalCase.tsx`
- Utility modules and types: `camelCase.ts`
- Test files: `*.test.tsx`

## What Claude should default to

- Functional components only. No class components.
- Hooks at the top of the component, then handlers, then return.
- Destructure props in the signature.
- TypeScript interface for props (not `type` — easier to extend if needed).
