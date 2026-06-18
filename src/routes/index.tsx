import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Plus, Pencil, Loader2, Sparkles, UserPlus, Check, X, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tentativa de Penúltimos — FIFA World Cup Fantasy" },
      { name: "description", content: "A nossa Liga Fantasy do Mundial. Quem vai ganhar o jantar?" },
      { property: "og:title", content: "Tentativa de Penúltimos — Fantasy World Cup" },
      { property: "og:description", content: "A nossa Liga Fantasy do Mundial. Quem vai ganhar o jantar?" },
    ],
  }),
  component: Index,
});

type Player = { id: string; name: string; display_order: number; drink: string };
type Score = { id: string; player_id: string; round_key: string; points: number };

const ROUNDS: { key: string; short: string; label: string; phase: "groups" | "ko" }[] = [
  { key: "grupos_1", short: "G1", label: "Fase de Grupos 1", phase: "groups" },
  { key: "grupos_2", short: "G2", label: "Fase de Grupos 2", phase: "groups" },
  { key: "grupos_3", short: "G3", label: "Fase de Grupos 3", phase: "groups" },
  { key: "16avos", short: "16", label: "16-avos", phase: "ko" },
  { key: "8avos", short: "8", label: "Oitavos", phase: "ko" },
  { key: "4os", short: "4", label: "Quartos", phase: "ko" },
  { key: "meias", short: "SF", label: "Meias-finais", phase: "ko" },
  { key: "final", short: "F", label: "Final", phase: "ko" },
];

const DRINKS = ["🍺", "🍷", "🧃", "🥃", "🍹", "☕"];

function dinnerLabel(prob: number) {
  if (prob >= 0.5) return { label: "Jantar pago!", emoji: "🍗" };
  if (prob >= 0.25) return { label: "A cheirar o jantar", emoji: "😋" };
  if (prob >= 0.1) return { label: "ACREDITA MALUCO!", emoji: "🤞" };
  if (prob >= 0.03) return { label: "A precisar de sorte", emoji: "😬" };
  return { label: "A pagar a conta", emoji: "💸" };
}

