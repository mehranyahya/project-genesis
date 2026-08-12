import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  DEFAULT_LOCALE,
  localizePath,
  type BaseDynamicPath,
  type BaseStaticPath,
  type Locale,
  type LocalizedDynamicPath,
  type LocalizedStaticPath,
} from "./locale";
import { translatorFor, type MessageKey, type Translator } from "./messages";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * Locale is derived from the route, never from storage or headers.
 * The provider exists so that server rendering and unit rendering share the
 * same value without every component reaching into the router.
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useTranslator(): Translator {
  const locale = useLocale();
  return useMemo(() => translatorFor(locale), [locale]);
}

/** Shorthand: `const t = useT(); t("nav.guides")`. */
export function useT(): Translator {
  return useTranslator();
}

export function useMessage(key: MessageKey): string {
  return useTranslator()(key);
}

/** Current pathname, safe to call inside the router tree. */
export function useRoutePathname(): string {
  return useRouterState({ select: (state) => state.location.pathname });
}

export function useStaticPath(path: BaseStaticPath): LocalizedStaticPath {
  const locale = useLocale();
  return localizePath(path, locale) as LocalizedStaticPath;
}

export function useDynamicPath(path: BaseDynamicPath): LocalizedDynamicPath {
  const locale = useLocale();
  return localizePath(path, locale) as LocalizedDynamicPath;
}

/**
 * Locale-aware link.
 *
 * `to` is the shared Persian base path; the active locale decides whether the
 * `/en` prefix is added. Dynamic segments keep working through `params`.
 */
export function LocaleLink({
  to,
  params,
  children,
  ...rest
}: {
  to: BaseStaticPath | BaseDynamicPath;
  params?: Record<string, string>;
  children: ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "to" | "params" | "children">) {
  const locale = useLocale();
  const target = localizePath(to, locale);
  const AnyLink = Link as unknown as React.ComponentType<Record<string, unknown>>;
  return (
    <AnyLink to={target} {...(params ? { params } : {})} {...rest}>
      {children}
    </AnyLink>
  );
}
