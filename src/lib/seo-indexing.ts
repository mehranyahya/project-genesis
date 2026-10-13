/** A page-level exclusion must also exclude its search language annotations. */
export function allowsIndexing(robots: string | null | undefined): boolean {
  return robots == null || !/\b(?:noindex|none)\b/i.test(robots);
}

/** Restrict a missing/noncanonical page without relaxing an owner's nofollow rule. */
export function restrictRobots(
  robots: string | null | undefined,
  hasIndexableContent: boolean,
): string | null {
  return hasIndexableContent || !allowsIndexing(robots) ? (robots ?? null) : "noindex,follow";
}
