import { useRouterState } from "@tanstack/react-router";

import { useLocale, useT } from "@/lib/i18n/react";
import { LOCALES, type Locale } from "@/lib/i18n/locale";
import { resolveLanguageTarget } from "@/lib/i18n/language-target";

const LOCALE_LABEL: Record<Locale, string> = {
  fa: "فارسی",
  en: "English",
};

/**
 * Use the readable counterpart when it exists; otherwise offer the locale home.
 * Public enquiry selectors survive only an equivalent-route switch.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const active = useLocale();
  const t = useT();
  const location = useRouterState({ select: (state) => state.location });
  const matches = useRouterState({ select: (state) => state.matches });

  return (
    <nav aria-label={t("انتخاب زبان")} className={className}>
      <ul className="flex items-center gap-x-1">
        {LOCALES.map((locale: Locale) => {
          const target = resolveLanguageTarget(
            location.pathname,
            locale,
            location.search as Record<string, unknown> | undefined,
            matches,
          );
          const isActive = locale === active;
          return (
            <li key={locale}>
              <a
                href={target.href}
                hrefLang={locale}
                {...(target.isHomepageFallback
                  ? {
                      title: t("ترجمهٔ این صفحه آماده نیست؛ ورود به صفحهٔ اصلی این زبان"),
                      "aria-label": LOCALE_LABEL[locale] + ": " + t("ورود به صفحهٔ اصلی این زبان"),
                    }
                  : {})}
                {...(isActive ? { "aria-current": "true" as const } : {})}
                className={`inline-flex min-h-12 min-w-12 items-center justify-center px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                  isActive ? "font-bold text-action-primary" : "text-text-secondary"
                }`}
              >
                <span lang={locale}>{LOCALE_LABEL[locale]}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
