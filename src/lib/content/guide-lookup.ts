import { DEFAULT_LOCALE, isLocale, type Locale } from "../i18n/locale";
import { isGuideSlug, MAX_GUIDES_PER_LOCALE } from "../../../scripts/guide-policy.mjs";

function object(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("Invalid guide lookup");
  return input as Record<string, unknown>;
}

function localeOf(raw: Record<string, unknown>): Locale {
  const locale = raw["locale"] === undefined ? DEFAULT_LOCALE : raw["locale"];
  if (!isLocale(locale)) throw new Error("Invalid guide locale");
  return locale;
}

export function validateGuideLookup(input: unknown): { slug: string; locale: Locale } {
  const raw = object(input);
  if (Object.keys(raw).some((key) => key !== "slug" && key !== "locale"))
    throw new Error("Invalid guide lookup");
  if (!isGuideSlug(raw["slug"])) throw new Error("Invalid guide slug");
  return { slug: raw["slug"], locale: localeOf(raw) };
}

export function validateGuideQuery(input: unknown): { locale: Locale; limit: number } {
  const raw = object(input);
  if (Object.keys(raw).some((key) => key !== "locale" && key !== "limit"))
    throw new Error("Invalid guide query");
  const limit = raw["limit"] === undefined ? MAX_GUIDES_PER_LOCALE : raw["limit"];
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_GUIDES_PER_LOCALE
  )
    throw new Error("Invalid guide limit");
  return { locale: localeOf(raw), limit };
}
