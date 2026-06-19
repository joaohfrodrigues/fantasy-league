# Copilot Instructions

## Product Context

This app tracks round-by-round results for soccer fantasy leagues and estimates each participant's chance of winning. It started as a World Cup 2026 fantasy tracker for a group of friends and was generalized for broader soccer fantasy use.

## Core Stack

- TanStack Start
- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- Supabase
- Radix UI

## Routing Rules

- Routing is file-based under `src/routes`.
- Do not introduce `src/pages`, Next.js-style layouts, or Remix conventions.
- `src/routes/__root.tsx` is the app shell.
- Dynamic route files use bare `$`, for example `src/routes/$slug.tsx`.
- Do not edit `src/routeTree.gen.ts` manually.

## Server Boundary Rules

- Never place application server modules in a folder literally named `server`.
- Use `.server.ts` for server-only modules.
- Use `.functions.ts` for TanStack Start server functions.
- Dynamic-import server-only modules inside handlers when they contain secrets or server-only code.
- Keep service-role Supabase access on the server only.

## Server Function Rules

- Use `createServerFn({ method: ... }).inputValidator(...).handler(...)`.
- Do not use `.validator(...)`; this repo uses `.inputValidator(...)`.
- Keep validation close to the server function.
- Prefer fixing behavior at the server-function boundary rather than patching around it in the UI.

## Supabase Rules

- Browser reads use the public client.
- Mutations and password verification run on the server.
- Do not leak service-role credentials into the client graph.
- If a module needs server-only secrets, do not top-level import it into code that can ship to the browser.

## i18n Rules

- Supported locales are English (`en`) and Portuguese (`pt`).
- Preserve both locale dictionaries when changing UI copy.
- If adding new user-facing strings, update both `src/lib/i18n/en.ts` and `src/lib/i18n/pt.ts`.
- Locale resolution falls back to English when the browser requests neither English nor Portuguese.

## UI Rules

- Preserve the current visual language unless the task is explicitly a redesign.
- Reuse existing components and Tailwind patterns before introducing new abstractions.
- Favor small, focused edits over broad refactors.
- Keep copy and controls clear for a shared-screen or mobile use case.

## Validation Rules

- Prefer narrow validation for the files or behavior you changed.
- Use `bun run build` for an app-level build check.
- Use `bunx tsc --noEmit` for stricter TypeScript validation.
- Repo-wide `bun run lint` may fail because of pre-existing issues in existing files; lint touched files when possible.
- When using terminal commands against route files containing `$`, quote the path in zsh.

## Change Hygiene

- Keep changes minimal and style-consistent.
- Do not edit generated files unless the task explicitly requires regeneration.
- Avoid unrelated cleanup while working on a focused task.
- Preserve existing public APIs unless the task requires changing them.
