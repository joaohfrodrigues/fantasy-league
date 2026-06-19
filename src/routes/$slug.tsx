import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Trophy,
  Plus,
  Pencil,
  Loader2,
  UserPlus,
  Check,
  X,
  HelpCircle,
  KeyRound,
  Lock,
  Unlock,
  Trash2,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  TrendingUp,
  TrendingDown,
  Sigma,
  Swords,
  Gauge,
  History,
  Download,
} from "lucide-react";
import {
  verifyLeaguePassword,
  addPlayer as addPlayerFn,
  removePlayer as removePlayerFn,
  addRound as addRoundFn,
  deleteRound as deleteRoundFn,
  setDrink as setDrinkFn,
  saveScores as saveScoresFn,
  lockRound as lockRoundFn,
  unlockRound as unlockRoundFn,
  getAuditLog as getAuditLogFn,
  exportLeague as exportLeagueFn,
  type AuditEntry,
} from "@/lib/leagues.functions";
import { useT, type Dict } from "@/lib/i18n";
import { recordRecentLeague } from "@/lib/recent-leagues";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useMounted, useCountUp } from "@/hooks/use-animations";

export const Route = createFileRoute("/$slug")({
  component: LeagueBoard,
});

type League = { id: string; slug: string; name: string };
type Round = {
  id: string;
  name: string;
  short: string;
  display_order: number;
  locked_at: string | null;
};
type Player = { id: string; name: string; display_order: number; drink: string };
type Score = { id: string; player_id: string; round_id: string; points: number };

const SCORE_MIN = -10;
const SCORE_MAX = 150;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// Small deterministic PRNG (mulberry32) so the simulation is reproducible.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRIZE_EMOJIS = ["🍺", "🍷", "🧃", "☕", "🍽️", "🥇"];

function dinnerLabel(prob: number, n: number, t: Dict) {
  const fair = 1 / Math.max(n, 1);
  if (prob >= 1) return { label: t.board.dinner1, emoji: "🍗" };
  if (prob >= clamp(4 * fair, 0.35, 0.6)) return { label: t.board.dinner2, emoji: "😋" };
  if (prob >= clamp(2 * fair, 0.2, 0.35)) return { label: t.board.dinner3, emoji: "🤞" };
  if (prob >= clamp(fair, 0.08, 0.2)) return { label: t.board.dinner4, emoji: "😬" };
  return { label: t.board.dinner5, emoji: "💸" };
}

function isAuthError(err: unknown): boolean {
  return String(err instanceof Error ? err.message : err).includes("WRONG_PASSWORD");
}

