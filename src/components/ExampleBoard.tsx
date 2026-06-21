import { FlaskConical } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useInView, useCountUp } from "@/hooks/use-animations";
import { BADGE_EMOJI } from "@/components/badge-emoji";
import { assignBadges } from "@/lib/badges";

// Static, read-only sample standings shown on the landing page so new users can
// see what the tracker looks like. No live data, no simulation, no editing.

type DemoPlayer = {
  name: string;
  drink: string;
  tier: 1 | 2 | 3 | 4 | 5;
  prob: number;
  scores: number[];
};

const DEMO_ROUND_SHORTS = ["MD1", "MD2", "MD3"];

// Scores chosen so the real badge logic produces a clear spread: Ana wins MD2+MD3
// (On Fire), Carla climbs on the last round (On the Rise), Bruno slips (The Bottler).
const DEMO_PLAYERS: DemoPlayer[] = [
  { name: "Ana", drink: "🍺", tier: 2, prob: 0.58, scores: [80, 102, 100] },
  { name: "Carla", drink: "🧃", tier: 3, prob: 0.24, scores: [72, 90, 95] },
  { name: "Bruno", drink: "🍷", tier: 4, prob: 0.15, scores: [98, 76, 70] },
  { name: "Diogo", drink: "☕", tier: 5, prob: 0.03, scores: [60, 81, 65] },
];

// Badges come from the real assignBadges over the demo data — never hardcoded, so
// the showcase always matches the live behaviour.
const DEMO_BADGES = assignBadges({
  players: DEMO_PLAYERS.map((p) => ({ id: p.name })),
  // The demo is a finished example — all rounds locked so badges (locked-only) show.
  rounds: DEMO_ROUND_SHORTS.map((short) => ({ id: short, locked: true })),
  score: (pid, rid) => {
    const p = DEMO_PLAYERS.find((x) => x.name === pid);
    const idx = DEMO_ROUND_SHORTS.indexOf(rid);
    return p && idx >= 0 ? p.scores[idx] : undefined;
  },
  tiebreak: "total",
});

const DINNER_EMOJI: Record<number, string> = { 1: "🍗", 2: "😋", 3: "🤞", 4: "😬", 5: "💸" };

function dinnerGradient(prob: number): string {
  if (prob >= 0.4) return "linear-gradient(90deg, oklch(0.84 0.18 168), oklch(0.6 0.23 262))";
  if (prob >= 0.15) return "linear-gradient(90deg, oklch(0.9 0.18 100), oklch(0.86 0.16 90))";
  return "linear-gradient(90deg, oklch(0.62 0.24 18), oklch(0.62 0.24 350))";
}

