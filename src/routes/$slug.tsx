import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Trophy,
  Plus,
  Pencil,
  Loader2,
  Sparkles,
  UserPlus,
  Check,
  X,
  HelpCircle,
  KeyRound,
  Lock,
  Unlock,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import {
  verifyLeaguePassword,
  addPlayer as addPlayerFn,
  removePlayer as removePlayerFn,
  setDrink as setDrinkFn,
  saveScores as saveScoresFn,
} from "@/lib/leagues.functions";
import { useT, type Dict } from "@/lib/i18n";
import { recordRecentLeague } from "@/lib/recent-leagues";
import { LanguageToggle } from "@/components/LanguageToggle";

export const Route = createFileRoute("/$slug")({
  component: LeagueBoard,
});

type League = { id: string; slug: string; name: string };
type Round = { id: string; name: string; short: string; display_order: number };
type Player = { id: string; name: string; display_order: number; drink: string };
type Score = { id: string; player_id: string; round_id: string; points: number };

const DRINKS = ["🍺", "🍷", "🧃", "🥃", "🍹", "☕"];

function dinnerLabel(prob: number, t: Dict) {
  if (prob >= 0.5) return { label: t.board.dinner1, emoji: "🍗" };
  if (prob >= 0.25) return { label: t.board.dinner2, emoji: "😋" };
  if (prob >= 0.1) return { label: t.board.dinner3, emoji: "🤞" };
  if (prob >= 0.03) return { label: t.board.dinner4, emoji: "😬" };
  return { label: t.board.dinner5, emoji: "💸" };
}

function isAuthError(err: unknown): boolean {
  return String(err instanceof Error ? err.message : err).includes("WRONG_PASSWORD");
}

