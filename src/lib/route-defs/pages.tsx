import { notFound } from "@tanstack/react-router";

import { BuildingStonePage } from "@/components/building-stone/building-stone-page";
import { CustomFunnelPage } from "@/components/custom-funnel/custom-funnel-page";
import {
  CustomFunnelError,
  CustomFunnelLoading,
} from "@/components/custom-funnel/custom-funnel-states";
import { GraveStoneListPage } from "@/components/grave-stones/grave-stone-list-page";
import {
  GraveStoneListError,
  GraveStoneListLoading,
} from "@/components/grave-stones/grave-stone-list-states";
import { GuideDetailPage, GuideError, GuidesListPage, GuidesLoading } from "@/components/guides/guides";
import { HomePage } from "@/components/home/home-page";
import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import { PortfolioError, PortfolioLoading } from "@/components/portfolio/portfolio-states";
import { ProductDetailPage } from "@/components/product/product-detail-page";
import {
  ProductDetailError,
  ProductDetailLoading,
} from "@/components/product/product-detail-states";
import { QuotePage } from "@/components/request-form/quote-page";
import {
  ContactDetailsList,
  ContentBlockedState,
  StaticPageView,
} from "@/components/static-pages/static-pages";
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
import { buildPortfolioModel } from "@/lib/portfolio";
import { findPortfolioReference, normalizePortfolioReference } from "@/lib/portfolio-reference";
import { buildProductDetailModel } from "@/lib/product-detail";
import { getRequestTermsDocument } from "@/lib/request-terms";
import {
  buildContactPageModel,
  buildStaticPageModel,
  contentBlockedMeta,
} from "@/lib/static-pages";
import type { ContactPageModel, StaticPageModel } from "@/lib/static-pages";

import { localizedHead, localizedLinks, useRouteData } from "./shared";

/* ------------------------------------------------------------------ home */

export function homeRouteOptions(locale: Locale) {
  return {
    head: () =>
      localizedHead({
        locale,
        basePath: "/",
        title: "سنگ مزار سفارشی و سنگ ساختمانی",
        description: "انتخاب مدل سنگ مزار، مشاهدهٔ گزینه‌ها و ثبت درخواست بررسی سفارش.",
      }),
    loader: async () => {
      const [products, portfolioItems, guides] = await Promise.all([
        getProducts({ featuredOnly: true, limit: 6 }),
        getPortfolioItems({ limit: 1 }),
        getGuides({ limit: 1 }),
      ]);
      return buildHomeViewModel({ products, portfolioItems, guides });
    },
    component: HomeRoute,
  };
}

function HomeRoute() {
  const model = useRouteData<ReturnType<typeof buildHomeViewModel>>();
  return <HomePage model={model} />;
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
    loader: async () => buildGraveStoneListModel(await getProducts()),
    pendingComponent: GraveStoneListLoading,
    errorComponent: GraveStoneListError,
    component: GraveStoneListRoute,
  };
}

function GraveStoneListRoute() {
  const model = useRouteData<ReturnType<typeof buildGraveStoneListModel>>();
  return <GraveStoneListPage model={model} />;
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
        products,
        catalogVersion: catalogVersion ?? null,
        site: site ?? null,
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
    pendingComponent: CustomFunnelLoading,
    errorComponent: CustomFunnelError,
    component: CustomFunnelRoute,
  };
}

type CustomFunnelData = Awaited<ReturnType<ReturnType<typeof customFunnelRouteOptions>["loader"]>>;

function CustomFunnelRoute() {
  const { products, catalogVersion, site, termsDocument } = useRouteData<CustomFunnelData>();
  return (
    <CustomFunnelPage
      products={products}
      catalogVersion={catalogVersion}
      site={site}
      termsDocument={termsDocument}
    />
  );
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

      const model = buildProductDetailModel(product, params.slug);
      if (model === null) throw notFound();

      return {
        model,
        catalogVersion: catalogVersion ?? null,
        site: site ?? null,
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
    pendingComponent: ProductDetailLoading,
    errorComponent: ProductDetailError,
    component: ProductDetailRoute,
  };
}

interface ProductDetailData {
  model: NonNullable<ReturnType<typeof buildProductDetailModel>>;
  catalogVersion: Awaited<ReturnType<typeof getCatalogVersion>> | null;
  site: Awaited<ReturnType<typeof getSite>> | null;
  termsDocument: Awaited<ReturnType<typeof getRequestTermsDocument>>;
}

function ProductDetailRoute() {
  const { model, catalogVersion, site, termsDocument } = useRouteData<ProductDetailData>();
  return (
    <ProductDetailPage
      model={model}
      catalogVersion={catalogVersion}
      site={site}
      termsDocument={termsDocument}
    />
  );
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
    loader: async () => buildPortfolioModel(await getPortfolioItems()),
    pendingComponent: PortfolioLoading,
    errorComponent: PortfolioError,
    component: PortfolioRoute,
  };
}

