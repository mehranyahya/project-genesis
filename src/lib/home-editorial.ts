import type { Guide, Media, PortfolioItem } from "./content/types";
import { buildHomeViewModel, HOME_SERVICE_KEYS } from "./home";
import type { HomeEditorialSelection, HomeServiceKey, HomeViewModel } from "./home";
import { contentListForLocale } from "./i18n/content-gate";
import type { Locale } from "./i18n/locale";
import { normalizePortfolioReference } from "./portfolio-reference";

/** References identify approved public DTOs, never raw URLs or Storage objects. */
export interface HomeMediaReference {
  readonly publicReferenceId: string;
  /** Public 24-character hash directory from an already generated Media DTO. */
  readonly assetId: string;
}

export interface HomeEditorialReferences {
  readonly hero?: HomeMediaReference;
  readonly heroMobile?: HomeMediaReference;
  readonly services?: Partial<Record<HomeServiceKey, HomeMediaReference>>;
  readonly projects?: Partial<Record<HomeServiceKey, string>>;
}

function validMediaReference(reference: HomeMediaReference | undefined): boolean {
  return (
    !!normalizePortfolioReference(reference?.publicReferenceId) &&
    /^[a-f0-9]{24}$/.test(reference?.assetId ?? "")
  );
}

/** No catalogue call for the unconfigured home or an orphaned mobile crop. */
export function homeNeedsPortfolio(references: HomeEditorialReferences): boolean {
  return (
    validMediaReference(references.hero) ||
    HOME_SERVICE_KEYS.some((key) => validMediaReference(references.services?.[key])) ||
    HOME_SERVICE_KEYS.some((key) => !!normalizePortfolioReference(references.projects?.[key]))
  );
}

export function resolveHomeEditorialSelection(
  items: readonly PortfolioItem[],
  locale: Locale,
  references: HomeEditorialReferences,
): HomeEditorialSelection {
  const localized = contentListForLocale(items, locale);
  function media(reference: HomeMediaReference | undefined): Media | null {
    if (!validMediaReference(reference)) return null;
    const id = normalizePortfolioReference(reference?.publicReferenceId);
    const item = localized.find((candidate) => candidate.publicReferenceId === id);
    return (
      item?.media.find((candidate) => {
        const asset = /^\/media\/([a-f0-9]{24})\/[a-f0-9]{16}-1280w\.webp$/.exec(candidate.src);
        return asset?.[1] === reference?.assetId;
      }) ?? null
    );
  }
  const services: Partial<Record<HomeServiceKey, Media>> = {};
  for (const key of HOME_SERVICE_KEYS) {
    const selected = media(references.services?.[key]);
    if (selected) services[key] = selected;
  }
  return {
    hero: media(references.hero),
    heroMobile: media(references.heroMobile),
    services,
    projects: references.projects ?? {},
  };
}

export interface HomeContentReaders {
  readonly getGuides: () => Promise<Guide[]>;
  readonly getPortfolioItems: () => Promise<PortfolioItem[]>;
}

/** The route supplies only the official adapters; filtering precedes selection. */
export async function loadHomeViewModel(
  locale: Locale,
  references: HomeEditorialReferences,
  readers: HomeContentReaders,
): Promise<HomeViewModel> {
  const [guides, portfolioItems] = await Promise.all([
    readers.getGuides(),
    homeNeedsPortfolio(references) ? readers.getPortfolioItems() : Promise.resolve([]),
  ]);
  return buildHomeViewModel(
    {
      guides: contentListForLocale(guides, locale),
      portfolioItems: contentListForLocale(portfolioItems, locale),
    },
    resolveHomeEditorialSelection(portfolioItems, locale, references),
  );
}