function Index() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [drinkPickerFor, setDrinkPickerFor] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from("players").select("*").order("display_order"),
      supabase.from("scores").select("*"),
    ]);
    setPlayers((p ?? []) as Player[]);
    setScores((s ?? []) as Score[]);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel("league")
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, loadAll)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const scoreMap = useMemo(() => {
    const m = new Map<string, number>();
    scores.forEach((s) => m.set(`${s.player_id}:${s.round_key}`, s.points));
    return m;
  }, [scores]);

  const roundsPlayedKeys = useMemo(
    () => ROUNDS.filter((r) => players.some((p) => scoreMap.has(`${p.id}:${r.key}`))).map((r) => r.key),
    [scoreMap, players],
  );
  const roundsRemaining = ROUNDS.length - roundsPlayedKeys.length;

  // Compute league-wide stats from played rounds for projection
  const leagueStats = useMemo(() => {
    const all: number[] = [];
    roundsPlayedKeys.forEach((rk) => {
      players.forEach((p) => {
        const v = scoreMap.get(`${p.id}:${rk}`);
        if (typeof v === "number") all.push(v);
      });
    });
    if (!all.length) return { mean: 70, std: 15 };
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    const variance = all.reduce((a, b) => a + (b - mean) ** 2, 0) / all.length;
    return { mean, std: Math.max(8, Math.sqrt(variance)) };
  }, [scoreMap, players, roundsPlayedKeys]);

  // Per-player base score (mean of their played rounds) — fall back to league mean
  const playerMean = useMemo(() => {
    const m = new Map<string, number>();
    players.forEach((p) => {
      const vals = roundsPlayedKeys
        .map((rk) => scoreMap.get(`${p.id}:${rk}`))
        .filter((v): v is number => typeof v === "number");
      m.set(p.id, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : leagueStats.mean);
    });
    return m;
  }, [players, scoreMap, roundsPlayedKeys, leagueStats]);

  // Monte Carlo: probability each player ends FIRST (wins, gets dinner paid)
  const dinnerProb = useMemo(() => {
    const counts = new Map<string, number>();
    players.forEach((p) => counts.set(p.id, 0));
    if (!players.length) return counts;

    // Pseudo-rounds: how strongly sparse records are pulled toward the league average.
    // With few rounds played we don't really know a player's level, so stay humble.
    const PRIOR_K = 4;

    const currentTotals = players.map((p) => {
      let t = 0;
      let n = 0;
      ROUNDS.forEach((r) => {
        const v = scoreMap.get(`${p.id}:${r.key}`);
        if (typeof v === "number") {
          t += v;
          n += 1;
        }
      });
      const rawMean = playerMean.get(p.id) ?? leagueStats.mean;
      // Regress toward the league average — more played rounds means we trust their own mean more
      const projMean = (rawMean * n + leagueStats.mean * PRIOR_K) / (n + PRIOR_K);
      // Uncertainty about a player's true level: shrinks as they accumulate rounds
      const skillSD = leagueStats.std / Math.sqrt(n + PRIOR_K);
      return { id: p.id, total: t, projMean, skillSD };
    });

    if (roundsRemaining === 0) {
      const max = Math.max(...currentTotals.map((c) => c.total));
      const winners = currentTotals.filter((c) => c.total === max);
      winners.forEach((w) => counts.set(w.id, 1 / winners.length));
      return counts;
    }

    const TRIALS = 4000;
    const randn = () => {
      // Box-Muller
      const u = Math.random() || 1e-9;
      const v = Math.random() || 1e-9;
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    for (let t = 0; t < TRIALS; t++) {
      let bestId = currentTotals[0].id;
      let bestTotal = -Infinity;
      for (const c of currentTotals) {
        // Draw this player's "true level" for the trial, then play out the remaining rounds
        const level = c.projMean + randn() * c.skillSD;
        let sim = c.total;
        for (let r = 0; r < roundsRemaining; r++) {
          sim += level + randn() * leagueStats.std;
        }
        if (sim > bestTotal) {
          bestTotal = sim;
          bestId = c.id;
        }
      }
      counts.set(bestId, (counts.get(bestId) ?? 0) + 1);
    }
    const out = new Map<string, number>();
    counts.forEach((v, k) => out.set(k, v / TRIALS));
    return out;
  }, [players, scoreMap, playerMean, leagueStats, roundsRemaining]);

  const standings = useMemo(() => {
    const rows = players.map((p) => {
      const perRound = ROUNDS.map((r) => scoreMap.get(`${p.id}:${r.key}`) ?? null);
      const agg = perRound.reduce<number>((a, v) => a + (v ?? 0), 0);
      const wins = ROUNDS.reduce((acc, r) => {
        const vals = players
          .map((pp) => scoreMap.get(`${pp.id}:${r.key}`))
          .filter((v): v is number => typeof v === "number");
        if (!vals.length) return acc;
        const max = Math.max(...vals);
        const mine = scoreMap.get(`${p.id}:${r.key}`);
        return mine === max ? acc + 1 : acc;
      }, 0);
      const prob = dinnerProb.get(p.id) ?? 0;
      return { player: p, perRound, agg, wins, prob };
    });
    rows.sort((a, b) => b.agg - a.agg);
    return rows;
  }, [players, scoreMap, dinnerProb]);

  async function addPlayer() {
    const name = newPlayerName.trim();
    if (!name) return;
    const order = (players[players.length - 1]?.display_order ?? 0) + 1;
    await supabase.from("players").insert({ name, display_order: order });
    setNewPlayerName("");
    setAddingPlayer(false);
  }

  async function setDrink(playerId: string, drink: string) {
    setDrinkPickerFor(null);
    setPlayers((ps) => ps.map((p) => (p.id === playerId ? { ...p, drink } : p)));
    await supabase.from("players").update({ drink }).eq("id", playerId);
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-20 bg-background/70">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg gradient-pitch grid place-items-center shadow-glow">
              <Trophy className="size-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display font-bold tracking-tight leading-none">Tentativa de Penúltimos</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
                FIFA World Cup · Fantasy
              </div>
            </div>
          </div>
          <button
            onClick={() => setAddingPlayer(true)}
            className="hidden sm:inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <UserPlus className="size-4" />
            Adicionar jogador
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-pitch mb-5">
          <Sparkles className="size-3.5" />
          <span>
            Época 2026 · {roundsPlayedKeys.length}/{ROUNDS.length} rondas jogadas
          </span>
        </div>
        <h1 className="font-display text-5xl sm:text-7xl font-bold leading-[0.95] max-w-3xl">
          Quem vai comer
          <br />
          <span className="text-pitch">o jantar à pala</span>?
        </h1>
        <p className="text-muted-foreground mt-5 max-w-xl text-lg">
          Classificação em tempo real, probabilidade de ganhar o jantar com {roundsRemaining}{" "}
          {roundsRemaining === 1 ? "ronda" : "rondas"} por jogar. Cada ronda ganha vale uma bebida.
        </p>
      </section>

      {/* Leaderboard */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="bg-surface/60 backdrop-blur border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">Classificação</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {players.length} jogadores · {ROUNDS.length} rondas
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {ROUNDS.map((r) => {
                const played = roundsPlayedKeys.includes(r.key);
                return (
                  <button
                    key={r.key}
                    onClick={() => setEditing(r.key)}
                    className={`hidden md:inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors ${
                      played
                        ? "bg-pitch/15 text-pitch hover:bg-pitch/25"
                        : "bg-surface-elevated text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                    title={`${played ? "Editar" : "Adicionar"} ${r.label}`}
                  >
                    <Pencil className="size-3" />
                    {r.short}
                  </button>
                );
              })}
              <button
                onClick={() => setEditing(ROUNDS[Math.min(roundsPlayedKeys.length, ROUNDS.length - 1)].key)}
                className="md:hidden inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-pitch text-primary-foreground font-medium"
              >
                <Plus className="size-3.5" />
                Pontos
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-20 grid place-items-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                    <th className="text-left font-medium px-6 py-3 w-10">#</th>
                    <th className="text-left font-medium py-3">Jogador</th>
                    <th className="text-left font-medium py-3 hidden sm:table-cell">Bebidas</th>
                    <th className="text-center font-medium py-3 hidden md:table-cell">
                      <span className="inline-flex items-center justify-center gap-1">
                        Jantar pago
                        <DinnerInfo />
                      </span>
                    </th>
                    {ROUNDS.map((r) => (
                      <th
                        key={r.key}
                        className={`text-center font-medium py-3 px-1.5 hidden lg:table-cell ${
                          r.phase === "ko" ? "text-pitch/70" : ""
                        }`}
                        title={r.label}
                      >
                        {r.short}
                      </th>
                    ))}
                    <th className="text-right font-medium px-6 py-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row, i) => {
                    const isLeader = i === 0 && row.agg > 0;
                    const dl = dinnerLabel(row.prob);
                    return (
                      <tr
                        key={row.player.id}
                        className="border-b border-border/30 last:border-0 hover:bg-surface-elevated/50 transition-colors"
                      >
                        <td className="px-6 py-4 text-muted-foreground tabular-nums align-top">
                          {isLeader ? (
                            <span className="inline-flex size-6 rounded-full gradient-pitch text-primary-foreground items-center justify-center text-xs font-bold">
                              {i + 1}
                            </span>
                          ) : (
                            <span className="text-base">{i + 1}</span>
                          )}
                        </td>
                        <td className="py-4 align-top">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-display font-semibold text-base">
                              {row.player.name}
                            </span>
                            {row.wins > 0 && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gold/15 text-[color:var(--gold)] border border-[color:var(--gold)]/30"
                                title={`${row.wins} ${row.wins === 1 ? "ronda ganha" : "rondas ganhas"}`}
                              >
                                <Trophy className="size-2.5" />
                                {row.wins}× {row.wins === 1 ? "ronda" : "rondas"}
                              </span>
                            )}
                          </div>
                          {/* mobile: show risk inline */}
                          <div className="text-xs text-muted-foreground mt-1 md:hidden">
                            <span className="mr-1">{dl.emoji}</span>
                            {dl.label} · {Math.round(row.prob * 100)}%
                          </div>
                        </td>
                        <td className="py-4 align-top hidden sm:table-cell">
                          <DrinkCell
                            player={row.player}
                            wins={row.wins}
                            open={drinkPickerFor === row.player.id}
                            onToggle={() =>
                              setDrinkPickerFor((cur) =>
                                cur === row.player.id ? null : row.player.id,
                              )
                            }
                            onPick={(d) => setDrink(row.player.id, d)}
                          />
                        </td>
                        <td className="py-4 align-top hidden md:table-cell">
                          <DinnerBar prob={row.prob} label={dl.label} emoji={dl.emoji} />
                        </td>
                        {row.perRound.map((v, idx) => {
                          const rk = ROUNDS[idx].key;
                          const winners = players
                            .map((pp) => scoreMap.get(`${pp.id}:${rk}`))
                            .filter((x): x is number => typeof x === "number");
                          const isRoundWin =
                            v !== null && winners.length > 0 && v === Math.max(...winners);
                          return (
                            <td
                              key={idx}
                              className="text-center font-mono text-xs tabular-nums px-1.5 hidden lg:table-cell align-top py-4"
                            >
                              {v === null ? (
                                <span className="text-muted-foreground/30">—</span>
                              ) : isRoundWin ? (
                                <span className="text-pitch font-bold">{v}</span>
                              ) : (
                                v
                              )}
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 text-right align-top">
                          <span
                            className={`font-display font-bold tabular-nums text-xl ${
                              isLeader ? "text-pitch" : ""
                            }`}
                          >
                            {row.agg}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {players.length === 0 && (
                    <tr>
                      <td colSpan={12} className="py-16 text-center text-muted-foreground">
                        Sem jogadores ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground/60 mt-6 text-center">
          Edição em tempo real · clica na bebida para a mudar · probabilidade de ganhar o jantar
          simulada com base nas rondas já jogadas
        </p>
      </section>

      {editing && (
        <RoundEditor
          roundKey={editing}
          players={players}
          scoreMap={scoreMap}
          onClose={() => setEditing(null)}
          onSaved={() => {}}
        />
      )}

      {addingPlayer && (
        <Modal onClose={() => setAddingPlayer(false)} title="Adicionar jogador">
          <input
            autoFocus
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
            placeholder="Nome"
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-base outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20"
          />
          <div className="flex justify-end gap-2 mt-5">
            <button
              onClick={() => setAddingPlayer(false)}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={addPlayer}
              className="px-4 py-2 text-sm rounded-lg bg-pitch text-primary-foreground font-medium shadow-glow hover:opacity-90"
            >
              Adicionar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DrinkCell({
  player,
  wins,
  open,
  onToggle,
  onPick,
}: {
  player: Player;
  wins: number;
  open: boolean;
  onToggle: () => void;
  onPick: (d: string) => void;
}) {
  const drink = player.drink || "🍺";
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-elevated hover:bg-accent transition-colors"
        title="Mudar bebida"
      >
        <span className="text-lg leading-none">{drink}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          ×{wins}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onToggle} />
          <div className="absolute z-40 mt-2 left-0 bg-surface border border-border rounded-xl shadow-card p-2 flex gap-1">
            {DRINKS.map((d) => (
              <button
                key={d}
                onClick={() => onPick(d)}
                className={`size-9 grid place-items-center rounded-lg text-xl hover:bg-accent transition-colors ${
                  d === drink ? "bg-pitch/20 ring-1 ring-pitch" : ""
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DinnerInfo() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex normal-case">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground/70 hover:text-foreground transition-colors"
        aria-label="Como é calculada a probabilidade"
      >
        <HelpCircle className="size-3.5" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Fechar"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-40 top-7 left-1/2 -translate-x-1/2 w-[min(92vw,26rem)] bg-surface border border-border rounded-2xl shadow-card overflow-hidden text-left">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-surface-elevated/50">
              <span className="grid place-items-center size-7 rounded-lg bg-pitch/15 text-pitch">
                <Trophy className="size-3.5" />
              </span>
              <div>
                <p className="text-xs font-semibold text-foreground tracking-normal normal-case">
                  Como é calculada a probabilidade
                </p>
                <p className="text-[10px] text-muted-foreground tracking-normal normal-case">
                  Simulação de Monte Carlo · 4000 cenários
                </p>
              </div>
            </div>

            <ol className="px-4 py-3 space-y-3">
              <li className="flex gap-3">
                <span className="mt-0.5 grid place-items-center size-5 shrink-0 rounded-full bg-pitch/15 text-pitch text-[10px] font-bold tabular-nums">
                  1
                </span>
                <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
                  Para cada ronda que falta, cada jogador soma a sua{" "}
                  <span className="text-foreground font-medium">média de pontos</span> com alguma
                  variação aleatória.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 grid place-items-center size-5 shrink-0 rounded-full bg-pitch/15 text-pitch text-[10px] font-bold tabular-nums">
                  2
                </span>
                <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
                  Repetimos este cenário{" "}
                  <span className="text-foreground font-medium">milhares de vezes</span>. Quem ficar
                  com o total mais alto ganha o jantar nesse cenário.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 grid place-items-center size-5 shrink-0 rounded-full bg-pitch/15 text-pitch text-[10px] font-bold tabular-nums">
                  3
                </span>
                <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
                  A probabilidade é a{" "}
                  <span className="text-foreground font-medium">fração de cenários</span> em que cada
                  jogador vence.
                </p>
              </li>
            </ol>

            <div className="px-4 py-3 border-t border-border/60 bg-surface-elevated/30 space-y-1.5">
              <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
                <span className="text-foreground font-medium">Poucas rondas jogadas?</span> A média
                de cada um é puxada para a média da liga, por isso quem está atrás ainda tem hipótese
                enquanto houver rondas por jogar.
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
                <span className="text-foreground font-medium">Sem rondas a jogar?</span> Ganha
                simplesmente quem tem mais pontos.
              </p>
            </div>
          </div>
        </>
      )}
    </span>
  );
}

function DinnerBar({ prob, label, emoji }: { prob: number; label: string; emoji: string }) {
  const pct = Math.round(prob * 100);
  return (
    <div className="px-3 min-w-[150px]">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">
          <span className="mr-1">{emoji}</span>
          {label}
        </span>
        <span className="font-mono tabular-nums font-semibold">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.max(2, pct)}%`,
            background:
              prob >= 0.4
                ? "linear-gradient(90deg, oklch(0.82 0.22 145), oklch(0.7 0.22 165))"
                : prob >= 0.15
                  ? "linear-gradient(90deg, oklch(0.78 0.18 70), oklch(0.82 0.16 90))"
                  : "linear-gradient(90deg, oklch(0.65 0.22 25), oklch(0.75 0.2 40))",
          }}
        />
      </div>
    </div>
  );
}

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 p-1"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RoundEditor({
  roundKey,
  players,
  scoreMap,
  onClose,
  onSaved,
}: {
  roundKey: string;
  players: Player[];
  scoreMap: Map<string, number>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [currentKey, setCurrentKey] = useState(roundKey);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d: Record<string, string> = {};
    players.forEach((p) => {
      const v = scoreMap.get(`${p.id}:${currentKey}`);
      d[p.id] = v == null ? "" : String(v);
    });
    setDraft(d);
  }, [currentKey, players, scoreMap]);

  const round = ROUNDS.find((r) => r.key === currentKey)!;

  async function save() {
    setSaving(true);
    const rows = players
      .map((p) => ({
        player_id: p.id,
        round_key: currentKey,
        points: draft[p.id] === "" ? null : parseInt(draft[p.id], 10),
      }))
      .filter((r) => r.points !== null && !Number.isNaN(r.points))
      .map((r) => ({ ...r, points: r.points as number }));

    if (rows.length) {
      await supabase.from("scores").upsert(rows, { onConflict: "player_id,round_key" });
    }
    const cleared = players
      .filter((p) => draft[p.id] === "" && scoreMap.has(`${p.id}:${currentKey}`))
      .map((p) => p.id);
    if (cleared.length) {
      await supabase.from("scores").delete().eq("round_key", currentKey).in("player_id", cleared);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 border-b border-border/40">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-pitch mb-1">
                {round.phase === "groups" ? "Fase de grupos" : "Eliminatórias"}
              </div>
              <h3 className="font-display text-2xl font-bold">{round.label}</h3>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex gap-1.5 mt-4 flex-wrap">
            {ROUNDS.map((r) => (
              <button
                key={r.key}
                onClick={() => setCurrentKey(r.key)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  r.key === currentKey
                    ? "bg-pitch text-primary-foreground font-medium"
                    : "bg-surface-elevated text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.short}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 max-h-[50vh] overflow-y-auto">
          <div className="grid grid-cols-[1fr_120px] gap-x-4 gap-y-2 items-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Jogador</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">
              Pontos
            </div>
            {players.map((p) => (
              <RowInput
                key={p.id}
                name={p.name}
                value={draft[p.id] ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, [p.id]: v }))}
              />
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border/40 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 text-sm rounded-lg bg-pitch text-primary-foreground font-medium shadow-glow hover:opacity-90 inline-flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function RowInput({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <div className="font-display text-sm font-medium py-1.5">{name}</div>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="bg-input border border-border rounded-md px-3 py-1.5 text-right font-mono tabular-nums text-sm outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20 w-full"
      />
    </>
  );
}
