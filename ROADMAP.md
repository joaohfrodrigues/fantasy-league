# Feature Roadmap

What's shipped and what's planned. The **Shipped** table is the canonical record of
done work; the **Epic backlog** holds only remaining work. When a task ships, it
moves to the Shipped table (with its PR) and leaves the backlog; when all of an
epic's tasks ship, the epic leaves the backlog.

## Shipped

| #   | Feature                                | Notes                                                                                                                                                                                                                                                             |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Round lock (with confirmation)         | `lockRound`/`unlockRound` server fns, `ROUND_LOCKED` guard in `saveScores`, lock UI in the round editor (confirm-to-lock, badge, disabled inputs).                                                                                                                |
| 2   | League-level edit history              | Audit logging for scores, lock/unlock, player add/remove, round add/delete, prize changes; `getAuditLog` + read-only history viewer in the board.                                                                                                                 |
| 3   | JSON snapshot export (import deferred) | `exportLeague` returns a versioned JSON snapshot. `importLeague` exists but is intentionally not exposed — user uploads judged too risky, so export-only. See [ADR 0002](docs/adr/0002-export-only-no-import-ui.md).                                              |
| 4   | What-if mode                           | Client-only hypothetical scores layered over future (unplayed, unlocked) rounds; standings, odds and stats recompute (debounced). Never persisted.                                                                                                                |
| 5   | Custom tie-break rules                 | Per-league `tiebreak` (total / most round wins / best latest round); applied to standings ranks and the prize split, audited, edited via a selector when unlocked.                                                                                                |
| 6   | Deep Standings & Simulation modules    | Extracted `standings.ts` (tiebreak-aware ranking) + `simulation.ts` (Monte Carlo win probability) as tested pure modules; rank now honours the tiebreak. ([#2](https://github.com/joaohfrodrigues/fantasy-league/pull/2))                                         |
| 7   | Per-IP creation limits, no global cap  | Epic A. `createLeague` keys the burst window per-IP; removed the global `MAX_LEAGUES_TOTAL` ceiling; raised hourly DB backstop. `rate-limit.test.ts`. ([#4](https://github.com/joaohfrodrigues/fantasy-league/pull/4))                                            |
| 8   | 10-second create flow                  | Epic A. Create with name + template; players/password optional under "Customize"; 0-player leagues; creator lands unlocked; add-players CTA + bulk add with duplicate guards. ([#5](https://github.com/joaohfrodrigues/fantasy-league/pull/5))                    |
| 9   | Round badges                           | Epic C. `assignBadges` (`src/lib/badges.ts`): On Fire / On the Rise / Bottler / Ghost; saved scores only, ≥2 rounds; inline chips. Editor round chips show a lock when locked. `badges.test.ts`. ([#6](https://github.com/joaohfrodrigues/fantasy-league/pull/6)) |

## Backlog / Future

- [ ] **Rename `drink` → `round_prize`** (tech debt) — the per-player win-token
      column is named `drink` for legacy reasons but the concept is a Round prize
      (see CONTEXT.md). Migration + update `players` type, `setDrink`/`DrinkCell`,
      audit `entityType: "drink"`, and `exportLeague`/`importLeague` snapshot keys.
      Keep export snapshot back-compat (accept old `drink` key on read).
- [ ] **Lock-aware board visuals** — distinguish _live_ metrics from _record_ metrics
      by round lock state. Today every view recomputes from all scores as they're
      edited. Desired: - **Total points** and the **win-probability simulation** stay live — recompute
      from all rounds (locked + unlocked) as scores change (no change). - **Badges** and **round prizes** (the per-player win tally) count **locked
      rounds only**, so a result only counts toward the record once its round is
      finalized. - **Round lock state is visible to all users** (viewers + editors), not just on
      the editor chips — supersedes the earlier editor-only decision. Must work on
      **mobile**, where round columns are hidden (the lock can't live only in the
      column header).
      Touches `assignBadges` (locked-only score lookup), the prize/`wins` count in
      `standings.ts` (locked-only, while `agg`/total stays all-rounds), and the board
      lock indicator. Needs a grilling pass for the mobile lock UX and edge cases
      (e.g. a round win in an unlocked round — shown in the grid but not yet tallied).
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

Larger future work, prioritized for **acquisition** (the product has no users yet),
not depth for existing groups.

Each Epic and Task carries one of two states:

- **In Spec** — captured but not yet refined. Needs a clear goal and concrete
  examples before it can be picked up. Do **not** implement directly.
- **Open** — refined and ready. Has a clear goal and examples; can be chosen for
  implementation.

Workflow: `In Spec` → (refine goal + examples) → `Open` → (implement) → move to the
**Shipped** table above.

**Product thesis:** this is not a fantasy _game_ — it's the **meta-layer over a
friend group's existing game** (FPL, World Cup fantasy, office pools). The official
platforms own scoring; they can't own a specific group's social, predictive, and
accountability layer because they're global and anonymous. Every item must answer:
_"why paste your scores here instead of just looking at the official table?"_

**North-star:** new leagues created per week (viral reach), guardrailed by
round-entry retention (a league still updated after round 3). Impact order for a
zero-user product: **activation → viral loop → differentiated hook → retention depth.**

**Identity:** stay login-free / no-accounts. Lean on `recent-leagues.ts`
(device-local) as soft identity; add an optional, device-local "this is me" row-claim
only where a feature needs personalization. Defer per-player PINs / accounts until a
feature genuinely can't work device-local (record as an ADR then).

> **Stack note:** despite the original framing, this is a **TanStack Start** app,
> not Next.js. Any "API route" below is a TanStack Start server function
> (`.functions.ts` / `.server.ts`) per [CLAUDE.md](CLAUDE.md). LLM calls, keys and
> service-role access stay server-only.

### Epic A — Frictionless onboarding & creation scalability — `In Spec` _(priority 1)_

Foundation for growth. The creation-scalability and fast-create slices have shipped
(Shipped #7, #8); one task remains.

- [ ] **Instant join** — `In Spec` — viewing a shared link is already password-free;
      add a clear "join / make picks" affordance plus the device-local row-claim.
      Password stays required only to edit. (Note: "make picks" doesn't map to the
      shared-editor model — narrow to the row-claim during refinement.)

### Epic B — Viral share loop & shareable moments — `In Spec` _(priority 1)_

The growth engine: normal use should produce content worth dropping in the group
chat, and every shared view should invite creating a new league.

- [ ] **Auto OG images for league links** — `In Spec` — server-rendered Open Graph
      image so a pasted link previews standings + leader in WhatsApp/iMessage.
      Example: "🏆 Leader: Ana · Round 5/8".
- [ ] **Shareable round-recap card** — `In Spec` — downloadable/shareable image after
      each round: winner, biggest mover, badge, current odds. Reuses `standings.ts` +
      `simulation.ts` + `badges.ts`; WhatsApp share target first.
- [ ] **"Create your own league" CTA** — `In Spec` — persistent low-friction CTA on
      shared/board views for viewers not yet in a league. Closes the loop A → B → A.

### Epic C — AI Banter & narrative — `Open` _(priority 2)_

The differentiated, most-shareable hook. Free-tier LLM, now — with hard caps. Round
badges (the no-deps quick win) have shipped (Shipped #9); the AI banter remains.

- [ ] **AI Banter server function** — `Open` — TanStack Start server fn taking
      `currentLeagueState`, strict system prompt, free-tier LLM (Gemini / Groq-Llama 3)
      as a ruthless pundit: praise 1st, roast last, < 4 sentences. **Server-only
      key**; **hard per-league + global rate cap** (reuse the league-creation
      abuse-guardrail pattern); cache the line per round. Degrades to the shipped
      badges when capped or on failure. Feeds the recap card (Epic B).

### Epic D — Signature predictive analytics — `In Spec` _(priority 3)_

Retention depth — "insight the official app never shows." Pure, builds on the new
modules; sequenced after the viral loop.

- [ ] **Path to Victory engine** — `In Spec` — points-per-round a chasing player needs
      to catch the buffered leader: leader's projection `E(L) = P_L + (A_L × R_rem)`
      plus a σ safety buffer, then the chaser's required average. Pure util on
      `simulation.ts` internals.
- [ ] **"Alternative Reality" toggle** — `In Spec` — exclude specific _played_ rounds
      and recompute totals/ranks via `computeStandings` / `simulateWinProbability` on
      a filtered round set. Distinct from What-if (#4), which layers hypothetical
      _future_ scores.

### Epic E — Playstyles, H2H & legacy — `In Spec` _(priority 4)_

Net-new surfaces; sequenced last. H2H is league-level, so it does not block on the
identity decision.

- [ ] **Playstyle archetype classifier** — `In Spec` — moving average + σ over a
      player's history → tactical identity (high variance = "Heavy Metal Attack",
      steady = "Defensive Block"). Pure pipeline; also a shareable artifact.
- [ ] **H2H matchup view** — `In Spec` — compare any two players head-to-head (record,
      per-round deltas). League-level; no accounts needed.
- [ ] **Season legacy / archive** — `In Spec` — when a league finishes, snapshot a
      read-only "season" and let the group start a new season under the same link,
      building an all-time record / hall of fame. Reuses the export snapshot shape.

## Notes

- Audit history is league-level only (no per-editor identity) by design.
