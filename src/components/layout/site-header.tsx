import { LanguageSwitcher } from "./language-switcher";
import { LocaleLink, useLocale, useT } from "@/lib/i18n/react";

import { MobileNavigation } from "./mobile-navigation";
import { PRIMARY_CTA, PRIMARY_NAV } from "@/lib/navigation";
import type { Site } from "@/lib/content/types";

/** Neutral home-link copy used whenever the Site adapter has no display name. */
export const NEUTRAL_HOME_LABEL = "صفحهٔ اصلی";

/** Opaque non-sticky header; three equal service destinations. */
export function SiteHeader({ site }: { site: Site | null }) {
  const t = useT();
  const locale = useLocale();
  const latin = site?.latinName?.trim() ?? "";
  const display = site?.displayName?.trim() ?? "";
  // English never falls back to a Persian display name.
  const brand = locale === "en" ? (latin === "" ? null : latin) : display === "" ? null : display;

  return (
    <header className="relative z-20 border-b border-border-subtle bg-surface">
      <div className="mx-auto flex w-full max-w-[80rem] flex-wrap items-center justify-between gap-2 px-5 py-4 md:px-6 lg:gap-5">
        <div className="min-w-0 flex-1 lg:flex-none lg:max-w-[12rem]">
          <LocaleLink
            to="/"
            className="inline-flex min-h-12 items-center text-lg font-bold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {brand ?? t(NEUTRAL_HOME_LABEL)}
          </LocaleLink>
        </div>

        <nav
          aria-label={t("ناوبری اصلی")}
          className="hidden lg:flex lg:flex-1 lg:flex-nowrap lg:items-center lg:justify-center lg:gap-x-5"
        >
          {PRIMARY_NAV.map((item) => (
            <LocaleLink
              key={item.to}
              to={item.to}
              className="inline-flex min-h-12 items-center whitespace-nowrap border-b border-transparent text-sm text-text-secondary transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] hover:border-action-primary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
              activeProps={{
                className: "border-action-primary font-medium text-action-primary",
                "aria-current": "page",
              }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {t(item.label)}
            </LocaleLink>
          ))}
        </nav>

        <div className="flex max-w-full flex-wrap items-center gap-2">
          <LocaleLink
            to={PRIMARY_CTA.to}
            className="hidden min-h-12 items-center rounded-sm border border-action-primary bg-action-primary px-5 text-sm font-bold text-text-inverse transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none lg:inline-flex"
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
