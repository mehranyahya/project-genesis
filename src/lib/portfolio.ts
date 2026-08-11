/**
 * Pure, side-effect free portfolio view-model.
 *
 * Consumes official adapter output only. Every asset is already same-origin,
 * hash-addressed and stripped of internal publication metadata at build time.
 */

import type { GraveStoneSizeCode, PortfolioItem } from "./content/types";
import type { Media } from "./content/types";
import { isPublicMedia } from "./content/media";
import { buildQuoteReferralPath, normalizePortfolioReference } from "./portfolio-reference";
import { SIZE_LABELS } from "./product-detail";

export interface PortfolioCard {
  publicReferenceId: string;
  quotePath: string;
  stoneCode: string | null;
  sizeCode: GraveStoneSizeCode | null;
  sizeLabel: string | null;
  summary: string | null;
  media: Media;
}

/** Trims a possible string; empty or non-string becomes null. */
function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** True when at least one approved public media entry is fully described. */
function firstApprovedPublicMedia(item: PortfolioItem): Media | null {
  return (item.media ?? []).find((media) => isPublicMedia(media)) ?? null;
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
    const media = firstApprovedPublicMedia(item);
    if (media === null) continue;

    seen.add(reference);

    const sizeCode = resolveSize(item.sizeCode);

    cards.push({
      publicReferenceId: reference,
      quotePath,
      stoneCode: cleanText(item.stoneCode),
      sizeCode,
      sizeLabel: sizeCode === null ? null : SIZE_LABELS[sizeCode],
      summary: cleanText(item.summary),
      media,
    });
  }

  return cards;
}
