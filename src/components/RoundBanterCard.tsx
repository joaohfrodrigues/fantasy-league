import { ChevronLeft, ChevronRight, Share2, Sparkles } from "lucide-react";

// Presentational: the "After {round}" AI-summary strip on the live league
// board. Shared here (not inlined in $slug.tsx) so the locked-round share
// affordance is testable in isolation, like StandingsTable.

export interface RoundBanterCardLabels {
  afterRound: (roundName: string) => string;
  shareRound: string;
  shareRoundTitle: string;
  banterPrevRound: string;
  banterNextRound: string;
}

export interface RoundBanterCardPagination {
  /** Disables the "older" control — already showing the oldest summary. */
  atOldest: boolean;
  /** Disables the "newer" control — already showing the newest summary. */
  atNewest: boolean;
  onGoOlder: () => void;
  onGoNewer: () => void;
}

export interface RoundBanterCardProps {
  roundName: string;
  text: string;
  /** Gates the share button — only a locked round has a shareable recap. */
  locked: boolean;
  onShare: () => void;
  /** Omit to hide the prev/next controls (e.g. only one round has a summary). */
  pagination?: RoundBanterCardPagination;
  labels: RoundBanterCardLabels;
  className?: string;
}

export function RoundBanterCard({
  roundName,
  text,
  locked,
  onShare,
  pagination,
  labels,
  className = "mt-8 rounded-xl border-l-2 border-pitch bg-surface-elevated/40 pl-5 pr-5 py-4",
}: RoundBanterCardProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-pitch">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {labels.afterRound(roundName)}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {locked && (
            <button
              onClick={onShare}
              title={labels.shareRoundTitle}
              className="flex items-center gap-1.5 text-xs text-pitch hover:text-pitch/80 font-medium transition-colors"
            >
              <Share2 className="size-3.5" />
              {labels.shareRound}
            </button>
          )}
          {pagination && (
            <div className="flex items-center gap-1">
              <button
                onClick={pagination.onGoOlder}
                disabled={pagination.atOldest}
                aria-label={labels.banterPrevRound}
                title={labels.banterPrevRound}
                className="inline-flex items-center justify-center size-6 rounded-md text-pitch hover:bg-pitch/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <button
                onClick={pagination.onGoNewer}
                disabled={pagination.atNewest}
                aria-label={labels.banterNextRound}
                title={labels.banterNextRound}
                className="inline-flex items-center justify-center size-6 rounded-md text-pitch hover:bg-pitch/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="text-sm text-foreground/80 leading-relaxed">{text}</p>
    </div>
  );
}
