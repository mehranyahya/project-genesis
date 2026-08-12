/**
 * Message-group helper. Every group must provide the exact same keys in both
 * locales; the type parameter derives the English key set from the Persian one,
 * so a missing or extra English string is a compile error.
 */
export interface MessageGroup<T extends Record<string, string>> {
  readonly fa: T;
  readonly en: { readonly [K in keyof T]: string };
}

export function defineMessages<T extends Record<string, string>>(
  group: MessageGroup<T>,
): MessageGroup<T> {
  return group;
}
