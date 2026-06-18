import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Trophy,
  Plus,
  X,
  Loader2,
  Sparkles,
  Copy,
  Check,
  ArrowRight,
  KeyRound,
} from "lucide-react";
import { createLeague, type CreateLeagueResult } from "@/lib/leagues.functions";
import { getRecentLeagues, removeRecentLeague, type RecentLeague } from "@/lib/recent-leagues";
import { useT, getDict, type Locale } from "@/lib/i18n";
import { resolveLocale } from "@/lib/locale.functions";
import { LanguageToggle } from "@/components/LanguageToggle";

export const Route = createFileRoute("/")({
  loader: async (): Promise<{ locale: Locale }> => ({ locale: await resolveLocale() }),
  head: ({ loaderData }) => {
    const t = getDict(loaderData?.locale ?? "pt");
    return {
      meta: [
        { title: t.landing.metaTitle },
        { name: "description", content: t.landing.metaDescription },
        { property: "og:title", content: t.landing.metaTitle },
        { property: "og:description", content: t.landing.metaDescription },
      ],
    };
  },
  component: Landing,
});

const DEFAULT_PLAYERS = ["", ""];

function slugFromInput(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  // Accept a full URL or a bare code.
  try {
    const url = new URL(v);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  } catch {
    return (
      v
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .pop() ?? ""
    );
  }
}

function Landing() {
  const navigate = useNavigate();
  const t = useT();
  const [name, setName] = useState("");
  const [players, setPlayers] = useState<string[]>(DEFAULT_PLAYERS);
  const [rounds, setRounds] = useState<string[]>(() => [...t.landing.defaultRounds]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateLeagueResult | null>(null);
  const [openCode, setOpenCode] = useState("");

  function updateAt(list: string[], idx: number, value: string) {
    return list.map((v, i) => (i === idx ? value : v));
  }

  async function handleCreate() {
    setError(null);
    const cleanName = name.trim();
    const cleanPlayers = players.map((p) => p.trim()).filter(Boolean);
    const cleanRounds = rounds.map((r) => r.trim()).filter(Boolean);
    if (!cleanName) {
      setError(t.landing.errNoName);
      return;
    }
    if (cleanPlayers.length < 2) {
      setError(t.landing.errPlayers);
      return;
    }
    if (cleanRounds.length < 1) {
      setError(t.landing.errRounds);
      return;
    }

    setCreating(true);
    try {
      const result = await createLeague({
        data: { name: cleanName, playerNames: cleanPlayers, roundNames: cleanRounds },
      });
      setCreated(result);
    } catch (err) {
      console.error("createLeague failed:", err);
      setError(t.landing.errCreate);
    } finally {
      setCreating(false);
    }
  }

  function handleOpen() {
    const slug = slugFromInput(openCode);
    if (slug) navigate({ to: "/$slug", params: { slug } });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-20 bg-background/70">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg gradient-pitch grid place-items-center shadow-glow">
              <Trophy className="size-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display font-bold tracking-tight leading-none">
                Fantasy League tracker
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
                {t.landing.brandSubtitle}
              </div>
            </div>
          </div>
          <LanguageToggle />
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-16 pb-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-pitch mb-5">
          <Sparkles className="size-3.5" />
          <span>{t.landing.heroEyebrow}</span>
        </div>
        <h1 className="font-display text-5xl sm:text-7xl font-bold leading-[0.95] max-w-3xl">
          {t.landing.heroTitleA}
          <br />
          <span className="text-pitch">{t.landing.heroTitleB}</span>
        </h1>
        <p className="text-muted-foreground mt-5 max-w-xl text-lg">{t.landing.heroSubtitle}</p>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Create league */}
        <div className="bg-surface/60 backdrop-blur border border-border rounded-2xl shadow-card p-6">
          <h2 className="font-display text-lg font-semibold mb-1">{t.landing.createTitle}</h2>
          <p className="text-xs text-muted-foreground mb-5">{t.landing.createSubtitle}</p>

          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            {t.landing.leagueNameLabel}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.landing.leagueNamePlaceholder}
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-base outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20 mb-6"
          />

          <EditableList
            title={t.landing.playersTitle}
            items={players}
            placeholder={(i) => t.landing.playerPlaceholder(i)}
            onChange={(i, v) => setPlayers((l) => updateAt(l, i, v))}
            onAdd={() => setPlayers((l) => [...l, ""])}
            onRemove={(i) => setPlayers((l) => l.filter((_, idx) => idx !== i))}
            minItems={2}
          />

          <div className="h-5" />

          <EditableList
            title={t.landing.roundsTitle}
            items={rounds}
            placeholder={(i) => t.landing.roundPlaceholder(i)}
            onChange={(i, v) => setRounds((l) => updateAt(l, i, v))}
            onAdd={() => setRounds((l) => [...l, ""])}
            onRemove={(i) => setRounds((l) => l.filter((_, idx) => idx !== i))}
            minItems={1}
          />

          {error && <p className="text-sm text-[color:oklch(0.7_0.2_25)] mt-5">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={creating}
            className="mt-6 w-full px-5 py-3 text-sm rounded-lg bg-pitch text-pitch-foreground font-medium shadow-glow hover:opacity-90 inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {t.landing.createButton}
          </button>
        </div>

        {/* Open existing league */}
        <div className="bg-surface/60 backdrop-blur border border-border rounded-2xl shadow-card p-6 h-fit">
          <h2 className="font-display text-lg font-semibold mb-1">{t.landing.openTitle}</h2>
          <p className="text-xs text-muted-foreground mb-5">{t.landing.openSubtitle}</p>
          <div className="flex gap-2">
            <input
              value={openCode}
              onChange={(e) => setOpenCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleOpen()}
              placeholder={t.landing.openPlaceholder}
              className="flex-1 bg-input border border-border rounded-lg px-4 py-3 text-base outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20"
            />
            <button
              onClick={handleOpen}
              className="px-4 rounded-lg bg-surface-elevated hover:bg-accent transition-colors inline-flex items-center"
              aria-label={t.landing.openAria}
            >
              <ArrowRight className="size-4" />
            </button>
          </div>

          <RecentLeagues />
        </div>
      </section>

      {created && (
        <CreatedModal
          result={created}
          onClose={() => navigate({ to: "/$slug", params: { slug: created.slug } })}
        />
      )}
    </div>
  );
}

