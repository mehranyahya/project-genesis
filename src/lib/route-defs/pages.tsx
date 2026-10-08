import { lazyRouteComponent, notFound } from "@tanstack/react-router";
import type { RouteComponent } from "@tanstack/react-router";

import {
  getCatalogVersion,
  getGuide,
  getGuides,
  getPage,
  getPortfolioItems,
  getProduct,
  getProducts,
  getSite,
} from "@/lib/content/adapters";
import { buildGraveStoneListModel } from "@/lib/grave-stone-list";
import { buildGuideDetailModel, buildGuideListModel } from "@/lib/guides";
import type { GuideDetailModel, GuideListItem } from "@/lib/guides";
import { buildHomeViewModel } from "@/lib/home";
import type { Locale } from "@/lib/i18n/locale";
import { contentForLocale, contentListForLocale, siteForLocale } from "@/lib/i18n/content-gate";
import { buildPortfolioModel } from "@/lib/portfolio";
import { findPortfolioReference, normalizePortfolioReference } from "@/lib/portfolio-reference";
import { buildProductDetailModel } from "@/lib/product-detail";
import { getRequestTermsDocument } from "@/lib/request-terms";
import { STONEWORKS_META_DESCRIPTION, STONEWORKS_META_TITLE } from "@/lib/stoneworks";
import { normalizeStoneworkCategory } from "@/lib/stonework-category";
import type { StoneworkCategoryId } from "@/lib/stonework-category";
import {
  buildContactPageModel,
  buildStaticPageModel,
  contentBlockedMeta,
} from "@/lib/static-pages";
import type { ContactPageModel, StaticPageModel } from "@/lib/static-pages";

import { localizedHead, localizedLinks } from "./shared";
import { HomeRoute } from "./views/home";

/* ------------------------------------------------------------------ home */

export function homeRouteOptions(locale: Locale) {
  return {
    head: () =>
      localizedHead({
        locale,
        basePath: "/",
        title: "سنگ طبیعی؛ سنگ مزار، سنگ ساختمانی و ساخت سفارشی",
        description:
          "بررسی خدمات سنگ مزار، سنگ ساختمانی و ساخت سفارشی؛ انتخاب مسیر و ثبت درخواست بررسی.",
      }),
    loader: async () => {
      const guides = await getGuides();
      return buildHomeViewModel({
        // Selected work is added with approved editorial references in the content phase.
        // Without that selection, fetching a catalogue contributes no home section.
        portfolioItems: [],
        guides: contentListForLocale(guides, locale),
      });
    },
    // Keep the small landing view critical: no extra chunk request before home hydration.
    component: HomeRoute,
  };
}

/* ------------------------------------------------------------ stoneworks */

/**
 * One shared factory for `/stoneworks` and `/en/stoneworks`.
 * The page is a pure catalogue of production categories: no adapter data,
 * no media and no amount.
 */
export function stoneworksRouteOptions(locale: Locale) {
  return {
    head: () =>
      localizedHead({
        locale,
        basePath: "/stoneworks",
        title: STONEWORKS_META_TITLE,
        description: STONEWORKS_META_DESCRIPTION,
      }),
    component: lazyRouteComponent(
      () => import("@/components/stoneworks/stoneworks-page"),
      "StoneworksPage",
    ),
  };
}

/* ---------------------------------------------------------- grave stones */

export function graveStoneListRouteOptions(locale: Locale) {
  return {
    head: () =>
      localizedHead({
        locale,
        basePath: "/grave-stones",
        title: "سنگ مزار",
        description: "فهرست مدل‌های سنگ مزار",
      }),
    loader: async () => buildGraveStoneListModel(contentListForLocale(await getProducts(), locale)),
    pendingComponent: lazyRouteComponent(
      () => import("@/components/grave-stones/grave-stone-list-states"),
      "GraveStoneListLoading",
    ),
    errorComponent: lazyRouteComponent(
      () => import("@/components/grave-stones/grave-stone-list-states"),
      "GraveStoneListError",
    ),
    component: lazyRouteComponent(() => import("./views/grave-stones"), "GraveStoneListRoute"),
  };
}

export function customFunnelRouteOptions(locale: Locale) {
  return {
    loader: async () => {
      const [products, catalogVersion, site, termsDocument] = await Promise.all([
        getProducts({ type: "simple" }),
        getCatalogVersion(),
        getSite(),
        getRequestTermsDocument(),
      ]);
      return {
        products: contentListForLocale(products, locale),
        catalogVersion: catalogVersion ?? null,
        site: siteForLocale(site, locale),
        termsDocument,
      };
    },
    head: () =>
      localizedHead({
        locale,
        basePath: "/grave-stones/custom",
        title: "سفارش سفارشی سنگ مزار",
        description: "مسیر ثبت سفارش سفارشی سنگ مزار",
      }),
    pendingComponent: lazyRouteComponent(
      () => import("@/components/custom-funnel/custom-funnel-states"),
      "CustomFunnelLoading",
    ),
    errorComponent: lazyRouteComponent(
      () => import("@/components/custom-funnel/custom-funnel-states"),
      "CustomFunnelError",
    ),
    component: lazyRouteComponent(() => import("./views/custom-funnel"), "CustomFunnelRoute"),
  };
}

