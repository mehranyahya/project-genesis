import { validateLocaleQuery } from "./locale-query";
import type { Locale } from "../i18n/locale";

export interface SiteQuery {
  readonly locale: Locale;
  readonly includeRouteAvailability?: true;
}
export function validateSiteQuery(input: unknown): SiteQuery {
  if (input === undefined) return validateLocaleQuery(input);
  if (input === null || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid site query");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => key !== "locale" && key !== "includeRouteAvailability"))
    throw new Error("Invalid site query");
  const localeQuery = value["locale"] === undefined ? {} : { locale: value["locale"] };
  const query = validateLocaleQuery(localeQuery);
  const include = value["includeRouteAvailability"];
  if (include !== undefined && typeof include !== "boolean") throw new Error("Invalid site query");
  return include === true ? { ...query, includeRouteAvailability: true } : query;
}
