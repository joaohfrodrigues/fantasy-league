# CLAUDE.md

Authoritative guidance for working in this repository. This file is the **single
source of truth** for project rules. `.github/copilot-instructions.md` points here.

## What this is

Fantasy Tracker — tracks round-by-round results for soccer fantasy leagues and
estimates each participant's chance of winning. Started as a World Cup 2026
tracker for a group of friends, generalized for any soccer fantasy league.
See [README.md](README.md) for the user-facing overview and [ROADMAP.md](ROADMAP.md)
for direction.

## Stack

TanStack Start · React 19 · TypeScript · Vite · Tailwind CSS v4 · Radix UI ·
Supabase. Package manager is **Bun**. Node 22+.

## Commands

```bash
bun install              # install dependencies
bun run dev              # local dev server
bun run build            # app-level build check (use to validate changes)
bunx tsc --noEmit        # stricter TypeScript validation
bun run lint             # eslint (may fail on pre-existing issues; lint touched files)
bun run format           # prettier --write .
bun run admin:change-password   # admin script to change a league password
```

Validation guidance: prefer narrow checks for what you changed. Use `bun run build`
for an app-level check and `bunx tsc --noEmit` for stricter typing. Repo-wide
`bun run lint` may report pre-existing issues — focus on files you touched.

## Project layout

- `src/routes/` — file-based routes. `__root.tsx` is the app shell, `index.tsx`
  is the landing page, `$slug.tsx` is the league board.
- `src/routeTree.gen.ts` — generated, do not edit by hand.
- `src/server.ts` / `src/start.ts` — server runtime entry and app/middleware config.
- `src/lib/` — app logic, including `src/lib/i18n/` (`en.ts`, `pt.ts`).
- `src/integrations/supabase/` — Supabase clients and auth.
- `supabase/migrations/` — apply in filename (timestamp) order.

## Conventions

### Routing

- Routing is file-based under `src/routes`.
- Do not introduce `src/pages`, Next.js-style layouts, or Remix conventions.
- `src/routes/__root.tsx` is the app shell.
- Dynamic route files use a bare `$` (e.g. `src/routes/$slug.tsx`).
  **Quote `$` paths in zsh** when running terminal commands against them.
- Do not edit `src/routeTree.gen.ts` manually.

### Server boundary

- Never place application server modules in a folder literally named `server`.
- Use `.server.ts` for server-only modules.
- Use `.functions.ts` for TanStack Start server functions.
- Dynamic-import server-only modules inside handlers when they contain secrets
  or server-only code.
- Keep service-role Supabase access on the server only.

### Server functions

- Use `createServerFn({ method }).inputValidator(...).handler(...)`.
- Do not use `.validator(...)`; this repo uses `.inputValidator(...)`.
- Keep validation close to the server function.
- Prefer fixing behavior at the server-function boundary rather than patching
  around it in the UI.

### Supabase

- Browser reads use the public client.
- Mutations and password verification run on the server.
- Do not leak service-role credentials into the client graph.
- If a module needs server-only secrets, do not top-level import it into code
  that can ship to the browser.

### i18n

- Supported locales are English (`en`) and Portuguese (`pt`).
- Preserve both locale dictionaries when changing UI copy.
- Update **both** `src/lib/i18n/en.ts` and `src/lib/i18n/pt.ts` for any new
  user-facing string.
- Locale resolution falls back to English when the browser requests neither.

### UI

- Preserve the current visual language unless the task is explicitly a redesign.
- Reuse existing components and Tailwind patterns before introducing new
  abstractions.
- Favor small, focused edits over broad refactors.
- Keep copy and controls clear for a shared-screen or mobile use case.

### Change hygiene

- Keep changes minimal and style-consistent.
- Do not edit generated files unless the task explicitly requires regeneration.
- Avoid unrelated cleanup while working on a focused task.
- Preserve existing public APIs unless the task requires changing them.
