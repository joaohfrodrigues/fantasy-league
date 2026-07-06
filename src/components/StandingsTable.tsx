import { createPortal } from "react-dom";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp, Lock, Pencil } from "lucide-react";

// Presentational standings table shared by the live league board ($slug.tsx)
// and the landing-page example (ExampleBoard.tsx). Both surfaces must render
// identical markup for a given input, so column visibility, sorting-header
// structure, and rank styling live here; interactive vs. static behaviour is
// injected by the caller via render-prop slots (see StandingsRow).

// Reveals the most recently played round columns progressively by viewport
// width (latest always visible, then sm/md), falling back to lg-only for
// older/unplayed rounds. `recencyRank` is 0 for the most recently played
// round, 1 for the next, etc.; `null` means "no recency" (unplayed/no data).
function roundColClass(recencyRank: number | null): string {
  const byRecency = ["table-cell", "hidden sm:table-cell", "hidden md:table-cell"];
  if (recencyRank !== null && recencyRank < byRecency.length) return byRecency[recencyRank];
  return "hidden lg:table-cell";
}

export interface StandingsColumn {
  id: string;
  short: string;
  fullTitle: string;
  locked: boolean;
  recencyRank: number | null;
}

export interface StandingsScoreCell {
  content: ReactNode;
  className?: string;
  title?: string;
}

export interface StandingsRow {
  id: string;
  rank: number;
  isLeader: boolean;
  rowClassName?: string;
  player: ReactNode;
  mobileSummary?: ReactNode;
  prizeCell: ReactNode;
  dinnerCell: ReactNode;
  scores: Record<string, StandingsScoreCell>;
  total: ReactNode;
}

export interface StandingsSort {
  key: string;
  dir: "asc" | "desc";
  onSortBy: (key: string) => void;
}

export interface StandingsLabels {
  player: string;
  roundPrizes: string;
  dinner: string;
  total: string;
  sortBy: (column: string) => string;
}

export interface StandingsTableProps {
  headerRowClassName?: string;
  columns: StandingsColumn[];
  rows: StandingsRow[];
  sort?: StandingsSort;
  dinnerHeaderExtra?: ReactNode;
  emptyState?: ReactNode;
  labels: StandingsLabels;
  scoreCellTextClassName?: string;
  /** When set, each round header gets an edit-round shortcut instead of a
   * separate row of per-round buttons above the table. */
  onEditRound?: (columnId: string) => void;
  editRoundTitle?: (columnId: string) => string;
}

export function StandingsTable({
  headerRowClassName = "text-xs uppercase tracking-wider text-muted-foreground border-b border-border/40",
  columns,
  rows,
  sort,
  dinnerHeaderExtra,
  emptyState,
  labels,
  scoreCellTextClassName = "text-xs lg:text-sm",
  onEditRound,
  editRoundTitle,
}: StandingsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={headerRowClassName}>
            <th className="text-left font-medium px-6 py-3 w-10">#</th>
            <th className="text-left font-medium py-3">{labels.player}</th>
            <th className="text-left font-medium py-3 hidden md:table-cell">
              <SortableHeaderLabel
                sort={sort}
                sortKey="prizes"
                label={labels.roundPrizes}
                sortTitle={labels.sortBy(labels.roundPrizes)}
              />
            </th>
            <th className="text-center font-medium py-3 hidden md:table-cell">
              <span className="inline-flex items-center justify-center gap-1">
                <SortableHeaderLabel
                  sort={sort}
                  sortKey="dinner"
                  label={labels.dinner}
                  sortTitle={labels.sortBy(labels.dinner)}
                />
                {dinnerHeaderExtra}
              </span>
            </th>
            {columns.map((c) => (
              <th
                key={c.id}
                className={`text-center font-medium py-3 px-1.5 ${roundColClass(c.recencyRank)}`}
                title={c.fullTitle}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  <RoundHeaderLabel sort={sort} column={c} sortTitle={labels.sortBy(c.fullTitle)} />
                  {onEditRound && (
                    <button
                      type="button"
                      onClick={() => onEditRound(c.id)}
                      title={editRoundTitle?.(c.id)}
                      className="hidden md:inline-flex text-muted-foreground/70 hover:text-foreground transition-colors"
                    >
                      <Pencil className="size-2.5" aria-hidden="true" />
                    </button>
                  )}
                </span>
              </th>
            ))}
            <th className="text-right font-medium px-6 py-3">
              <SortableHeaderLabel
                sort={sort}
                sortKey="total"
                label={labels.total}
                sortTitle={labels.sortBy(labels.total)}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`border-b border-border/30 last:border-0 ${row.rowClassName ?? ""}`}
            >
              <td className="px-6 py-4 text-muted-foreground tabular-nums align-top">
                {row.isLeader ? (
                  <span className="inline-flex size-6 rounded-full gradient-pitch text-primary-foreground items-center justify-center text-xs font-bold">
                    {row.rank}
                  </span>
                ) : (
                  <span className="text-base">{row.rank}</span>
                )}
              </td>
              <td className="py-4 align-top">
                {row.player}
                {row.mobileSummary && (
                  <div className="text-xs text-muted-foreground mt-1 md:hidden flex items-center gap-1.5">
                    {row.mobileSummary}
                  </div>
                )}
              </td>
              <td className="py-4 align-top hidden md:table-cell">{row.prizeCell}</td>
              <td className="py-4 align-top hidden md:table-cell">{row.dinnerCell}</td>
              {columns.map((c) => {
                const cell = row.scores[c.id];
                return (
                  <td
                    key={c.id}
                    className={`text-center font-mono ${scoreCellTextClassName} tabular-nums px-1.5 align-top py-4 ${roundColClass(c.recencyRank)} ${cell?.className ?? ""}`}
                    title={cell?.title}
                  >
                    {cell?.content}
                  </td>
                );
              })}
              <td className="px-6 py-4 text-right align-top">{row.total}</td>
            </tr>
          ))}
          {rows.length === 0 && emptyState && (
            <tr>
              <td colSpan={columns.length + 5} className="py-16 text-center">
                {emptyState}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortableHeaderLabel({
  sort,
  sortKey,
  label,
  sortTitle,
}: {
  sort?: StandingsSort;
  sortKey: string;
  label: string;
  sortTitle: string;
}) {
  if (!sort) return <>{label}</>;
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => sort.onSortBy(sortKey)}
      title={sortTitle}
      className={`uppercase tracking-wider inline-flex items-center gap-1 hover:text-foreground transition-colors ${
        active ? "text-foreground" : ""
      }`}
    >
      {label}
      <SortIcon active={active} dir={sort.dir} />
    </button>
  );
}

