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
        className="sr-only inline-flex min-h-11 items-center rounded-sm border border-action-primary bg-action-primary px-4 text-sm font-bold text-text-inverse focus:not-sr-only focus:absolute focus:right-4 focus:top-4 focus:z-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse"
      >
        {SKIP_LINK_LABEL}
      </a>

      <SiteHeader />

      <main id={MAIN_CONTENT_ID} className="w-full flex-1 pb-24 lg:pb-0">
        {children}
      </main>

      <SiteFooter site={site} />

      <div className="fixed inset-x-0 bottom-0 z-10 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:hidden">
        <div className="mineral-glass p-2">
          <Link
            to={PRIMARY_CTA.to}
            className="flex min-h-11 items-center justify-center rounded-sm border border-action-primary bg-action-primary px-5 text-sm font-bold text-text-inverse transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse motion-reduce:transition-none"
          >
            {PRIMARY_CTA.label}
          </Link>
        </div>
      </div>
    </div>
  );
}