function LeagueBoard() {
  const { slug } = useParams({ from: "/$slug" });
  const t = useT();
  const pwKey = `league:${slug}:pw`;

  const [league, setLeague] = useState<League | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [password, setPassword] = useState<string | null>(null);
  const [askPassword, setAskPassword] = useState(false);

  const [editing, setEditing] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [drinkPickerFor, setDrinkPickerFor] = useState<string | null>(null);

  const unlocked = password !== null;

  useEffect(() => {
    setPassword(localStorage.getItem(pwKey));
  }, [pwKey]);

  const loadAll = useCallback(async () => {
    const { data: lg } = await supabase
      .from("leagues")
      .select("id, slug, name")
      .eq("slug", slug)
      .maybeSingle();
    if (!lg) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from("rounds").select("*").eq("league_id", lg.id).order("display_order"),
      supabase.from("players").select("*").eq("league_id", lg.id).order("display_order"),
    ]);
    const roundIds = (r ?? []).map((x) => x.id);
    const { data: s } = roundIds.length
      ? await supabase.from("scores").select("*").in("round_id", roundIds)
      : { data: [] as Score[] };
    setLeague(lg as League);
    setRounds((r ?? []) as Round[]);
    setPlayers((p ?? []) as Player[]);
    setScores((s ?? []) as Score[]);
    setLoading(false);
    recordRecentLeague(lg.slug, lg.name);
  }, [slug]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!league) return;
    const ch = supabase
      .channel(`league:${league.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, () => loadAll())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `league_id=eq.${league.id}` },
        () => loadAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `league_id=eq.${league.id}` },
        () => loadAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [league, loadAll]);

  function unlock(pw: string) {
    localStorage.setItem(pwKey, pw);
    setPassword(pw);
    setAskPassword(false);
  }
  function lock() {
    localStorage.removeItem(pwKey);
    setPassword(null);
  }

  // Re-prompt for password after a rejected edit.
  const handleAuthFailure = useCallback(() => {
    localStorage.removeItem(pwKey);
    setPassword(null);
    setAskPassword(true);
  }, [pwKey]);

  const scoreMap = useMemo(() => {
    const m = new Map<string, number>();
    scores.forEach((s) => m.set(`${s.player_id}:${s.round_id}`, s.points));
    return m;
  }, [scores]);

  const roundsPlayedIds = useMemo(
    () =>
      rounds.filter((r) => players.some((p) => scoreMap.has(`${p.id}:${r.id}`))).map((r) => r.id),
    [scoreMap, players, rounds],
  );
  const roundsRemaining = rounds.length - roundsPlayedIds.length;

  const leagueStats = useMemo(() => {
    const all: number[] = [];
    roundsPlayedIds.forEach((rid) => {
      players.forEach((p) => {
        const v = scoreMap.get(`${p.id}:${rid}`);
        if (typeof v === "number") all.push(v);
      });
    });
    if (!all.length) return { mean: 70, std: 15 };
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    const variance = all.reduce((a, b) => a + (b - mean) ** 2, 0) / all.length;
    return { mean, std: Math.max(8, Math.sqrt(variance)) };
  }, [scoreMap, players, roundsPlayedIds]);

  const playerMean = useMemo(() => {
    const m = new Map<string, number>();
    players.forEach((p) => {
      const vals = roundsPlayedIds
        .map((rid) => scoreMap.get(`${p.id}:${rid}`))
        .filter((v): v is number => typeof v === "number");
      m.set(p.id, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : leagueStats.mean);
    });
    return m;
  }, [players, scoreMap, roundsPlayedIds, leagueStats]);

  // Monte Carlo: probability each player ends FIRST (wins, gets dinner paid)
  const dinnerProb = useMemo(() => {
    const counts = new Map<string, number>();
    players.forEach((p) => counts.set(p.id, 0));
    if (!players.length) return counts;

    const PRIOR_K = 4;

    const currentTotals = players.map((p) => {
      let t = 0;
      let n = 0;
      rounds.forEach((r) => {
        const v = scoreMap.get(`${p.id}:${r.id}`);
        if (typeof v === "number") {
          t += v;
          n += 1;
        }
      });
      const rawMean = playerMean.get(p.id) ?? leagueStats.mean;
      const projMean = (rawMean * n + leagueStats.mean * PRIOR_K) / (n + PRIOR_K);
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
      const u = Math.random() || 1e-9;
      const v = Math.random() || 1e-9;
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    for (let t = 0; t < TRIALS; t++) {
      let bestId = currentTotals[0].id;
      let bestTotal = -Infinity;
      for (const c of currentTotals) {
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
  }, [players, scoreMap, playerMean, leagueStats, roundsRemaining, rounds]);

  const standings = useMemo(() => {
    const rows = players.map((p) => {
      const perRound = rounds.map((r) => scoreMap.get(`${p.id}:${r.id}`) ?? null);
      const agg = perRound.reduce<number>((a, v) => a + (v ?? 0), 0);
      const wins = rounds.reduce((acc, r) => {
        const vals = players
          .map((pp) => scoreMap.get(`${pp.id}:${r.id}`))
          .filter((v): v is number => typeof v === "number");
        if (!vals.length) return acc;
        const max = Math.max(...vals);
        const mine = scoreMap.get(`${p.id}:${r.id}`);
        return mine === max ? acc + 1 : acc;
      }, 0);
      const prob = dinnerProb.get(p.id) ?? 0;
      return { player: p, perRound, agg, wins, prob };
    });
    rows.sort((a, b) => b.agg - a.agg);
    return rows;
  }, [players, scoreMap, dinnerProb, rounds]);

  async function addPlayer() {
    const name = newPlayerName.trim();
    if (!name || !password) return;
    try {
      await addPlayerFn({ data: { slug, password, name } });
      setNewPlayerName("");
      setAddingPlayer(false);
      loadAll();
    } catch (err) {
      if (isAuthError(err)) handleAuthFailure();
    }
  }

  async function removePlayer(playerId: string) {
    if (!password) return;
    try {
      await removePlayerFn({ data: { slug, password, playerId } });
      loadAll();
    } catch (err) {
      if (isAuthError(err)) handleAuthFailure();
    }
  }

  async function setDrink(playerId: string, drink: string) {
    if (!password) return;
    setDrinkPickerFor(null);
    setPlayers((ps) => ps.map((p) => (p.id === playerId ? { ...p, drink } : p)));
    try {
      await setDrinkFn({ data: { slug, password, playerId, drink } });
    } catch (err) {
      if (isAuthError(err)) handleAuthFailure();
      loadAll();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="text-center">
          <div className="size-12 rounded-xl gradient-pitch grid place-items-center shadow-glow mx-auto mb-5">
            <Trophy className="size-6 text-primary-foreground" />
          </div>
          <h1 className="font-display text-2xl font-bold">{t.board.notFoundTitle}</h1>
          <p className="text-muted-foreground mt-2">
            {t.board.notFoundCodePrefix} <span className="font-mono">{slug}</span>{" "}
            {t.board.notFoundCodeSuffix}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 mt-6 px-4 py-2 text-sm rounded-lg bg-pitch text-pitch-foreground font-medium shadow-glow hover:opacity-90"
          >
            <ArrowLeft className="size-4" /> {t.board.createOne}
          </Link>
        </div>
      </div>
    );
  }

  const roundsPlayedCount = roundsPlayedIds.length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-20 bg-background/70">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="size-9 rounded-lg gradient-pitch grid place-items-center shadow-glow">
              <Trophy className="size-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display font-bold tracking-tight leading-none">
                {league?.name}
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
                {t.board.leagueLabel} · {slug}
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            {unlocked && (
              <button
                onClick={() => setAddingPlayer(true)}
                className="hidden sm:inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <UserPlus className="size-4" />
                {t.board.addPlayer}
              </button>
            )}
            {unlocked ? (
              <button
                onClick={lock}
                className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-pitch/15 text-pitch hover:bg-pitch/25 transition-colors"
                title={t.board.lockTitle}
              >
                <Unlock className="size-3.5" />
                {t.board.editingActive}
              </button>
            ) : (
              <button
                onClick={() => setAskPassword(true)}
                className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
                title={t.board.unlockTitle}
              >
                <Lock className="size-3.5" />
                {t.board.editScores}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-pitch mb-5">
          <Sparkles className="size-3.5" />
          <span>{t.board.roundsPlayed(roundsPlayedCount, rounds.length)}</span>
        </div>
        <h1 className="font-display text-5xl sm:text-6xl font-bold leading-[0.95] max-w-3xl">
          {t.board.heroTitleA}
          <br />
          <span className="text-pitch">{t.board.heroTitleB}</span>?
        </h1>
        <p className="text-muted-foreground mt-5 max-w-xl text-lg">
          {t.board.heroSubtitle(roundsRemaining)}
        </p>
      </section>

      {/* Leaderboard */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="bg-surface/60 backdrop-blur border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">{t.board.standings}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.board.standingsSummary(players.length, rounds.length)}
              </p>
            </div>
            {unlocked && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {rounds.map((r) => {
                  const played = roundsPlayedIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => setEditing(r.id)}
                      className={`hidden md:inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors ${
                        played
                          ? "bg-pitch/15 text-pitch hover:bg-pitch/25"
                          : "bg-surface-elevated text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                      title={t.board.roundButtonTitle(played, r.name)}
                    >
                      <Pencil className="size-3" />
                      {r.short}
                    </button>
                  );
                })}
                {rounds.length > 0 && (
                  <button
                    onClick={() =>
                      setEditing(rounds[Math.min(roundsPlayedCount, rounds.length - 1)].id)
                    }
                    className="md:hidden inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-pitch text-pitch-foreground font-medium"
                  >
                    <Plus className="size-3.5" />
                    {t.board.pointsButton}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="text-left font-medium px-6 py-3 w-10">#</th>
                  <th className="text-left font-medium py-3">{t.board.colPlayer}</th>
                  <th className="text-left font-medium py-3">{t.board.colDrinks}</th>
                  <th className="text-center font-medium py-3 hidden md:table-cell">
                    <span className="inline-flex items-center justify-center gap-1">
                      {t.board.colDinner}
                      <DinnerInfo />
                    </span>
                  </th>
                  {rounds.map((r) => (
                    <th
                      key={r.id}
                      className="text-center font-medium py-3 px-1.5 hidden lg:table-cell"
                      title={r.name}
                    >
                      {r.short}
                    </th>
                  ))}
                  <th className="text-right font-medium px-6 py-3">{t.board.colTotal}</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, i) => {
                  const isLeader = i === 0 && row.agg > 0;
                  const dl = dinnerLabel(row.prob, t);
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
                              className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gold/15 text-[color:var(--gold)] border border-[color:var(--gold)]/30"
                              title={t.board.winsBadgeTitle(row.wins)}
                            >
                              <Trophy className="size-2.5" />
                              {t.board.winsBadgeText(row.wins)}
                            </span>
                          )}
                          {unlocked && (
                            <button
                              onClick={() => removePlayer(row.player.id)}
                              className="text-muted-foreground/40 hover:text-[color:oklch(0.7_0.2_25)] transition-colors"
                              title={t.board.removePlayer}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 md:hidden">
                          <span className="mr-1">{dl.emoji}</span>
                          {dl.label} · {Math.round(row.prob * 100)}%
                        </div>
                      </td>
                      <td className="py-4 align-top">
                        <DrinkCell
                          player={row.player}
                          wins={row.wins}
                          editable={unlocked}
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
                        const rid = rounds[idx].id;
                        const winners = players
                          .map((pp) => scoreMap.get(`${pp.id}:${rid}`))
                          .filter((x): x is number => typeof x === "number");
                        const isRoundWin =
                          v !== null && winners.length > 0 && v === Math.max(...winners);
                        return (
                          <td
                            key={rid}
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
                          className={`font-display font-bold tabular-nums text-xl ${isLeader ? "text-pitch" : ""}`}
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
                      {t.board.noPlayers}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground/60 mt-6 text-center">{t.board.footer}</p>
      </section>

      {editing && unlocked && password && league && (
        <RoundEditor
          slug={slug}
          password={password}
          roundId={editing}
          rounds={rounds}
          players={players}
          scoreMap={scoreMap}
          onAuthFailure={handleAuthFailure}
          onClose={() => setEditing(null)}
          onSaved={() => loadAll()}
        />
      )}

      {addingPlayer && unlocked && (
        <Modal onClose={() => setAddingPlayer(false)} title={t.board.addPlayer}>
          <input
            autoFocus
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
            placeholder={t.board.addPlayerPlaceholder}
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-base outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20"
          />
          <div className="flex justify-end gap-2 mt-5">
            <button
              onClick={() => setAddingPlayer(false)}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={addPlayer}
              className="px-4 py-2 text-sm rounded-lg bg-pitch text-pitch-foreground font-medium shadow-glow hover:opacity-90"
            >
              {t.common.add}
            </button>
          </div>
        </Modal>
      )}

      {askPassword && (
        <PasswordModal slug={slug} onClose={() => setAskPassword(false)} onSuccess={unlock} />
      )}
    </div>
  );
}

function PasswordModal({
  slug,
  onClose,
  onSuccess,
}: {
  slug: string;
  onClose: () => void;
  onSuccess: (pw: string) => void;
}) {
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);
  const t = useT();

  async function submit() {
    const pw = value.trim();
    if (!pw) return;
    setChecking(true);
    setError(false);
    try {
      const { ok } = await verifyLeaguePassword({ data: { slug, password: pw } });
      if (ok) {
        onSuccess(pw);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Modal onClose={onClose} title={t.board.unlockTitle}>
      <p className="text-sm text-muted-foreground mb-4">{t.board.passwordPrompt}</p>
      <div className="relative">
        <KeyRound className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t.board.passwordPlaceholder}
          className="w-full bg-input border border-border rounded-lg pl-9 pr-4 py-3 text-base outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20 font-mono tracking-wide"
        />
      </div>
      {error && (
        <p className="text-sm text-[color:oklch(0.7_0.2_25)] mt-2">{t.board.passwordWrong}</p>
      )}
      <div className="flex justify-end gap-2 mt-5">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {t.common.cancel}
        </button>
        <button
          onClick={submit}
          disabled={checking}
          className="px-4 py-2 text-sm rounded-lg bg-pitch text-pitch-foreground font-medium shadow-glow hover:opacity-90 inline-flex items-center gap-2 disabled:opacity-50"
        >
          {checking ? <Loader2 className="size-4 animate-spin" /> : <Unlock className="size-4" />}
          {t.board.unlock}
        </button>
      </div>
    </Modal>
  );
}

function DrinkCell({
  player,
  wins,
  editable,
  open,
  onToggle,
  onPick,
}: {
  player: Player;
  wins: number;
  editable: boolean;
  open: boolean;
  onToggle: () => void;
  onPick: (d: string) => void;
}) {
  const t = useT();
  const drink = player.drink || "🍺";
  if (!editable) {
    return (
      <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-elevated">
        <span className="text-lg leading-none">{drink}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">×{wins}</span>
      </div>
    );
  }
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-elevated hover:bg-accent transition-colors"
        title={t.board.changeDrink}
      >
        <span className="text-lg leading-none">{drink}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">×{wins}</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label={t.common.close}
            className="fixed inset-0 z-30"
            onClick={onToggle}
          />
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
  const t = useT();
  return (
    <span className="relative inline-flex normal-case">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground/70 hover:text-foreground transition-colors"
        aria-label={t.board.infoTitle}
      >
        <HelpCircle className="size-3.5" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label={t.common.close}
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
                  {t.board.infoTitle}
                </p>
                <p className="text-[11px] text-muted-foreground tracking-normal normal-case">
                  {t.board.infoSubtitle}
                </p>
              </div>
            </div>

            <ol className="px-4 py-3 space-y-3">
              <li className="flex gap-3">
                <span className="mt-0.5 grid place-items-center size-5 shrink-0 rounded-full bg-pitch/15 text-pitch text-[11px] font-bold tabular-nums">
                  1
                </span>
                <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
                  {t.board.infoStep1a}{" "}
                  <span className="text-foreground font-medium">{t.board.infoStep1bold}</span>{" "}
                  {t.board.infoStep1c}
                </p>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 grid place-items-center size-5 shrink-0 rounded-full bg-pitch/15 text-pitch text-[11px] font-bold tabular-nums">
                  2
                </span>
                <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
                  {t.board.infoStep2a}{" "}
                  <span className="text-foreground font-medium">{t.board.infoStep2bold}</span>
                  {t.board.infoStep2c}
                </p>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 grid place-items-center size-5 shrink-0 rounded-full bg-pitch/15 text-pitch text-[11px] font-bold tabular-nums">
                  3
                </span>
                <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
                  {t.board.infoStep3a}{" "}
                  <span className="text-foreground font-medium">{t.board.infoStep3bold}</span>{" "}
                  {t.board.infoStep3c}
                </p>
              </li>
            </ol>

            <div className="px-4 py-3 border-t border-border/60 bg-surface-elevated/30 space-y-1.5">
              <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
                <span className="text-foreground font-medium">{t.board.infoFaq1bold}</span>{" "}
                {t.board.infoFaq1}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
                <span className="text-foreground font-medium">{t.board.infoFaq2bold}</span>{" "}
                {t.board.infoFaq2}
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
                ? "linear-gradient(90deg, oklch(0.84 0.18 168), oklch(0.6 0.23 262))"
                : prob >= 0.15
                  ? "linear-gradient(90deg, oklch(0.9 0.18 100), oklch(0.86 0.16 90))"
                  : "linear-gradient(90deg, oklch(0.62 0.24 18), oklch(0.62 0.24 350))",
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
  slug,
  password,
  roundId,
  rounds,
  players,
  scoreMap,
  onAuthFailure,
  onClose,
  onSaved,
}: {
  slug: string;
  password: string;
  roundId: string;
  rounds: Round[];
  players: Player[];
  scoreMap: Map<string, number>;
  onAuthFailure: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [currentId, setCurrentId] = useState(roundId);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const t = useT();

  useEffect(() => {
    const d: Record<string, string> = {};
    players.forEach((p) => {
      const v = scoreMap.get(`${p.id}:${currentId}`);
      d[p.id] = v == null ? "" : String(v);
    });
    setDraft(d);
  }, [currentId, players, scoreMap]);

  const round = rounds.find((r) => r.id === currentId);

  async function save() {
    if (!round) return;
    setSaving(true);
    const entries = players.map((p) => ({
      playerId: p.id,
      points: draft[p.id] === "" ? null : parseInt(draft[p.id], 10),
    }));
    try {
      await saveScoresFn({ data: { slug, password, roundId: currentId, entries } });
      onSaved();
      onClose();
    } catch (err) {
      if (isAuthError(err)) {
        onClose();
        onAuthFailure();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!round) return null;

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
              <div className="text-[11px] uppercase tracking-[0.2em] text-pitch mb-1">
                {t.board.roundLabel}
              </div>
              <h3 className="font-display text-2xl font-bold">{round.name}</h3>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex gap-1.5 mt-4 flex-wrap">
            {rounds.map((r) => (
              <button
                key={r.id}
                onClick={() => setCurrentId(r.id)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  r.id === currentId
                    ? "bg-pitch text-pitch-foreground font-medium"
                    : "bg-surface-elevated text-muted-foreground hover:text-foreground"
                }`}
                title={r.name}
              >
                {r.short}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 max-h-[50vh] overflow-y-auto">
          <div className="grid grid-cols-[1fr_120px] gap-x-4 gap-y-2 items-center">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t.board.colPlayer}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground text-right">
              {t.board.points}
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
            {t.common.cancel}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 text-sm rounded-lg bg-pitch text-pitch-foreground font-medium shadow-glow hover:opacity-90 inline-flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {t.common.save}
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