function RoundHeaderLabel({
  sort,
  column,
  sortTitle,
}: {
  sort?: StandingsSort;
  column: StandingsColumn;
  sortTitle: string;
}) {
  if (!sort) return <>{column.short}</>;
  const active = sort.key === column.id;
  return (
    <button
      type="button"
      onClick={() => sort.onSortBy(column.id)}
      title={sortTitle}
      className={`uppercase tracking-wider inline-flex items-center gap-0.5 hover:text-foreground transition-colors ${
        active ? "text-foreground" : ""
      } ${column.locked ? "" : "italic opacity-70"}`}
    >
      {column.locked && <Lock className="size-2.5" aria-hidden="true" />}
      {column.short}
      <SortIcon active={active} dir={sort.dir} />
    </button>
  );
}

export function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="size-3 opacity-40" />;
  return dir === "desc" ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />;
}

export function DinnerBar({
  prob,
  label,
  emoji,
  active,
}: {
  prob: number;
  label: string;
  emoji: string;
  active: boolean;
}) {
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
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: active ? `${Math.max(2, pct)}%` : "0%",
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

export function RoundPrizeCell({
  emoji,
  wins,
  editable,
  openUp = false,
  open = false,
  onToggle = () => {},
  onPick = () => {},
  prizeEmojis = [],
  pickerTitle = "",
  closeLabel = "",
}: {
  emoji: string;
  wins: number;
  editable: boolean;
  openUp?: boolean;
  open?: boolean;
  onToggle?: () => void;
  onPick?: (d: string) => void;
  prizeEmojis?: string[];
  pickerTitle?: string;
  closeLabel?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pickerStyle, setPickerStyle] = useState<CSSProperties>({});

  if (!editable) {
    return (
      <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-elevated">
        <span className="text-lg leading-none">{emoji}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">×{wins}</span>
      </div>
    );
  }

  function handleToggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      if (openUp) {
        setPickerStyle({
          position: "fixed",
          left: rect.left,
          bottom: window.innerHeight - rect.top + 6,
          zIndex: 50,
        });
      } else {
        setPickerStyle({ position: "fixed", left: rect.left, top: rect.bottom + 6, zIndex: 50 });
      }
    }
    onToggle();
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-elevated hover:bg-accent transition-colors"
        title={pickerTitle}
      >
        <span className="text-lg leading-none">{emoji}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">×{wins}</span>
      </button>
      {open &&
        createPortal(
          <>
            <button
              type="button"
              aria-label={closeLabel}
              className="fixed inset-0 z-40"
              onClick={handleToggle}
            />
            <div
              style={pickerStyle}
              className="bg-surface border border-border rounded-xl shadow-card p-2 flex gap-1"
            >
              {prizeEmojis.map((d) => (
                <button
                  key={d}
                  onClick={() => onPick(d)}
                  className={`size-9 grid place-items-center rounded-lg text-xl hover:bg-accent transition-colors ${
                    d === emoji ? "bg-pitch/20 ring-1 ring-pitch" : ""
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
