import { useRouterState } from "@tanstack/react-router";

import { useLocale, useT } from "@/lib/i18n/react";
import { LOCALES, alternatePathname, safeSwitchSearch, type Locale } from "@/lib/i18n/locale";

const LABEL_KEY = {
  fa: "layout.languageFa",
  en: "layout.languageEn",
} as const;

function withSafeSearch(path: string, search: Record<string, unknown> | undefined): string {
  const safe = safeSwitchSearch(search);
  const entries = Object.entries(safe);
  if (entries.length === 0) return path;
  const query = new URLSearchParams(entries).toString();
  return `${path}?${query}`;
}

/**
 * Equivalent-route language switcher.
 *
 * The target is the same route in the other locale — dynamic slugs stay
 * stable, and only the non-PII portfolio referral pair survives the switch.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const active = useLocale();
  const t = useT();
  const location = useRouterState({ select: (state) => state.location });

  return (
    <nav aria-label={t("layout.languageSwitcher")} className={className}>
      <ul className="flex items-center gap-x-1">
        {LOCALES.map((locale: Locale) => {
          const href = withSafeSearch(
            alternatePathname(location.pathname, locale),
            location.search as Record<string, unknown> | undefined,
          );
          const isActive = locale === active;
          return (
            <li key={locale}>
              <a
                href={href}
                hrefLang={locale}
                lang={locale}
                {...(isActive ? { "aria-current": "true" as const } : {})}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                  isActive ? "font-bold text-action-primary" : "text-text-secondary"
                }`}
              >
                {t(LABEL_KEY[locale])}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
