/**
 * Pure, side-effect free portfolio view-model.
 *
 * Consumes official adapter output only. Media is a publication gate, never a
 * rendered asset: media keys, captions and consent references never leave this
 * module. Inputs are never mutated.
 */

import type { GraveStoneSizeCode, PortfolioItem } from "./content/types";
import { buildQuoteReferralPath, normalizePortfolioReference } from "./portfolio-reference";
import { SIZE_LABELS } from "./product-detail";

export interface PortfolioCard {
  publicReferenceId: string;
  quotePath: string;
  stoneCode: string | null;
  sizeCode: GraveStoneSizeCode | null;
  sizeLabel: string | null;
  summary: string | null;
}

/** Trims a possible string; empty or non-string becomes null. */
function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** True when at least one media entry is privacy-cleared and fully described. */
function hasApprovedPublicMedia(item: PortfolioItem): boolean {
  for (const media of item.media ?? []) {
    if (!media) continue;
    if (media.privacyCleared !== true) continue;
    if (cleanText(media.consentReference) === null) continue;
    if (cleanText(media.mediaKey) === null) continue;
    if (cleanText(media.alt) === null) continue;
    return true;
  }
  return false;
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
    if (!hasApprovedPublicMedia(item)) continue;

    seen.add(reference);

    const sizeCode = resolveSize(item.sizeCode);

    cards.push({
      publicReferenceId: reference,
      quotePath,
      stoneCode: cleanText(item.stoneCode),
      sizeCode,
      sizeLabel: sizeCode === null ? null : SIZE_LABELS[sizeCode],
      summary: cleanText(item.summary),
    });
  }

  return cards;
}
