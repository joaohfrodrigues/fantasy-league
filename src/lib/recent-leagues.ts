// Tracks the leagues this browser has opened, persisted in localStorage so the
// landing page can offer quick links back to them. Purely client-side and
// SSR-safe: every function no-ops when `window`/`localStorage` is unavailable.

const STORAGE_KEY = "recent-leagues";
const MAX_ENTRIES = 8;

export type RecentLeague = { slug: string; name: string; openedAt: number };

function isBrowser(): boolean {
  return globalThis.localStorage !== undefined;
}

function sanitize(value: unknown): RecentLeague[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (e): e is RecentLeague =>
        !!e &&
        typeof e.slug === "string" &&
        typeof e.name === "string" &&
        typeof e.openedAt === "number",
    )
    .map((e) => ({ slug: e.slug, name: e.name, openedAt: e.openedAt }));
}

export function getRecentLeagues(): RecentLeague[] {
  if (!isBrowser()) return [];
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return sanitize(JSON.parse(raw)).sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

export function recordRecentLeague(slug: string, name: string): void {
  if (!isBrowser() || !slug) return;
  try {
    const existing = getRecentLeagues().filter((e) => e.slug !== slug);
    const next = [{ slug, name, openedAt: Date.now() }, ...existing].slice(0, MAX_ENTRIES);
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable or quota exceeded */
  }
}

export function removeRecentLeague(slug: string): void {
  if (!isBrowser()) return;
  try {
    const next = getRecentLeagues().filter((e) => e.slug !== slug);
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}
