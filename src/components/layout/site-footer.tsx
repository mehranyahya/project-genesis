import { LocaleLink, useLocale, useT } from "@/lib/i18n/react";

import { ContactLinks } from "./contact-links";
import { FOOTER_LEGAL_NAV, PRIMARY_NAV, SECONDARY_NAV } from "@/lib/navigation";
import type { Site } from "@/lib/content/types";

/** Solid, compact footer with operational content and equal service links. */
export function SiteFooter({ site }: { site: Site | null }) {
  const t = useT();
  const locale = useLocale();
  const brand = (locale === "en" ? site?.latinName : site?.displayName)?.trim();
  return (
    <footer className="on-dark bg-surface-inverse text-text-inverse">
      <div className="mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-8 px-5 py-12 md:grid-cols-8 md:px-6 md:py-20 lg:grid-cols-12">
        {brand ? (
          <div className="col-span-4 md:col-span-8 lg:col-span-4">
            <p className="text-lg font-bold">{brand}</p>
          </div>
        ) : null}

        <nav aria-label={t("ناوبری پاورقی")} className="col-span-4 md:col-span-4 lg:col-span-4">
          <ul>
            {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => (
              <li key={item.to}>
                <LocaleLink
                  to={item.to}
                  className="inline-flex min-h-12 items-center text-sm text-text-inverse-secondary hover:text-text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse"
                >
                  {t(item.label)}
                </LocaleLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="col-span-4 md:col-span-4 lg:col-span-4">
          <nav aria-label={t("ناوبری حقوقی")}>
            <ul>
              {FOOTER_LEGAL_NAV.map((item) => (
                <li key={item.to}>
                  <LocaleLink
                    to={item.to}
                    className="inline-flex min-h-12 items-center text-sm text-text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse"
                  >
                    {t(item.label)}
                  </LocaleLink>
                </li>
              ))}
            </ul>
          </nav>
          <ContactLinks
            site={site}
            className="mt-2 text-sm"
            linkClassName="inline-flex min-h-12 items-center text-sm text-text-inverse underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse"
          />
        </div>
      </div>
    </footer>
  );
}
