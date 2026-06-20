# CLAUDE.md is the canonical source of project rules

The project's coding rules and conventions originally lived in
`.github/copilot-instructions.md`. When adopting Claude Code, we made `CLAUDE.md`
the single authoritative source and reduced `copilot-instructions.md` to a thin
pointer back to it. We chose this over importing the Copilot file into `CLAUDE.md`
(which would couple Claude's behavior to a Copilot-named file and silently lose
rules if that file changed) and over duplicating the rules in both files (which
guarantees eventual drift). A future reader will see `copilot-instructions.md` is
a two-line stub — that is deliberate, not an oversight.

## Considered Options

- **Import** `@.github/copilot-instructions.md` into `CLAUDE.md` — one source, but
  not self-contained and tied to a Copilot-named file.
- **Duplicate** full rules in both files — simple but drifts over time.
- **Make `CLAUDE.md` canonical, Copilot file a pointer** (chosen) — self-contained,
  zero drift, matches the migration toward Claude Code as the primary tool.
