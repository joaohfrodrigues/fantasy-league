# Feature Roadmap

Progress on the five proposed enhancements. Statuses: ✅ done · 🟡 in progress · ⬜ not started.

## Epic backlog states

The Epic backlog below tracks larger future work. Each Epic and Task carries one
of two states:

- **In Spec** — captured but not yet refined. Needs a clear goal and concrete
  examples before it can be picked up. Do **not** implement directly.
- **Open** — refined and ready. Has a clear goal and examples; can be chosen for
  implementation.

Workflow: `In Spec` → (refine goal + examples) → `Open` → (implement) → move to the
status table at the top once shipped.

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

## Epic backlog

Larger future work, in proposed priority order. All items are **In Spec** until
refined (see [Epic backlog states](#epic-backlog-states)).

> **Stack note:** despite the original framing, this is a **TanStack Start** app,
> not Next.js. Any "API route" below is a TanStack Start server function
> (`.functions.ts` / `.server.ts`) per [CLAUDE.md](CLAUDE.md). LLM calls, keys and
> service-role access stay server-only.

### Epic 2 — Tryout 2.0 & Analytics — `In Spec` _(priority 1)_

Highest ROI / lowest risk: both tasks are pure functions with no external deps,
building on existing `simulation.ts` / `standings.ts` / What-if (#4) code.

- [ ] **Path to Victory engine** — `In Spec` — utility that computes the required
      points-per-round a chasing player needs to catch the current leader. - Leader's projected final score: `E(L) = P_L + (A_L × R_rem)`. - Add a standard-deviation (σ) safety buffer to the leader's projection. - Compute the chaser's required average to beat the buffered projection.
- [ ] **"Alternative Reality" toggle** — `In Spec` — frontend state utility to
      hide/exclude specific past rounds (e.g. "What if Round 3 didn't happen?")
      and dynamically recompute every player's `totalPoints` and `currentRank`
      from the active rounds. Distinct from What-if (#4): this removes _played_
      rounds rather than layering hypothetical _future_ scores.

### Epic 1 — The Social Engine — `In Spec` _(priority 2)_

Highest delight, heaviest infra (external LLM, cost, abuse + moderation risk).
Reuses the abuse-guardrail pattern from league-creation caps. Weekly Badges is a
cheap pure-util quick win that can ship independently of the AI banter.

- [ ] **AI Banter server function** — `In Spec` — TanStack Start server function
      (not a Next.js route) taking `currentLeagueState`, formatting a strict
      system prompt, and calling a free-tier LLM (Gemini / Groq-Llama 3) acting as
      a ruthless pundit: praise 1st, roast last, < 4 sentences. Must enforce a hard
      call-rate cap to avoid free-tier overuse. Key stays server-only.
- [ ] **Weekly badges utility** — `In Spec` — pure `assignWeeklyBadges(leagueState)`
      attaching badges from the current round (e.g. "On Fire" = highest current
      points, "The Bottler" = biggest rank drop, "The Ghost" = 0 total points).

### Epic 3 — Playstyles & H2H — `In Spec` _(priority 3)_

Net-new feature surface; reuses the variance math established in Epic 2.

- [ ] **Playstyle archetype classifier** — `In Spec` — data-pipeline function over
      a player's scoring history; uses moving average + standard deviation to assign
      a tactical identity (high variance = "Liverpool Heavy Metal Attack",
      low variance/steady = "Valencia Defensive Block").
- [ ] **H2H matchup logic** — `In Spec` — let users compare themselves against any
      other league player in a head-to-head view.

## Notes

- Audit history is league-level only (no per-editor identity) by design.
- Pre-existing TypeScript errors in `crypto.server.ts` and `$slug.tsx` (stats typing) are a known baseline; "clean" means no _new_ errors.
