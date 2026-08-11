/**
 * Pure, side-effect free portfolio view-model.
 * Consumes only the sanitized public content artifact; private media keys and
 * consent records are build-only and cannot enter this model.
 */

import type { GraveStoneSizeCode, Media, PortfolioItem } from "./content/types";
import { buildQuoteReferralPath, normalizePortfolioReference } from "./portfolio-reference";
import { SIZE_LABELS } from "./product-detail";

export interface PortfolioCard {
  publicReferenceId: string;
  quotePath: string;
  media: Media;
  stoneCode: string | null;
  sizeCode: GraveStoneSizeCode | null;
  sizeLabel: string | null;
  summary: string | null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function resolveSize(value: unknown): GraveStoneSizeCode | null {
  if (typeof value !== "string") return null;
  return value in SIZE_LABELS ? (value as GraveStoneSizeCode) : null;
}

/** Builds the ordered, deduplicated, privacy-safe portfolio card model. */
export function buildPortfolioModel(
  items: readonly PortfolioItem[] | null | undefined,
): PortfolioCard[] {
  const cards: PortfolioCard[] = [];
  const seen = new Set<string>();

  for (const item of items ?? []) {
    if (!item) continue;

    const reference = normalizePortfolioReference(item.publicReferenceId);
    if (reference === null) continue;

    const quotePath = buildQuoteReferralPath(reference);
    if (quotePath === null) continue;

    if (seen.has(reference)) continue;
    const media = item.media[0] ?? null;
    if (media === null) continue;

    seen.add(reference);
    const sizeCode = resolveSize(item.sizeCode);

    cards.push({
      publicReferenceId: reference,
      quotePath,
      media,
      stoneCode: cleanText(item.stoneCode),
      sizeCode,
      sizeLabel: sizeCode === null ? null : SIZE_LABELS[sizeCode],
      summary: cleanText(item.summary),
    });
  }

  return cards;
}
