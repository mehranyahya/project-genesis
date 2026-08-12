/**
 * Locale contract for the bilingual public site.
 *
 * Persian is the default locale and is served without a URL prefix.
 * English is served under the `/en` prefix. The URL is the single source of
 * truth for the active locale: there is no cookie, no storage, no header
 * negotiation and no automatic redirect.
 */

export const LOCALES = ["fa", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fa";

/** URL prefix of the non-default locale. */
export const EN_PREFIX = "/en";

export type TextDirection = "rtl" | "ltr";

const DIRECTION: Record<Locale, TextDirection> = { fa: "rtl", en: "ltr" };

/** HTML `lang` attribute value for a locale. */
export function htmlLang(locale: Locale): Locale {
  return locale;
}

/** HTML `dir` attribute value for a locale. */
export function htmlDir(locale: Locale): TextDirection {
  return DIRECTION[locale];
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Public routes that exist in both locales, expressed as Persian base paths. */
export const BASE_STATIC_PATHS = [
  "/",
  "/grave-stones",
  "/grave-stones/custom",
  "/portfolio",
  "/building-stone",
  "/stoneworks",
  "/guides",
  "/quote",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
] as const;

export const BASE_DYNAMIC_PATHS = ["/grave-stones/$slug", "/guides/$slug"] as const;

export type BaseStaticPath = (typeof BASE_STATIC_PATHS)[number];
export type BaseDynamicPath = (typeof BASE_DYNAMIC_PATHS)[number];
export type BasePath = BaseStaticPath | BaseDynamicPath;

type EnPath<T extends string> = T extends "/" ? "/en" : `/en${T}`;

export type LocalizedStaticPath = BaseStaticPath | EnPath<BaseStaticPath>;
export type LocalizedDynamicPath = BaseDynamicPath | EnPath<BaseDynamicPath>;
export type LocalizedPath = LocalizedStaticPath | LocalizedDynamicPath;

function normalizePathname(pathname: string): string {
  if (typeof pathname !== "string" || pathname === "") return "/";
  const withoutQuery = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (!withoutQuery.startsWith("/")) return `/${withoutQuery}`;
  return withoutQuery;
}

/** Route-derived locale. Only `/en` and `/en/...` are English. */
export function localeFromPathname(pathname: string): Locale {
  const path = normalizePathname(pathname);
  if (path === EN_PREFIX || path.startsWith(`${EN_PREFIX}/`)) return "en";
  return DEFAULT_LOCALE;
}

/** Strips the locale prefix, returning the shared Persian base path. */
export function basePathFromPathname(pathname: string): string {
  const path = normalizePathname(pathname);
  if (path === EN_PREFIX) return "/";
  if (path.startsWith(`${EN_PREFIX}/`)) {
    const rest = path.slice(EN_PREFIX.length);
    return rest === "" ? "/" : rest;
  }
  return path;
}

/** Adds (or removes) the locale prefix for a shared base path. */
export function localizePath<T extends BasePath>(path: T, locale: Locale): LocalizedPath {
  if (locale === DEFAULT_LOCALE) return path;
  return (path === "/" ? EN_PREFIX : `${EN_PREFIX}${path}`) as LocalizedPath;
}

/** Free-form variant used for canonical/hreflang computation. */
export function localizeRawPath(path: string, locale: Locale): string {
  const base = basePathFromPathname(path);
  if (locale === DEFAULT_LOCALE) return base;
  return base === "/" ? EN_PREFIX : `${EN_PREFIX}${base}`;
}

/** The equivalent path of the current location in the other locale. */
export function alternatePathname(pathname: string, target: Locale): string {
  return localizeRawPath(pathname, target);
}

export function otherLocale(locale: Locale): Locale {
  return locale === "fa" ? "en" : "fa";
}

const SAFE_SEARCH_KEYS = ["source", "reference"] as const;
const SAFE_REFERENCE = /^pf-[0-9]{4,}$/;

/**
 * Only the non-PII portfolio referral pair survives a language switch.
 * Anything else — including any free text — is dropped.
 */
export function safeSwitchSearch(
  search: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!search) return {};
  const source = search["source"];
  const reference = search["reference"];
  if (source !== "portfolio") return {};
  if (typeof reference !== "string" || !SAFE_REFERENCE.test(reference)) return {};
  const safe: Record<string, string> = { source: "portfolio", reference };
  for (const key of Object.keys(safe)) {
    if (!(SAFE_SEARCH_KEYS as readonly string[]).includes(key)) delete safe[key];
  }
  return safe;
}
