import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Trophy,
  Plus,
  Minus,
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
  TrendingUp,
  TrendingDown,
  Sigma,
  Swords,
  Gauge,
  History,
  Download,
  Scale,
  Menu,
  Share2,
  UserCheck,
  Shuffle,
  Target,
} from "lucide-react";
import { Drawer, DrawerTrigger, DrawerContent, DrawerClose } from "@/components/ui/drawer";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { LanguageToggle } from "@/components/LanguageToggle";
import {
  verifyLeaguePassword,
  addPlayers as addPlayersFn,
  removePlayer as removePlayerFn,
  updateLeagueName as updateLeagueNameFn,
  addRound as addRoundFn,
  deleteRound as deleteRoundFn,
  updateRound as updateRoundFn,
  setRoundPrize as setRoundPrizeFn,
  saveScores as saveScoresFn,
  lockRound as lockRoundFn,
  unlockRound as unlockRoundFn,
  getAuditLog as getAuditLogFn,
  exportLeague as exportLeagueFn,
  updateTiebreak as updateTiebreakFn,
  getLeagueMeta,
  type AuditEntry,
  type LeagueMeta,
} from "@/lib/leagues.functions";
import { useT, useLocale, getDict, type Dict, type Locale } from "@/lib/i18n";
import { resolveLocale } from "@/lib/locale.functions";
import { recordRecentLeague } from "@/lib/recent-leagues";
import { EditableList } from "@/components/EditableList";
import { toSimRound, SCORE_MIN, SCORE_MAX } from "@/lib/simulation";
import { computeRoundMaxes, TIEBREAKS, type TiebreakMode, type StandingRow } from "@/lib/standings";
import { computeH2H } from "@/lib/h2h";
import { computeLiveMetrics } from "@/lib/league-metrics";
import { computeRecordMetrics } from "@/lib/badges";
import { computePathToVictory } from "@/lib/path-to-victory";
import { resolveAlternativeReality } from "@/lib/alt-reality";
import { BADGE_EMOJI } from "@/components/badge-emoji";
import { useMounted, useCountUp } from "@/hooks/use-animations";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  StandingsTable,
  RoundPrizeCell,
  DinnerBar,
  type StandingsColumn,
  type StandingsRow,
} from "@/components/StandingsTable";
import { RoundBanterCard } from "@/components/RoundBanterCard";
import { shareRoundRecap } from "@/lib/share-recap";

export const Route = createFileRoute("/$slug")({
  loader: async ({ params }): Promise<{ locale: Locale; leagueMeta: LeagueMeta | null }> => {
    // leagueMeta only feeds <head> (title/description/OG tags); a DB hiccup here
    // must never fail the whole page load, so it degrades to the generic fallback.
    const [locale, leagueMeta] = await Promise.all([
      resolveLocale(),
      getLeagueMeta({ data: { slug: params.slug } }).catch(() => null),
    ]);
    return { locale, leagueMeta };
  },
  head: ({ params, loaderData }) => {
    const site = import.meta.env.VITE_SITE_URL ?? "";
    const ogImage = `${site}/api/og/${params.slug}`;
    const t = getDict(loaderData?.locale ?? "pt");
    const meta = loaderData?.leagueMeta ?? null;
    const title = meta?.name || t.root.metaTitle;
    const description = meta
      ? t.root.leagueMetaDescription(meta.playerCount, meta.roundsPlayed, meta.totalRounds)
      : t.root.metaDescription;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: ogImage },
        ...(site ? [{ property: "og:url", content: `${site}/${params.slug}` }] : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: ogImage },
      ],
    };
  },
  component: LeagueBoard,
});

type League = { id: string; slug: string; name: string; tiebreak: TiebreakMode };
type Round = {
  id: string;
  name: string;
  short: string;
  display_order: number;
  locked_at: string | null;
  summary_en?: string | null;
  summary_pt?: string | null;
};
type Player = { id: string; name: string; display_order: number; round_prize: string };
type Score = { id: string; player_id: string; round_id: string; points: number };

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

type RoundDetailsInput = { name: string; short: string };

function tiebreakLabel(mode: string, t: Dict): string {
  if (mode === "wins") return t.board.tiebreakWins;
  if (mode === "latest") return t.board.tiebreakLatest;
  return t.board.tiebreakTotal;
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
  const msg = String(err instanceof Error ? err.message : err);
  return msg.includes("WRONG_PASSWORD") || msg.includes("RATE_LIMITED");
}

