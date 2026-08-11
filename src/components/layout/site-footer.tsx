import { Link } from "@tanstack/react-router";

import { ContactLinks } from "./contact-links";
import { FOOTER_LEGAL_NAV, PRIMARY_NAV } from "@/lib/navigation";
import type { Site } from "@/lib/content/types";

/** Solid Obsidian footer. Bronze appears only as a non-interactive rule. */
export function SiteFooter({ site }: { site: Site | null }) {
  return (
    <footer className="bg-surface-inverse text-text-inverse">
      <div
        aria-hidden="true"
        className="h-px w-full bg-decorative-accent"
        data-decorative="bronze-rule"
      />
      <div className="mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-8 px-4 py-10 md:grid-cols-8 lg:grid-cols-12">
        {site?.displayName?.trim() ? (
          <div className="col-span-4 md:col-span-8 lg:col-span-4">
            <p className="text-lg font-bold">{site.displayName.trim()}</p>
          </div>
        ) : null}

        <nav aria-label="ناوبری پاورقی" className="col-span-4 md:col-span-4 lg:col-span-4">
          <ul>
            {PRIMARY_NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="inline-flex min-h-11 items-center text-sm text-text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="col-span-4 md:col-span-4 lg:col-span-4">
          <nav aria-label="ناوبری حقوقی">
            <ul>
              {FOOTER_LEGAL_NAV.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="inline-flex min-h-11 items-center text-sm text-text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ContactLinks
            site={site}
            className="mt-2 text-sm"
            linkClassName="inline-flex min-h-11 items-center text-sm text-text-inverse underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse"
          />
        </div>
      </div>
    </footer>
  );
}
