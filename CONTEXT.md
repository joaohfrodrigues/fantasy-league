# Fantasy Tracker

A tracker for soccer fantasy leagues: round-by-round scores, live standings, and
each player's simulated chance of winning the league prize. No user accounts —
a league is a public link plus a shared edit password.

## Language

### League & access

**League**:
The top-level aggregate: a named board with its players, rounds, scores, a single
Edit password, and one tiebreak rule. Reachable at its Slug URL.
_Avoid_: tournament, competition.

**Slug**:
The random, opaque identifier in a league's URL (e.g. `z432vgfd`). Because there
are no accounts, the slug acts as an unguessable capability: knowing the link
grants view access, and leagues can't be enumerated by guessing.
_Avoid_: league ID, permalink, vanity URL (it is not human-readable).

**Edit password**:
The single shared secret (hashed + salted, per league) that authorizes edits.
Knowledge-based, not identity-based: anyone who knows it can edit, and the audit
log records no per-editor identity. There is no "owner" or "admin" role.
_Avoid_: login, account, admin password, owner.

### Players, rounds & scores

**Player**:
A human competing in a league. Has a name, a score per round, and a win probability.
_Avoid_: participant, competitor, contestant, user (the app has no user accounts).

**Round**:
One scoring period in a league. Has a full `name`, a `short` abbreviation, an
order, and a locked state.
_Avoid_: matchday, gameweek, stage.

**Locked round**:
A round marked final (`locked_at` set): its scores are frozen and edits are
rejected by the `ROUND_LOCKED` guard. Lock state also separates **live** metrics
(total points, [[Win probability]], tiebreak — recompute from all rounds) from
**record** metrics ([[Badge]]s and [[Round prize]] tallies — count locked rounds
only). The simulation banks locked rounds and treats unlocked ones as provisional.
_Avoid_: closed, finished.

**Score**:
The points one player earned in one round.
_Avoid_: result; "points" as the name for the row.

### Ranking & prizes

**Standings**:
The players ranked by total points, with the tiebreak applied.
_Avoid_: leaderboard, table, ranking.

**Tiebreak**:
The rule that orders players level on points. One of three: **total**, **most
round wins**, **best latest round**.
_Avoid_: decider.

**Round win**:
A round's highest scorer wins that round. Awards the player a Round prize and feeds
the "most round wins" tiebreak.

**Round prize**:
The emoji token a player earns each time they win a round. Each player picks their
own symbol (defaults to 🥇 — the picker also offers medals, meals, drinks, etc.); a
player's Round prize count equals their round wins. Stored per player.
_Avoid_: drink (the legacy column name — see backlog rename).

**Final prize**:
What the single overall league winner takes at the end. The prize that Win
probability estimates each player's chance of taking.
_Avoid_: a bare "prize" when it could be confused with a Round prize.

**Badge**:
A derived, non-persisted per-player tag earned from round results — On Fire (a
[[Round win]] streak), On the Rise / The Bottler (biggest rank move in the latest
round), The Ghost (no points). Computed from saved scores only (never What-if) and
not shown until at least two rounds are played.
_Avoid_: award, achievement, trophy (Trophy/Round prize is the emoji token, distinct).

### Simulation & projection

**Win probability**:
A player's simulated likelihood of taking the Final prize (finishing first), shown
as a percentage. Computed by Monte Carlo simulation over the remaining rounds.
_Avoid_: odds, chance (acceptable in landing-page marketing copy, but not the
canonical term in code or discussion).

**Simulation**:
The Monte Carlo process that produces win probability by running many random
draws of the remaining rounds. Refers to the engine only — not the What-if recompute.

**Trial**:
A single Monte Carlo draw: one random play-out of all remaining rounds, ending
with one player in first. Win probability is the share of trials a player wins.
_Avoid_: scenario, run, sample.

**What-if**:
A user-authored set of hypothetical results for future (unplayed, unlocked)
rounds, layered over the real data and never persisted; standings and win
probability recompute from it. The input mechanism may change over time (e.g. a
slider) but the concept does not.
_Avoid_: scenario, hypothetical, projection.

### History

**Audit log**:
The record of every change made to a league since its creation — score edits,
lock/unlock, player and round add/remove, tiebreak and Round prize changes.
League-level only, with no per-editor identity. "History" is the user-facing label
for the viewer; **Audit log** is the canonical term for the concept and data.
_Avoid_: history (in code), changelog, activity feed.
