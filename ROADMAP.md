# Feature Roadmap

What's shipped and what's planned. The **Shipped** table is the canonical record of
done work; the **Epic backlog** holds only remaining work. When a task ships, it
moves to the Shipped table (with its PR) and leaves the backlog; when all of an
epic's tasks ship, the epic leaves the backlog.

**Priority** (value): `High` · `Medium` · `Low`. **Size** (effort): `S` (one short
session, single area), `M` (pure module + tests + UI wiring, one surface), `L` (new
infra / external deps, or spans multiple surfaces). Priority and size are
independent — a `Low`/`S` item can be a worthwhile quick win.

## Shipped

| #   | Feature                                | Notes                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Round lock (with confirmation)         | `lockRound`/`unlockRound` server fns, `ROUND_LOCKED` guard in `saveScores`, lock UI in the round editor (confirm-to-lock, badge, disabled inputs).                                                                                                                                                           |
| 2   | League-level edit history              | Audit logging for scores, lock/unlock, player add/remove, round add/delete, prize changes; `getAuditLog` + read-only history viewer in the board.                                                                                                                                                            |
| 3   | JSON snapshot export (import deferred) | `exportLeague` returns a versioned JSON snapshot. `importLeague` exists but is intentionally not exposed — user uploads judged too risky, so export-only. See [ADR 0002](docs/adr/0002-export-only-no-import-ui.md).                                                                                         |
| 4   | What-if mode                           | Client-only hypothetical scores layered over future (unplayed, unlocked) rounds; standings, odds and stats recompute (debounced). Never persisted.                                                                                                                                                           |
| 5   | Custom tie-break rules                 | Per-league `tiebreak` (total / most round wins / best latest round); applied to standings ranks and the prize split, audited, edited via a selector when unlocked.                                                                                                                                           |
| 6   | Deep Standings & Simulation modules    | Extracted `standings.ts` (tiebreak-aware ranking) + `simulation.ts` (Monte Carlo win probability) as tested pure modules; rank now honours the tiebreak. ([#2](https://github.com/joaohfrodrigues/fantasy-league/pull/2))                                                                                    |
| 7   | Per-IP creation limits, no global cap  | `createLeague` keys the burst window per-IP; removed the global `MAX_LEAGUES_TOTAL` ceiling; raised hourly DB backstop. `rate-limit.test.ts`. ([#4](https://github.com/joaohfrodrigues/fantasy-league/pull/4))                                                                                               |
| 8   | 10-second create flow                  | Create with name + template; players/password optional under "Customize"; 0-player leagues; creator lands unlocked; add-players CTA + bulk add with duplicate guards. ([#5](https://github.com/joaohfrodrigues/fantasy-league/pull/5))                                                                       |
| 9   | Round badges                           | `assignBadges` (`src/lib/badges.ts`): On Fire / On the Rise / Bottler / Ghost; saved scores only, ≥2 rounds; inline chips. `badges.test.ts`. ([#6](https://github.com/joaohfrodrigues/fantasy-league/pull/6))                                                                                                |
| 10  | Landing quick wins                     | Demo badges from real logic, sharper copy, no-signup proof, OG/Twitter image tags (`VITE_SITE_URL`). ([#7](https://github.com/joaohfrodrigues/fantasy-league/pull/7), [#8](https://github.com/joaohfrodrigues/fantasy-league/pull/8))                                                                        |
| 11  | Desktop score steppers                 | The −/+ steppers (previously mobile-only) now also show on desktop: slider + arrows + free text on desktop, arrows + free text on mobile. Reuses the clamped `stepValue`.                                                                                                                                    |
| 12  | Lock-aware board visuals               | Live (total, win-prob sim, tiebreak) vs record (badges + round prizes = locked rounds only). Sim banks locked rounds and treats unlocked ones as provisional with asymmetric upside. Lock shown to all users — status strip on mobile/tablet, 🔒 in desktop headers; unlocked round-wins styled provisional. |

## Backlog / Future

Standalone items (smaller than an epic). Tagged `priority · size`.

- [ ] **Rename `drink` → `round_prize`** — `Low · M` — the per-player win-token column
      is named `drink` for legacy reasons but the concept is a Round prize (see
      CONTEXT.md). DB migration + update `players` type, `setDrink`/`DrinkCell`, audit
      `entityType: "drink"`, and `exportLeague`/`importLeague` snapshot keys. Keep
      export snapshot back-compat (accept the old `drink` key on read). Own PR — it
      touches production data.
- [ ] **Shared `StandingsTable` component** — `Low · M` — the live board
      (`src/routes/$slug.tsx`) and the landing-page showcase
      (`src/components/ExampleBoard.tsx`) duplicate the standings-table markup, so
      every visual/responsive change must be made twice and drifts between them
      (e.g. the mobile declutter shipped for the board in
      [#14](https://github.com/joaohfrodrigues/fantasy-league/pull/14) had to be
      re-applied to the example in
      [#15](https://github.com/joaohfrodrigues/fantasy-league/pull/15)). Extract a
      single presentational `StandingsTable` (rank, player + badges, round-prize/wins,
      odds/dinner, per-round columns with the progressive-reveal logic, total) that
      both feed via props: the live board passes real data + interactive cells (drink
      picker, claim/share, sort, what-if), the example passes mock data + static cells.
      Pure presentational extraction — keep behavior and visuals identical.
- [ ] **What-if slider** — `Low · M` — replace per-round score entry in What-if mode
      with one slider per player over their **expected average** future score,
      defaulting to the player's current average. The slider sets the _mean_ only; the
      Monte Carlo simulation still samples around it using that player's observed
      round-to-round variance (fall back to a sensible default when few rounds played).
      Do **not** feed the slider value as a constant per future round — that would
      flatten win probability toward 0%/100% and defeat the simulation. The What-if
      concept is unchanged (hypothetical, never persisted); only the input changes.
      Keep an "advanced" path for entering exact per-round scores if cheap.

## Epic backlog

Larger thematic work, prioritized for **acquisition** (the product has no users yet),
not depth for existing groups. Tasks are tagged `size`; epics carry a `priority` and a
state:

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
only where a feature needs personalization — it rides into the highest-priority epic
that needs it (currently Epic B). Defer per-player PINs / accounts until a feature
genuinely can't work device-local (record as an ADR then).

> **Stack note:** despite the original framing, this is a **TanStack Start** app,
> not Next.js. Any "API route" below is a TanStack Start server function
> (`.functions.ts` / `.server.ts`) per [CLAUDE.md](CLAUDE.md). LLM calls, keys and
> service-role access stay server-only.

### Epic B — Viral share loop & narrative — `High` · `Open`

The growth engine: normal use should produce content worth dropping in the group
chat, and every shared view should invite creating a new league. Sequence within the
epic: league-level card first → personal share + row-claim → AI banter.

- [ ] **Auto OG images for league links** — `M` — server-rendered Open Graph image so
      a pasted link previews standings + leader in WhatsApp/iMessage (dynamic
      `@vercel/og`-style; upgrades the static landing image already shipped). Example:
      "🏆 Leader: Ana · Round 5/8".
- [ ] **Shareable round-recap card** — `M` — downloadable/shareable image after each
      round: winner, biggest mover, badge, current odds. Reuses `standings.ts` +
      `simulation.ts` + `badges.ts`; templated banter line as the fallback. WhatsApp
      share target first.
- [ ] **Personal share + row-claim** — `M` — a personal "share your odds/standing"
      artifact (_"I've got a 58% chance 🔥"_) — more screenshot-worthy than a league
      table. Introduces the device-local "this is me" row-claim (highlights your row;
      reused later by D/E).
- [ ] **AI banter line** — `L` — TanStack Start server fn taking `currentLeagueState`,
      strict system prompt, free-tier LLM (Gemini / Groq-Llama 3) as a ruthless pundit:
      praise 1st, roast last, < 4 sentences. **Server-only key**; **hard per-league +
      global rate cap** (reuse the league-creation abuse-guardrail pattern); cache per
      round. Degrades to the templated/badge line when capped or on failure. Feeds the
      recap card. (Folded in from the former Social Engine epic; badges already shipped.)

### Epic D — Signature predictive analytics — `Medium` · `Open`

Retention depth — "insight the official app never shows." Pure, builds on the new
modules; sequenced after the viral loop.

- [ ] **Path to Victory engine** — `M` — points-per-round a chasing player needs to
      catch the buffered leader: leader's projection `E(L) = P_L + (A_L × R_rem)` plus
      a σ safety buffer, then the chaser's required average. Computed **generally** (any
      chaser vs. the leader); the row-claim only _highlights_ "yours". Pure util on
      `simulation.ts` internals.
- [ ] **"Alternative Reality" toggle** — `M` — exclude specific _played_ rounds and
      recompute totals/ranks via `computeStandings` / `simulateWinProbability` on a
      filtered round set. Distinct from What-if (#4), which layers hypothetical _future_
      scores.

### Epic E — Playstyles, H2H & legacy — `Low` · `In Spec`

Net-new surfaces; sequenced last. Not ready to build — each task needs refinement.

- [ ] **Playstyle archetype classifier** — `M` — moving average + σ over a player's
      history → tactical identity (high variance = "Heavy Metal Attack", steady =
      "Defensive Block"). Pure pipeline; may later feed Epic B's shareables. Needs
      threshold definitions.
- [ ] **H2H matchup view** — `M` — compare any two players head-to-head (record,
      per-round deltas). League-level; no accounts needed (row-claim only highlights
      "you"). Needs scope (which stats).
- [ ] **Season legacy / archive** — `L` — **premature** (no users, no completed
      seasons yet). When a league finishes, snapshot a read-only "season" and let the
      group start a new season under the same link, building an all-time record / hall
      of fame. Reuses the export snapshot shape. Revisit once leagues are completing.

## Notes

- Audit history is league-level only (no per-editor identity) by design.
- **Dropped epics:** _Frictionless onboarding_ (its slices shipped as #7/#8; the
  row-claim folded into Epic B) and _Social Engine_ (badges shipped as #9; AI banter
  folded into Epic B).
