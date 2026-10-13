import { DEFAULT_LOCALE, isLocale, type Locale } from "../i18n/locale";

export function validateLocaleQuery(input: unknown): { locale: Locale } {
  if (input === undefined) return { locale: DEFAULT_LOCALE };
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid locale query");
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((key) => key !== "locale")) throw new Error("Invalid locale query");
  const locale = data["locale"] === undefined ? DEFAULT_LOCALE : data["locale"];
  if (!isLocale(locale)) throw new Error("Invalid locale query");
  return { locale };
}
