import { useCallback, useMemo, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { computePositionEvolution } from "@/lib/position-evolution";
import type { ScoreLookup, TiebreakMode } from "@/lib/standings";
import { useT } from "@/lib/i18n";
import { X } from "lucide-react";

// Reserved for highlighted player lines only — deliberately distinct from the
// pitch/gold/secondary tokens and the sky/violet/emerald/amber panel accents
// used elsewhere on the league page, so a highlighted line never reads as
// "related to" H2H/Alt Reality/Path to Victory.
const CHART_COLORS = [
  "oklch(0.78 0.17 45)", // coral
  "oklch(0.76 0.16 255)", // periwinkle
  "oklch(0.78 0.16 135)", // leaf green
  "oklch(0.75 0.19 330)", // rose
  "oklch(0.8 0.14 195)", // teal
  "oklch(0.82 0.15 70)", // warm yellow
];

const MUTED_STROKE = "var(--color-muted-foreground)";
const CLAIMED_COLOR = "var(--color-pitch)";

type PlayerLite = { id: string; name: string };
type RoundLite = { id: string; short: string; name: string };

type ChartRow = { roundId: string; roundLabel: string } & Record<string, number | string>;

type Nearest = { roundIndex: number; playerId: string } | null;

export function PositionEvolutionChart({
  players,
  rounds,
  score,
  tiebreak,
  claimedPlayerId,
}: Readonly<{
  players: PlayerLite[];
  rounds: RoundLite[];
  score: ScoreLookup;
  tiebreak: TiebreakMode;
  claimedPlayerId: string | null;
}>) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [clicked, setClicked] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<Nearest>(null);

  const evolution = useMemo(
    () => computePositionEvolution({ players, rounds, score, tiebreak }),
    [players, rounds, score, tiebreak],
  );

  const playedRounds = useMemo(() => {
    const ids = new Set<string>();
    evolution.forEach((points) => points.forEach((pt) => ids.add(pt.roundId)));
    return rounds.filter((r) => ids.has(r.id));
  }, [evolution, rounds]);

  const data = useMemo<ChartRow[]>(
    () =>
      playedRounds.map((r) => {
        const row: ChartRow = { roundId: r.id, roundLabel: r.short || r.name };
        players.forEach((p) => {
          const pt = evolution.get(p.id)?.find((e) => e.roundId === r.id);
          if (pt) row[p.id] = pt.rank;
        });
        return row;
      }),
    [playedRounds, players, evolution],
  );

  const totalPlayers = players.length;

  // Keep all rounds visible with tighter spacing on small screens rather than
  // forcing horizontal scroll; thin the axis *labels* (not the data/lines) as
  // round count grows so they don't overlap.
  const tickInterval = playedRounds.length <= 10 ? 0 : playedRounds.length <= 20 ? 1 : 4;

  const highlighted = useMemo(() => {
    const s = new Set(clicked);
    if (claimedPlayerId) s.add(claimedPlayerId);
    return s;
  }, [clicked, claimedPlayerId]);

  const colorByPlayerId = useMemo(() => {
    const m = new Map<string, string>();
    let i = 0;
    highlighted.forEach((id) => {
      if (id === claimedPlayerId) {
        m.set(id, CLAIMED_COLOR);
        return;
      }
      m.set(id, CHART_COLORS[i % CHART_COLORS.length]);
      i += 1;
    });
    return m;
  }, [highlighted, claimedPlayerId]);

  const toggleHighlight = useCallback(
    (playerId: string) => {
      if (playerId === claimedPlayerId) return;
      setClicked((prev) => {
        const next = new Set(prev);
        if (next.has(playerId)) next.delete(playerId);
        else next.add(playerId);
        return next;
      });
    },
    [claimedPlayerId],
  );

  // Nearest-point hit-testing: measure the actual rendered dots (already
  // positioned by Recharts' own scales) rather than re-deriving pixel
  // geometry from axis margins by hand — robust to any layout/margin change.
  const findNearest = useCallback((clientX: number, clientY: number): Nearest => {
    const container = containerRef.current;
    if (!container) return null;
    const dots = container.querySelectorAll<SVGElement>("[data-player-id]");
    if (dots.length === 0) return null;

    let nearestIndex: number | null = null;
    let minDx = Infinity;
    dots.forEach((d) => {
      const rect = d.getBoundingClientRect();
      const dx = Math.abs(rect.left + rect.width / 2 - clientX);
      if (dx < minDx) {
        minDx = dx;
        nearestIndex = Number(d.dataset.roundIndex);
      }
    });
    if (nearestIndex === null) return null;

    let nearestPlayerId: string | null = null;
    let minDy = Infinity;
    dots.forEach((d) => {
      if (Number(d.dataset.roundIndex) !== nearestIndex) return;
      const rect = d.getBoundingClientRect();
      const dy = Math.abs(rect.top + rect.height / 2 - clientY);
      if (dy < minDy) {
        minDy = dy;
        nearestPlayerId = d.dataset.playerId ?? null;
      }
    });
    if (!nearestPlayerId) return null;
    return { roundIndex: nearestIndex, playerId: nearestPlayerId };
  }, []);

  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const nearest = findNearest(e.clientX, e.clientY);
      setHovered(nearest);
      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();
      if (!rect || !container) return;
      // Position is relative to the container's scrollable content, not its
      // visible viewport — add the current scroll offset so the tooltip
      // tracks the cursor correctly once the chart has been scrolled. Clamp
      // within the visible viewport (a fixed half-width estimate, since
      // actual tooltip content width isn't known until after render) so it
      // never renders past the container's edges.
      const TOOLTIP_HALF_WIDTH = 90;
      const rawX = e.clientX - rect.left + container.scrollLeft;
      const minX = container.scrollLeft + TOOLTIP_HALF_WIDTH;
      const maxX = Math.max(
        minX,
        container.scrollLeft + container.clientWidth - TOOLTIP_HALF_WIDTH,
      );
      setTooltipPos({
        x: Math.min(Math.max(rawX, minX), maxX),
        y: e.clientY - rect.top + container.scrollTop,
      });
    },
    [findNearest],
  );

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
    setTooltipPos(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const nearest = findNearest(e.clientX, e.clientY);
      if (nearest) toggleHighlight(nearest.playerId);
    },
    [findNearest, toggleHighlight],
  );

  const playerName = useCallback(
    (id: string) => players.find((p) => p.id === id)?.name ?? "",
    [players],
  );

  if (playedRounds.length < 2) return null;

  // Claimed pinned first, then click order (`clicked` never contains
  // claimedPlayerId — toggleHighlight excludes it).
  const highlightedIds = claimedPlayerId
    ? [claimedPlayerId, ...Array.from(clicked)]
    : Array.from(clicked);

  return (
    <div className="bg-surface/60 backdrop-blur border border-border rounded-2xl shadow-card p-6">
      <h2 className="font-display text-lg font-semibold">{t.board.positionEvolutionTitle}</h2>
      <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
        {t.board.positionEvolutionSubtitle}
      </p>

      <div
        ref={containerRef}
        className="relative mt-4 overflow-x-auto select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] touch-manipulation"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <ChartContainer config={{}} className="aspect-auto h-64 cursor-pointer">
          <ResponsiveContainer>
            <LineChart
              data={data}
              margin={{ top: 16, right: 12, bottom: 4, left: 4 }}
              accessibilityLayer={false}
            >
              <XAxis
                dataKey="roundLabel"
                tickLine={false}
                axisLine={false}
                height={24}
                interval={tickInterval}
                tick={{ fontSize: 11 }}
              />
              <YAxis hide reversed domain={[1, Math.max(totalPlayers, 1)]} allowDecimals={false} />
              {players.map((p) => {
                const isHighlighted = highlighted.has(p.id);
                const color = colorByPlayerId.get(p.id) ?? MUTED_STROKE;
                return (
                  <Line
                    key={p.id}
                    dataKey={p.id}
                    type="linear"
                    stroke={color}
                    strokeWidth={isHighlighted ? 2.5 : 1.25}
                    strokeOpacity={isHighlighted ? 1 : 0.35}
                    isAnimationActive={false}
                    connectNulls={false}
                    dot={(dotProps: {
                      cx?: number;
                      cy?: number;
                      payload?: ChartRow;
                      index?: number;
                    }) => {
                      const { cx, cy, payload, index } = dotProps;
                      const rank = payload ? payload[p.id] : undefined;
                      if (cx === undefined || cy === undefined || rank === undefined) {
                        return <g key={`${p.id}-${index}`} />;
                      }
                      const isHovered = hovered?.playerId === p.id && hovered.roundIndex === index;
                      const showNumber = isHighlighted || isHovered;
                      if (showNumber) {
                        return (
                          <g
                            key={`${p.id}-${index}`}
                            data-player-id={p.id}
                            data-round-index={index}
                          >
                            <circle cx={cx} cy={cy} r={9} fill={color} />
                            <text
                              x={cx}
                              y={cy}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={9}
                              fontWeight={700}
                              fill="var(--color-background)"
                            >
                              {rank}
                            </text>
                          </g>
                        );
                      }
                      return (
                        <circle
                          key={`${p.id}-${index}`}
                          data-player-id={p.id}
                          data-round-index={index}
                          cx={cx}
                          cy={cy}
                          r={2.5}
                          fill={color}
                          fillOpacity={0.5}
                        />
                      );
                    }}
                    activeDot={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {hovered && tooltipPos && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs shadow-card whitespace-nowrap"
            style={{ left: tooltipPos.x, top: tooltipPos.y - 12 }}
          >
            {t.board.positionEvolutionTooltip(
              playerName(hovered.playerId),
              playedRounds[hovered.roundIndex]?.short ||
                playedRounds[hovered.roundIndex]?.name ||
                "",
              (data[hovered.roundIndex]?.[hovered.playerId] as number) ?? 0,
            )}
          </div>
        )}
      </div>

      {highlightedIds.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {highlightedIds.map((id) => {
            const isClaimed = id === claimedPlayerId;
            const color = colorByPlayerId.get(id) ?? MUTED_STROKE;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-elevated border border-border px-2.5 py-1 text-xs text-foreground"
              >
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                {playerName(id)}
                {!isClaimed && (
                  <button
                    type="button"
                    onClick={() => toggleHighlight(id)}
                    aria-label={t.board.positionEvolutionRemove(playerName(id))}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
