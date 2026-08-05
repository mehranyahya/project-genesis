/**
 * Portfolio public-reference helper.
 *
 * Only an exact `publicReferenceId` present in the official adapter output is
 * accepted. Captions, media keys and arbitrary queries never leave this module.
 */

import type { PortfolioItem } from "./content/types";

export const PORTFOLIO_REFERENCE_PATTERN = /^pf-[0-9]{4,}$/;

/** Trims the outer whitespace and validates the public pattern. */
export function normalizePortfolioReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return PORTFOLIO_REFERENCE_PATTERN.test(trimmed) ? trimmed : null;
}

/** Returns the first adapter item whose public reference matches exactly. */
export function findPortfolioReference(
  items: readonly PortfolioItem[] | null | undefined,
  value: unknown,
): string | null {
  const candidate = normalizePortfolioReference(value);
  if (candidate === null) return null;
  for (const item of items ?? []) {
    if (item?.publicReferenceId === candidate) return candidate;
  }
  return null;
}

/** The single referral destination allowed from the portfolio surface. */
export function buildQuoteReferralPath(publicReferenceId: string): string | null {
  const reference = normalizePortfolioReference(publicReferenceId);
  if (reference === null) return null;
  return `/quote?source=portfolio&reference=${encodeURIComponent(reference)}`;
}
