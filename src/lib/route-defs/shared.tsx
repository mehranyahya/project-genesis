import { useRouterState } from "@tanstack/react-router";

import { canonicalHref } from "@/lib/canonical";
import { LOCALES, localizeRawPath, type Locale } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";
import { allowsIndexing, restrictRobots } from "@/lib/seo-indexing";
import { staticRouteAvailability, type LoaderMatch } from "@/lib/i18n/route-availability";

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
export function localizedLinks(
  basePath: string,
  locale: Locale,
  translationLocales: readonly Locale[] = LOCALES,
): HeadLink[] {
  const links: HeadLink[] = [
    { rel: "canonical", href: canonicalHref(localizeRawPath(basePath, locale)) },
  ];
  if (!translationLocales.includes(locale)) return links;
  for (const alternate of LOCALES) {
    if (!translationLocales.includes(alternate)) continue;
    links.push({
      rel: "alternate",
      hrefLang: alternate,
      href: canonicalHref(localizeRawPath(basePath, alternate)),
    });
  }
  if (translationLocales.includes("fa")) {
    links.push({
      rel: "alternate",
      hrefLang: "x-default",
      href: canonicalHref(localizeRawPath(basePath, "fa")),
    });
  }
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
  readonly translationLocales?: readonly Locale[];
  readonly ogType?: "website" | "article";
}

export function localizedHead({
  locale,
  basePath,
  title,
  description,
  robots,
  rawTitle,
  rawDescription,
  translationLocales,
  ogType = "website",
}: LocalizedHeadInput) {
  const resolvedTitle = rawTitle ?? translate(locale, title);
  const resolvedDescription =
    rawDescription ?? (description ? translate(locale, description) : null);
  const links = localizedLinks(basePath, locale, allowsIndexing(robots) ? translationLocales : []);
  const canonical = links[0]!.href;
  return {
    meta: [
      { title: resolvedTitle },
      ...(resolvedDescription ? [{ name: "description", content: resolvedDescription }] : []),
      { property: "og:title", content: resolvedTitle },
      { property: "og:type", content: ogType },
      { property: "og:locale", content: locale === "fa" ? "fa_IR" : "en_US" },
      ...(canonical.startsWith("https:") ? [{ property: "og:url", content: canonical }] : []),
      ...(resolvedDescription
        ? [{ property: "og:description", content: resolvedDescription }]
        : []),
      ...(robots ? [{ name: "robots", content: robots }] : []),
    ],
    links,
  };
}

export interface HeadMatchState {
  readonly status?: string;
  readonly globalNotFound?: boolean;
  readonly _notFound?: boolean;
}
export function isUnavailableHeadMatch(match: HeadMatchState | undefined): boolean {
  return (
    match?.globalNotFound === true ||
    match?._notFound === true ||
    match?.status === "notFound" ||
    match?.status === "error"
  );
}
/** A failed lookup is not a second canonical publication of its catalogue. */
export function unavailableHead() {
  return { meta: [{ name: "robots", content: "noindex,follow" }], links: [], scripts: [] };
}

export interface AvailabilityHeadContext {
  readonly matches?: readonly LoaderMatch[];
  readonly loaderData?: unknown;
}
export interface AvailabilityLoaderContext {
  readonly parentMatchPromise?: Promise<LoaderMatch>;
}
/** TanStack's head.matches may still carry pre-load snapshots on first SSR. */
export async function loadStaticIndexableLocales(
  ctx: AvailabilityLoaderContext,
  path: string,
): Promise<readonly Locale[]> {
  const parent = await ctx.parentMatchPromise;
  return staticRouteAvailability(parent ? [parent] : undefined, path).indexableLocales;
}
/** Root carries the same small static-route policy that the sitemap consumes. */
export function availableStaticHead(input: LocalizedHeadInput, ctx: AvailabilityHeadContext) {
  const data = ctx.loaderData;
  const locales =
    data !== null && typeof data === "object" && "indexableLocales" in data
      ? data.indexableLocales
      : undefined;
  const available = Array.isArray(locales)
    ? LOCALES.filter((locale) => locales.includes(locale))
    : staticRouteAvailability(ctx.matches, input.basePath).indexableLocales;
  return localizedHead({
    ...input,
    robots: restrictRobots(input.robots, available.includes(input.locale)),
    translationLocales: available,
  });
}
