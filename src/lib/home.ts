/** Home curation is explicit; memorial products never become the shared hero. */
import type { Guide, Media, PortfolioItem } from "./content/types";

export const HOME_SERVICES = ["grave_stone", "building_stone", "stoneworks"] as const;
export type HomeService = (typeof HOME_SERVICES)[number];

export interface HomeGuideItem {
  readonly slug: string;
  readonly title: string;
  readonly summary: string | null;
}

export interface HomeProject {
  readonly service: HomeService;
  readonly item: PortfolioItem;
}

/** Sanitized public media only. Unassigned editorial slots stay absent. */
export interface HomePresentation {
  readonly heroMedia?: Media | null;
  readonly serviceMedia?: Partial<Record<HomeService, Media>>;
  readonly projects?: readonly HomeProject[];
}

export interface HomeViewModel {
  readonly heroMedia: Media | null;
  readonly serviceMedia: Partial<Record<HomeService, Media>>;
  readonly projects: readonly HomeProject[];
  readonly showPortfolio: boolean;
  readonly guide: HomeGuideItem | null;
  readonly showGuide: boolean;
}

export interface HomeAdapterResult {
  readonly guides: readonly Guide[];
  readonly presentation?: HomePresentation;
}

function cleanText(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildHomeViewModel(input: HomeAdapterResult): HomeViewModel {
  const presentation = input.presentation;
  const projects = HOME_SERVICES.map((service) =>
    presentation?.projects?.find(
      (project) =>
        project.service === service &&
        cleanText(project.item.publicReferenceId) &&
        project.item.media.length > 0,
    ),
  );
  // A complete, explicitly curated three-service row is required.
  const completeProjects = projects.every((project) => project !== undefined)
    ? (projects as HomeProject[])
    : [];
  const distinct = new Set(completeProjects.map((project) => project.item.publicReferenceId));
  const balancedProjects = distinct.size === 3 ? completeProjects : [];
  const validGuide = input.guides.find((guide) => cleanText(guide.slug) && cleanText(guide.title));
  const guide = validGuide
    ? { slug: validGuide.slug, title: validGuide.title, summary: cleanText(validGuide.summary) }
    : null;

  return {
    heroMedia: presentation?.heroMedia ?? null,
    serviceMedia: presentation?.serviceMedia ?? {},
    projects: balancedProjects,
    showPortfolio: balancedProjects.length === 3,
    guide,
    showGuide: guide !== null,
  };
}
