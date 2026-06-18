import { Languages } from "lucide-react";

import { useLocale, type Locale } from "@/lib/i18n";

const ORDER: Locale[] = ["pt", "en"];

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <div
      className="inline-flex items-center gap-1 rounded-md bg-surface-elevated p-0.5 text-xs"
      aria-label="Language"
    >
      <Languages className="size-3.5 ml-1 text-muted-foreground" aria-hidden="true" />
      {ORDER.map((code) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            className={`rounded px-2 py-1 font-medium uppercase tracking-wide transition-colors ${
              active
                ? "bg-pitch text-pitch-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