const PRODUCT_DESCRIPTION = "جزئیات مدل سنگ مزار و ثبت درخواست بررسی سفارش.";

export function productDetailRouteOptions(locale: Locale) {
  return {
    loader: async ({ params }: { params: { slug: string } }) => {
      const [product, catalogVersion, site, termsDocument] = await Promise.all([
        getProduct(params.slug),
        getCatalogVersion(),
        getSite(),
        getRequestTermsDocument(),
      ]);

      const model = buildProductDetailModel(contentForLocale(product, locale), params.slug);
      if (model === null) throw notFound();

      return {
        model,
        catalogVersion: catalogVersion ?? null,
        site: siteForLocale(site, locale),
        termsDocument,
      };
    },
    head: (ctx: { loaderData?: ProductDetailData }) => {
      const data = ctx.loaderData;
      if (!data) {
        return localizedHead({
          locale,
          basePath: "/grave-stones",
          title: "جزئیات سنگ مزار",
          description: PRODUCT_DESCRIPTION,
          robots: "noindex",
        });
      }
      return {
        ...localizedHead({
          locale,
          basePath: "/grave-stones",
          title: "جزئیات سنگ مزار",
          rawTitle: data.model.title,
          rawDescription: data.model.summary ?? null,
          description: PRODUCT_DESCRIPTION,
        }),
        links: localizedLinks(`/grave-stones/${data.model.slug}`, locale),
      };
    },
    pendingComponent: lazyRouteComponent(
      () => import("@/components/product/product-detail-states"),
      "ProductDetailLoading",
    ),
    errorComponent: lazyRouteComponent(
      () => import("@/components/product/product-detail-states"),
      "ProductDetailError",
    ),
    component: lazyRouteComponent(() => import("./views/product"), "ProductDetailRoute"),
  };
}

export interface ProductDetailData {
  model: NonNullable<ReturnType<typeof buildProductDetailModel>>;
  catalogVersion: Awaited<ReturnType<typeof getCatalogVersion>> | null;
  site: Awaited<ReturnType<typeof getSite>> | null;
  termsDocument: Awaited<ReturnType<typeof getRequestTermsDocument>>;
}

/* ------------------------------------------------------------- portfolio */

export function portfolioRouteOptions(locale: Locale) {
  return {
    head: () =>
      localizedHead({
        locale,
        basePath: "/portfolio",
        title: "نمونه‌کارها",
        description: "نمونه‌کارهای اجراشدهٔ سنگ مزار",
      }),
    loader: async () =>
      buildPortfolioModel(contentListForLocale(await getPortfolioItems(), locale)),
    pendingComponent: lazyRouteComponent(
      () => import("@/components/portfolio/portfolio-states"),
      "PortfolioLoading",
    ),
    errorComponent: lazyRouteComponent(
      () => import("@/components/portfolio/portfolio-states"),
      "PortfolioError",
    ),
    component: lazyRouteComponent(() => import("./views/portfolio"), "PortfolioRoute"),
  };
}

/* -------------------------------------------------------- building stone */

export function buildingStoneRouteOptions(locale: Locale) {
  return {
    loader: async () => {
      const [site, termsDocument] = await Promise.all([getSite(), getRequestTermsDocument()]);
      return { site: siteForLocale(site, locale), termsDocument };
    },
    head: () =>
      localizedHead({
        locale,
        basePath: "/building-stone",
        title: "سنگ ساختمانی",
        description: "ثبت درخواست بررسی سنگ ساختمانی",
      }),
    component: lazyRouteComponent(() => import("./views/building-stone"), "BuildingStoneRoute"),
  };
}

/* ----------------------------------------------------------------- quote */

export interface QuoteSearch {
  readonly source?: "portfolio" | "stoneworks";
  readonly reference?: string;
  readonly category?: StoneworkCategoryId;
}

export function quoteRouteOptions(locale: Locale) {
  return {
    validateSearch: (search: Record<string, unknown>): QuoteSearch => {
      if (search["source"] === "stoneworks") {
        const category = normalizeStoneworkCategory(search["category"]);
        return category ? { source: "stoneworks", category } : {};
      }
      const reference = normalizePortfolioReference(search["reference"]);
      if (search["source"] !== "portfolio" || reference === null) return {};
      return { source: "portfolio", reference };
    },
    loaderDeps: ({ search }: { search: QuoteSearch }) => ({
      reference: search.reference ?? null,
      category: search.category ?? null,
    }),
    loader: async ({
      deps,
    }: {
      deps: { reference: string | null; category: StoneworkCategoryId | null };
    }) => {
      const [portfolioItems, site, termsDocument] = await Promise.all([
        deps.reference ? getPortfolioItems() : Promise.resolve([]),
        getSite(),
        getRequestTermsDocument(),
      ]);
      return {
        portfolioReferenceId: findPortfolioReference(
          contentListForLocale(portfolioItems, locale),
          deps.reference,
        ),
        stoneworkCategoryId: deps.category,
        site: siteForLocale(site, locale),
        termsDocument,
      };
    },
    head: () =>
      localizedHead({
        locale,
        basePath: "/quote",
        title: "ثبت درخواست بررسی",
        description: "ثبت درخواست بررسی سفارش سنگ",
      }),
    component: lazyRouteComponent(() => import("./views/quote"), "QuoteRoute"),
  };
}

