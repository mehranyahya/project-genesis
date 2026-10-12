import { DEFAULT_LOCALE, isLocale, type Locale } from "../i18n/locale";
import { PAGE_SLUGS, type PageSlug } from "./types";

const SLUGS = new Set<string>(PAGE_SLUGS);

export function validatePageLookup(input: unknown): { slug: PageSlug; locale: Locale } {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("Invalid page lookup");
  const raw = input as Record<string, unknown>;
  const slug = raw["slug"],
    locale = raw["locale"] === undefined ? DEFAULT_LOCALE : raw["locale"];
  if (typeof slug !== "string" || !SLUGS.has(slug)) throw new Error("Invalid page slug");
  if (!isLocale(locale)) throw new Error("Invalid page locale");
  return { slug: slug as PageSlug, locale };
}
