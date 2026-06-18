import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { pt, type Dict } from "./pt";
import { en } from "./en";

export type { Dict } from "./pt";
export type Locale = "pt" | "en";

export const LOCALE_COOKIE = "lang";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const dictionaries: Record<Locale, Dict> = { pt, en };

export function getDict(locale: Locale): Dict {
  return dictionaries[locale];
}

function persistLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  document.documentElement.lang = locale;
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Dict;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: (next: Locale) => {
        persistLocale(next);
        setLocale(next);
      },
      t: getDict(locale),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => void } {
  const { locale, setLocale } = useLocaleContext();
  return { locale, setLocale };
}

export function useT(): Dict {
  return useLocaleContext().t;
}