/* ---------------------------------------------------------------- guides */

export function guideListRouteOptions(locale: Locale) {
  return {
    head: (ctx: { loaderData?: GuideListItem[] }) => {
      const hasContent = (ctx.loaderData?.length ?? 0) > 0;
      return localizedHead({
        locale,
        basePath: "/guides",
        title: "راهنماها",
        robots: hasContent ? null : "noindex",
      });
    },
    loader: async () => buildGuideListModel(contentListForLocale(await getGuides(), locale)),
    pendingComponent: lazyRouteComponent(
      () => import("@/components/guides/guides"),
      "GuidesLoading",
    ),
    errorComponent: lazyRouteComponent(() => import("@/components/guides/guides"), "GuideError"),
    component: lazyRouteComponent(() => import("./views/guide-list"), "GuideListRoute"),
  };
}

export function guideDetailRouteOptions(locale: Locale) {
  return {
    head: (ctx: { loaderData?: GuideDetailModel }) => {
      const guide = ctx.loaderData;
      if (!guide) {
        return {
          meta: [{ name: "robots", content: "noindex" }],
          links: localizedLinks("/guides", locale),
        };
      }
      return {
        ...localizedHead({
          locale,
          basePath: "/guides",
          title: "راهنماها",
          rawTitle: guide.metaTitle,
          rawDescription: guide.metaDescription ?? null,
        }),
        links: localizedLinks(guide.path, locale),
      };
    },
    loader: async ({ params }: { params: { slug: string } }) => {
      const guide = buildGuideDetailModel(contentForLocale(await getGuide(params.slug), locale));
      if (!guide) throw notFound();
      return guide;
    },
    pendingComponent: lazyRouteComponent(
      () => import("@/components/guides/guides"),
      "GuidesLoading",
    ),
    errorComponent: lazyRouteComponent(() => import("@/components/guides/guides"), "GuideError"),
    component: lazyRouteComponent(() => import("./views/guide-detail"), "GuideDetailRoute"),
  };
}

/* ------------------------------------------------- static and legal pages */

function staticPageHead(
  locale: Locale,
  basePath: string,
  page: StaticPageModel | null,
  fallbackTitle: string,
) {
  if (!page) return { meta: contentBlockedMeta() };
  return {
    ...localizedHead({
      locale,
      basePath,
      title: fallbackTitle,
      rawTitle: page.metaTitle,
      rawDescription: page.metaDescription ?? null,
      robots: page.robots,
    }),
    links: localizedLinks(page.canonicalPath ?? basePath, locale),
  };
}

function staticPageOptions(
  locale: Locale,
  basePath: string,
  slug: "about" | "privacy" | "terms",
  fallbackTitle: string,
  component: RouteComponent,
) {
  return {
    head: (ctx: { loaderData?: StaticPageModel | null }) =>
      staticPageHead(locale, basePath, ctx.loaderData ?? null, fallbackTitle),
    loader: async () => buildStaticPageModel(contentForLocale(await getPage(slug), locale), slug),
    component,
  };
}

export function aboutRouteOptions(locale: Locale) {
  return staticPageOptions(
    locale,
    "/about",
    "about",
    "درباره ما",
    lazyRouteComponent(() => import("./views/static"), "StaticPageRoute"),
  );
}

export function privacyRouteOptions(locale: Locale) {
  return staticPageOptions(
    locale,
    "/privacy",
    "privacy",
    "حریم خصوصی",
    lazyRouteComponent(() => import("./views/static"), "StaticPageRoute"),
  );
}

export function termsRouteOptions(locale: Locale) {
  return staticPageOptions(
    locale,
    "/terms",
    "terms",
    "شرایط استفاده",
    lazyRouteComponent(() => import("./views/static"), "StaticPageRoute"),
  );
}

export function contactRouteOptions(locale: Locale) {
  return {
    head: (ctx: { loaderData?: ContactPageModel }) =>
      staticPageHead(locale, "/contact", ctx.loaderData?.page ?? null, "تماس"),
    loader: async (): Promise<ContactPageModel> => {
      const [page, site] = await Promise.all([getPage("contact"), getSite()]);
      return buildContactPageModel(contentForLocale(page, locale), siteForLocale(site, locale));
    },
    component: lazyRouteComponent(() => import("./views/contact"), "ContactRoute"),
  };
}
