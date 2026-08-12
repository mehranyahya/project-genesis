import { DEFAULT_LOCALE, type Locale } from "./locale";
import { EN_MESSAGES, type MessageKey } from "./en";

export type { MessageKey };

export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * Message keys are the Persian source strings.
 *
 * Persian therefore renders the key itself, byte-for-byte, and English renders
 * the catalogue entry. Runtime values produced by the pure domain libraries are
 * already Persian source strings, so passing them through the translator is
 * enough to localize them — no key mapping table is required.
 */
export type Translator = (key: MessageKey | (string & {}), params?: MessageParams) => string;

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

export function formatMessage(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function translate(locale: Locale, key: string, params?: MessageParams): string {
  if (locale === DEFAULT_LOCALE) return formatMessage(key, params);
  const table = EN_MESSAGES as Record<string, string>;
  const translated = table[key];
  return formatMessage(translated ?? key, params);
}

export function translatorFor(locale: Locale): Translator {
  return (key, params) => translate(locale, key, params);
}
