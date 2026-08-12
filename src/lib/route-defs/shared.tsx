import { useRouterState } from "@tanstack/react-router";

import { canonicalHref } from "@/lib/canonical";
import { LOCALES, localizeRawPath, type Locale } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";

/**
 * Loader data of the currently matched leaf route.
 *
 * Locale variants of the same page share one options factory, so the page
 * components cannot reference a single `Route` object. This hook reads the
 * leaf match instead, which is the same value `Route.useLoaderData()` returns.
 */
export function useRouteData<T>(): T {
  const data = useRouterState({
    select: (state) => state.matches[state.matches.length - 1]?.loaderData as unknown,
    structuralSharing: false,
  });
  return data as T;
}

export interface HeadLink {
  readonly rel: string;
  readonly href: string;
  readonly hrefLang?: string;
}

/** Canonical plus reciprocal hreflang alternates for one shared base path. */
export function localizedLinks(basePath: string, locale: Locale): HeadLink[] {
  const links: HeadLink[] = [
    { rel: "canonical", href: canonicalHref(localizeRawPath(basePath, locale)) },
  ];
  for (const alternate of LOCALES) {
    links.push({
      rel: "alternate",
      hrefLang: alternate,
      href: canonicalHref(localizeRawPath(basePath, alternate)),
    });
  }
  links.push({ rel: "alternate", hrefLang: "x-default", href: canonicalHref(basePath) });
  return links;
}

export interface LocalizedHeadInput {
  readonly locale: Locale;
  readonly basePath: string;
  /** Persian source string used as the translation key. */
  readonly title: string;
  readonly description?: string | null;
  readonly robots?: string | null;
  /** Already-localized title, used for adapter-provided content. */
  readonly rawTitle?: string | null;
  readonly rawDescription?: string | null;
}

export function localizedHead({
  locale,
  basePath,
  title,
  description,
  robots,
  rawTitle,
  rawDescription,
}: LocalizedHeadInput) {
  const resolvedTitle = rawTitle ?? translate(locale, title);
  const resolvedDescription =
    rawDescription ?? (description ? translate(locale, description) : null);
  return {
    meta: [
      { title: resolvedTitle },
      ...(resolvedDescription ? [{ name: "description", content: resolvedDescription }] : []),
      { property: "og:title", content: resolvedTitle },
      ...(resolvedDescription
        ? [{ property: "og:description", content: resolvedDescription }]
        : []),
      ...(robots ? [{ name: "robots", content: robots }] : []),
    ],
    links: localizedLinks(basePath, locale),
  };
}
