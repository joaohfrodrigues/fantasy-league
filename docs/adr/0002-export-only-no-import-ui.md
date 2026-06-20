# Export-only: no league import UI

JSON snapshot **export** is exposed (Export button on the board, backed by
`exportLeague`). An `importLeague` server function exists and works, but no UI
surfaces it: accepting user-supplied snapshot files would mean letting users
upload arbitrary file content into Supabase, which was judged too risky for a
shared-password, no-account product. We deliberately ship export-only.

A future reader will see a complete `importLeague` server function with no caller
and may assume the UI was simply never finished — it was a deliberate scope
decision, not an oversight. Revisit only if import is reworked to avoid trusting
raw uploaded files (e.g. server-side validation hardening, size/shape limits,
rate limiting, or paste-JSON instead of file upload).