function PortfolioRoute() {
  const cards = useRouteData<ReturnType<typeof buildPortfolioModel>>();
  return <PortfolioPage cards={cards} />;
}

/* -------------------------------------------------------- building stone */

export function buildingStoneRouteOptions(locale: Locale) {
  return {
    loader: async () => {
      const [site, termsDocument] = await Promise.all([getSite(), getRequestTermsDocument()]);
      return { site: site ?? null, termsDocument };
    },
    head: () =>
      localizedHead({
        locale,
        basePath: "/building-stone",
        title: "سنگ ساختمانی",
        description: "ثبت درخواست بررسی سنگ ساختمانی",
      }),
    component: BuildingStoneRoute,
  };
}

type BuildingStoneData = Awaited<
  ReturnType<ReturnType<typeof buildingStoneRouteOptions>["loader"]>
>;

function BuildingStoneRoute() {
  const { site, termsDocument } = useRouteData<BuildingStoneData>();
  return <BuildingStonePage site={site} termsDocument={termsDocument} />;
}

/* ----------------------------------------------------------------- quote */

export interface QuoteSearch {
  readonly source?: "portfolio";
  readonly reference?: string;
}

export function quoteRouteOptions(locale: Locale) {
  return {
    validateSearch: (search: Record<string, unknown>): QuoteSearch => {
      const reference = normalizePortfolioReference(search["reference"]);
      if (search["source"] !== "portfolio" || reference === null) return {};
      return { source: "portfolio", reference };
    },
    loaderDeps: ({ search }: { search: QuoteSearch }) => ({ reference: search.reference ?? null }),
    loader: async ({ deps }: { deps: { reference: string | null } }) => {
      const [portfolioItems, site, termsDocument] = await Promise.all([
        getPortfolioItems(),
        getSite(),
        getRequestTermsDocument(),
      ]);
      return {
        portfolioReferenceId: findPortfolioReference(portfolioItems, deps.reference),
        site: site ?? null,
        termsDocument,
      };
    },
    head: () =>
      localizedHead({
        locale,
        basePath: "/quote",
        title: "ثبت سفارش",
        description: "ثبت درخواست بررسی سفارش سنگ",
      }),
    component: QuoteRoute,
  };
}

type QuoteData = Awaited<ReturnType<ReturnType<typeof quoteRouteOptions>["loader"]>>;

function QuoteRoute() {
  const { portfolioReferenceId, site, termsDocument } = useRouteData<QuoteData>();
  return (
    <QuotePage
      portfolioReferenceId={portfolioReferenceId}
      site={site}
      termsDocument={termsDocument}
    />
  );
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
    loader: async () => buildGuideListModel(await getGuides()),
    pendingComponent: GuidesLoading,
    errorComponent: GuideError,
    component: GuideListRoute,
  };
}

function GuideListRoute() {
  const items = useRouteData<GuideListItem[]>();
  return <GuidesListPage items={items} />;
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
      const guide = buildGuideDetailModel(await getGuide(params.slug));
      if (!guide) throw notFound();
      return guide;
    },
    pendingComponent: GuidesLoading,
    errorComponent: GuideError,
    component: GuideDetailRoute,
  };
}

function GuideDetailRoute() {
  const guide = useRouteData<GuideDetailModel | undefined>();
  if (!guide) return null;
  return <GuideDetailPage guide={guide} />;
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
  component: () => React.ReactElement,
) {
  return {
    head: (ctx: { loaderData?: StaticPageModel | null }) =>
      staticPageHead(locale, basePath, ctx.loaderData ?? null, fallbackTitle),
    loader: async () => buildStaticPageModel(await getPage(slug), slug),
    component,
  };
}

function StaticPageRoute() {
  const page = useRouteData<StaticPageModel | null>() ?? null;
  return page ? <StaticPageView page={page} /> : <ContentBlockedState />;
}

export function aboutRouteOptions(locale: Locale) {
  return staticPageOptions(locale, "/about", "about", "درباره ما", StaticPageRoute);
}

export function privacyRouteOptions(locale: Locale) {
  return staticPageOptions(locale, "/privacy", "privacy", "حریم خصوصی", StaticPageRoute);
}

export function termsRouteOptions(locale: Locale) {
  return staticPageOptions(locale, "/terms", "terms", "شرایط استفاده", StaticPageRoute);
}

export function contactRouteOptions(locale: Locale) {
  return {
    head: (ctx: { loaderData?: ContactPageModel }) =>
      staticPageHead(locale, "/contact", ctx.loaderData?.page ?? null, "تماس"),
    loader: async (): Promise<ContactPageModel> => {
      const [page, site] = await Promise.all([getPage("contact"), getSite()]);
      return buildContactPageModel(page, site);
    },
    component: ContactRoute,
  };
}

function ContactRoute() {
  const model = useRouteData<ContactPageModel | undefined>();
  if (!model?.page) return <ContentBlockedState />;
  return (
    <StaticPageView page={model.page}>
      <ContactDetailsList entries={model.details} />
    </StaticPageView>
  );
}
