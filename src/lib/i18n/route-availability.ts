import {
  BASE_STATIC_PATHS,
  LOCALES,
  basePathFromPathname,
  type BaseStaticPath,
  type Locale,
} from "./locale";

export interface RouteAvailability {
  readonly readableLocales: readonly Locale[];
  readonly indexableLocales: readonly Locale[];
}
export type PublicRouteAvailability = Readonly<Record<BaseStaticPath, RouteAvailability>>;
export interface LoaderMatch {
  readonly routeId: string;
  readonly loaderData?: unknown;
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function readableLocalesFromData(value: unknown): Locale[] {
  const locales = record(value)?.["readableLocales"];
  return Array.isArray(locales) ? LOCALES.filter((locale) => locales.includes(locale)) : [];
}
export function staticRouteAvailability(
  matches: readonly LoaderMatch[] | undefined,
  pathname: string,
): RouteAvailability {
  const root = matches?.find((match) => match.routeId === "__root__");
  const routes = record(record(root?.loaderData)?.["routeAvailability"]);
  const value = record(routes?.[basePathFromPathname(pathname)]);
  const indexable = value?.["indexableLocales"];
  return {
    readableLocales: readableLocalesFromData(value),
    indexableLocales: Array.isArray(indexable)
      ? LOCALES.filter((locale) => indexable.includes(locale))
      : [],
  };
}
export function isStaticPublicPath(path: string): path is BaseStaticPath {
  return (BASE_STATIC_PATHS as readonly string[]).includes(path);
}