export function ExampleBoard() {
  const t = useT();
  const [ref, inView] = useInView<HTMLElement>();

  const roundMax = DEMO_ROUND_SHORTS.map((_, idx) =>
    Math.max(...DEMO_PLAYERS.map((p) => p.scores[idx])),
  );

  const rows = DEMO_PLAYERS.map((p) => {
    const total = p.scores.reduce((a, b) => a + b, 0);
    const wins = p.scores.reduce((acc, v, idx) => (v === roundMax[idx] ? acc + 1 : acc), 0);
    return { ...p, total, wins };
  }).sort((a, b) => b.total - a.total);

  // Stats for the slim strip below the table.
  let high = { value: -Infinity, player: "", round: "" };
  let margin = { value: -Infinity, player: "", round: "" };
  DEMO_ROUND_SHORTS.forEach((short, idx) => {
    const ranked = [...DEMO_PLAYERS].sort((a, b) => b.scores[idx] - a.scores[idx]);
    DEMO_PLAYERS.forEach((p) => {
      if (p.scores[idx] > high.value) high = { value: p.scores[idx], player: p.name, round: short };
    });
    const m = ranked[0].scores[idx] - ranked[1].scores[idx];
    if (m > margin.value) margin = { value: m, player: ranked[0].name, round: short };
  });
  const lead = rows[0].total - rows[1].total;

  const highCount = Math.round(useCountUp(high.value, inView));
  const marginCount = Math.round(useCountUp(margin.value, inView));
  const leadCount = Math.round(useCountUp(lead, inView));

  const dinnerLabels: Record<number, string> = {
    1: t.board.dinner1,
    2: t.board.dinner2,
    3: t.board.dinner3,
    4: t.board.dinner4,
    5: t.board.dinner5,
  };

  return (
    <section ref={ref} className="max-w-5xl mx-auto px-6 pb-12">
      <div
        className={`bg-surface/60 backdrop-blur border border-border rounded-2xl shadow-card overflow-hidden ${
          inView
            ? "animate-in fade-in slide-in-from-bottom-6 duration-700 fill-mode-both"
            : "opacity-0"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">{t.landing.example.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t.landing.example.subtitle}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-md bg-pitch/15 text-pitch">
            <FlaskConical className="size-3.5" />
            {t.landing.example.badge}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <th className="text-left font-medium px-6 py-3 w-10">#</th>
                <th className="text-left font-medium py-3">{t.board.colPlayer}</th>
                <th className="text-left font-medium py-3">{t.board.colRoundPrizes}</th>
                <th className="text-center font-medium py-3 hidden md:table-cell">
                  {t.board.colDinner}
                </th>
                {DEMO_ROUND_SHORTS.map((short, idx) => (
                  <th
                    key={short}
                    className="text-center font-medium py-3 px-1.5 hidden lg:table-cell"
                    title={t.landing.templates.matchday(idx + 1)}
                  >
                    {short}
                  </th>
                ))}
                <th className="text-right font-medium px-6 py-3">{t.board.colTotal}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isLeader = i === 0;
                const emoji = DINNER_EMOJI[row.tier];
                const label = dinnerLabels[row.tier];
                const pct = Math.round(row.prob * 100);
                return (
                  <tr key={row.name} className="border-b border-border/30 last:border-0">
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
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <span className="font-display font-semibold text-base">{row.name}</span>
                        {(DEMO_BADGES.get(row.name) ?? []).map((bid) => (
                          <span
                            key={bid}
                            className="text-sm leading-none"
                            title={t.board.badges[bid]}
                            aria-label={t.board.badges[bid]}
                          >
                            {BADGE_EMOJI[bid]}
                          </span>
                        ))}
                      </span>
                      <div className="text-xs text-muted-foreground mt-1 md:hidden">
                        <span className="mr-1">{emoji}</span>
                        {label} · {pct}%
                      </div>
                    </td>
                    <td className="py-4 align-top">
                      <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-elevated">
                        <span className="text-lg leading-none">{row.drink}</span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          ×{row.wins}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 align-top hidden md:table-cell">
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
                              width: inView ? `${Math.max(2, pct)}%` : "0%",
                              background: dinnerGradient(row.prob),
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    {row.scores.map((v, idx) => {
                      const isRoundWin = v === roundMax[idx];
                      return (
                        <td
                          key={DEMO_ROUND_SHORTS[idx]}
                          className="text-center font-mono text-xs tabular-nums px-1.5 hidden lg:table-cell align-top py-4"
                        >
                          {isRoundWin ? <span className="text-pitch font-bold">{v}</span> : v}
                        </td>
                      );
                    })}
                    <td className="px-6 py-4 text-right align-top">
                      <AnimatedTotal value={row.total} active={inView} isLeader={isLeader} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 py-4 border-t border-border/60">
          <StatChip
            label={t.board.statsHighest}
            value={String(highCount)}
            caption={`${high.player} · ${high.round}`}
          />
          <StatChip
            label={t.board.statsRoundMargin}
            value={`+${marginCount}`}
            caption={`${margin.player} · ${margin.round}`}
          />
          <StatChip
            label={t.board.statsLead}
            value={`+${leadCount}`}
            caption={t.board.statsLeadBy(rows[0].name)}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground/70 mt-4 text-center">
        {t.landing.example.caption}{" "}
        <a href="#create-tracker" className="text-pitch font-medium hover:underline">
          {t.landing.example.cta}
        </a>
      </p>
    </section>
  );
}

function StatChip({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-surface-elevated/60">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-display font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground truncate">{caption}</span>
    </div>
  );
}

function AnimatedTotal({
  value,
  active,
  isLeader,
}: {
  value: number;
  active: boolean;
  isLeader: boolean;
}) {
  const v = Math.round(useCountUp(value, active));
  return (
    <span className={`font-display font-bold tabular-nums text-xl ${isLeader ? "text-pitch" : ""}`}>
      {v}
    </span>
  );
}
