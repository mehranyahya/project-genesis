/**
 * Pure home view-model. Editorial media must be explicitly selected from
 * approved adapter DTOs; a memorial product never becomes the brand hero.
 */
import type { Guide, Media, PortfolioItem } from "./content/types";
import { normalizePortfolioReference } from "./portfolio-reference";

export const HOME_SERVICE_KEYS = ["memorial", "architectural", "bespoke"] as const;
export type HomeServiceKey = (typeof HOME_SERVICE_KEYS)[number];

export interface HomeEditorialSelection {
  readonly hero?: Media | null;
  readonly heroMobile?: Media | null;
  readonly services?: Partial<Record<HomeServiceKey, Media>>;
  /** Public, non-sensitive references; one explicitly chosen work per service. */
  readonly projects?: Partial<Record<HomeServiceKey, string>>;
}

export interface HomeProjectItem {
  readonly service: HomeServiceKey;
  readonly publicReferenceId: string;
  readonly summary: string | null;
  readonly media: Media;
}

export interface HomeGuideItem {
  readonly slug: string;
  readonly title: string;
  readonly summary: string | null;
}

export interface HomeViewModel {
  readonly heroMedia: Media | null;
  readonly heroMobileMedia: Media | null;
  readonly serviceMedia: Readonly<Record<HomeServiceKey, Media | null>>;
  readonly projects: readonly HomeProjectItem[];
  readonly showPortfolio: boolean;
  readonly guide: HomeGuideItem | null;
  readonly showGuide: boolean;
}

export interface HomeAdapterResult {
  readonly portfolioItems: readonly PortfolioItem[];
  readonly guides: readonly Guide[];
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildHomeViewModel(
  input: HomeAdapterResult,
  selection: HomeEditorialSelection = {},
): HomeViewModel {
  const projects: HomeProjectItem[] = [];
  const used = new Set<string>();
  for (const service of HOME_SERVICE_KEYS) {
    const reference = normalizePortfolioReference(selection.projects?.[service]);
    const item = input.portfolioItems.find(
      (candidate) => candidate.publicReferenceId === reference,
    );
    if (!reference || used.has(reference) || !item?.media[0]) continue;
    used.add(reference);
    projects.push({
      service,
      publicReferenceId: reference,
      summary: cleanText(item.summary),
      media: item.media[0],
    });
  }

  // Never publish a lopsided "selected work" section from unclassified content.
  const showPortfolio = projects.length === HOME_SERVICE_KEYS.length;
  const allServiceMedia = HOME_SERVICE_KEYS.every((key) => selection.services?.[key]);
  const validGuide = input.guides.find((guide) => cleanText(guide.slug) && cleanText(guide.title));
  const guide = validGuide
    ? {
        slug: validGuide.slug,
        title: validGuide.title,
        summary: cleanText(validGuide.summary),
      }
    : null;

  return {
    heroMedia: selection.hero ?? null,
    heroMobileMedia: selection.hero ? (selection.heroMobile ?? null) : null,
    serviceMedia: {
      memorial: allServiceMedia ? (selection.services?.memorial ?? null) : null,
      architectural: allServiceMedia ? (selection.services?.architectural ?? null) : null,
      bespoke: allServiceMedia ? (selection.services?.bespoke ?? null) : null,
    },
    projects: showPortfolio ? projects : [],
    showPortfolio,
    guide,
    showGuide: guide !== null,
  };
}