function parseDraftPoints(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return null;
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.trunc(num)));
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
  const [showHistory, setShowHistory] = useState(false);

  // Column the standings table is sorted by. "total" | "prizes" | "dinner" | <roundId>.
  const [sortKey, setSortKey] = useState<string>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortBy = useCallback((key: string) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        return key;
      }
      setSortDir("desc");
      return key;
    });
  }, []);

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

  // Briefly highlight rows whose scores just changed (live updates / edits).
  const prevScoreRef = useRef<Map<string, number> | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const prev = prevScoreRef.current;
    prevScoreRef.current = scoreMap;
    if (!prev) return; // Skip the first load — rows already animate in.
    const changed = new Set<string>();
    scoreMap.forEach((val, key) => {
      if (prev.get(key) !== val) changed.add(key.slice(0, key.indexOf(":")));
    });
    prev.forEach((val, key) => {
      if (!scoreMap.has(key)) changed.add(key.slice(0, key.indexOf(":")));
    });
    if (changed.size === 0) return;
    setFlashIds(changed);
    const id = setTimeout(() => setFlashIds(new Set()), 1100);
    return () => clearTimeout(id);
  }, [scoreMap]);

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
    if (!all.length) return { mean: 70, std: 35 };
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    const variance = all.reduce((a, b) => a + (b - mean) ** 2, 0) / all.length;
    return { mean, std: Math.max(20, Math.sqrt(variance)) };
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

    const PRIOR_K = 3;

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

    // Deterministic seed from the current data so probabilities don't flicker
    // between renders (same inputs -> same output).
    let seed = (0x9e3779b9 ^ roundsRemaining) >>> 0;
    for (const c of currentTotals) {
      seed = (Math.imul(seed, 31) + Math.round(c.total) + Math.round(c.projMean * 1000)) >>> 0;
    }
    const rand = mulberry32(seed);
    const randn = () => {
      const u = rand() || 1e-9;
      const v = rand() || 1e-9;
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    // Antithetic variates: each pair of trials reuses the negated normals to
    // cancel sampling swings, cutting variance for roughly the same work.
    const PAIRS = 3000;
    const perTrial = currentTotals.length * (1 + roundsRemaining);
    const z = new Float64Array(perTrial);

    const runTrial = (sign: number) => {
      let bestId = currentTotals[0].id;
      let bestTotal = -Infinity;
      let k = 0;
      for (const c of currentTotals) {
        const level = c.projMean + sign * z[k++] * c.skillSD;
        let sim = c.total;
        for (let r = 0; r < roundsRemaining; r++) {
          sim += clamp(level + sign * z[k++] * leagueStats.std, SCORE_MIN, SCORE_MAX);
        }
        if (sim > bestTotal) {
          bestTotal = sim;
          bestId = c.id;
        }
      }
      counts.set(bestId, (counts.get(bestId) ?? 0) + 1);
    };

    for (let t = 0; t < PAIRS; t++) {
      for (let i = 0; i < perTrial; i++) z[i] = randn();
      runTrial(1);
      runTrial(-1);
    }
    const samples = PAIRS * 2;
    const out = new Map<string, number>();
    counts.forEach((v, k) => out.set(k, v / samples));
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

    // League rank is always determined by total, independent of the display sort.
    const rankMap = new Map<string, number>();
    [...rows].sort((a, b) => b.agg - a.agg).forEach((r, i) => rankMap.set(r.player.id, i + 1));
    const withRank = rows.map((r) => ({ ...r, rank: rankMap.get(r.player.id) ?? 0 }));

    const valueFor = (row: (typeof withRank)[number]): number | null => {
      if (sortKey === "prizes") return row.wins;
      if (sortKey === "dinner") return row.prob;
      if (sortKey === "total") return row.agg;
      const idx = rounds.findIndex((r) => r.id === sortKey);
      return idx >= 0 ? row.perRound[idx] : row.agg;
    };

    const dir = sortDir === "asc" ? 1 : -1;
    withRank.sort((a, b) => {
      const av = valueFor(a);
      const bv = valueFor(b);
      if (av === null && bv === null) return a.rank - b.rank;
      if (av === null) return 1; // players without a score for this column go last
      if (bv === null) return -1;
      if (av === bv) return a.rank - b.rank;
      return (av - bv) * dir;
    });
    return withRank;
  }, [players, scoreMap, dinnerProb, rounds, sortKey, sortDir]);

  const stats = useMemo(() => {
    let high: { value: number; player: string; round: string } | null = null;
    let low: { value: number; player: string; round: string } | null = null;
    let margin: { value: number; player: string; round: string } | null = null;
    let sum = 0;
    let count = 0;
    rounds.forEach((r) => {
      const entries: { name: string; v: number }[] = [];
      players.forEach((p) => {
        const v = scoreMap.get(`${p.id}:${r.id}`);
        if (typeof v !== "number") return;
        entries.push({ name: p.name, v });
        sum += v;
        count += 1;
        if (!high || v > high.value) high = { value: v, player: p.name, round: r.short };
        if (!low || v < low.value) low = { value: v, player: p.name, round: r.short };
      });
      if (entries.length >= 2) {
        entries.sort((a, b) => b.v - a.v);
        const m = entries[0].v - entries[1].v;
        if (!margin || m > margin.value) {
          margin = { value: m, player: entries[0].name, round: r.short };
        }
      }
    });
    const avg = count ? sum / count : 0;
    const totals = [...players]
      .map((p) => rounds.reduce((a, r) => a + (scoreMap.get(`${p.id}:${r.id}`) ?? 0), 0))
      .sort((a, b) => b - a);
    const lead = totals.length >= 2 ? totals[0] - totals[1] : null;
    return { high, low, margin, avg, count, lead };
  }, [rounds, players, scoreMap]);

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

  async function addRound() {
    if (!password) return;
    try {
      const { id } = await addRoundFn({ data: { slug, password } });
      await loadAll();
      setEditing(id);
    } catch (err) {
      if (isAuthError(err)) handleAuthFailure();
    }
  }

  async function deleteRound(roundId: string) {
    if (!password) return;
    const idx = rounds.findIndex((r) => r.id === roundId);
    const fallbackId = rounds[idx + 1]?.id ?? rounds[idx - 1]?.id ?? null;
    try {
      await deleteRoundFn({ data: { slug, password, roundId } });
      await loadAll();
      setEditing(fallbackId);
    } catch (err) {
      if (isAuthError(err)) handleAuthFailure();
    }
  }

  async function setRoundLock(roundId: string, locked: boolean) {
    if (!password) return;
    try {
      const fn = locked ? lockRoundFn : unlockRoundFn;
      await fn({ data: { slug, password, roundId } });
      await loadAll();
    } catch (err) {
      if (isAuthError(err)) handleAuthFailure();
    }
  }

  async function exportData() {
    if (!password) return;
    try {
      const snapshot = await exportLeagueFn({ data: { slug, password } });
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (isAuthError(err)) handleAuthFailure();
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
            {unlocked && (
              <button
                onClick={() => setShowHistory(true)}
                className="hidden sm:inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                title={t.board.historyTitle}
              >
                <History className="size-4" />
                {t.board.history}
              </button>
            )}
            {unlocked && (
              <button
                onClick={exportData}
                className="hidden sm:inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                title={t.board.exportTitle}
              >
                <Download className="size-4" />
                {t.board.exportData}
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
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-pitch mb-5 animate-in fade-in slide-in-from-bottom-3 duration-500">
          <span>{t.board.roundsPlayed(roundsPlayedCount, rounds.length)}</span>
        </div>
        <h1 className="font-display text-5xl sm:text-6xl font-bold leading-[0.95] max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 fill-mode-both">
          {t.board.heroTitleA}
          <br />
          <span className="text-pitch">{t.board.heroTitleB}</span>
          <sup className="text-pitch/60 text-2xl font-normal align-super">*</sup>?
        </h1>
        <p className="text-muted-foreground mt-5 max-w-xl text-lg animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 fill-mode-both">
          {t.board.heroSubtitle(roundsRemaining)}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-3 max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 fill-mode-both">
          {t.board.heroFootnote}
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
                <button
                  onClick={addRound}
                  className="hidden md:inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-surface-elevated text-muted-foreground hover:text-foreground hover:bg-accent"
                  title={t.board.addRound}
                >
                  <Plus className="size-3" />
                  {t.board.addRound}
                </button>
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
                  <th className="text-left font-medium py-3">
                    <button
                      type="button"
                      onClick={() => sortBy("prizes")}
                      title={t.board.sortBy(t.board.colRoundPrizes)}
                      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
                        sortKey === "prizes" ? "text-foreground" : ""
                      }`}
                    >
                      {t.board.colRoundPrizes}
                      <SortIcon active={sortKey === "prizes"} dir={sortDir} />
                    </button>
                  </th>
                  <th className="text-center font-medium py-3 hidden md:table-cell">
                    <span className="inline-flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => sortBy("dinner")}
                        title={t.board.sortBy(t.board.colDinner)}
                        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
                          sortKey === "dinner" ? "text-foreground" : ""
                        }`}
                      >
                        {t.board.colDinner}
                        <SortIcon active={sortKey === "dinner"} dir={sortDir} />
                      </button>
                      <DinnerInfo />
                    </span>
                  </th>
                  {rounds.map((r) => (
                    <th
                      key={r.id}
                      className="text-center font-medium py-3 px-1.5 hidden lg:table-cell"
                      title={r.name}
                    >
                      <button
                        type="button"
                        onClick={() => sortBy(r.id)}
                        title={t.board.sortBy(r.name)}
                        className={`inline-flex items-center gap-0.5 hover:text-foreground transition-colors ${
                          sortKey === r.id ? "text-foreground" : ""
                        }`}
                      >
                        {r.short}
                        <SortIcon active={sortKey === r.id} dir={sortDir} />
                      </button>
                    </th>
                  ))}
                  <th className="text-right font-medium px-6 py-3">
                    <button
                      type="button"
                      onClick={() => sortBy("total")}
                      title={t.board.sortBy(t.board.colTotal)}
                      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
                        sortKey === "total" ? "text-foreground" : ""
                      }`}
                    >
                      {t.board.colTotal}
                      <SortIcon active={sortKey === "total"} dir={sortDir} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, i) => {
                  const isLeader = row.rank === 1 && row.agg > 0;
                  const dl = dinnerLabel(row.prob, players.length, t);
                  return (
                    <tr
                      key={row.player.id}
                      className={`border-b border-border/30 last:border-0 hover:bg-surface-elevated/50 transition-colors ${
                        flashIds.has(row.player.id) ? "animate-row-flash" : ""
                      }`}
                    >
                      <td className="px-6 py-4 text-muted-foreground tabular-nums align-top">
                        {isLeader ? (
                          <span className="inline-flex size-6 rounded-full gradient-pitch text-primary-foreground items-center justify-center text-xs font-bold">
                            {row.rank}
                          </span>
                        ) : (
                          <span className="text-base">{row.rank}</span>
                        )}
                      </td>
                      <td className="py-4 align-top">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display font-semibold text-base">
                            {row.player.name}
                          </span>
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
                          openUp={i >= standings.length - 3}
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

        {stats.count > 0 && (
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard
              icon={<TrendingUp className="size-4" />}
              tone="up"
              label={t.board.statsHighest}
              num={stats.high ? stats.high.value : null}
              caption={stats.high ? `${stats.high.player} · ${stats.high.round}` : ""}
              delay={0}
            />
            <StatCard
              icon={<TrendingDown className="size-4" />}
              tone="down"
              label={t.board.statsLowest}
              num={stats.low ? stats.low.value : null}
              caption={stats.low ? `${stats.low.player} · ${stats.low.round}` : ""}
              delay={60}
            />
            <StatCard
              icon={<Sigma className="size-4" />}
              tone="neutral"
              label={t.board.statsAverage}
              num={stats.avg}
              decimals={1}
              caption={t.board.statsAcross(stats.count)}
              delay={120}
            />
            <StatCard
              icon={<Swords className="size-4" />}
              tone="up"
              label={t.board.statsRoundMargin}
              num={stats.margin ? stats.margin.value : null}
              prefix="+"
              caption={stats.margin ? `${stats.margin.player} · ${stats.margin.round}` : ""}
              delay={180}
            />
            <StatCard
              icon={<Gauge className="size-4" />}
              tone="neutral"
              label={t.board.statsLead}
              num={stats.lead}
              prefix="+"
              caption={
                stats.lead === null
                  ? ""
                  : stats.lead === 0
                    ? t.board.statsTied
                    : t.board.statsLeadBy(standings.find((r) => r.rank === 1)?.player.name ?? "")
              }
              delay={240}
            />
          </div>
        )}

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
          onAddRound={addRound}
          onDeleteRound={deleteRound}
          onSetRoundLock={setRoundLock}
          onSaved={() => loadAll()}
        />
      )}

      {showHistory && unlocked && password && (
        <HistoryModal
          slug={slug}
          password={password}
          players={players}
          rounds={rounds}
          onClose={() => setShowHistory(false)}
          onAuthFailure={handleAuthFailure}
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
  const [error, setError] = useState<"wrong" | "server" | null>(null);
  const t = useT();

  async function submit() {
    const pw = value.trim();
    if (!pw) return;
    setChecking(true);
    setError(null);
    try {
      const { ok, reason } = await verifyLeaguePassword({ data: { slug, password: pw } });
      if (ok) {
        onSuccess(pw);
      } else {
        setError(reason === "WRONG_PASSWORD" ? "wrong" : "server");
      }
    } catch {
      setError("server");
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
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t.board.passwordPlaceholder}
          className="w-full bg-input border border-border rounded-lg pl-9 pr-4 py-3 text-base outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20 font-mono tracking-wide"
        />
      </div>
      {error === "wrong" && (
        <p className="text-sm text-[color:oklch(0.7_0.2_25)] mt-2">{t.board.passwordWrong}</p>
      )}
      {error === "server" && (
        <p className="text-sm text-[color:oklch(0.7_0.2_25)] mt-2">{t.board.passwordCheckFailed}</p>
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
          className="px-4 py-2 text-sm rounded-lg bg-pitch text-pitch-foreground font-medium shadow-glow hover:opacity-90 active:scale-95 transition inline-flex items-center gap-2 disabled:opacity-50 disabled:active:scale-100"
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
  openUp,
  editable,
  open,
  onToggle,
  onPick,
}: {
  player: Player;
  wins: number;
  openUp: boolean;
  editable: boolean;
  open: boolean;
  onToggle: () => void;
  onPick: (d: string) => void;
}) {
  const t = useT();
  const drink = player.drink || "🥇";

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
        title={t.board.changeRoundPrizeEmoji}
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
          <div
            className={`absolute z-40 left-0 bg-surface border border-border rounded-xl shadow-card p-2 flex gap-1 ${
              openUp ? "bottom-full mb-2" : "top-full mt-2"
            }`}
          >
            {PRIZE_EMOJIS.map((d) => (
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

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="size-3 opacity-40" />;
  return dir === "desc" ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />;
}

function StatCard({
  icon,
  tone,
  label,
  value,
  caption,
  num = null,
  prefix = "",
  decimals = 0,
  delay = 0,
}: {
  icon: React.ReactNode;
  tone: "up" | "down" | "neutral";
  label: string;
  value?: string;
  caption: string;
  num?: number | null;
  prefix?: string;
  decimals?: number;
  delay?: number;
}) {
  const animated = useCountUp(num ?? 0, num !== null);
  const toneClass =
    tone === "up"
      ? "bg-pitch/15 text-pitch"
      : tone === "down"
        ? "bg-[color:oklch(0.62_0.24_18)]/15 text-[color:oklch(0.7_0.2_25)]"
        : "bg-surface-elevated text-muted-foreground";
  const display = num !== null ? `${prefix}${animated.toFixed(decimals)}` : (value ?? "—");
  return (
    <div
      style={{ animationDelay: `${delay}ms`, animationDuration: "600ms" }}
      className="bg-surface/60 backdrop-blur border border-border rounded-xl p-4 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
    >
      <div className="flex items-center gap-2">
        <span className={`grid place-items-center size-7 rounded-lg ${toneClass}`}>{icon}</span>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="font-display font-bold text-2xl tabular-nums leading-none">{display}</div>
      {caption && <div className="text-xs text-muted-foreground truncate">{caption}</div>}
    </div>
  );
}

function DinnerBar({ prob, label, emoji }: { prob: number; label: string; emoji: string }) {
  const pct = Math.round(prob * 100);
  const mounted = useMounted();
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
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: mounted ? `${Math.max(2, pct)}%` : "0%",
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

function auditRecord(value: AuditEntry["oldValues"]): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function HistoryModal({
  slug,
  password,
  players,
  rounds,
  onClose,
  onAuthFailure,
}: Readonly<{
  slug: string;
  password: string;
  players: Player[];
  rounds: Round[];
  onClose: () => void;
  onAuthFailure: () => void;
}>) {
  const t = useT();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getAuditLogFn({ data: { slug, password } })
      .then((res) => {
        if (active) setEntries(res.entries);
      })
      .catch((err) => {
        if (isAuthError(err)) {
          onClose();
          onAuthFailure();
          return;
        }
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [slug, password, onClose, onAuthFailure]);

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const roundById = useMemo(() => new Map(rounds.map((r) => [r.id, r.name])), [rounds]);

  function describe(entry: AuditEntry) {
    const oldV = auditRecord(entry.oldValues);
    const newV = auditRecord(entry.newValues);
    const player = (id?: unknown) => (id != null ? playerById.get(String(id)) : undefined);
    const round = (id?: unknown) => (id != null ? roundById.get(String(id)) : undefined);

    if (entry.entityType === "score") {
      return t.board.historyLine({
        entityType: "score",
        action: entry.action,
        player: player(newV?.player_id ?? oldV?.player_id) ?? "—",
        round: round(newV?.round_id ?? oldV?.round_id) ?? "—",
        from: asText(oldV?.points),
        to: asText(newV?.points),
      });
    }
    if (entry.entityType === "round") {
      return t.board.historyLine({
        entityType: "round",
        action: entry.action,
        round: asText(newV?.name ?? oldV?.name) ?? round(entry.recordId) ?? "—",
      });
    }
    if (entry.entityType === "player") {
      return t.board.historyLine({
        entityType: "player",
        action: entry.action,
        player: asText(newV?.name ?? oldV?.name) ?? player(entry.recordId) ?? "—",
      });
    }
    if (entry.entityType === "drink") {
      return t.board.historyLine({
        entityType: "drink",
        action: entry.action,
        player: player(entry.recordId) ?? "—",
        from: asText(oldV?.drink),
        to: asText(newV?.drink),
      });
    }
    return t.board.historyLine({ entityType: entry.entityType, action: entry.action });
  }

  return (
    <Modal onClose={onClose} title={t.board.historyTitle}>
      <p className="text-xs text-muted-foreground -mt-3 mb-4">{t.board.historySubtitle}</p>
      {entries === null && !failed && (
        <div className="grid place-items-center py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
      {failed && (
        <p className="text-sm text-muted-foreground py-6 text-center">{t.board.historyError}</p>
      )}
      {entries !== null && entries.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">{t.board.historyEmpty}</p>
      )}
      {entries !== null && entries.length > 0 && (
        <ul className="max-h-[55vh] overflow-y-auto -mx-1 px-1 divide-y divide-border/40">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5">
              <span className="text-sm leading-snug">{describe(entry)}</span>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums shrink-0 pt-0.5">
                {new Date(entry.changedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
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
  onAddRound,
  onDeleteRound,
  onSetRoundLock,
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
  onAddRound: () => Promise<void>;
  onDeleteRound: (roundId: string) => Promise<void>;
  onSetRoundLock: (roundId: string, locked: boolean) => Promise<void>;
  onSaved: () => void;
}) {
  const [currentId, setCurrentId] = useState(roundId);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [addingRound, setAddingRound] = useState(false);
  const [deletingRound, setDeletingRound] = useState(false);
  const [togglingLock, setTogglingLock] = useState(false);
  const t = useT();

  useEffect(() => {
    setCurrentId(roundId);
  }, [roundId]);

  useEffect(() => {
    const d: Record<string, string> = {};
    players.forEach((p) => {
      const v = scoreMap.get(`${p.id}:${currentId}`);
      d[p.id] = v == null ? "" : String(v);
    });
    setDraft(d);
  }, [currentId, players, scoreMap]);

  const round = rounds.find((r) => r.id === currentId);

  async function addRound() {
    setAddingRound(true);
    try {
      await onAddRound();
    } finally {
      setAddingRound(false);
    }
  }

  async function deleteRound() {
    if (!round || rounds.length <= 1) return;
    const confirmed = window.confirm(t.board.deleteRoundConfirm(round.name));
    if (!confirmed) return;
    setDeletingRound(true);
    try {
      await onDeleteRound(round.id);
    } finally {
      setDeletingRound(false);
    }
  }

  async function toggleLock() {
    if (!round) return;
    const locked = !!round.locked_at;
    if (!locked && !window.confirm(t.board.lockRoundConfirm(round.name))) return;
    setTogglingLock(true);
    try {
      await onSetRoundLock(round.id, !locked);
    } finally {
      setTogglingLock(false);
    }
  }

  async function save() {
    if (!round || round.locked_at) return;
    setSaving(true);
    const entries = players.map((p) => ({
      playerId: p.id,
      points: parseDraftPoints(draft[p.id] ?? ""),
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

  const locked = !!round.locked_at;

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
              <h3 className="font-display text-2xl font-bold flex items-center gap-2">
                {round.name}
                {locked && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-pitch/15 text-pitch font-semibold">
                    <Lock className="size-3" />
                    {t.board.roundLocked}
                  </span>
                )}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleLock}
                disabled={togglingLock}
                className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-50"
                title={locked ? t.board.unlockRound : t.board.lockRound}
              >
                {togglingLock ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : locked ? (
                  <Unlock className="size-4" />
                ) : (
                  <Lock className="size-4" />
                )}
              </button>
              <button
                onClick={addRound}
                disabled={addingRound}
                className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-50"
                title={t.board.addRound}
              >
                {addingRound ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
              </button>
              <button
                onClick={deleteRound}
                disabled={deletingRound || rounds.length <= 1}
                className="text-muted-foreground hover:text-[color:oklch(0.7_0.2_25)] p-1 disabled:opacity-30"
                title={t.board.deleteRound}
              >
                {deletingRound ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </button>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
                <X className="size-4" />
              </button>
            </div>
          </div>
          <div className="flex gap-1.5 mt-4 flex-wrap">
            {rounds.map((r) => (
              <button
                key={r.id}
                onClick={() => setCurrentId(r.id)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1 ${
                  r.id === currentId
                    ? "bg-pitch text-pitch-foreground font-medium"
                    : "bg-surface-elevated text-muted-foreground hover:text-foreground"
                }`}
                title={r.name}
              >
                {r.locked_at && <Lock className="size-2.5" />}
                {r.short}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 max-h-[50vh] overflow-y-auto">
          {locked && (
            <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground bg-surface-elevated/60 border border-border/40 rounded-lg px-3 py-2">
              <Lock className="size-3.5 shrink-0 text-pitch" />
              {t.board.roundLockedNote}
            </div>
          )}
          <div className="grid grid-cols-[minmax(80px,auto)_1fr] gap-x-4 gap-y-2 items-center">
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
                disabled={locked}
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
            {locked ? t.common.close : t.common.cancel}
          </button>
          {!locked && (
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 text-sm rounded-lg bg-pitch text-pitch-foreground font-medium shadow-glow hover:opacity-90 active:scale-95 transition inline-flex items-center gap-2 disabled:opacity-50 disabled:active:scale-100"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {t.common.save}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RowInput({
  name,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const numeric = parseDraftPoints(value);
  const sliderValue = numeric ?? 0;

  return (
    <>
      <div className="font-display text-sm font-medium py-1.5">{name}</div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={SCORE_MIN}
          max={SCORE_MAX}
          step={1}
          value={sliderValue}
          onChange={(e) => onChange(e.currentTarget.value)}
          disabled={disabled}
          className="flex-1 min-w-0 accent-[oklch(0.84_0.18_168)] disabled:opacity-50"
          aria-label={name}
        />
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            const next = parseDraftPoints(e.target.value);
            if (next === null && e.target.value.trim() !== "") return;
            onChange(next === null ? "" : String(next));
          }}
          placeholder="0"
          disabled={disabled}
          className="bg-input border border-border rounded-md px-3 py-1.5 text-right font-mono tabular-nums text-sm outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20 w-16 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => onChange("")}
          disabled={disabled}
          className="px-2 py-1 text-[11px] rounded-md bg-surface-elevated text-muted-foreground hover:text-foreground disabled:opacity-30"
          title={t.board.clearScore}
        >
          <X className="size-3" />
        </button>
      </div>
    </>
  );
}
