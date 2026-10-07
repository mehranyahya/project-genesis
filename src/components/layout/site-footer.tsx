import { LocaleLink, useLocale, useT } from "@/lib/i18n/react";
import { ContactLinks } from "./contact-links";
import { FOOTER_LEGAL_NAV, PRIMARY_NAV, SECONDARY_NAV } from "@/lib/navigation";
import type { Site } from "@/lib/content/types";

/** Short dark footer; contact and identity appear only when actually supplied. */
export function SiteFooter({ site }: { site: Site | null }) {
  const t = useT();
  const locale = useLocale();
  const brand = (locale === "en" ? site?.latinName : site?.displayName)?.trim();
  const linkClass =
    "inline-flex min-h-12 items-center text-sm text-text-inverse underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse";
  return (
    <footer className="inverse-surface bg-surface-inverse text-text-inverse">
      <div
        className={
          "site-container grid gap-8 py-12 " + (site ? "md:grid-cols-3" : "md:grid-cols-2")
        }
      >
        {site ? (
          <div>
            {brand ? <p className="mb-4 text-lg font-medium">{brand}</p> : null}
            <ContactLinks site={site} className="text-sm" linkClassName={linkClass} />
          </div>
        ) : null}
        <nav aria-label={t("ناوبری پاورقی")}>
          <ul>
            {PRIMARY_NAV.map((item) => (
              <li key={item.to}>
                <LocaleLink to={item.to} className={linkClass}>
                  {t(item.label)}
                </LocaleLink>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t("اطلاعات و راهنماها")}>
          <ul>
            {SECONDARY_NAV.map((item) => (
              <li key={item.to}>
                <LocaleLink to={item.to} className={linkClass}>
                  {t(item.label)}
                </LocaleLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <nav
        aria-label={t("ناوبری حقوقی")}
        className="site-container flex flex-wrap gap-x-6 border-t border-border-control py-4"
      >
        {FOOTER_LEGAL_NAV.map((item) => (
          <LocaleLink key={item.to} to={item.to} className={linkClass}>
            {t(item.label)}
          </LocaleLink>
        ))}
      </nav>
    </footer>
  );
}
