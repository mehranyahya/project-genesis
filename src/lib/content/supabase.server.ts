import type {
  CatalogVersion,
  GraveStoneSizeCode,
  Media,
  PortfolioItem,
  PortfolioQuery,
  PriceType,
  Product,
  ProductOption,
  ProductQuery,
  ProductType,
  ProductVariant,
  SeoMeta,
  Site,
} from "./types";
import { isCatalogVersion } from "./types";

type ProductRow = {
  id: string;
  code: string;
  slug: string;
  product_type: ProductType;
  title: string;
  summary: string | null;
  description: string | null;
  is_active: boolean;
  is_featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  seo_canonical_path: string | null;
  seo_robots: string | null;
  sort_order: number;
  updated_at: string;
};

type VariantRow = {
  id: string;
  product_id: string;
  stone_code: string;
  size_code: GraveStoneSizeCode;
  price_type: PriceType;
  amount_toman: number | null;
  price_updated_at: string | null;
  includes: string[];
  excludes: string[];
  is_available: boolean;
  sort_order: number;
};

type OptionRow = {
  id: string;
  variant_id: string;
  title: string;
  price_type: PriceType;
  amount_toman: number | null;
  price_updated_at: string | null;
  is_available: boolean;
  compatible_size_codes: GraveStoneSizeCode[];
  sort_order: number;
};

type ProductMediaRow = {
  product_id: string;
  media_key: string;
  alt: string;
  caption: string | null;
  privacy_cleared: boolean;
  consent_reference: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
};

type PortfolioRow = {
  public_reference_id: string;
  stone_code: string | null;
  size_code: GraveStoneSizeCode | null;
  summary: string | null;
  sort_order: number;
};

type PortfolioMediaRow = {
  public_reference_id: string;
  media_key: string;
  alt: string;
  caption: string | null;
  privacy_cleared: boolean;
  consent_reference: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
};

type SiteRow = {
  display_name: string;
  latin_name: string;
  phone: string | null;
  whatsapp: string | null;
  telegram: string | null;
  address: string | null;
  working_hours: string | null;
  instagram_url: string | null;
  website_url: string | null;
  map_url: string | null;
};

const REQUEST_TIMEOUT_MS = 8_000;

function getConfig(): { baseUrl: string; serviceRoleKey: string } {
  const rawUrl = process.env["SUPABASE_URL"]?.trim();
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();

  if (!rawUrl || !serviceRoleKey) {
    throw new Error("Server content repository is not configured");
  }

  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use https");
  }

  return {
    baseUrl: parsed.origin,
    serviceRoleKey,
  };
}

