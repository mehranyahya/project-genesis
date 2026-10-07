import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/react";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { MAIN_CONTENT_ID, SKIP_LINK_LABEL } from "@/lib/navigation";
import type { Site } from "@/lib/content/types";
import { StoneworkRequestProvider } from "@/lib/stonework-request-context";

/** Accessible shared shell without a fixed, service-specific action overlay. */
export function AppShell({ site, children }: { site: Site | null; children: ReactNode }) {
  const t = useT();
  return (
    <StoneworkRequestProvider>
      <div className="flex min-h-screen flex-col bg-canvas text-text-primary">
        <a
          href={`#${MAIN_CONTENT_ID}`}
          className="sr-only inline-flex min-h-12 items-center rounded-sm border border-action-primary bg-action-primary px-4 text-sm font-bold text-text-inverse focus:not-sr-only focus:absolute focus:start-5 focus:top-4 focus:z-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {t(SKIP_LINK_LABEL)}
        </a>

        <SiteHeader site={site} />

        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="w-full min-w-0 flex-1">
          {children}
        </main>

        <SiteFooter site={site} />
      </div>
    </StoneworkRequestProvider>
  );
}
