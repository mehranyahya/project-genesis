import { LanguageSwitcher } from "./language-switcher";
import { LocaleLink, useLocale, useT } from "@/lib/i18n/react";
import { MobileNavigation } from "./mobile-navigation";
import { PRIMARY_CTA, PRIMARY_NAV } from "@/lib/navigation";
import type { Site } from "@/lib/content/types";

export const NEUTRAL_HOME_LABEL = "صفحهٔ اصلی";

/** Opaque, non-sticky header. A missing brand name stays owner-neutral. */
export function SiteHeader({ site }: { site: Site | null }) {
  const t = useT();
  const locale = useLocale();
  const brand = (locale === "en" ? site?.latinName : site?.displayName)?.trim();

  return (
    <header className="relative z-20 border-b border-border-subtle bg-surface">
      <div className="site-container flex min-h-20 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 lg:flex-nowrap">
        <LocaleLink
          to="/"
          className="inline-flex min-h-12 min-w-0 items-center text-lg font-medium text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {brand || t(NEUTRAL_HOME_LABEL)}
        </LocaleLink>
        <nav
          aria-label={t("ناوبری اصلی")}
          className="hidden items-center gap-5 lg:flex lg:flex-nowrap"
        >
          {PRIMARY_NAV.map((item) => (
            <LocaleLink
              key={item.to}
              to={item.to}
              className="inline-flex min-h-12 items-center whitespace-nowrap text-sm text-text-secondary underline-offset-8 transition-colors duration-[180ms] hover:text-action-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
              activeProps={{ className: "text-action-primary underline", "aria-current": "page" }}
            >
              {t(item.label)}
            </LocaleLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <LocaleLink to={PRIMARY_CTA.to} className="ui-action hidden lg:inline-flex">
            {t(PRIMARY_CTA.label)}
          </LocaleLink>
          <MobileNavigation />
        </div>
      </div>
    </header>
  );
}