function RecentLeagues() {
  const t = useT();
  const [leagues, setLeagues] = useState<RecentLeague[]>([]);

  useEffect(() => {
    setLeagues(getRecentLeagues());
  }, []);

  function remove(slug: string) {
    removeRecentLeague(slug);
    setLeagues(getRecentLeagues());
  }

  if (leagues.length === 0) return null;

  return (
    <div className="mt-6 pt-5 border-t border-border/60">
      <h3 className="font-display text-sm font-semibold mb-0.5">{t.landing.recentTitle}</h3>
      <p className="text-[11px] text-muted-foreground mb-3">{t.landing.recentSubtitle}</p>
      <ul className="space-y-1.5">
        {leagues.map((lg) => (
          <li key={lg.slug} className="group flex items-center gap-1">
            <Link
              to="/$slug"
              params={{ slug: lg.slug }}
              className="flex-1 flex items-center gap-2 min-w-0 rounded-lg px-3 py-2 bg-surface-elevated/50 hover:bg-accent transition-colors"
            >
              <Trophy className="size-3.5 shrink-0 text-pitch" />
              <span className="truncate text-sm font-medium">{lg.name}</span>
              <span className="ml-auto shrink-0 text-[11px] font-mono text-muted-foreground">
                {lg.slug}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => remove(lg.slug)}
              className="px-2 py-2 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
              aria-label={t.landing.recentRemove}
              title={t.landing.recentRemove}
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditableList({
  title,
  items,
  placeholder,
  onChange,
  onAdd,
  onRemove,
  minItems,
}: {
  title: string;
  items: readonly string[];
  placeholder: (i: number) => string;
  onChange: (i: number, v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  minItems: number;
}) {
  const t = useT();
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {title}
        </label>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 text-xs text-pitch hover:opacity-80"
        >
          <Plus className="size-3.5" /> {t.common.add}
        </button>
      </div>
      <div className="space-y-2">
        {items.map((value, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={value}
              onChange={(e) => onChange(i, e.target.value)}
              placeholder={placeholder(i)}
              className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20"
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              disabled={items.length <= minItems}
              className="px-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30"
              aria-label={t.common.remove}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreatedModal({ result, onClose }: { result: CreateLeagueResult; onClose: () => void }) {
  const t = useT();
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/${result.slug}` : `/${result.slug}`;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-card w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="grid place-items-center size-7 rounded-lg bg-pitch/15 text-pitch">
            <Check className="size-4" />
          </span>
          <h3 className="font-display text-lg font-semibold">{t.landing.createdTitle}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          <span className="text-foreground font-medium">{result.name}</span>{" "}
          {t.landing.createdReady}
        </p>

        <CopyField
          label={t.landing.shareLinkLabel}
          value={url}
          icon={<ArrowRight className="size-3.5" />}
        />
        <div className="h-3" />
        <CopyField
          label={t.landing.passwordLabel}
          value={result.password}
          icon={<KeyRound className="size-3.5" />}
          mono
        />

        <div className="mt-5 rounded-lg bg-surface-elevated/50 border border-border/60 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="text-foreground font-medium">{t.landing.importantLabel}</span>{" "}
            {t.landing.importantBody}
          </p>
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full px-5 py-3 text-sm rounded-lg bg-pitch text-pitch-foreground font-medium shadow-glow hover:opacity-90 inline-flex items-center justify-center gap-2"
        >
          {t.landing.goToLeague} <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function CopyField({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  mono?: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {icon}
        {label}
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={`flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm outline-none ${mono ? "font-mono tracking-wide" : ""}`}
        />
        <button
          onClick={copy}
          className="px-3 rounded-lg bg-surface-elevated hover:bg-accent transition-colors inline-flex items-center"
          aria-label={t.common.copy}
        >
          {copied ? <Check className="size-4 text-pitch" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}
