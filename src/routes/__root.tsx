import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppShell } from "../components/layout/app-shell";
import { NotFoundView } from "../components/static-pages/static-pages";
import { getPage, getSite } from "../lib/content/adapters";
import { buildContentSecurityPolicy } from "../lib/csp";
import { buildNotFoundModel } from "../lib/static-pages";

const CSP_MISSING_NONCE_POLICY = "default-src 'none'; frame-ancestors 'none'";

function NotFoundComponent() {
  const data = Route.useLoaderData() as
    { notFound: ReturnType<typeof buildNotFoundModel> } | undefined;
  return <NotFoundView page={data?.notFound ?? null} />;
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  headers: ({ ssr }) => {
    if (import.meta.env.DEV) return;
    const nonce = ssr?.nonce;
    return {
      "Content-Security-Policy": nonce
        ? buildContentSecurityPolicy(nonce)
        : CSP_MISSING_NONCE_POLICY,
    };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "مهرآرا" },
      { name: "description", content: "فروشگاه سفارش‌محور سنگ مزار مهرآرا" },
      { property: "og:title", content: "مهرآرا" },
      { property: "og:description", content: "فروشگاه سفارش‌محور سنگ مزار مهرآرا" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "مهرآرا" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  loader: async () => {
    const [site, notFoundPage] = await Promise.all([getSite(), getPage("not-found")]);
    return { site, notFound: buildNotFoundModel(notFoundPage) };
  },

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const site = Route.useLoaderData()?.site ?? null;

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <AppShell site={site}>
        <Outlet />
      </AppShell>
    </QueryClientProvider>
  );
}
