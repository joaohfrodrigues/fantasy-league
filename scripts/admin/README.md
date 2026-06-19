# Admin Scripts

## Change League Password

Rotates a league edit password in `league_credentials`.

### Prerequisites

- Environment variables must be available:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Run from the project root.

### Usage

By slug:

```bash
bun run admin:change-password -- --slug myleague1 --password newpass
```

By UUID:

```bash
bun run admin:change-password -- --id 123e4567-e89b-12d3-a456-426614174000 --password newpass
```

### Rules

- Password must be 4 to 8 characters.
- Provide exactly one identifier: `--slug` or `--id`.
- The script never prints plaintext passwords.

## Vercel Troubleshooting

If password unlock works locally but fails in production, check Vercel environment variables first.

- Server functions use `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Browser reads use `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `SUPABASE_URL` and `VITE_SUPABASE_URL` must point to the same Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY` must belong to that same project.

After updating variables in Vercel, redeploy the app.
