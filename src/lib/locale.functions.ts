import { createServerFn } from "@tanstack/react-start";

import type { Locale } from "./i18n";
import { LOCALE_COOKIE } from "./i18n";

function pickFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  // Take language tags in order of appearance (ignoring q-weights is fine for two locales).
  for (const part of header.split(",")) {
    const tag = part.trim().split(";")[0].toLowerCase();
    if (tag.startsWith("pt")) return "pt";
    if (tag.startsWith("en")) return "en";
  }
  return null;
}

/**
 * Resolves the active locale on the server: cookie first, then the
 * Accept-Language header, defaulting to Portuguese.
 */
export const resolveLocale = createServerFn({ method: "GET" }).handler(
  async (): Promise<Locale> => {
    const { getCookie, getRequestHeaders } = await import("@tanstack/react-start/server");

    const cookie = getCookie(LOCALE_COOKIE);
    if (cookie === "pt" || cookie === "en") return cookie;

    const headers = getRequestHeaders();
    const accept = headers.get("accept-language");
    return pickFromAcceptLanguage(accept) ?? "pt";
  },
);