function parseDraftPoints(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

function LeagueBoard() {
  const { slug } = useParams({ from: "/$slug" });
  const t = useT();
  const { locale } = useLocale();
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
  const [playerDraft, setPlayerDraft] = useState<string[]>(["", ""]);
  const [addPlayersError, setAddPlayersError] = useState<string | null>(null);
  const [editingLeagueName, setEditingLeagueName] = useState(false);
  const [creatingRound, setCreatingRound] = useState(false);
  const [creatingRoundSave, setCreatingRoundSave] = useState(false);
  const [newRoundDraft, setNewRoundDraft] = useState<RoundDetailsInput>({ name: "", short: "" });
  const [removePlayerTarget, setRemovePlayerTarget] = useState<Player | null>(null);
  const [roundPrizePickerFor, setRoundPrizePickerFor] = useState<string | null>(null);
  // Separate from roundPrizePickerFor: the mobile sub-line renders its own RoundPrizeCell,
  // so it needs its own open state to avoid both instances opening the portal.
  const [mobileRoundPrizePickerFor, setMobileRoundPrizePickerFor] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [h2hOpen, setH2hOpen] = useState(false);
  const [claimedPlayerId, setClaimedPlayerId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  // Alternative Reality panel: exclude one or more played (locked) rounds from
  // the standings/odds computation to see how much they mattered. Purely
  // client-side — never persisted.
  const [altRealityOpen, setAltRealityOpen] = useState(false);
  const [altRealityExcluded, setAltRealityExcluded] = useState<Set<string>>(new Set());

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

  const tiebreak: TiebreakMode =
    league && TIEBREAKS.includes(league.tiebreak as TiebreakMode)
      ? (league.tiebreak as TiebreakMode)
      : "total";

  useEffect(() => {
    setPassword(localStorage.getItem(pwKey));
  }, [pwKey]);

  const claimKey = `row-claim:${slug}`;
  useEffect(() => {
    setClaimedPlayerId(localStorage.getItem(claimKey));
  }, [claimKey]);

  function toggleClaim(playerId: string) {
    const next = claimedPlayerId === playerId ? null : playerId;
    setClaimedPlayerId(next);
    if (next) localStorage.setItem(claimKey, next);
    else localStorage.removeItem(claimKey);
  }

  // Reset the add-players draft each time the modal opens.
  useEffect(() => {
    if (addingPlayer) {
      setPlayerDraft(["", ""]);
      setAddPlayersError(null);
    }
  }, [addingPlayer]);

  const loadAll = useCallback(async () => {
    const { data: lg } = await supabase
      .from("leagues")
      .select("id, slug, name, tiebreak")
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
    setRounds((r ?? []) as unknown as Round[]);
    // Bypass strict Supabase schema types until migration is applied and types regenerated.
    setPlayers((p ?? []) as unknown as Player[]);
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

  const altRealityOn = altRealityExcluded.size > 0;

  // Rounds after Alternative Reality exclusion — feeds the simulation and
  // standings only; the table still renders every round column from `rounds`.
  const altRealityRounds = useMemo(
    () => resolveAlternativeReality({ rounds, excludedRoundIds: altRealityExcluded }).activeRounds,
    [rounds, altRealityExcluded],
  );

  const roundsPlayedIds = useMemo(
    () =>
      rounds.filter((r) => players.some((p) => scoreMap.has(`${p.id}:${r.id}`))).map((r) => r.id),
    [scoreMap, players, rounds],
  );
  const roundsRemaining = rounds.length - roundsPlayedIds.length;
  const hasLockedRounds = useMemo(() => rounds.some((r) => r.locked_at !== null), [rounds]);

  const roundIndexById = useMemo(() => {
    const m = new Map<string, number>();
    rounds.forEach((r, idx) => m.set(r.id, idx));
    return m;
  }, [rounds]);

  const scoreOf = useCallback(
    (playerId: string, roundId: string) => scoreMap.get(`${playerId}:${roundId}`),
    [scoreMap],
  );

  const roundMaxById = useMemo(
    () => computeRoundMaxes(players, rounds, scoreOf),
    [players, rounds, scoreOf],
  );

  // Rounds with lock state, for the lock-aware simulation and badges.
  const roundsWithLock = useMemo(() => rounds.map(toSimRound), [rounds]);

  // Alternative Reality's filtered round set, lock-annotated, for the
  // simulation and standings below (badges/prizes stay on the full set —
  // they're the real record, not a hypothetical).
  const simRoundsWithLock = useMemo(() => altRealityRounds.map(toSimRound), [altRealityRounds]);

  // Live metrics (see src/lib/league-metrics.ts): win probability + standings
  // together, one seam shared with round-lock banter generation and the OG
  // image. Live: total + tiebreak use Alternative Reality's round set when
  // active.
  const { standings: baseStandings, winProbability: dinnerProb } = useMemo(
    () =>
      computeLiveMetrics({
        players,
        rounds: simRoundsWithLock,
        score: scoreOf,
        tiebreak,
      }),
    [players, simRoundsWithLock, scoreOf, tiebreak],
  );

  // Record metrics (see src/lib/badges.ts): Badges and the Round-prize win
  // tally, both from saved scores and locked rounds only — never What-if or
  // Alternative Reality.
  const { badges: badgesByPlayer, lockedWins: lockedWinsByPlayer } = useMemo(
    () =>
      computeRecordMetrics({
        players,
        rounds: roundsWithLock,
        score: (pid, rid) => scoreMap.get(`${pid}:${rid}`),
        tiebreak,
      }),
    [players, roundsWithLock, scoreMap, tiebreak],
  );

  // Mobile reveals only the most recently played round columns, widening to show
  // more as the viewport grows (lg shows all). Maps each round to its recency
  // rank among played rounds (0 = most recent); StandingsTable turns that into
  // the actual responsive visibility class.
  const roundRecencyById = useMemo(() => {
    const playedInOrder = rounds.filter((r) => roundMaxById.has(r.id));
    const recency = new Map<string, number>();
    playedInOrder.forEach((r, idx) => recency.set(r.id, playedInOrder.length - 1 - idx));
    return recency;
  }, [rounds, roundMaxById]);

  // Drives DinnerBar's reveal animation (0% -> actual width on mount).
  const dinnerBarMounted = useMounted();

  const standings = useMemo(() => {
    const withRank = [...baseStandings];

    const valueFor = (row: (typeof withRank)[number]): number | null => {
      if (sortKey === "prizes") return lockedWinsByPlayer.get(row.player.id) ?? 0;
      if (sortKey === "dinner") return row.prob;
      if (sortKey === "total") return row.agg;
      // Column values come straight from scoreOf (keyed by full `rounds`, not
      // row.perRound) since Alternative Reality can filter perRound down to a
      // subset of rounds while every round column still renders.
      if (roundIndexById.has(sortKey)) return scoreOf(row.player.id, sortKey) ?? null;
      return row.agg;
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
  }, [baseStandings, roundIndexById, sortKey, sortDir, lockedWinsByPlayer, scoreOf]);

  // Every locked round with a generated summary, in the current locale,
  // newest first — lets the banter card page back through past rounds.
  const summarizedRounds = useMemo(() => {
    const pick = (r: Round) => (locale === "pt" ? r.summary_pt : r.summary_en) ?? r.summary_en;
    return rounds
      .filter((r) => r.locked_at !== null && pick(r))
      .sort((a, b) => new Date(b.locked_at!).getTime() - new Date(a.locked_at!).getTime())
      .map((r) => ({ id: r.id, name: r.name, text: pick(r)! }));
  }, [rounds, locale]);

  // 0 = most recent round's summary. Snaps back to the latest whenever the
  // number of summarized rounds changes (a new round just locked).
  const [summaryIndex, setSummaryIndex] = useState(0);
  useEffect(() => {
    setSummaryIndex(0);
  }, [summarizedRounds.length]);
  const shownSummary = summarizedRounds[Math.min(summaryIndex, summarizedRounds.length - 1)];

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
    return { high, low, margin, avg, count, lead } as {
      high: { value: number; player: string; round: string } | null;
      low: { value: number; player: string; round: string } | null;
      margin: { value: number; player: string; round: string } | null;
      avg: number;
      count: number;
      lead: number | null;
    };
  }, [rounds, players, scoreMap]);

  async function addPlayers() {
    const names = playerDraft.map((n) => n.trim()).filter(Boolean);
    if (!names.length || !password) return;
    setAddPlayersError(null);

    // Reject duplicates within this submission (case-insensitive).
    const lower = names.map((n) => n.toLowerCase());
    if (lower.some((n, i) => lower.indexOf(n) !== i)) {
      setAddPlayersError(t.board.errDuplicateInBatch);
      return;
    }
    // Reject names already in the league (case-insensitive). The server's unique
    // constraint is the final guard against races between load and submit.
    const existing = new Set(players.map((p) => p.name.trim().toLowerCase()));
    if (lower.some((n) => existing.has(n))) {
      setAddPlayersError(t.board.errDuplicatePlayer);
      return;
    }

    try {
      await addPlayersFn({ data: { slug, password, names } });
      setPlayerDraft(["", ""]);
      setAddingPlayer(false);
      loadAll();
    } catch (err) {
      if (isAuthError(err)) {
        handleAuthFailure();
      } else if (err instanceof Error && err.message === "DUPLICATE_PLAYER") {
        setAddPlayersError(t.board.errDuplicatePlayer);
      } else if (err instanceof Error && err.message === "TOO_MANY_PLAYERS") {
        setAddPlayersError(t.board.errTooManyPlayers);
      } else {
        setAddPlayersError(t.board.errAddPlayers);
      }
    }
  }

  async function renameLeague(name: string) {
    if (!password) return;
    try {
      await updateLeagueNameFn({ data: { slug, password, name } });
      setEditingLeagueName(false);
      await loadAll();
    } catch (err) {
      if (isAuthError(err)) handleAuthFailure();
    }
  }

  async function removePlayer(playerId: string) {
    if (!password) return;
    try {
      await removePlayerFn({ data: { slug, password, playerId } });
      setRemovePlayerTarget(null);
      loadAll();
    } catch (err) {
      if (isAuthError(err)) handleAuthFailure();
    }
  }

  async function setRoundPrize(playerId: string, roundPrize: string) {
    if (!password) return;
    setRoundPrizePickerFor(null);
    setPlayers((ps) => ps.map((p) => (p.id === playerId ? { ...p, round_prize: roundPrize } : p)));
    try {
      await setRoundPrizeFn({ data: { slug, password, playerId, roundPrize } });
    } catch (err) {
      if (isAuthError(err)) handleAuthFailure();
      loadAll();
    }
  }

  async function addRound(details?: RoundDetailsInput) {
    if (!password) return;
    try {
      const { id } = await addRoundFn({ data: { slug, password, ...details } });
      await loadAll();
      setEditing(id);
      return id;
    } catch (err) {
      if (isAuthError(err)) handleAuthFailure();
    }
  }

  function openCreateRound() {
    const nextOrder = rounds.reduce((max, item) => Math.max(max, item.display_order), 0) + 1;
    setNewRoundDraft({ name: `${t.board.roundLabel} ${nextOrder}`, short: String(nextOrder) });
    setCreatingRound(true);
  }

  async function updateRoundDetails(roundId: string, details: RoundDetailsInput) {
    if (!password) return;
    try {
      await updateRoundFn({ data: { slug, password, roundId, ...details } });
      await loadAll();
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

  async function shareMyOdds(playerId: string) {
    const row = standings.find((r) => r.player.id === playerId);
    if (!row || !league) return;
    const text = t.board.shareOddsText(row.rank, Math.round(row.prob * 100), league.name);
    const url = window.location.href;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: league.name, text, url });
        return;
      }
    } catch {
      // fall through
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  }

  async function changeTiebreak(next: TiebreakMode) {
    if (!password || !league || next === tiebreak) return;
    const prev = league;
    setLeague({ ...league, tiebreak: next });
    try {
      await updateTiebreakFn({ data: { slug, password, tiebreak: next } });
    } catch (err) {
      setLeague(prev);
      if (isAuthError(err)) handleAuthFailure();
    }
  }

  function toggleAltRealityRound(roundId: string) {
    setAltRealityExcluded((prev) => {
      const s = new Set(prev);
      if (s.has(roundId)) s.delete(roundId);
      else s.add(roundId);
      return s;
    });
  }

  function resetAltReality() {
    setAltRealityExcluded(new Set());
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

  const standingsColumns: StandingsColumn[] = rounds.map((r) => ({
    id: r.id,
    short: r.short,
    fullTitle: r.name,
    locked: r.locked_at !== null,
    recencyRank: roundRecencyById.get(r.id) ?? null,
  }));

  const standingsRows: StandingsRow[] = standings.map((row, i) => {
    const isLeader = row.rank === 1 && row.agg > 0;
    const dl = dinnerLabel(row.prob, players.length, t);
    const isClaimed = claimedPlayerId === row.player.id;
    const wins = lockedWinsByPlayer.get(row.player.id) ?? 0;
    const openUp = i >= standings.length - 3;
    return {
      id: row.player.id,
      rank: row.rank,
      isLeader,
      rowClassName: `hover:bg-surface-elevated/50 transition-colors ${
        flashIds.has(row.player.id) ? "animate-row-flash" : ""
      } ${isClaimed ? "bg-pitch/5" : ""}`,
      player: (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display font-semibold text-base">{row.player.name}</span>
          {(badgesByPlayer.get(row.player.id) ?? []).map((bid) => (
            <span
              key={bid}
              className="text-sm leading-none"
              title={t.board.badges[bid]}
              aria-label={t.board.badges[bid]}
            >
              {BADGE_EMOJI[bid]}
            </span>
          ))}
          {unlocked && (
            <button
              onClick={() => setRemovePlayerTarget(row.player)}
              className="text-muted-foreground/40 hover:text-[color:oklch(0.7_0.2_25)] transition-colors"
              title={t.board.removePlayer}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
          <button
            onClick={() => toggleClaim(row.player.id)}
            className={`transition-colors ${
              isClaimed ? "text-pitch" : "text-muted-foreground/30 hover:text-muted-foreground"
            }`}
            title={isClaimed ? t.board.unclaimRow : t.board.claimRow}
            aria-label={isClaimed ? t.board.unclaimRow : t.board.claimRow}
          >
            <UserCheck className="size-3.5" />
          </button>
          {isClaimed && (
            <button
              onClick={() => shareMyOdds(row.player.id)}
              className="text-muted-foreground/50 hover:text-foreground transition-colors"
              title={t.board.shareMyOdds}
              aria-label={t.board.shareMyOdds}
            >
              <Share2 className="size-3.5" />
            </button>
          )}
        </div>
      ),
      mobileSummary: (
        <>
          {wins > 0 &&
            (unlocked ? (
              <RoundPrizeCell
                emoji={row.player.round_prize || "🥇"}
                wins={wins}
                openUp={openUp}
                editable={unlocked}
                open={mobileRoundPrizePickerFor === row.player.id}
                onToggle={() =>
                  setMobileRoundPrizePickerFor((cur) =>
                    cur === row.player.id ? null : row.player.id,
                  )
                }
                onPick={(d) => setRoundPrize(row.player.id, d)}
                prizeEmojis={PRIZE_EMOJIS}
                pickerTitle={t.board.changeRoundPrizeEmoji}
                closeLabel={t.common.close}
              />
            ) : (
              <span className="inline-flex items-center gap-0.5">
                <span className="leading-none">{row.player.round_prize || "🥇"}</span>
                <span className="font-mono tabular-nums">×{wins}</span>
              </span>
            ))}
          {wins > 0 && <span aria-hidden="true">·</span>}
          <span>
            <span className="mr-1">{dl.emoji}</span>
            {Math.round(row.prob * 100)}%
          </span>
        </>
      ),
      prizeCell: (
        <RoundPrizeCell
          emoji={row.player.round_prize || "🥇"}
          wins={lockedWinsByPlayer.get(row.player.id) ?? 0}
          openUp={openUp}
          editable={unlocked}
          open={roundPrizePickerFor === row.player.id}
          onToggle={() =>
            setRoundPrizePickerFor((cur) => (cur === row.player.id ? null : row.player.id))
          }
          onPick={(d) => setRoundPrize(row.player.id, d)}
          prizeEmojis={PRIZE_EMOJIS}
          pickerTitle={t.board.changeRoundPrizeEmoji}
          closeLabel={t.common.close}
        />
      ),
      dinnerCell: (
        <DinnerBar prob={row.prob} label={dl.label} emoji={dl.emoji} active={dinnerBarMounted} />
      ),
      scores: Object.fromEntries(
        rounds.map((r) => {
          const rid = r.id;
          const roundLocked = r.locked_at !== null;
          // Cell value comes from scoreOf directly (not row.perRound):
          // Alternative Reality can filter perRound down to a subset of
          // rounds for totals/rank while every round column still shows.
          const v = scoreOf(row.player.id, rid) ?? null;
          const roundMax = roundMaxById.get(rid);
          const isRoundWin = v !== null && roundMax !== undefined && v === roundMax;
          const isExcluded = altRealityOn && altRealityExcluded.has(rid);
          const content =
            v === null ? (
              <span className="text-muted-foreground/30">—</span>
            ) : isExcluded ? (
              <span className="line-through">{v}</span>
            ) : isRoundWin && roundLocked ? (
              // Banked round win (round is final).
              <span className="text-pitch font-bold">{v}</span>
            ) : isRoundWin ? (
              // Currently leading an unlocked round — provisional, not yet tallied.
              <span
                className="text-pitch/60 font-bold underline decoration-dotted underline-offset-2"
                title={t.board.provisionalWin}
              >
                {v}
              </span>
            ) : (
              v
            );
          return [
            rid,
            {
              content,
              className: isExcluded ? "opacity-30" : "",
              title: isExcluded ? t.board.altRealityActive : undefined,
            },
          ];
        }),
      ),
      total: (
        <span
          className={`font-display font-bold tabular-nums text-xl ${isLeader ? "text-pitch" : ""}`}
        >
          {row.agg}
        </span>
      ),
    };
  });

  return (
    <div className="min-h-screen">
      {/* Clipboard copy feedback */}
      {shareCopied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-3 duration-200">
          {t.board.shareCopied}
        </div>
      )}
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-20 bg-background/70">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 group min-w-0">
            <div className="size-9 shrink-0 rounded-lg gradient-pitch grid place-items-center shadow-glow">
              <Trophy className="size-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold tracking-tight leading-none truncate">
                {league?.name}
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
                {t.board.leagueLabel} · {slug}
              </div>
            </div>
          </Link>

          {/* Desktop action row — hidden on mobile. Grouped so the language
              toggle, content-editing shortcuts, and the lock/unlock control
              read as three distinct clusters instead of one flat icon row. */}
          <div className="hidden md:flex items-center gap-3">
            <LanguageToggle />
            {unlocked && (
              <div className="flex items-center gap-2 pl-3 border-l border-border/60">
                <button
                  onClick={() => setEditingLeagueName(true)}
                  className="inline-flex items-center justify-center size-8 rounded-md bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
                  title={t.board.editLeagueName}
                  aria-label={t.board.editLeagueName}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => setAddingPlayer(true)}
                  className="inline-flex items-center justify-center size-8 rounded-md bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
                  title={t.board.addPlayer}
                  aria-label={t.board.addPlayer}
                >
                  <UserPlus className="size-3.5" />
                </button>
                <button
                  onClick={() => setShowHistory(true)}
                  className="inline-flex items-center justify-center size-8 rounded-md bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
                  title={t.board.historyTitle}
                  aria-label={t.board.history}
                >
                  <History className="size-3.5" />
                </button>
                <button
                  onClick={exportData}
                  className="inline-flex items-center justify-center size-8 rounded-md bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
                  title={t.board.exportTitle}
                  aria-label={t.board.exportData}
                >
                  <Download className="size-3.5" />
                </button>
              </div>
            )}
            <div className="pl-3 border-l border-border/60">
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

          {/* Mobile action row — hidden on desktop */}
          <div className="flex md:hidden items-center gap-1.5 shrink-0">
            {/* Lock/Unlock: icon-only on mobile */}
            {unlocked ? (
              <button
                onClick={lock}
                className="inline-flex items-center justify-center size-9 rounded-lg bg-pitch/15 text-pitch hover:bg-pitch/25 transition-colors"
                title={t.board.lockTitle}
                aria-label={t.board.lockTitle}
              >
                <Unlock className="size-4" />
              </button>
            ) : (
              <button
                onClick={() => setAskPassword(true)}
                className="inline-flex items-center justify-center size-9 rounded-lg bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
                title={t.board.unlockTitle}
                aria-label={t.board.unlockTitle}
              >
                <Lock className="size-4" />
              </button>
            )}
            {/* Hamburger → bottom sheet for secondary actions */}
            <Drawer>
              <DrawerTrigger asChild>
                <button
                  className="inline-flex items-center justify-center size-9 rounded-lg bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t.board.moreActions}
                >
                  <Menu className="size-4" />
                </button>
              </DrawerTrigger>
              <DrawerContent className="px-4 pb-8 pt-2">
                <div className="mt-4 mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground px-1">
                  {league?.name}
                </div>
                <div className="flex flex-col gap-1">
                  {unlocked && (
                    <DrawerClose asChild>
                      <button
                        onClick={() => setEditingLeagueName(true)}
                        className="flex items-center gap-3 w-full rounded-xl px-4 py-3.5 text-sm font-medium bg-surface-elevated/50 hover:bg-accent transition-colors"
                      >
                        <Pencil className="size-4 text-muted-foreground" />
                        {t.board.editLeagueName}
                      </button>
                    </DrawerClose>
                  )}
                  {unlocked && (
                    <DrawerClose asChild>
                      <button
                        onClick={() => setAddingPlayer(true)}
                        className="flex items-center gap-3 w-full rounded-xl px-4 py-3.5 text-sm font-medium bg-surface-elevated/50 hover:bg-accent transition-colors"
                      >
                        <UserPlus className="size-4 text-muted-foreground" />
                        {t.board.addPlayer}
                      </button>
                    </DrawerClose>
                  )}
                  {unlocked && (
                    <DrawerClose asChild>
                      <button
                        onClick={() => setShowHistory(true)}
                        className="flex items-center gap-3 w-full rounded-xl px-4 py-3.5 text-sm font-medium bg-surface-elevated/50 hover:bg-accent transition-colors"
                      >
                        <History className="size-4 text-muted-foreground" />
                        {t.board.history}
                      </button>
                    </DrawerClose>
                  )}
                  {unlocked && (
                    <DrawerClose asChild>
                      <button
                        onClick={exportData}
                        className="flex items-center gap-3 w-full rounded-xl px-4 py-3.5 text-sm font-medium bg-surface-elevated/50 hover:bg-accent transition-colors"
                      >
                        <Download className="size-4 text-muted-foreground" />
                        {t.board.exportData}
                      </button>
                    </DrawerClose>
                  )}
                  {!unlocked && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      {t.board.moreActionsLocked}
                    </p>
                  )}
                </div>
              </DrawerContent>
            </Drawer>
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
        {shownSummary && (
          <RoundBanterCard
            className="mt-8 rounded-xl border-l-2 border-pitch bg-surface-elevated/40 pl-5 pr-5 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-[400ms] fill-mode-both"
            roundName={shownSummary.name}
            text={shownSummary.text}
            locked
            onShare={() => shareRoundRecap(slug, shownSummary.id, shownSummary.name)}
            pagination={
              summarizedRounds.length > 1
                ? {
                    atOldest: summaryIndex >= summarizedRounds.length - 1,
                    atNewest: summaryIndex === 0,
                    onGoOlder: () =>
                      setSummaryIndex((i) => Math.min(i + 1, summarizedRounds.length - 1)),
                    onGoNewer: () => setSummaryIndex((i) => Math.max(i - 1, 0)),
                  }
                : undefined
            }
            labels={{
              afterRound: t.board.afterRound,
              shareRound: t.board.shareRound,
              shareRoundTitle: t.board.shareRoundTitle,
              banterPrevRound: t.board.banterPrevRound,
              banterNextRound: t.board.banterNextRound,
            }}
          />
        )}
      </section>

      {/* Alternative Reality panel: "change the past" — exclude played rounds. */}
      {altRealityOpen && (
        <section className="max-w-6xl mx-auto px-6 pb-2">
          <div className="rounded-2xl border p-5 animate-in fade-in slide-in-from-top-2 duration-300 border-violet-500/40 bg-violet-500/5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <span className="grid place-items-center size-9 rounded-xl shrink-0 bg-violet-500/15 text-violet-400">
                  <Shuffle className="size-4" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold">{t.board.altRealityActive}</h2>
                  <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 max-w-md">
                    {t.board.altRealityBanner}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {altRealityOn && (
                  <button
                    onClick={resetAltReality}
                    className="text-xs px-3 py-1.5 rounded-md bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t.board.altRealityReset}
                  </button>
                )}
                <button
                  onClick={() => setAltRealityOpen(false)}
                  title={t.common.close}
                  aria-label={t.common.close}
                  className="inline-flex items-center justify-center size-8 rounded-md transition-colors bg-violet-500/15 text-violet-400 hover:bg-violet-500/25"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            {rounds.filter((r) => r.locked_at !== null).length === 0 ? (
              <p className="text-sm text-muted-foreground mt-4">{t.board.altRealityNoRounds}</p>
            ) : (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-3">{t.board.altRealityIntro}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {rounds
                    .filter((r) => r.locked_at !== null)
                    .map((r) => {
                      const excluded = altRealityExcluded.has(r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => toggleAltRealityRound(r.id)}
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors ${
                            excluded
                              ? "bg-violet-500/25 text-violet-300 line-through"
                              : "bg-surface-elevated text-muted-foreground hover:text-foreground"
                          }`}
                          title={r.name}
                        >
                          {r.short}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {h2hOpen && players.length >= 2 && (
        <H2HPanel
          players={players}
          rounds={rounds}
          scoreMap={scoreMap}
          standings={baseStandings}
          claimedPlayerId={claimedPlayerId}
          onClose={() => setH2hOpen(false)}
        />
      )}

      {claimedPlayerId && (
        <PathToVictoryPanel
          players={players}
          standings={baseStandings}
          rounds={altRealityRounds}
          scoreMap={scoreMap}
          roundsPlayedCount={roundsPlayedIds.length}
          claimedPlayerId={claimedPlayerId}
        />
      )}

      {/* Leaderboard */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="bg-surface/60 backdrop-blur border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-border/60 gap-3 sm:gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">{t.board.standings}</h2>
              <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
                {t.board.standingsSummary(players.length, rounds.length)}
              </p>
              {/* Change the Past + H2H: the user-facing "poke at the data"
                  tools, kept next to the standings they affect rather than up
                  with the admin controls in the header. Path to Victory shows
                  inline above the table instead of behind a toggle. */}
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                {hasLockedRounds && (
                  <button
                    onClick={() => setAltRealityOpen((open) => !open)}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                      altRealityOpen
                        ? "bg-violet-500 text-white shadow-sm hover:bg-violet-500/90"
                        : altRealityOn
                          ? "border border-violet-400/70 text-violet-300 bg-violet-500/25 hover:bg-violet-500/35"
                          : "border border-violet-400/80 text-violet-300 bg-violet-500/20 hover:bg-violet-500/30"
                    }`}
                    title={t.board.altRealityTitle}
                  >
                    <Shuffle className="size-3.5" />
                    {t.board.altReality}
                    {altRealityOn && !altRealityOpen && (
                      <span className="size-1.5 rounded-full bg-violet-400" aria-hidden="true" />
                    )}
                  </button>
                )}
                {players.length >= 2 && (
                  <button
                    onClick={() => setH2hOpen((open) => !open)}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                      h2hOpen
                        ? "bg-sky-500 text-white shadow-sm hover:bg-sky-500/90"
                        : "border border-sky-400/60 text-sky-300 bg-sky-500/20 hover:bg-sky-500/30"
                    }`}
                    title={t.board.h2hTitle}
                  >
                    <Swords className="size-3.5" />
                    {t.board.h2h}
                  </button>
                )}
              </div>
              {unlocked ? (
                <div className="mt-2 flex items-center gap-2">
                  <Scale className="size-3.5 text-muted-foreground" aria-hidden />
                  <label
                    htmlFor="tiebreak-select"
                    className="text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    {t.board.tiebreak}
                  </label>
                  <select
                    id="tiebreak-select"
                    value={tiebreak}
                    onChange={(e) => changeTiebreak(e.target.value as TiebreakMode)}
                    title={t.board.tiebreakTitle}
                    className="bg-input border border-border rounded-md px-2 py-1 text-xs outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20"
                  >
                    <option value="total">{t.board.tiebreakTotal}</option>
                    <option value="wins">{t.board.tiebreakWins}</option>
                    <option value="latest">{t.board.tiebreakLatest}</option>
                  </select>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Scale className="size-3.5 text-muted-foreground" aria-hidden />
                  <span className="text-xs uppercase tracking-wider">{t.board.tiebreak}</span>
                  <span className="inline-flex items-center rounded-md bg-surface-elevated px-2.5 py-1 text-foreground">
                    {tiebreakLabel(tiebreak, t)}
                  </span>
                  <TiebreakInfo />
                </div>
              )}
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground md:hidden">
                <Trophy className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="text-[11px] uppercase tracking-wider">{t.board.colDinner}</span>
                <WinOddsInfo />
              </div>
            </div>
            {unlocked && (
              <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                {/* Per-round editing now lives on the table's own round
                    headers (see onEditRound below) — a separate row of
                    round-short buttons here just duplicated those labels. */}
                <button
                  onClick={openCreateRound}
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

          {/* Round status, visible to everyone where the per-round columns are hidden
              (mobile + tablet). Desktop shows lock state in the column headers instead. */}
          {rounds.length > 0 && (
            <div
              className="lg:hidden flex items-center gap-1 overflow-x-auto px-6 pt-4 pb-4"
              aria-label={t.board.roundsStatusLabel}
            >
              {rounds.map((r) => {
                const locked = r.locked_at !== null;
                const played = roundsPlayedIds.includes(r.id);
                return (
                  <span
                    key={r.id}
                    title={
                      locked
                        ? t.board.roundFinal(r.name)
                        : played
                          ? t.board.roundInProgress(r.name)
                          : t.board.roundUpcoming(r.name)
                    }
                    className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      locked
                        ? "bg-pitch/15 text-pitch"
                        : played
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-surface-elevated text-muted-foreground"
                    }`}
                  >
                    {locked ? (
                      <Lock className="size-2.5" aria-hidden="true" />
                    ) : played ? (
                      <span className="size-1 rounded-full bg-current" aria-hidden="true" />
                    ) : null}
                    {r.short}
                  </span>
                );
              })}
            </div>
          )}

          <StandingsTable
            columns={standingsColumns}
            rows={standingsRows}
            sort={{ key: sortKey, dir: sortDir, onSortBy: sortBy }}
            dinnerHeaderExtra={<WinOddsInfo />}
            onEditRound={unlocked ? setEditing : undefined}
            editRoundTitle={(roundId) =>
              t.board.roundButtonTitle(
                roundsPlayedIds.includes(roundId),
                rounds.find((r) => r.id === roundId)?.name ?? "",
              )
            }
            onShareRound={(roundId) =>
              shareRoundRecap(slug, roundId, rounds.find((r) => r.id === roundId)?.name ?? "")
            }
            shareRoundTitle={() => t.board.shareRoundTitle}
            emptyState={
              unlocked ? (
                <button
                  onClick={() => setAddingPlayer(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-pitch px-5 py-3 text-sm font-medium text-pitch-foreground shadow-glow transition hover:opacity-90 active:scale-95"
                >
                  <UserPlus className="size-4" />
                  {t.board.addPlayersCta}
                </button>
              ) : (
                <span className="text-muted-foreground">{t.board.noPlayers}</span>
              )
            }
            labels={{
              player: t.board.colPlayer,
              roundPrizes: t.board.colRoundPrizes,
              dinner: t.board.colDinner,
              total: t.board.colTotal,
              sortBy: t.board.sortBy,
            }}
          />
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
          onUpdateRound={updateRoundDetails}
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
        <Modal onClose={() => setAddingPlayer(false)} title={t.board.addPlayersTitle}>
          <EditableList
            title={t.board.playersLabel}
            items={playerDraft}
            placeholder={() => t.board.addPlayerPlaceholder}
            onChange={(i, v) => setPlayerDraft((l) => l.map((x, idx) => (idx === i ? v : x)))}
            onAdd={() => setPlayerDraft((l) => [...l, ""])}
            onRemove={(i) => setPlayerDraft((l) => l.filter((_, idx) => idx !== i))}
            minItems={1}
          />
          {addPlayersError && (
            <p className="text-sm text-[color:oklch(0.7_0.2_25)] mt-3">{addPlayersError}</p>
          )}
          <div className="flex justify-end gap-2 mt-5">
            <button
              onClick={() => setAddingPlayer(false)}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={addPlayers}
              disabled={!playerDraft.some((n) => n.trim())}
              className="px-4 py-2 text-sm rounded-lg bg-pitch text-pitch-foreground font-medium shadow-glow hover:opacity-90 disabled:opacity-50"
            >
              {t.common.add}
            </button>
          </div>
        </Modal>
      )}

      {editingLeagueName && unlocked && league && (
        <LeagueNameModal
          initialName={league.name}
          onClose={() => setEditingLeagueName(false)}
          onSave={renameLeague}
        />
      )}

      {creatingRound && unlocked && (
        <RoundDetailsModal
          mode="new"
          draft={newRoundDraft}
          saving={creatingRoundSave}
          onChange={setNewRoundDraft}
          onClose={() => setCreatingRound(false)}
          onSave={async () => {
            setCreatingRoundSave(true);
            try {
              await addRound(newRoundDraft);
              setCreatingRound(false);
            } finally {
              setCreatingRoundSave(false);
            }
          }}
        />
      )}

      {removePlayerTarget && unlocked && (
        <ConfirmModal
          title={t.board.removePlayerTitle}
          body={t.board.removePlayerConfirm(removePlayerTarget.name)}
          confirmLabel={t.board.removePlayer}
          tone="danger"
          onClose={() => setRemovePlayerTarget(null)}
          onConfirm={() => removePlayer(removePlayerTarget.id)}
        />
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
  const [error, setError] = useState<"wrong" | "rate" | "server" | null>(null);
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
        if (reason === "WRONG_PASSWORD") {
          setError("wrong");
        } else if (reason === "RATE_LIMITED") {
          setError("rate");
        } else {
          setError("server");
        }
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
      {error === "rate" && (
        <p className="text-sm text-[color:oklch(0.7_0.2_25)] mt-2">{t.board.passwordRateLimited}</p>
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

function WinOddsInfo() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const t = useT();

  const panelBody = (
    <>
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
    </>
  );

  if (isMobile) {
    return (
      <Drawer>
        <DrawerTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground/70 hover:text-foreground transition-colors"
            aria-label={t.board.infoTitle}
          >
            <HelpCircle className="size-3.5" />
          </button>
        </DrawerTrigger>
        <DrawerContent className="text-left overflow-hidden">
          <div className="pb-6">{panelBody}</div>
        </DrawerContent>
      </Drawer>
    );
  }

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
            {panelBody}
          </div>
        </>
      )}
    </span>
  );
}

function TiebreakInfo() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const t = useT();

  const panelBody = (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-surface-elevated/50">
        <span className="grid place-items-center size-7 rounded-lg bg-pitch/15 text-pitch">
          <Scale className="size-3.5" />
        </span>
        <div>
          <p className="text-xs font-semibold text-foreground tracking-normal normal-case">
            {t.board.tiebreakInfoTitle}
          </p>
          <p className="text-[11px] text-muted-foreground tracking-normal normal-case">
            {t.board.tiebreakInfoSubtitle}
          </p>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
          <span className="text-foreground font-medium">{t.board.tiebreakTotal}</span>{" "}
          {t.board.tiebreakInfoTotal}
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
          <span className="text-foreground font-medium">{t.board.tiebreakWins}</span>{" "}
          {t.board.tiebreakInfoWins}
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
          <span className="text-foreground font-medium">{t.board.tiebreakLatest}</span>{" "}
          {t.board.tiebreakInfoLatest}
        </p>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer>
        <DrawerTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground/70 hover:text-foreground transition-colors"
            aria-label={t.board.tiebreakInfoTitle}
          >
            <HelpCircle className="size-3.5" />
          </button>
        </DrawerTrigger>
        <DrawerContent className="text-left overflow-hidden">
          <div className="pb-6">{panelBody}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <span className="relative inline-flex normal-case">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground/70 hover:text-foreground transition-colors"
        aria-label={t.board.tiebreakInfoTitle}
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
          <div className="absolute z-40 top-7 left-1/2 -translate-x-1/2 w-[min(92vw,24rem)] bg-surface border border-border rounded-2xl shadow-card overflow-hidden text-left">
            {panelBody}
          </div>
        </>
      )}
    </span>
  );
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

