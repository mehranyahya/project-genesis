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
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="max-w-md text-center" role="alert" aria-live="assertive">
        <h1 className="text-xl font-bold text-text-primary">بارگذاری این صفحه انجام نشد</h1>
        <p className="mt-2 text-sm text-text-secondary">
          مشکلی پیش آمد. می‌توانید دوباره تلاش کنید یا به صفحهٔ اصلی برگردید.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-sm border border-action-primary bg-action-primary px-4 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse motion-reduce:transition-none"
          >
            تلاش دوباره
          </button>
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-sm border border-border-control bg-surface px-4 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-surface-media focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
          >
            بازگشت به خانه
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
      { title: "سنگ مزار سفارشی و سنگ ساختمانی" },
      {
        name: "description",
        content: "انتخاب مدل سنگ مزار، مشاهدهٔ وضعیت قیمت و ثبت درخواست بررسی سفارش.",
      },
      { property: "og:title", content: "سنگ مزار سفارشی و سنگ ساختمانی" },
      {
        property: "og:description",
        content: "انتخاب مدل سنگ مزار، مشاهدهٔ وضعیت قیمت و ثبت درخواست بررسی سفارش.",
      },
      { property: "og:type", content: "website" },
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
