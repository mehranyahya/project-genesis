import type { HomeEditorialReferences } from "./home-editorial";
import type { Locale } from "./i18n/locale";

/**
 * Fill only after approval, using public pf- references and asset hash IDs
 * from the official portfolio adapter. Each locale is selected independently.
 * Missing translations stay absent; do not insert example IDs or raw media.
 */
export const HOME_EDITORIAL_REFERENCES: Readonly<Record<Locale, HomeEditorialReferences>> =
  Object.freeze({ fa: Object.freeze({}), en: Object.freeze({}) });
