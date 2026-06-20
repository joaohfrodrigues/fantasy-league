import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  Trophy,
  Plus,
  Minus,
  X,
  Loader2,
  Copy,
  Check,
  ArrowRight,
  KeyRound,
  LineChart,
  History,
} from "lucide-react";
import { createLeague, type CreateLeagueResult } from "@/lib/leagues.functions";
import {
  buildTemplateRounds,
  TEMPLATE_IDS,
  type TemplateId,
  LEAGUE_MIN_ROUNDS,
  LEAGUE_MAX_ROUNDS,
  LEAGUE_DEFAULT_ROUNDS,
  KNOCKOUT_MIN_DEPTH,
  KNOCKOUT_MAX_DEPTH,
  KNOCKOUT_DEFAULT_DEPTH,
} from "@/lib/templates";
import { getRecentLeagues, removeRecentLeague, type RecentLeague } from "@/lib/recent-leagues";
import { useT, getDict, type Locale } from "@/lib/i18n";
import { resolveLocale } from "@/lib/locale.functions";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ExampleBoard } from "@/components/ExampleBoard";

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
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 64;
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
  const [templateId, setTemplateId] = useState<TemplateId>("worldCup");
  const [leagueRounds, setLeagueRounds] = useState<number>(LEAGUE_DEFAULT_ROUNDS);
  const [knockoutDepth, setKnockoutDepth] = useState<number>(KNOCKOUT_DEFAULT_DEPTH);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateLeagueResult | null>(null);
  const [openCode, setOpenCode] = useState("");
  const [password, setPassword] = useState("");

  function updateAt(list: string[], idx: number, value: string) {
    return list.map((v, i) => (i === idx ? value : v));
  }

  async function handleCreate() {
    setError(null);
    const cleanName = name.trim();
    const cleanPlayers = players.map((p) => p.trim()).filter(Boolean);
    const cleanRounds = buildTemplateRounds(templateId, t, { leagueRounds, knockoutDepth });
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
    if (password && (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD)) {
      setError(t.landing.errPasswordLength);
      return;
    }

    setCreating(true);
    try {
      const result = await createLeague({
        data: {
          name: cleanName,
          playerNames: cleanPlayers,
          rounds: cleanRounds,
          password: password || undefined,
        },
      });
      setCreated(result);
    } catch (err) {
      console.error("createLeague failed:", err);
      if (err instanceof Error && err.message === "RATE_LIMITED") {
        setError(t.landing.errRateLimited);
      } else if (err instanceof Error && err.message === "INVALID_PASSWORD") {
        setError(t.landing.errPasswordLength);
      } else {
        setError(t.landing.errCreate);
      }
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
            <div className="font-display font-bold tracking-tight leading-none">
              Fantasy Tracker
            </div>
          </div>
          <LanguageToggle />
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-16 pb-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-pitch mb-5 animate-in fade-in slide-in-from-bottom-3 duration-500">
          <span>{t.landing.heroEyebrow}</span>
        </div>
        <h1 className="font-display text-5xl sm:text-7xl font-bold leading-[0.95] max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 fill-mode-both">
          {t.landing.heroTitleA}
          <br />
          <span className="text-pitch">{t.landing.heroTitleB}</span>
          <sup className="text-pitch/60 text-2xl font-normal align-super">*</sup>
        </h1>
        <p className="text-muted-foreground mt-5 max-w-xl text-lg animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 fill-mode-both">
          {t.landing.heroSubtitle}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-3 max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 fill-mode-both">
          {t.landing.heroFootnote}
        </p>
        <div className="mt-10 flex justify-center animate-in fade-in slide-in-from-top-6 duration-700 delay-[450ms] fill-mode-both">
          <a
            href="#create-tracker"
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById("create-tracker")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-pitch px-8 py-4 text-base font-semibold text-pitch-foreground shadow-glow transition-transform hover:scale-[1.03] active:scale-95"
          >
            {t.landing.heroCta}
          </a>
        </div>
      </section>

      <RecentLeagues />

      <section className="max-w-5xl mx-auto px-6 pb-12">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-5">
          {t.landing.features.title}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={<LineChart className="size-4" />}
            title={t.landing.features.simulateTitle}
            desc={t.landing.features.simulateDesc}
            delay={0}
          />
          <FeatureCard
            icon={<Trophy className="size-4" />}
            title={t.landing.features.prizesTitle}
            desc={t.landing.features.prizesDesc}
            delay={100}
          />
          <FeatureCard
            icon={<History className="size-4" />}
            title={t.landing.features.historyTitle}
            desc={t.landing.features.historyDesc}
            delay={200}
          />
        </div>
      </section>

      <ExampleBoard />

      <section className="max-w-5xl mx-auto px-6 pt-4 pb-2" id="create-tracker">
        <div className="scroll-mt-24">
          <div className="text-xs uppercase tracking-[0.2em] text-pitch mb-3">
            {t.landing.setupEyebrow}
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold leading-tight">
            {t.landing.setupTitle}
          </h2>
          <p className="text-muted-foreground mt-3 max-w-xl">{t.landing.setupSubtitle}</p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Create league */}
        <div className="bg-surface/60 backdrop-blur border border-border rounded-2xl shadow-card p-6">
          <h2 className="font-display text-lg font-semibold mb-1">{t.landing.createTitle}</h2>
          <p className="text-xs lg:text-sm text-muted-foreground mb-5">
            {t.landing.createSubtitle}
          </p>

          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            {t.landing.leagueNameLabel}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.landing.leagueNamePlaceholder}
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-base outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20 mb-6"
          />

          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            {t.landing.createPasswordLabel}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.landing.createPasswordPlaceholder}
            maxLength={MAX_PASSWORD}
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-base outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20"
          />
          <p className="text-xs text-muted-foreground mt-2 mb-6">{t.landing.createPasswordHelp}</p>

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

          <TemplateSelector
            templateId={templateId}
            onSelect={setTemplateId}
            leagueRounds={leagueRounds}
            onLeagueRounds={setLeagueRounds}
            knockoutDepth={knockoutDepth}
            onKnockoutDepth={setKnockoutDepth}
          />

          {error && <p className="text-sm text-[color:oklch(0.7_0.2_25)] mt-5">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={creating}
            className="mt-6 w-full px-5 py-3 text-sm rounded-lg bg-pitch text-pitch-foreground font-medium shadow-glow hover:opacity-90 active:scale-95 transition inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100"
          >
            {creating && <Loader2 className="size-4 animate-spin" />}
            {t.landing.createButton}
          </button>
        </div>

        {/* Open existing league */}
        <div className="bg-surface/60 backdrop-blur border border-border rounded-2xl shadow-card p-6 h-fit">
          <h2 className="font-display text-lg font-semibold mb-1">{t.landing.openTitle}</h2>
          <p className="text-xs lg:text-sm text-muted-foreground mb-5">{t.landing.openSubtitle}</p>
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

function FeatureCard({
  icon,
  title,
  desc,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  delay?: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms`, animationDuration: "700ms" }}
      className="bg-surface/60 backdrop-blur border border-border rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-pitch/40 animate-in fade-in slide-in-from-bottom-4 fill-mode-both"
    >
      <div className="size-9 rounded-lg bg-pitch/15 text-pitch grid place-items-center mb-3">
        {icon}
      </div>
      <h3 className="font-display font-semibold text-sm mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function RecentLeagues() {
  const t = useT();
  const [leagues, setLeagues] = useState<RecentLeague[]>([]);

  useIsomorphicLayoutEffect(() => {
    const syncRecentLeagues = () => setLeagues(getRecentLeagues());
    syncRecentLeagues();
    const onStorage = () => syncRecentLeagues();
    globalThis.addEventListener("storage", onStorage);
    return () => globalThis.removeEventListener("storage", onStorage);
  }, []);

  function remove(slug: string) {
    removeRecentLeague(slug);
    setLeagues(getRecentLeagues());
  }

  if (leagues.length === 0) return null;

  return (
    <section className="max-w-5xl mx-auto px-6 pb-10">
      <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
        {t.landing.recentTitle}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {leagues.map((lg, i) => (
          <li
            key={lg.slug}
            style={{ animationDelay: `${Math.min(i, 8) * 50}ms`, animationDuration: "500ms" }}
            className="group flex items-center gap-1 animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
          >
            <Link
              to="/$slug"
              params={{ slug: lg.slug }}
              className="flex-1 flex items-center gap-3 min-w-0 rounded-xl px-4 py-3 bg-surface/60 backdrop-blur border border-border hover:border-pitch/40 hover:bg-surface-elevated/50 transition-colors shadow-card"
            >
              <div className="size-8 rounded-lg bg-pitch/15 grid place-items-center shrink-0">
                <Trophy className="size-4 text-pitch" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold font-display">{lg.name}</p>
                <p className="text-[11px] font-mono text-muted-foreground">{lg.slug}</p>
              </div>
              <ArrowRight className="size-4 ml-auto shrink-0 text-muted-foreground/40 group-hover:text-pitch transition-colors" />
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
    </section>
  );
}

function TemplateSelector({
  templateId,
  onSelect,
  leagueRounds,
  onLeagueRounds,
  knockoutDepth,
  onKnockoutDepth,
}: {
  templateId: TemplateId;
  onSelect: (id: TemplateId) => void;
  leagueRounds: number;
  onLeagueRounds: (n: number) => void;
  knockoutDepth: number;
  onKnockoutDepth: (n: number) => void;
}) {
  const t = useT();
  const meta = t.landing.templates;
  const preview = buildTemplateRounds(templateId, t, { leagueRounds, knockoutDepth });

  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-muted-foreground">
        {meta.title}
      </label>
      <p className="text-xs text-muted-foreground mt-1 mb-2.5">{meta.subtitle}</p>

      <div className="grid grid-cols-2 gap-2">
        {TEMPLATE_IDS.map((id) => {
          const selected = id === templateId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-pressed={selected}
              className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                selected
                  ? "border-pitch bg-pitch/10 ring-2 ring-pitch/20"
                  : "border-border bg-input hover:bg-accent"
              }`}
            >
              <div className="text-sm font-medium">{meta[id].label}</div>
              <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                {meta[id].desc}
              </div>
            </button>
          );
        })}
      </div>

      {templateId === "league" && (
        <TemplateSizeField
          label={meta.leagueRoundsLabel}
          value={leagueRounds}
          min={LEAGUE_MIN_ROUNDS}
          max={LEAGUE_MAX_ROUNDS}
          onChange={onLeagueRounds}
        />
      )}
      {templateId === "knockout" && (
        <TemplateSizeField
          label={meta.knockoutDepthLabel}
          value={knockoutDepth}
          min={KNOCKOUT_MIN_DEPTH}
          max={KNOCKOUT_MAX_DEPTH}
          onChange={onKnockoutDepth}
        />
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        <span className="uppercase tracking-wider">{meta.previewLabel}</span>{" "}
        <span className="text-foreground/70">({preview.length})</span>{" "}
        <span className="font-mono">{preview.map((r) => r.short).join(" · ")}</span>
      </p>
    </div>
  );
}

