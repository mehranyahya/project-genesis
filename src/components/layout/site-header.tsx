import { LanguageSwitcher } from "./language-switcher";
import { LocaleLink, useLocale, useT } from "@/lib/i18n/react";

import { MobileNavigation } from "./mobile-navigation";
import { PRIMARY_CTA, PRIMARY_NAV } from "@/lib/navigation";
import type { Site } from "@/lib/content/types";

/** Neutral home-link copy used whenever the Site adapter has no display name. */
export const NEUTRAL_HOME_LABEL = "صفحهٔ اصلی";

/** The single floating header surface allowed to use Mineral Glass. */
export function SiteHeader({ site }: { site: Site | null }) {
  const t = useT();
  const locale = useLocale();
  const latin = site?.latinName?.trim() ?? "";
  const display = site?.displayName?.trim() ?? "";
  // English never falls back to a Persian display name.
  const brand = locale === "en" ? (latin === "" ? null : latin) : display === "" ? null : display;

  return (
    <header className="sticky top-0 z-20 px-3 pt-3">
      <div className="mineral-glass mx-auto grid w-full max-w-[80rem] grid-cols-4 items-center gap-x-4 px-4 py-2 md:grid-cols-8 lg:grid-cols-12">
        <div className="col-span-3 flex items-center md:col-span-4 lg:col-span-2">
          <LocaleLink
            to="/"
            className="inline-flex min-h-11 items-center text-lg font-bold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {brand ?? t(NEUTRAL_HOME_LABEL)}
          </LocaleLink>
        </div>

        <nav
          aria-label={t("ناوبری اصلی")}
          className="col-span-6 hidden lg:col-span-7 lg:flex lg:flex-nowrap lg:items-center lg:justify-center lg:gap-x-2"
        >
          {PRIMARY_NAV.map((item) => (
            <LocaleLink
              key={item.to}
              to={item.to}
              className="inline-flex min-h-11 items-center whitespace-nowrap px-1 text-xs text-text-secondary transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
              activeProps={{
                className: "font-bold text-action-primary",
                "aria-current": "page",
              }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {t(item.label)}
            </LocaleLink>
          ))}
        </nav>

        <div className="col-span-1 flex items-center justify-end md:col-span-4 lg:col-span-3">
          <LocaleLink
            to={PRIMARY_CTA.to}
            className="hidden min-h-11 items-center rounded-sm border border-action-primary bg-action-primary px-5 text-sm font-bold text-text-inverse transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse motion-reduce:transition-none lg:inline-flex"
          >
            {t(PRIMARY_CTA.label)}
          </LocaleLink>
          <LanguageSwitcher className="me-1" />
          <MobileNavigation />
        </div>
      </div>
    </header>
  );
}
