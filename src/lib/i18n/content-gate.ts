import { DEFAULT_LOCALE, isLocale, type Locale } from "./locale";

/**
 * Content safety gate.
 *
 * Editorial content produced by the content adapters is Persian unless it
 * declares its own locale. English routes must never render Persian
 * operational copy, so content that does not belong to the active locale is
 * treated as absent and the surrounding section is omitted entirely.
 */
export interface LocalizedContent {
  readonly locale?: string | null;
}

export function contentLocale(value: LocalizedContent | null | undefined): Locale {
  const declared = value?.locale;
  return isLocale(declared) ? declared : DEFAULT_LOCALE;
}

export function isContentForLocale(
  value: LocalizedContent | null | undefined,
  locale: Locale,
): boolean {
  if (value === null || value === undefined) return false;
  return contentLocale(value) === locale;
}

/** Returns the value when it belongs to the locale, otherwise `null`. */
export function contentForLocale<T extends LocalizedContent>(
  value: T | null | undefined,
  locale: Locale,
): T | null {
  return isContentForLocale(value, locale) ? (value as T) : null;
}

/** List variant of {@link contentForLocale}. */
export function contentListForLocale<T extends LocalizedContent>(
  values: readonly T[] | null | undefined,
  locale: Locale,
): T[] {
  if (!values) return [];
  return values.filter((value) => isContentForLocale(value, locale));
}

/**
 * Site record narrowed to one locale.
 *
 * Locale-neutral values (phone, WhatsApp/Telegram handles, links, Latin name)
 * always survive. Prose written in another language — display name, address,
 * working hours — is dropped rather than leaked into the other locale.
 */
export function siteForLocale<
  T extends LocalizedContent & {
    displayName: string;
    latinName: string;
    address: string | null;
    workingHours: string | null;
  },
>(site: T | null | undefined, locale: Locale): T | null {
  if (!site) return null;
  if (isContentForLocale(site, locale)) return site;
  return {
    ...site,
    displayName: locale === DEFAULT_LOCALE ? site.displayName : site.latinName,
    address: null,
    workingHours: null,
  };
}