function TemplateSizeField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  function commit(raw: string) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    onChange(Math.min(max, Math.max(min, n)));
  }
  const step = (delta: number) => commit(String(value + delta));
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="flex items-center rounded-lg border border-border bg-input focus-within:border-pitch focus-within:ring-2 focus-within:ring-pitch/20">
        <button
          type="button"
          aria-label="Decrease"
          onClick={() => step(-1)}
          disabled={value <= min}
          className="flex h-9 w-9 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => commit(e.target.value)}
          className="w-10 border-x border-border bg-transparent py-1.5 text-center text-sm font-mono tabular-nums outline-none"
        />
        <button
          type="button"
          aria-label="Increase"
          onClick={() => step(1)}
          disabled={value >= max}
          className="flex h-9 w-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
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
          {result.generatedPassword
            ? t.landing.createdReadyGenerated
            : t.landing.createdReadyChosen}
        </p>

        <CopyField
          label={t.landing.shareLinkLabel}
          value={url}
          icon={<ArrowRight className="size-3.5" />}
        />
        <div className="h-3" />
        {result.generatedPassword ? (
          <>
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
          </>
        ) : (
          <div className="mt-3 rounded-lg bg-surface-elevated/50 border border-border/60 px-3 py-2.5">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="text-foreground font-medium">{t.landing.passwordChosenLabel}</span>{" "}
              {t.landing.passwordChosenBody}
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full px-5 py-3 text-sm rounded-lg bg-pitch text-pitch-foreground font-medium shadow-glow hover:opacity-90 active:scale-95 transition inline-flex items-center justify-center gap-2"
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
          className="px-3 rounded-lg bg-surface-elevated hover:bg-accent active:scale-95 transition inline-flex items-center"
          aria-label={t.common.copy}
        >
          {copied ? (
            <Check className="size-4 text-pitch animate-in zoom-in-50 duration-300" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
