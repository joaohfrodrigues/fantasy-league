# Fantasy Tracker

Fantasy Tracker started as a small tool for a group of friends to note down round-by-round results while estimating each participant's chances of winning the FIFA World Cup 2026 Fantasy league.

The app was then generalized so anyone can use it for any soccer (football) fantasy league with custom players, custom rounds, and a shared edit password.

## What It Does

- Create a fantasy league board with players and rounds.
- Track round-by-round scores manually.
- Estimate each player's probability of winning based on the remaining rounds.
- Explore what-if scenarios by layering hypothetical future scores without saving them.
- Choose a tie-break rule for players level on points (total, most round wins, or best latest round).
- Lock rounds once they are final to protect them from further edits.
- Review a league-level history of edits, lock changes, and prize updates.
- Export a JSON snapshot of a league for backup or portability.
- Share a public league link while protecting edits with a shared password.
- Re-open recent leagues from the same browser.
- Use the app in English or Portuguese.

## Tools Used

This project is built with:

- Bun for package management and scripts
- TanStack Start for the full-stack React app and server functions
- React 19 and TypeScript
- Vite for local development and builds
- Tailwind CSS v4 for styling
- Radix UI primitives for UI building blocks
- Lucide React for icons
- Supabase for data storage
- Vercel for deployment output
- A small custom i18n layer for English and Portuguese

## How It Works

Each league has:

- A public board URL identified by a slug
- A shared password required for edits
- Players, rounds, and manually entered scores stored in Supabase
- A probability view that projects the remaining rounds to estimate likely winners

The link is meant for sharing. Editing is protected by the league password.

## Getting Started

### Prerequisites

- Node.js 22 or newer
- Bun
- A Supabase project
- A Vercel project if you plan to deploy it

### Installation

1. Install dependencies:

```bash
bun install
```

2. Copy the example environment file:

```bash
cp .env.example .env
```

3. Fill in the required variables in `.env`.

4. Apply the database migrations in `supabase/migrations/` to your Supabase project, in filename (timestamp) order.

5. Start the app:

```bash
bun run dev
```

## Environment Variables

The project expects five environment variables.

### Client-side

These are exposed to the browser by Vite:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

### Server-side

These are used by SSR and server functions:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Use `.env.example` as the source of truth for local setup.

## Available Commands

```bash
bun run dev
bun run build
bun run build:dev
bun run preview
bun run lint
bun run format
bun run admin:change-password -- --slug <slug> --password <new-password>
```

### Command Notes

- `bun run dev`: start the local development server
- `bun run build`: create the production build output used by Vercel
- `bun run preview`: preview the built app locally
- `bun run lint`: run ESLint across the repository
- `bun run format`: run Prettier
- `bun run admin:change-password`: rotate a league password manually

## Admin Script

A password rotation script is available at `scripts/admin/change-league-password.ts`.

Examples:

```bash
bun run admin:change-password -- --slug myleague1 --password newpass
bun run admin:change-password -- --id 123e4567-e89b-12d3-a456-426614174000 --password newpass
```

Rules:

- Passwords must be 4 to 8 characters long
- Provide exactly one identifier: `--slug` or `--id`
- The script never prints plaintext passwords

## Project Structure

```text
src/
  routes/                 TanStack Start file-based routes
  lib/                    i18n, league logic, helpers, templates
  integrations/supabase/  browser and server Supabase clients
  components/             reusable UI and feature components
scripts/admin/            maintenance scripts
supabase/migrations/      database schema
public/                   static assets, including app icons
```

Important route files:

- `src/routes/index.tsx`: landing page for creating or opening a league
- `src/routes/$slug.tsx`: league board page
- `src/routes/__root.tsx`: root shell and document head

## Development Notes

- Routing is file-based under `src/routes`
- `src/routeTree.gen.ts` is generated and should not be edited manually
- Server-only modules use `.server.ts` naming
- TanStack Start server functions live in `.functions.ts` files
- Shared league password verification happens on the server with the Supabase service-role client
- Locale support is currently English and Portuguese

## Validation

For local verification, the most useful checks are:

```bash
bun run build
bunx tsc --noEmit
```

Notes:

- `bun run build` is a good app-level sanity check
- `bunx tsc --noEmit` is the stricter TypeScript check
- Repo-wide lint may include pre-existing failures in generated or vendor-style files, so validate touched files carefully

## Deployment

The Vite/TanStack Start configuration is set up to emit Vercel Build Output API artifacts. In practice that means:

- local development runs through Vite
- production build output targets Vercel
- Supabase credentials must be configured both locally and in Vercel

## Why This Exists

This repo solves a very specific social problem: keeping a fantasy league fun and transparent without relying on spreadsheets or message threads.

It began with a World Cup 2026 fantasy league among friends, but the structure is flexible enough for any soccer fantasy competition where you want to:

- define the participants
- define the rounds
- enter scores manually
- keep a running table
- estimate who is most likely to win