function LeagueNameModal({
  initialName,
  onClose,
  onSave,
}: {
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void | undefined>;
}) {
  const t = useT();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const next = name.trim();
    if (!next) return;
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title={t.board.editLeagueName}>
      <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {t.board.leagueNameLabel}
      </label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={t.board.leagueNamePlaceholder}
        className="w-full bg-input border border-border rounded-lg px-4 py-3 text-base outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20"
      />
      <div className="flex justify-end gap-2 mt-5">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {t.common.cancel}
        </button>
        <button
          onClick={submit}
          disabled={saving || !name.trim()}
          className="px-4 py-2 text-sm rounded-lg bg-pitch text-pitch-foreground font-medium shadow-glow hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t.common.save : t.common.save}
        </button>
      </div>
    </Modal>
  );
}

function RoundDetailsModal({
  mode,
  draft,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  mode: "new" | "current";
  draft: RoundDetailsInput;
  saving: boolean;
  onChange: React.Dispatch<React.SetStateAction<RoundDetailsInput>>;
  onClose: () => void;
  onSave: () => Promise<void | undefined>;
}) {
  const t = useT();

  return (
    <Modal
      onClose={onClose}
      title={mode === "new" ? t.board.createRoundTitle : t.board.editRoundDetails}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            {t.board.roundNameLabel}
          </label>
          <input
            autoFocus
            value={draft.name}
            onChange={(e) => onChange((current) => ({ ...current, name: e.target.value }))}
            placeholder={t.board.roundNamePlaceholder}
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-base outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            {t.board.roundShortLabel}
          </label>
          <input
            value={draft.short}
            onChange={(e) =>
              onChange((current) => ({ ...current, short: e.target.value.slice(0, 8) }))
            }
            placeholder={t.board.roundShortPlaceholder}
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-base outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20 font-mono"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {t.common.cancel}
        </button>
        <button
          onClick={onSave}
          disabled={saving || !draft.name.trim() || !draft.short.trim()}
          className="px-4 py-2 text-sm rounded-lg bg-pitch text-pitch-foreground font-medium shadow-glow hover:opacity-90 disabled:opacity-50"
        >
          {mode === "new" ? t.common.add : t.common.save}
        </button>
      </div>
    </Modal>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  onClose,
  onConfirm,
  tone = "default",
  loading = false,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  tone?: "default" | "danger";
  loading?: boolean;
}) {
  const t = useT();

  return (
    <Modal onClose={onClose} title={title}>
      <p className="text-sm text-muted-foreground">{body}</p>
      <div className="flex justify-end gap-2 mt-5">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {t.common.cancel}
        </button>
        <button
          onClick={() => void onConfirm()}
          disabled={loading}
          className={`px-4 py-2 text-sm rounded-lg font-medium shadow-glow hover:opacity-90 disabled:opacity-50 ${
            tone === "danger"
              ? "bg-[color:oklch(0.7_0.2_25)] text-white"
              : "bg-pitch text-pitch-foreground"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
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
    if (entry.entityType === "drink" || entry.entityType === "round_prize") {
      // Old audit entries were written with entityType "drink" before the rename;
      // normalize to "round_prize" so both render through the same i18n copy.
      return t.board.historyLine({
        entityType: "round_prize",
        action: entry.action,
        player: player(entry.recordId) ?? "—",
        from: asText(oldV?.round_prize ?? oldV?.drink),
        to: asText(newV?.round_prize ?? newV?.drink),
      });
    }
    if (entry.entityType === "league") {
      return t.board.historyLine({
        entityType: "league",
        action: entry.action,
        from:
          entry.action === "UPDATE"
            ? (asText(oldV?.name) ?? "—")
            : oldV?.tiebreak != null
              ? tiebreakLabel(String(oldV.tiebreak), t)
              : "—",
        to:
          entry.action === "UPDATE"
            ? (asText(newV?.name) ?? "—")
            : newV?.tiebreak != null
              ? tiebreakLabel(String(newV.tiebreak), t)
              : "—",
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

function H2HPanel({
  players,
  rounds,
  scoreMap,
  standings,
  claimedPlayerId,
  onClose,
}: Readonly<{
  players: Player[];
  rounds: Round[];
  scoreMap: Map<string, number>;
  standings: StandingRow<Player>[];
  claimedPlayerId: string | null;
  onClose: () => void;
}>) {
  const t = useT();
  const otherPlayer = (excludeId: string | null) =>
    players.find((p) => p.id !== excludeId)?.id ?? null;

  // Default matchup: the claimed player against the league leader — or, if the
  // claimed player IS the leader, against their nearest chaser instead. Falls
  // back to leader-vs-chaser when nothing is claimed.
  const rankOf = (id: string | null) => standings.find((r) => r.player.id === id)?.rank;
  const byRank = (rank: number) => standings.find((r) => r.rank === rank)?.player.id ?? null;
  const leaderId = byRank(1);
  const defaultAId = claimedPlayerId ?? leaderId ?? players[0]?.id ?? null;
  const defaultBId =
    defaultAId !== null && rankOf(defaultAId) === 1
      ? (byRank(2) ?? otherPlayer(defaultAId))
      : (leaderId ?? otherPlayer(defaultAId));

  const [playerAId, setPlayerAId] = useState<string | null>(defaultAId);
  const [playerBId, setPlayerBId] = useState<string | null>(defaultBId);

  const lockedRounds = useMemo(() => rounds.filter((r) => r.locked_at !== null), [rounds]);
  const roundLabelById = useMemo(
    () => new Map(rounds.map((r) => [r.id, r.short || r.name])),
    [rounds],
  );
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const score = useCallback(
    (pid: string, rid: string) => scoreMap.get(`${pid}:${rid}`),
    [scoreMap],
  );

  const samePlayer = playerAId !== null && playerAId === playerBId;
  const summary = useMemo(() => {
    if (!playerAId || !playerBId || samePlayer) return null;
    return computeH2H({ playerAId, playerBId, rounds: lockedRounds, score });
  }, [playerAId, playerBId, samePlayer, lockedRounds, score]);

  return (
    <section className="max-w-6xl mx-auto px-6 pb-2">
      <div className="max-w-2xl mx-auto rounded-2xl border p-5 animate-in fade-in slide-in-from-top-2 duration-300 border-sky-500/40 bg-sky-500/5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="grid place-items-center size-9 rounded-xl shrink-0 bg-sky-500/15 text-sky-400">
              <Swords className="size-4" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold">{t.board.h2hTitle}</h2>
              <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 max-w-md">
                {t.board.h2hSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            title={t.common.close}
            aria-label={t.common.close}
            className="inline-flex items-center justify-center size-8 rounded-md transition-colors bg-sky-500/15 text-sky-400 hover:bg-sky-500/25"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Select value={playerAId ?? undefined} onValueChange={setPlayerAId}>
            <SelectTrigger
              aria-label={t.board.h2hPlayerA}
              className="w-full h-auto justify-center gap-1 p-0 border-none shadow-none bg-transparent font-bold underline decoration-2 underline-offset-2 text-foreground text-lg"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {players.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={playerBId ?? undefined} onValueChange={setPlayerBId}>
            <SelectTrigger
              aria-label={t.board.h2hPlayerB}
              className="w-full h-auto justify-center gap-1 p-0 border-none shadow-none bg-transparent font-bold underline decoration-2 underline-offset-2 text-foreground text-lg"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {players.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {samePlayer && (
          <p className="text-sm text-muted-foreground py-6 text-center">{t.board.h2hPickTwo}</p>
        )}

        {!samePlayer && lockedRounds.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">{t.board.h2hNoRounds}</p>
        )}

        {!samePlayer && summary && summary.rounds.length > 0 && (
          <div className="mt-5">
            <div className="text-center">
              <div className="font-display text-2xl font-semibold">
                {t.board.h2hRecord(summary.aWins, summary.bWins, summary.draws)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t.board.h2hRoundsCompared(summary.rounds.length)}
              </p>
            </div>

            <div className="flex items-center justify-between mt-4 px-1">
              <div>
                <div className="text-xs text-muted-foreground">{playerById.get(playerAId!)}</div>
                <div className="font-display text-xl font-semibold tabular-nums">
                  {summary.aTotal}
                </div>
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                {t.board.h2hTotalPoints}
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">{playerById.get(playerBId!)}</div>
                <div className="font-display text-xl font-semibold tabular-nums">
                  {summary.bTotal}
                </div>
              </div>
            </div>

            <ul className="max-h-[40vh] overflow-y-auto mt-5 -mx-1 px-1 divide-y divide-border/40">
              {summary.rounds.map((r) => (
                <li key={r.roundId} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm">{roundLabelById.get(r.roundId) ?? r.roundId}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {r.aScore} – {r.bScore}
                  </span>
                  <span
                    className={`text-xs font-medium tabular-nums w-16 text-right ${
                      r.winner === "a"
                        ? "text-pitch"
                        : r.winner === "b"
                          ? "text-[color:oklch(0.7_0.2_25)]"
                          : "text-muted-foreground"
                    }`}
                  >
                    {r.winner === "draw" ? t.board.h2hDraw : `${r.delta > 0 ? "+" : ""}${r.delta}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function PathToVictoryInfo() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const t = useT();

  const panelBody = (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-surface-elevated/50">
        <span className="grid place-items-center size-7 rounded-lg bg-emerald-500/15 text-emerald-400">
          <Target className="size-3.5" />
        </span>
        <div>
          <p className="text-xs font-semibold text-foreground tracking-normal normal-case">
            {t.board.pathToVictoryInfoTitle}
          </p>
          <p className="text-[11px] text-muted-foreground tracking-normal normal-case">
            {t.board.pathToVictoryInfoSubtitle}
          </p>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
          <span className="text-foreground font-medium">{t.board.pathToVictoryInfoBody1bold}</span>{" "}
          {t.board.pathToVictoryInfoBody1}
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
          <span className="text-foreground font-medium">{t.board.pathToVictoryInfoBody2bold}</span>{" "}
          {t.board.pathToVictoryInfoBody2}
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground tracking-normal normal-case">
          <span className="text-foreground font-medium">{t.board.pathToVictoryInfoBody3bold}</span>{" "}
          {t.board.pathToVictoryInfoBody3}
        </p>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer>
        <DrawerTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground/70 hover:text-foreground transition-colors"
            aria-label={t.board.pathToVictoryInfoTitle}
          >
            <HelpCircle className="size-3.5" />
          </button>
        </DrawerTrigger>
        <DrawerContent className="text-left overflow-hidden">
          <div className="pb-6">{panelBody}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <span className="relative inline-flex normal-case">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground/70 hover:text-foreground transition-colors"
        aria-label={t.board.pathToVictoryInfoTitle}
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
          <div className="absolute z-40 top-7 left-0 w-[min(92vw,24rem)] bg-surface border border-border rounded-2xl shadow-card overflow-hidden text-left">
            {panelBody}
          </div>
        </>
      )}
    </span>
  );
}