async function dataApi<T>(path: string, init?: RequestInit): Promise<T> {
  const { baseUrl, serviceRoleKey } = getConfig();
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Content repository request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

function idsFilter(ids: readonly string[]): string {
  return `in.(${ids.join(",")})`;
}

function mediaFromRow(row: ProductMediaRow | PortfolioMediaRow): Media {
  const media: Media = {
    mediaKey: row.media_key,
    alt: row.alt,
    caption: row.caption,
    privacyCleared: row.privacy_cleared,
    consentReference: row.consent_reference,
  };

  if (row.width != null) media.width = row.width;
  if (row.height != null) media.height = row.height;
  return media;
}

function seoFromProduct(row: ProductRow): SeoMeta | null {
  if (
    row.seo_title == null &&
    row.seo_description == null &&
    row.seo_canonical_path == null &&
    row.seo_robots == null
  ) {
    return null;
  }

  // SeoMeta requires a title. An incomplete SEO row is treated as absent rather
  // than inventing a title from business content.
  if (row.seo_title == null) return null;

  return {
    title: row.seo_title,
    description: row.seo_description,
    canonicalPath: row.seo_canonical_path,
    robots: row.seo_robots,
  };
}

function optionFromRow(row: OptionRow): ProductOption {
  return {
    id: row.id,
    title: row.title,
    priceType: row.price_type,
    amountToman: row.amount_toman,
    priceUpdatedAt: row.price_updated_at,
    isAvailable: row.is_available,
    compatibleSizeCodes: row.compatible_size_codes,
  };
}

function variantFromRow(row: VariantRow, optionRows: readonly OptionRow[]): ProductVariant {
  return {
    id: row.id,
    stoneCode: row.stone_code,
    sizeCode: row.size_code,
    priceType: row.price_type,
    amountToman: row.amount_toman,
    priceUpdatedAt: row.price_updated_at,
    includes: row.includes,
    excludes: row.excludes,
    options: optionRows
      .filter((option) => option.variant_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      .map(optionFromRow),
    isAvailable: row.is_available,
  };
}

export async function loadProducts(query: ProductQuery = {}): Promise<Product[]> {
  const params = new URLSearchParams({
    select:
      "id,code,slug,product_type,title,summary,description,is_active,is_featured,seo_title,seo_description,seo_canonical_path,seo_robots,sort_order,updated_at",
    is_active: "eq.true",
    order: "sort_order.asc,updated_at.desc",
  });
  if (query.type) params.set("product_type", `eq.${query.type}`);
  if (query.featuredOnly) params.set("is_featured", "eq.true");

  const products = await dataApi<ProductRow[]>(`products?${params}`);
  if (products.length === 0) return [];

  const productIds = products.map((product) => product.id);
  const [variants, mediaRows] = await Promise.all([
    dataApi<VariantRow[]>(
      `product_variants?select=id,product_id,stone_code,size_code,price_type,amount_toman,price_updated_at,includes,excludes,is_available,sort_order&product_id=${encodeURIComponent(idsFilter(productIds))}`,
    ),
    dataApi<ProductMediaRow[]>(
      `product_media?select=product_id,media_key,alt,caption,privacy_cleared,consent_reference,width,height,sort_order&privacy_cleared=eq.true&product_id=${encodeURIComponent(idsFilter(productIds))}`,
    ),
  ]);

  const variantIds = variants.map((variant) => variant.id);
  const options =
    variantIds.length === 0
      ? []
      : await dataApi<OptionRow[]>(
          `product_options?select=id,variant_id,title,price_type,amount_toman,price_updated_at,is_available,compatible_size_codes,sort_order&variant_id=${encodeURIComponent(idsFilter(variantIds))}`,
        );

  let result = products.map<Product>((row) => ({
    id: row.id,
    code: row.code,
    slug: row.slug,
    type: row.product_type,
    title: row.title,
    summary: row.summary,
    description: row.description,
    isActive: row.is_active,
    isFeatured: row.is_featured,
    media: mediaRows
      .filter((media) => media.product_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order || a.media_key.localeCompare(b.media_key))
      .map(mediaFromRow),
    variants: variants
      .filter((variant) => variant.product_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      .map((variant) => variantFromRow(variant, options)),
    seo: seoFromProduct(row),
    updatedAt: row.updated_at,
  }));

  if (query.sizeCode) {
    result = result.filter((product) =>
      product.variants.some(
        (variant) => variant.sizeCode === query.sizeCode && variant.isAvailable,
      ),
    );
  }

  if (query.limit != null) result = result.slice(0, query.limit);
  return result;
}

export async function loadProduct(slug: string): Promise<Product | null> {
  const products = await loadProducts();
  return products.find((product) => product.slug === slug) ?? null;
}

export async function loadPortfolioItems(query: PortfolioQuery = {}): Promise<PortfolioItem[]> {
  const params = new URLSearchParams({
    select: "public_reference_id,stone_code,size_code,summary,sort_order",
    is_active: "eq.true",
    order: "sort_order.asc,public_reference_id.asc",
  });
  if (query.limit != null) params.set("limit", String(query.limit));

  const items = await dataApi<PortfolioRow[]>(`portfolio_items?${params}`);
  if (items.length === 0) return [];

  const refs = items.map((item) => item.public_reference_id);
  const mediaRows = await dataApi<PortfolioMediaRow[]>(
    `portfolio_media?select=public_reference_id,media_key,alt,caption,privacy_cleared,consent_reference,width,height,sort_order&privacy_cleared=eq.true&public_reference_id=${encodeURIComponent(idsFilter(refs))}`,
  );

  return items.map((row) => ({
    publicReferenceId: row.public_reference_id,
    media: mediaRows
      .filter((media) => media.public_reference_id === row.public_reference_id)
      .sort((a, b) => a.sort_order - b.sort_order || a.media_key.localeCompare(b.media_key))
      .map(mediaFromRow),
    stoneCode: row.stone_code,
    sizeCode: row.size_code,
    summary: row.summary,
  }));
}

export async function loadSite(): Promise<Site | null> {
  const rows = await dataApi<SiteRow[]>(
    "site_settings?select=display_name,latin_name,phone,whatsapp,telegram,address,working_hours,instagram_url,website_url,map_url&id=eq.primary&limit=1",
  );
  const row = rows[0];
  if (!row) return null;

  return {
    displayName: row.display_name,
    latinName: row.latin_name,
    phone: row.phone,
    whatsapp: row.whatsapp,
    telegram: row.telegram,
    address: row.address,
    workingHours: row.working_hours,
    links: {
      instagram: row.instagram_url,
      website: row.website_url,
      map: row.map_url,
    },
  };
}

export async function loadCatalogVersion(): Promise<CatalogVersion> {
  const value = await dataApi<string>("rpc/compute_operational_catalog_version", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

  if (!isCatalogVersion(value)) {
    throw new Error("Invalid operational catalog version returned by database");
  }
  return value;
}
