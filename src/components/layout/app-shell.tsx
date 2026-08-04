import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { MAIN_CONTENT_ID, PRIMARY_CTA, SKIP_LINK_LABEL } from "@/lib/navigation";
import type { Site } from "@/lib/content/types";

/** Skip link → header → main → footer → mobile action bar. */
export function AppShell({ site, children }: { site: Site | null; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-text-primary">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only inline-flex min-h-11 items-center border border-action-primary bg-action-primary px-4 text-sm font-bold text-text-inverse focus:not-sr-only focus:absolute focus:right-4 focus:top-4 focus:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {SKIP_LINK_LABEL}
      </a>

      <SiteHeader />

      <main id={MAIN_CONTENT_ID} className="w-full flex-1 pb-24 lg:pb-0">
        {children}
      </main>

      <SiteFooter site={site} />

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border-subtle bg-surface px-4 pb-[env(safe-area-inset-bottom)] pt-2 lg:hidden">
        <Link
          to={PRIMARY_CTA.to}
          className="flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 pb-2 text-sm font-bold text-text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {PRIMARY_CTA.label}
        </Link>
      </div>
    </div>
  );
}