// Minimum rounds played before Path to Victory has enough data to be useful —
// mirrors the Badge grace period (see src/lib/badges.ts: MIN_PLAYED).
const PATH_TO_VICTORY_MIN_PLAYED = 2;

function PathToVictoryPanel({
  players,
  standings,
  rounds,
  scoreMap,
  roundsPlayedCount,
  claimedPlayerId,
}: Readonly<{
  players: Player[];
  standings: StandingRow<Player>[];
  rounds: Round[];
  scoreMap: Map<string, number>;
  roundsPlayedCount: number;
  claimedPlayerId: string;
}>) {
  const t = useT();
  const [subjectOverride, setSubjectOverride] = useState<string | null>(null);
  const subjectId = subjectOverride ?? claimedPlayerId;

  const ranks = useMemo(() => new Map(standings.map((r) => [r.player.id, r.rank])), [standings]);
  const roundsForCalc = useMemo(
    () => rounds.map((r) => ({ id: r.id, locked: r.locked_at !== null })),
    [rounds],
  );
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const score = useCallback(
    (pid: string, rid: string) => scoreMap.get(`${pid}:${rid}`),
    [scoreMap],
  );

  const result = useMemo(
    () => computePathToVictory({ players, rounds: roundsForCalc, score, ranks, subjectId }),
    [players, roundsForCalc, score, ranks, subjectId],
  );

  if (roundsPlayedCount < PATH_TO_VICTORY_MIN_PLAYED) return null;
  if (result.status === "no-rounds-left") return null;

  return (
    <section className="max-w-6xl mx-auto px-6 pb-2">
      <div className="rounded-2xl border p-5 border-emerald-500/40 bg-emerald-500/5 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-start gap-3">
          <span className="grid place-items-center size-9 rounded-xl shrink-0 bg-emerald-500/15 text-emerald-400">
            <Target className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold inline-flex items-center gap-1.5">
              {t.board.pathToVictory}
              <PathToVictoryInfo />
            </h2>
            <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
              {t.board.pathToVictorySubtitle}
            </p>
          </div>
        </div>

        <div className="text-sm text-foreground/80 leading-relaxed mt-4">
          <Select value={subjectId} onValueChange={setSubjectOverride}>
            <SelectTrigger
              aria-label={t.board.pathToVictoryPlayerLabel}
              className="inline-flex w-auto h-auto gap-1 p-0 m-0 border-none shadow-none bg-transparent font-bold underline decoration-2 underline-offset-2 text-foreground text-base"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {players.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {result.status === "leading"
            ? result.chaserId
              ? t.board.pathToVictoryLeadingSuffix(
                  playerById.get(result.chaserId) ?? "",
                  result.requiredAverage,
                )
              : t.board.pathToVictoryLeadingSoloSuffix
            : result.impossible
              ? t.board.pathToVictoryImpossibleSuffix(playerById.get(result.leaderId) ?? "")
              : t.board.pathToVictoryChasingSuffix(
                  playerById.get(result.leaderId) ?? "",
                  result.requiredAverage,
                )}
        </div>
      </div>
    </section>
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
  onUpdateRound,
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
  onAddRound: (details: RoundDetailsInput) => Promise<string | undefined>;
  onDeleteRound: (roundId: string) => Promise<void>;
  onUpdateRound: (roundId: string, details: RoundDetailsInput) => Promise<void>;
  onSetRoundLock: (roundId: string, locked: boolean) => Promise<void>;
  onSaved: () => void;
}) {
  const [currentId, setCurrentId] = useState(roundId);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [addingRound, setAddingRound] = useState(false);
  const [deletingRound, setDeletingRound] = useState(false);
  const [togglingLock, setTogglingLock] = useState(false);
  const [editingRoundDetails, setEditingRoundDetails] = useState<"new" | "current" | null>(null);
  const [roundDraft, setRoundDraft] = useState<RoundDetailsInput>({ name: "", short: "" });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingLock, setConfirmingLock] = useState(false);
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

  function handleShareRound() {
    return shareRoundRecap(slug, currentId, round?.name ?? "");
  }

  function openRoundEditor(mode: "new" | "current") {
    if (mode === "current") {
      if (!round) return;
      setRoundDraft({ name: round.name, short: round.short });
      setEditingRoundDetails("current");
      return;
    }
    const nextOrder = rounds.reduce((max, item) => Math.max(max, item.display_order), 0) + 1;
    setRoundDraft({ name: `${t.board.roundLabel} ${nextOrder}`, short: String(nextOrder) });
    setEditingRoundDetails("new");
  }

  async function addRound() {
    setAddingRound(true);
    try {
      await onAddRound(roundDraft);
      setEditingRoundDetails(null);
    } finally {
      setAddingRound(false);
    }
  }

  async function saveRoundDetails() {
    if (!round) return;
    if (editingRoundDetails === "new") {
      await addRound();
      return;
    }
    setAddingRound(true);
    try {
      await onUpdateRound(round.id, roundDraft);
      setEditingRoundDetails(null);
    } finally {
      setAddingRound(false);
    }
  }

  async function deleteRound() {
    if (!round || rounds.length <= 1) return;
    setDeletingRound(true);
    try {
      await onDeleteRound(round.id);
      setConfirmingDelete(false);
    } finally {
      setDeletingRound(false);
    }
  }

  async function toggleLock() {
    if (!round) return;
    const locked = !!round.locked_at;
    setTogglingLock(true);
    try {
      await onSetRoundLock(round.id, !locked);
      setConfirmingLock(false);
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

  function clearAllScores() {
    setDraft(Object.fromEntries(players.map((p) => [p.id, ""])));
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
                onClick={() => openRoundEditor("current")}
                className="text-muted-foreground hover:text-foreground p-1"
                title={t.board.editRoundDetails}
              >
                <Pencil className="size-4" />
              </button>
              <button
                onClick={() => (locked ? toggleLock() : setConfirmingLock(true))}
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
                onClick={() => openRoundEditor("new")}
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
                onClick={() => setConfirmingDelete(true)}
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
            <div className="mb-4 flex items-center justify-between gap-2 text-xs text-muted-foreground bg-surface-elevated/60 border border-border/40 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <Lock className="size-3.5 shrink-0 text-pitch" />
                {t.board.roundLockedNote}
              </div>
              {/* Duplicates the standings-table and hero-banter share shortcuts on
                  purpose: an admin mid-edit can share without closing this dialog. */}
              <button
                onClick={handleShareRound}
                title={t.board.shareRoundTitle}
                className="flex items-center gap-1.5 shrink-0 text-pitch hover:text-pitch/80 font-medium transition-colors"
              >
                <Share2 className="size-3.5" />
                {t.board.shareRound}
              </button>
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

        <div className="px-6 py-4 border-t border-border/40 flex justify-between gap-2">
          <div>
            {!locked && (
              <button
                onClick={clearAllScores}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                {t.common.clear}
              </button>
            )}
          </div>
          <div className="flex justify-end gap-2">
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
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {t.common.save}
              </button>
            )}
          </div>
        </div>
      </div>

      {editingRoundDetails && (
        <RoundDetailsModal
          mode={editingRoundDetails}
          draft={roundDraft}
          saving={addingRound}
          onChange={setRoundDraft}
          onClose={() => setEditingRoundDetails(null)}
          onSave={saveRoundDetails}
        />
      )}

      {confirmingDelete && round && (
        <ConfirmModal
          title={t.board.deleteRound}
          body={t.board.deleteRoundConfirm(round.name)}
          confirmLabel={t.board.deleteRound}
          tone="danger"
          loading={deletingRound}
          onClose={() => setConfirmingDelete(false)}
          onConfirm={deleteRound}
        />
      )}

      {confirmingLock && round && (
        <ConfirmModal
          title={t.board.lockRound}
          body={t.board.lockRoundConfirm(round.name)}
          confirmLabel={t.board.lockRound}
          loading={togglingLock}
          onClose={() => setConfirmingLock(false)}
          onConfirm={toggleLock}
        />
      )}
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
  const sliderValue = numeric == null ? 0 : clamp(numeric, SCORE_MIN, SCORE_MAX);
  const stepValue = (delta: number) => {
    const current = numeric ?? 0;
    onChange(String(clamp(current + delta, SCORE_MIN, SCORE_MAX)));
  };

  // The −/+ stepper (arrows + free text). Shown on both desktop and mobile; the
  // slider is added before it on desktop only.
  const stepper = (
    <div className="shrink-0 flex items-center rounded-lg border border-border bg-input focus-within:border-pitch focus-within:ring-2 focus-within:ring-pitch/20">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => stepValue(-1)}
        disabled={disabled || (numeric ?? 0) <= SCORE_MIN}
        className="flex h-9 w-9 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
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
        className="w-12 border-x border-border bg-transparent py-1.5 text-center text-sm font-mono tabular-nums outline-none disabled:opacity-50"
        aria-label={name}
      />
      <button
        type="button"
        aria-label="Increase"
        onClick={() => stepValue(1)}
        disabled={disabled || (numeric ?? 0) >= SCORE_MAX}
        className="flex h-9 w-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <>
      <div className="font-display text-sm font-medium py-1.5">{name}</div>
      <div className="flex items-center justify-end gap-2">
        <input
          type="range"
          min={SCORE_MIN}
          max={SCORE_MAX}
          step={1}
          value={sliderValue}
          onChange={(e) => onChange(e.currentTarget.value)}
          disabled={disabled}
          className="hidden md:block flex-1 min-w-0 accent-[oklch(0.84_0.18_168)] disabled:opacity-50"
          aria-label={name}
        />
        {stepper}
        <button
          type="button"
          onClick={() => onChange("")}
          disabled={disabled}
          className="shrink-0 px-2 py-1 text-[11px] rounded-md bg-surface-elevated text-muted-foreground hover:text-foreground disabled:opacity-30"
          title={t.board.clearScore}
        >
          <X className="size-3" />
        </button>
      </div>
    </>
  );
}
