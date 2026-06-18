import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import { Heart } from "lucide-react";

import { LocaleProvider, useT, getDict, type Locale } from "@/lib/i18n";
import { resolveLocale } from "@/lib/locale.functions";

import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource-variable/inter/index.css";
import "@fontsource/jetbrains-mono/500.css";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  const t = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t.root.notFoundTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t.root.notFoundBody}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t.root.goHome}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const t = useT();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t.root.errorTitle}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.root.errorBody}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t.root.tryAgain}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t.root.goHome}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async (): Promise<{ locale: Locale }> => ({ locale: await resolveLocale() }),
  head: ({ loaderData }) => {
    const t = getDict(loaderData?.locale ?? "pt");
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: t.root.metaTitle },
        { name: "description", content: t.root.metaDescription },
        { property: "og:title", content: t.root.metaTitle },
        { property: "og:description", content: t.root.metaDescription },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const { locale } = Route.useLoaderData();
  return (
    <html lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        <LocaleProvider initialLocale={locale}>
          {children}
          <Scripts />
        </LocaleProvider>
      </body>
    </html>
  );
}

function Footer() {
  const t = useT();
  return (
    <footer className="border-t border-border/40 py-6">
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        {t.root.madeWithA}
        <Heart className="size-3.5 fill-pitch text-pitch" aria-hidden="true" />
        {t.root.madeWithB}
      </p>
    </footer>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </div>
    </QueryClientProvider>
  );
}
