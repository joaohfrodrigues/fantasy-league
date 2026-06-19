# Feature Roadmap

Progress on the five proposed enhancements. Statuses: ✅ done · 🟡 in progress · ⬜ not started.

| #   | Feature                        | Status | Notes                                                                                                                                                                     |
| --- | ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Round lock (with confirmation) | ✅     | `lockRound`/`unlockRound` server fns, `ROUND_LOCKED` guard in `saveScores`, lock UI in the round editor (confirm-to-lock, badge, disabled inputs).                        |
| 2   | League-level edit history      | ✅     | Audit logging for scores, lock/unlock, player add/remove, round add/delete, drink changes; `getAuditLog` + read-only history viewer in the board.                         |
| 3   | JSON snapshot import/export    | ✅     | `exportLeague` returns a versioned JSON snapshot (Export button on the board); `importLeague` validates a snapshot and creates a NEW league (import on the landing page). |
| 4   | What-if mode                   | ⬜     | —                                                                                                                                                                         |
| 5   | Custom tie-break rules         | ⬜     | —                                                                                                                                                                         |

## Phase 2 — Edit history (current)

- [x] Audit table + `writeAuditLog` helper
- [x] Log score INSERT/UPDATE/DELETE in `saveScores`
- [x] Log LOCK/UNLOCK in `lockRound`/`unlockRound`
- [x] `getAuditLog` server function (paginated, league-level)
- [x] Log player add/remove, round add/delete, drink changes
- [x] Read-only history viewer UI in the board
- [x] i18n strings (en + pt)

## Phase 3 — JSON snapshot import/export

- [x] `exportLeague` server fn (versioned snapshot, player/round indices for scores)
- [x] `importLeague` server fn (validates snapshot, creates a new league + scores)
- [x] Export button on the board (downloads JSON)
- [x] Import action on the landing page (file picker → new league)
- [x] i18n strings (en + pt)

## Notes

- Audit history is league-level only (no per-editor identity) by design.
- Pre-existing TypeScript errors in `crypto.server.ts` and `$slug.tsx` (stats typing) are a known baseline; "clean" means no _new_ errors.
