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

/** Locale-aware link for the static public routes. */
export function LocaleLink({
  to,
  children,
  ...rest
}: { to: BaseStaticPath | BaseDynamicPath; children: ReactNode } & Omit<
  React.ComponentProps<typeof Link>,
  "to" | "children"
>) {
  const locale = useLocale();
  const target = localizePath(to, locale);
  return (
    <Link to={target} {...rest}>
      {children}
    </Link>
  );
}
