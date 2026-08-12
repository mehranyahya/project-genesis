import { DEFAULT_LOCALE, type Locale } from "./locale";
import { catalogMessages } from "./messages/catalog";
import { contentMessages } from "./messages/content";
import { formsMessages } from "./messages/forms";
import { funnelMessages } from "./messages/funnel";
import { homeMessages } from "./messages/home";
import { layoutMessages } from "./messages/layout";
import { metaMessages } from "./messages/meta";
import { productMessages } from "./messages/product";

export const MESSAGES = {
  fa: {
    ...layoutMessages.fa,
    ...metaMessages.fa,
    ...homeMessages.fa,
    ...catalogMessages.fa,
    ...productMessages.fa,
    ...funnelMessages.fa,
    ...formsMessages.fa,
    ...contentMessages.fa,
  },
  en: {
    ...layoutMessages.en,
    ...metaMessages.en,
    ...homeMessages.en,
    ...catalogMessages.en,
    ...productMessages.en,
    ...funnelMessages.en,
    ...formsMessages.en,
    ...contentMessages.en,
  },
} as const;

export type MessageKey = keyof (typeof MESSAGES)["fa"];

/**
 * Resolves a message for a locale. English always has a professional string of
 * its own; the Persian entry is the last-resort fallback for a key that a
 * locale bundle is still missing, never a Persian string rendered by design.
 */
export function translate(locale: Locale, key: MessageKey): string {
  const bundle = MESSAGES[locale] as Record<string, string | undefined>;
  const value = bundle[key];
  if (typeof value === "string" && value !== "") return value;
  return (MESSAGES[DEFAULT_LOCALE] as Record<string, string>)[key] ?? key;
}

export type Translator = (key: MessageKey) => string;

export function translatorFor(locale: Locale): Translator {
  return (key) => translate(locale, key);
}
