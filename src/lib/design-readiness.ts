import type { Guide, Page, PortfolioItem, Product, Site } from "./content/types";
import { isCatalogVersion } from "./content/types";
import { buildHomeViewModel, HOME_SERVICE_KEYS } from "./home";
import type { HomeEditorialReferences } from "./home-editorial";
import { resolveHomeEditorialSelection } from "./home-editorial";
import { contentListForLocale } from "./i18n/content-gate";
import { LOCALES, type Locale } from "./i18n/locale";

export interface DesignReadinessInput {
  readonly generated: boolean;
  readonly catalogVersion: string | null;
  readonly products: readonly Product[];
  readonly portfolioItems: readonly PortfolioItem[];
  readonly site: Site | null;
  readonly pages: readonly Page[];
  readonly guides: readonly Guide[];
  readonly editorial: Readonly<Record<Locale, HomeEditorialReferences>>;
  readonly termsRelease: { readonly version: string; readonly currentContentHash: string } | null;
  readonly capabilities: { readonly englishSources: boolean; readonly guides: boolean };
}

interface ReadinessCheck {
  readonly key: string;
  readonly required: boolean;
  readonly status: "pass" | "blocked" | "deferred";
}

/** Counts and fixed labels only: never return content, contacts or media URLs. */
export function assessDesignReadiness(input: DesignReadinessInput) {
  const checks: ReadinessCheck[] = [];
  const check = (key: string, pass: boolean, required = true) => {
    checks.push({ key, required, status: pass ? "pass" : required ? "blocked" : "deferred" });
  };
  const products = input.products.filter((product) => product.isActive);
  check("structured_artifact", input.generated);
  check("catalog_version", !!input.catalogVersion && isCatalogVersion(input.catalogVersion));
  check("brand_names", !!input.site?.displayName.trim() && !!input.site?.latinName.trim());
  check(
    "contact_details",
    !!(input.site?.phone || input.site?.whatsappUrl || input.site?.telegram),
  );
  check("english_source_ingestion", input.capabilities.englishSources);
  check("guide_source_ingestion", input.capabilities.guides, false);

  const counts: Partial<
    Record<Locale, { products: number; portfolioItems: number; guides: number }>
  > = {};
  for (const locale of LOCALES) {
    const localizedProducts = contentListForLocale(products, locale);
    const portfolioItems = contentListForLocale(input.portfolioItems, locale);
    const guides = contentListForLocale(input.guides, locale);
    const pages = contentListForLocale(input.pages, locale);
    const model = buildHomeViewModel(
      { portfolioItems, guides },
      resolveHomeEditorialSelection(portfolioItems, locale, input.editorial[locale]),
    );
    counts[locale] = {
      products: localizedProducts.length,
      portfolioItems: portfolioItems.length,
      guides: guides.length,
    };
    check(
      `${locale}.product_media`,
      localizedProducts.length > 0 &&
        localizedProducts.every((product) => product.media.length > 0),
    );
    check(`${locale}.hero`, model.heroMedia !== null);
    check(`${locale}.hero_mobile`, model.heroMobileMedia !== null);
    check(
      `${locale}.service_images`,
      HOME_SERVICE_KEYS.every((key) => model.serviceMedia[key] !== null),
    );
    check(`${locale}.selected_projects`, model.showPortfolio);
    check(
      `${locale}.about_page`,
      pages.some((page) => page.slug === "about"),
    );
    check(
      `${locale}.building_stone_page`,
      pages.some((page) => page.slug === "building-stone"),
    );
    check(
      `${locale}.privacy_page`,
      pages.some((page) => page.slug === "privacy"),
    );
    const terms = pages.find((page) => page.slug === "terms");
    check(
      `${locale}.versioned_terms`,
      !!terms?.version &&
        /^[0-9a-f]{64}$/.test(terms.contentHash ?? "") &&
        terms.version === input.termsRelease?.version &&
        terms.contentHash === input.termsRelease?.currentContentHash,
    );
    check(`${locale}.home_guide`, model.showGuide, false);
  }

  return {
    scope: "committed-sanitized-artifacts",
    automaticChecksPass: checks.every((item) => !item.required || item.status === "pass"),
    // Content checks cannot accept a deployment or invent a visual/performance result.
    readyForPublication: false,
    counts,
    checks,
    manualChecks: [
      { key: "preview_visual_accessibility", status: "pending" },
      { key: "preview_real_media_performance", status: "pending" },
      { key: "preview_request_success", status: "pending" },
    ],
  } as const;
}
