# Feature Roadmap

Progress on the five proposed enhancements. Statuses: ✅ done · 🟡 in progress · ⬜ not started.

| #   | Feature                                | Status | Notes                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Round lock (with confirmation)         | ✅     | `lockRound`/`unlockRound` server fns, `ROUND_LOCKED` guard in `saveScores`, lock UI in the round editor (confirm-to-lock, badge, disabled inputs).                                                                                                                                                |
| 2   | League-level edit history              | ✅     | Audit logging for scores, lock/unlock, player add/remove, round add/delete, drink changes; `getAuditLog` + read-only history viewer in the board.                                                                                                                                                 |
| 3   | JSON snapshot export (import deferred) | ✅     | `exportLeague` returns a versioned JSON snapshot (Export button on the board). `importLeague` exists as a server fn but is intentionally not exposed: accepting user file uploads was judged too risky, so the product is export-only. See [ADR 0002](docs/adr/0002-export-only-no-import-ui.md). |
| 4   | What-if mode                           | ✅     | Client-only hypothetical scores layered over future (unplayed, unlocked) rounds; standings, odds and stats recompute (debounced) from them. Never persisted.                                                                                                                                      |
| 5   | Custom tie-break rules                 | ✅     | Per-league `tiebreak` (total / most round wins / best latest round); applied to standings ranks and the finished-league prize split, audited, edited via a selector when unlocked.                                                                                                                |

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
- [ ] ~~Import action on the landing page (file picker → new league)~~ — dropped; export-only by design (see ADR 0002)
- [x] i18n strings (en + pt)

## Backlog / Future

- [ ] **Rename `drink` → `round_prize`** (tech debt) — the per-player win-token
      column is named `drink` for legacy reasons but the concept is a Round prize
      (see CONTEXT.md). Migration + update `players` type, `setDrink`/`DrinkCell`,
      audit `entityType: "drink"`, and `exportLeague`/`importLeague` snapshot keys.
      Keep export snapshot back-compat (accept old `drink` key on read).
- [ ] **What-if slider** — replace per-round score entry in What-if mode with one
      slider per player over their **expected average** future score, defaulting to
      the player's current average. The slider sets the _mean_ only; the Monte Carlo
      simulation still samples around it using that player's observed round-to-round
      variance (fall back to a sensible default variance when few rounds are played).
      Do **not** feed the slider value as a constant per future round — that would
      flatten win probability toward 0%/100% and defeat the simulation. The What-if
      concept is unchanged (hypothetical, never persisted); only the input changes.
      Keep an "advanced" path for entering exact per-round scores if cheap.

## Notes

- Audit history is league-level only (no per-editor identity) by design.
- Pre-existing TypeScript errors in `crypto.server.ts` and `$slug.tsx` (stats typing) are a known baseline; "clean" means no _new_ errors.
