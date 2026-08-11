import { readFile, readdir, rename, rm, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  materializeMediaReferences,
  normalizeSupabaseOrigin,
  validateMediaKey,
  validateSecretKey,
} from "./prepare-media.mjs";

const ARTIFACT_PATH = fileURLToPath(
  new URL("../src/data/catalog/catalog.generated.ts", import.meta.url),
);
const MEDIA_PARENT_PATH = fileURLToPath(new URL("../public/media/", import.meta.url));
const MEDIA_OUTPUT_PATH = join(MEDIA_PARENT_PATH, "catalog");
const ARTIFACT_PREFIX =
  'import type { CatalogArtifact } from "../../lib/content/types";\n\n/* catalog-artifact:start */\nexport const GENERATED_CATALOG: CatalogArtifact = ';
const ARTIFACT_SUFFIX = ";\n/* catalog-artifact:end */\n";
const CATALOG_VERSION_PATTERN = /^[0-9a-f]{64}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const PORTFOLIO_REFERENCE_PATTERN = /^pf-[0-9]{4,}$/;
const PUBLIC_MEDIA_PATH_PATTERN = /^\/media\/catalog\/[0-9a-f]{64}-([1-9][0-9]{1,3})\.(avif|webp)$/;
const PRICE_TYPES = new Set(["fixed", "estimate", "review"]);
const PRODUCT_TYPES = new Set(["simple", "cnc_box"]);
const SIZE_CODES = new Set(["120x60", "160x60", "180x60", "custom"]);

export const EMPTY_CATALOG_ARTIFACT = {
  schemaVersion: 1,
  catalogVersion: null,
  products: [],
  portfolioItems: [],
  site: null,
};

function fail(message) {
  throw new Error(`Catalog build: ${message}`);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isRecord(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} has an unexpected public shape`);
  }
}

function requiredText(value, label, maxLength, pattern) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    (pattern !== undefined && !pattern.test(value))
  ) {
    fail(`${label} is invalid`);
  }
  return value;
}

function optionalText(value, label, maxLength) {
  if (value === null) return null;
  return requiredText(value, label, maxLength);
}

function booleanValue(value, label) {
  if (typeof value !== "boolean") fail(`${label} must be boolean`);
  return value;
}

function safeInteger(
  value,
  label,
  { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {},
) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${label} is invalid`);
  return value;
}

function optionalDimension(value, label) {
  return value === null ? null : safeInteger(value, label, { min: 1, max: 12_000 });
}

function isoTimestamp(value, label) {
  const text = requiredText(value, label, 64);
  const time = Date.parse(text);
  if (Number.isNaN(time)) fail(`${label} is not an ISO timestamp`);
  return new Date(time).toISOString();
}

function priceDate(value, label) {
  if (value === null) return null;
  return isoTimestamp(value, label).slice(0, 10);
}

function cleanStringArray(value, label, allowed) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  const result = [];
  for (const [index, entry] of value.entries()) {
    const text = requiredText(entry, `${label}[${index}]`, 200);
    if (allowed !== undefined && !allowed.has(text)) fail(`${label}[${index}] is not allowed`);
    if (!result.includes(text)) result.push(text);
  }
  return result;
}

function httpsUrl(value, label, { whatsapp = false } = {}) {
  if (value === null) return null;
  const text = requiredText(value, label, 500);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    fail(`${label} must be an HTTPS URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    fail(`${label} must be a clean HTTPS URL`);
  }
  if (
    whatsapp &&
    (parsed.hostname !== "wa.me" ||
      !/^\/[1-9][0-9]{7,15}$/.test(parsed.pathname) ||
      parsed.search !== "")
  ) {
    fail(`${label} must be a canonical wa.me URL without a query`);
  }
  return parsed.href;
}

function seoFromRow(row, label) {
  const title = optionalText(row.seo_title, `${label}.seo_title`, 160);
  const description = optionalText(row.seo_description, `${label}.seo_description`, 320);
  const canonicalPath = optionalText(row.seo_canonical_path, `${label}.seo_canonical_path`, 240);
  const robots = optionalText(row.seo_robots, `${label}.seo_robots`, 120);
  if (title === null) {
    if (description !== null || canonicalPath !== null || robots !== null) {
      fail(`${label} has partial SEO without a title`);
    }
    return null;
  }
  if (canonicalPath !== null && !/^\/(?!\/)[^\s]*$/.test(canonicalPath)) {
    fail(`${label}.seo_canonical_path is invalid`);
  }
  return { title, description, canonicalPath, robots };
}

function mapPriceFields(row, label) {
  const priceType = requiredText(row.price_type, `${label}.price_type`, 16);
  if (!PRICE_TYPES.has(priceType)) fail(`${label}.price_type is invalid`);
  const amountToman =
    row.amount_toman === null
      ? null
      : safeInteger(row.amount_toman, `${label}.amount_toman`, { min: 1 });
  const updated = priceDate(row.price_updated_at, `${label}.price_updated_at`);
  if (priceType === "review") {
    if (amountToman !== null || updated !== null) fail(`${label} review price must be null`);
  } else if (amountToman === null || updated === null) {
    fail(`${label} numeric price is incomplete`);
  }
  return { priceType, amountToman, priceUpdatedAt: updated };
}

function mapOption(row, label) {
  if (row.is_available !== true) fail(`${label} is not available`);
  const compatibleSizeCodes = cleanStringArray(
    row.compatible_size_codes,
    `${label}.compatible_size_codes`,
    SIZE_CODES,
  );
  return {
    id: requiredText(row.id, `${label}.id`, 120, ID_PATTERN),
    title: requiredText(row.title, `${label}.title`, 160),
    ...mapPriceFields(row, label),
    isAvailable: true,
    compatibleSizeCodes,
  };
}

function mapVariant(row, options, label) {
  if (row.is_available !== true) fail(`${label} is not available`);
  const sizeCode = requiredText(row.size_code, `${label}.size_code`, 16);
  if (!SIZE_CODES.has(sizeCode)) fail(`${label}.size_code is invalid`);
  return {
    id: requiredText(row.id, `${label}.id`, 120, ID_PATTERN),
    stoneCode: requiredText(row.stone_code, `${label}.stone_code`, 80),
    sizeCode,
    ...mapPriceFields(row, label),
    includes: cleanStringArray(row.includes, `${label}.includes`),
    excludes: cleanStringArray(row.excludes, `${label}.excludes`),
    options,
    isAvailable: true,
  };
}

function publicMediaIsValid(media) {
  if (!isRecord(media)) return false;
  const keys = Object.keys(media).sort();
  if (keys.join(",") !== "alt,height,src,srcSet,width") return false;
  if (
    typeof media.alt !== "string" ||
    media.alt !== media.alt.trim() ||
    media.alt.length < 1 ||
    media.alt.length > 300 ||
    /[\u0000-\u001f\u007f]/.test(media.alt) ||
    !Number.isSafeInteger(media.width) ||
    media.width < 1 ||
    media.width > 1600 ||
    !Number.isSafeInteger(media.height) ||
    media.height < 1 ||
    media.height > 3200 ||
    typeof media.src !== "string" ||
    !PUBLIC_MEDIA_PATH_PATTERN.test(media.src) ||
    !isRecord(media.srcSet) ||
    Object.keys(media.srcSet).sort().join(",") !== "avif,webp"
  ) {
    return false;
  }

  const parse = (value, extension) => {
    if (typeof value !== "string" || value.length === 0 || value.length > 4096) return null;
    let previous = 0;
    const urls = [];
    for (const item of value.split(",")) {
      const match =
        /^(\/media\/catalog\/[0-9a-f]{64}-([1-9][0-9]{1,3})\.(avif|webp)) ([1-9][0-9]{1,3})w$/.exec(
          item.trim(),
        );
      if (match === null || match[3] !== extension || match[2] !== match[4]) return null;
      const width = Number(match[2]);
      if (width <= previous || width > 1600) return null;
      previous = width;
      urls.push(match[1]);
    }
    return urls.length > 0 && urls.length <= 8 ? urls : null;
  };

  const avif = parse(media.srcSet.avif, "avif");
  const webp = parse(media.srcSet.webp, "webp");
  if (avif === null || webp === null || avif.length !== webp.length) return false;
  const widths = (urls) => urls.map((url) => Number(PUBLIC_MEDIA_PATH_PATTERN.exec(url)?.[1]));
  const avifWidths = widths(avif);
  const webpWidths = widths(webp);
  return (
    avifWidths.every((width, index) => width === webpWidths[index]) &&
    webp.at(-1) === media.src &&
    webpWidths.at(-1) === media.width
  );
}

function internalMediaReference(row, scope, ownerId) {
  if (row.privacy_cleared !== true) return null;
  if (
    scope === "portfolio" &&
    optionalText(row.consent_reference, "consent reference", 200) === null
  ) {
    return null;
  }

  const mediaKey = validateMediaKey(row.media_key);
  const alt = requiredText(row.alt, `${scope} media alt`, 300);
  const width = optionalDimension(row.width, `${scope} media width`);
  const height = optionalDimension(row.height, `${scope} media height`);
  if ((width === null) !== (height === null)) fail(`${scope} media dimensions must be paired`);
  return {
    id: `${scope}:${ownerId}:${mediaKey}`,
    mediaKey,
    alt,
    width,
    height,
  };
}

export function collectMediaReferences(rows) {
  const activeProductIds = new Set(rows.products.map((row) => row.id));
  const activePortfolioIds = new Set(rows.portfolioItems.map((row) => row.public_reference_id));
  const references = [];

  for (const row of rows.productMedia) {
    if (!activeProductIds.has(row.product_id)) continue;
    const reference = internalMediaReference(row, "product", row.product_id);
    if (reference !== null) references.push(reference);
  }
  for (const row of rows.portfolioMedia) {
    if (!activePortfolioIds.has(row.public_reference_id)) continue;
    const reference = internalMediaReference(row, "portfolio", row.public_reference_id);
    if (reference !== null) references.push(reference);
  }
  return references;
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key];
    const group = groups.get(value) ?? [];
    group.push(row);
    groups.set(value, group);
  }
  return groups;
}

function sorted(rows) {
  return [...rows].sort((left, right) => {
    const order = Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0);
    if (order !== 0) return order;
    const leftId = String(left.id ?? left.media_key ?? left.public_reference_id ?? "");
    const rightId = String(right.id ?? right.media_key ?? right.public_reference_id ?? "");
    return leftId.localeCompare(rightId, "en");
  });
}

function mediaFor(rows, scope, ownerId, mediaById) {
  const media = [];
  for (const row of sorted(rows)) {
    const reference = internalMediaReference(row, scope, ownerId);
    if (reference === null) continue;
    const publicMedia = mediaById.get(reference.id);
    if (!publicMediaIsValid(publicMedia)) fail(`processed ${scope} media is invalid`);
    media.push(publicMedia);
  }
  return media;
}

export function buildArtifactFromRows({ rows, catalogVersion, mediaById }) {
  if (!CATALOG_VERSION_PATTERN.test(catalogVersion)) fail("catalog version is invalid");

  const optionsByVariant = groupBy(rows.options, "variant_id");
  const variantsByProduct = groupBy(rows.variants, "product_id");
  const productMediaByProduct = groupBy(rows.productMedia, "product_id");
  const portfolioMediaByItem = groupBy(rows.portfolioMedia, "public_reference_id");

  const products = [];
  for (const [index, row] of sorted(rows.products).entries()) {
    if (row.is_active !== true) fail(`products[${index}] is not active`);
    const id = requiredText(row.id, `products[${index}].id`, 120, ID_PATTERN);
    const type = requiredText(row.product_type, `products[${index}].product_type`, 16);
    if (!PRODUCT_TYPES.has(type)) fail(`products[${index}].product_type is invalid`);

    const variants = sorted(variantsByProduct.get(id) ?? []).map((variantRow, variantIndex) => {
      const variantId = requiredText(
        variantRow.id,
        `products[${index}].variants[${variantIndex}].id`,
        120,
        ID_PATTERN,
      );
      const options = sorted(optionsByVariant.get(variantId) ?? []).map((optionRow, optionIndex) =>
        mapOption(
          optionRow,
          `products[${index}].variants[${variantIndex}].options[${optionIndex}]`,
        ),
      );
      return mapVariant(variantRow, options, `products[${index}].variants[${variantIndex}]`);
    });
    if (variants.length === 0) continue;

    products.push({
      id,
      code: requiredText(row.code, `products[${index}].code`, 80),
      slug: requiredText(row.slug, `products[${index}].slug`, 160, SLUG_PATTERN),
      type,
      title: requiredText(row.title, `products[${index}].title`, 160),
      summary: optionalText(row.summary, `products[${index}].summary`, 500),
      description: optionalText(row.description, `products[${index}].description`, 5000),
      isActive: true,
      isFeatured: booleanValue(row.is_featured, `products[${index}].is_featured`),
      media: mediaFor(productMediaByProduct.get(id) ?? [], "product", id, mediaById),
      variants,
      seo: seoFromRow(row, `products[${index}]`),
      updatedAt: isoTimestamp(row.updated_at, `products[${index}].updated_at`),
    });
  }

  const portfolioItems = [];
  for (const [index, row] of sorted(rows.portfolioItems).entries()) {
    if (row.is_active !== true) fail(`portfolioItems[${index}] is not active`);
    const publicReferenceId = requiredText(
      row.public_reference_id,
      `portfolioItems[${index}].public_reference_id`,
      80,
      PORTFOLIO_REFERENCE_PATTERN,
    );
    const media = mediaFor(
      portfolioMediaByItem.get(publicReferenceId) ?? [],
      "portfolio",
      publicReferenceId,
      mediaById,
    );
    if (media.length === 0) continue;

    let sizeCode = null;
    if (row.size_code !== null) {
      sizeCode = requiredText(row.size_code, `portfolioItems[${index}].size_code`, 16);
      if (!SIZE_CODES.has(sizeCode)) fail(`portfolioItems[${index}].size_code is invalid`);
    }
    portfolioItems.push({
      publicReferenceId,
      media,
      stoneCode: optionalText(row.stone_code, `portfolioItems[${index}].stone_code`, 80),
      sizeCode,
      summary: optionalText(row.summary, `portfolioItems[${index}].summary`, 500),
    });
  }

  let site = null;
  if (rows.site.length > 1) fail("site_settings must contain at most one primary row");
  if (rows.site.length === 1) {
    const row = rows.site[0];
    if (row.id !== "primary") fail("site_settings row id must be primary");
    const phone = optionalText(row.phone, "site.phone", 20);
    if (phone !== null && !/^\+?[0-9]{8,16}$/.test(phone)) fail("site.phone is invalid");
    site = {
      displayName: requiredText(row.display_name, "site.display_name", 120),
      latinName: requiredText(row.latin_name, "site.latin_name", 120),
      phone,
      whatsapp: httpsUrl(row.whatsapp_url, "site.whatsapp_url", { whatsapp: true }),
      telegram: httpsUrl(row.telegram, "site.telegram"),
      address: optionalText(row.address, "site.address", 500),
      workingHours: optionalText(row.working_hours, "site.working_hours", 500),
      links: {
        instagram: httpsUrl(row.instagram_url, "site.instagram_url"),
        website: httpsUrl(row.website_url, "site.website_url"),
        map: httpsUrl(row.map_url, "site.map_url"),
      },
    };
  }

  const artifact = { schemaVersion: 1, catalogVersion, products, portfolioItems, site };
  validatePublicArtifact(artifact);
  return artifact;
}

function assertNoInternalKeys(value, path = "artifact") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoInternalKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (/media.?key|privacy|consent|secret|supabase/i.test(key)) {
      fail(`${path}.${key} is an internal field`);
    }
    assertNoInternalKeys(entry, `${path}.${key}`);
  }
}

function assertUnique(items, key, label) {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    const value = item[key];
    if (seen.has(value)) fail(`${label}[${index}].${key} is duplicated`);
    seen.add(value);
  }
}

function validatePublicStringArray(value, label, allowed) {
  const normalized = cleanStringArray(value, label, allowed);
  if (normalized.length !== value.length) fail(`${label} contains duplicates`);
}

function validatePublicPrice(value, label) {
  const priceType = requiredText(value.priceType, `${label}.priceType`, 16);
  if (!PRICE_TYPES.has(priceType)) fail(`${label}.priceType is invalid`);
  const amountToman =
    value.amountToman === null
      ? null
      : safeInteger(value.amountToman, `${label}.amountToman`, { min: 1 });
  const updated = value.priceUpdatedAt;
  if (updated !== null) {
    const normalized = priceDate(updated, `${label}.priceUpdatedAt`);
    if (updated !== normalized || !/^\d{4}-\d{2}-\d{2}$/.test(updated)) {
      fail(`${label}.priceUpdatedAt is invalid`);
    }
  }
  if (priceType === "review") {
    if (amountToman !== null || updated !== null) fail(`${label} review price must be null`);
  } else if (amountToman === null || updated === null) {
    fail(`${label} numeric price is incomplete`);
  }
}

function validatePublicSeo(value, label) {
  if (value === null) return;
  exactKeys(value, ["title", "description", "canonicalPath", "robots"], label);
  requiredText(value.title, `${label}.title`, 160);
  optionalText(value.description, `${label}.description`, 320);
  const canonicalPath = optionalText(value.canonicalPath, `${label}.canonicalPath`, 240);
  optionalText(value.robots, `${label}.robots`, 120);
  if (canonicalPath !== null && !/^\/(?!\/)[^\s]*$/.test(canonicalPath)) {
    fail(`${label}.canonicalPath is invalid`);
  }
}

function validatePublicOption(option, label) {
  exactKeys(
    option,
    [
      "id",
      "title",
      "priceType",
      "amountToman",
      "priceUpdatedAt",
      "isAvailable",
      "compatibleSizeCodes",
    ],
    label,
  );
  requiredText(option.id, `${label}.id`, 120, ID_PATTERN);
  requiredText(option.title, `${label}.title`, 160);
  validatePublicPrice(option, label);
  if (option.isAvailable !== true) fail(`${label}.isAvailable must be true`);
  validatePublicStringArray(option.compatibleSizeCodes, `${label}.compatibleSizeCodes`, SIZE_CODES);
}

function validatePublicVariant(variant, label) {
  exactKeys(
    variant,
    [
      "id",
      "stoneCode",
      "sizeCode",
      "priceType",
      "amountToman",
      "priceUpdatedAt",
      "includes",
      "excludes",
      "options",
      "isAvailable",
    ],
    label,
  );
  requiredText(variant.id, `${label}.id`, 120, ID_PATTERN);
  requiredText(variant.stoneCode, `${label}.stoneCode`, 80);
  const sizeCode = requiredText(variant.sizeCode, `${label}.sizeCode`, 16);
  if (!SIZE_CODES.has(sizeCode)) fail(`${label}.sizeCode is invalid`);
  validatePublicPrice(variant, label);
  validatePublicStringArray(variant.includes, `${label}.includes`);
  validatePublicStringArray(variant.excludes, `${label}.excludes`);
  if (!Array.isArray(variant.options)) fail(`${label}.options must be an array`);
  variant.options.forEach((option, index) =>
    validatePublicOption(option, `${label}.options[${index}]`),
  );
  assertUnique(variant.options, "id", `${label}.options`);
  if (variant.isAvailable !== true) fail(`${label}.isAvailable must be true`);
}

function validatePublicProduct(product, label) {
  exactKeys(
    product,
    [
      "id",
      "code",
      "slug",
      "type",
      "title",
      "summary",
      "description",
      "isActive",
      "isFeatured",
      "media",
      "variants",
      "seo",
      "updatedAt",
    ],
    label,
  );
  requiredText(product.id, `${label}.id`, 120, ID_PATTERN);
  requiredText(product.code, `${label}.code`, 80);
  requiredText(product.slug, `${label}.slug`, 160, SLUG_PATTERN);
  const type = requiredText(product.type, `${label}.type`, 16);
  if (!PRODUCT_TYPES.has(type)) fail(`${label}.type is invalid`);
  requiredText(product.title, `${label}.title`, 160);
  optionalText(product.summary, `${label}.summary`, 500);
  optionalText(product.description, `${label}.description`, 5000);
  if (product.isActive !== true) fail(`${label}.isActive must be true`);
  booleanValue(product.isFeatured, `${label}.isFeatured`);
  if (!Array.isArray(product.media) || !product.media.every(publicMediaIsValid)) {
    fail(`${label}.media is invalid`);
  }
  if (!Array.isArray(product.variants) || product.variants.length === 0) {
    fail(`${label}.variants must contain an available variant`);
  }
  product.variants.forEach((variant, index) =>
    validatePublicVariant(variant, `${label}.variants[${index}]`),
  );
  assertUnique(product.variants, "id", `${label}.variants`);
  validatePublicSeo(product.seo, `${label}.seo`);
  const normalizedUpdatedAt = isoTimestamp(product.updatedAt, `${label}.updatedAt`);
  if (product.updatedAt !== normalizedUpdatedAt) fail(`${label}.updatedAt is not canonical`);
}

function validatePublicPortfolioItem(item, label) {
  exactKeys(item, ["publicReferenceId", "media", "stoneCode", "sizeCode", "summary"], label);
  requiredText(
    item.publicReferenceId,
    `${label}.publicReferenceId`,
    80,
    PORTFOLIO_REFERENCE_PATTERN,
  );
  if (
    !Array.isArray(item.media) ||
    item.media.length === 0 ||
    !item.media.every(publicMediaIsValid)
  ) {
    fail(`${label}.media is invalid`);
  }
  optionalText(item.stoneCode, `${label}.stoneCode`, 80);
  if (item.sizeCode !== null) {
    const sizeCode = requiredText(item.sizeCode, `${label}.sizeCode`, 16);
    if (!SIZE_CODES.has(sizeCode)) fail(`${label}.sizeCode is invalid`);
  }
  optionalText(item.summary, `${label}.summary`, 500);
}

function validatePublicSite(site) {
  exactKeys(
    site,
    [
      "displayName",
      "latinName",
      "phone",
      "whatsapp",
      "telegram",
      "address",
      "workingHours",
      "links",
    ],
    "artifact.site",
  );
  requiredText(site.displayName, "artifact.site.displayName", 120);
  requiredText(site.latinName, "artifact.site.latinName", 120);
  const phone = optionalText(site.phone, "artifact.site.phone", 20);
  if (phone !== null && !/^\+?[0-9]{8,16}$/.test(phone)) fail("artifact.site.phone is invalid");
  for (const [key, options] of [
    ["whatsapp", { whatsapp: true }],
    ["telegram", {}],
  ]) {
    const normalized = httpsUrl(site[key], `artifact.site.${key}`, options);
    if (normalized !== site[key]) fail(`artifact.site.${key} is not canonical`);
  }
  optionalText(site.address, "artifact.site.address", 500);
  optionalText(site.workingHours, "artifact.site.workingHours", 500);
  exactKeys(site.links, ["instagram", "website", "map"], "artifact.site.links");
  for (const key of ["instagram", "website", "map"]) {
    const normalized = httpsUrl(site.links[key], `artifact.site.links.${key}`);
    if (normalized !== site.links[key]) fail(`artifact.site.links.${key} is not canonical`);
  }
}

export function validatePublicArtifact(artifact) {
  exactKeys(
    artifact,
    ["schemaVersion", "catalogVersion", "products", "portfolioItems", "site"],
    "artifact",
  );
  if (artifact.schemaVersion !== 1) fail("artifact schema version is invalid");
  if (
    artifact.catalogVersion !== null &&
    (typeof artifact.catalogVersion !== "string" ||
      !CATALOG_VERSION_PATTERN.test(artifact.catalogVersion))
  ) {
    fail("artifact catalog version is invalid");
  }
  if (!Array.isArray(artifact.products) || !Array.isArray(artifact.portfolioItems)) {
    fail("artifact collections must be arrays");
  }
  artifact.products.forEach((product, index) =>
    validatePublicProduct(product, `artifact.products[${index}]`),
  );
  artifact.portfolioItems.forEach((item, index) =>
    validatePublicPortfolioItem(item, `artifact.portfolioItems[${index}]`),
  );
  assertUnique(artifact.products, "id", "artifact.products");
  assertUnique(artifact.products, "slug", "artifact.products");
  assertUnique(artifact.portfolioItems, "publicReferenceId", "artifact.portfolioItems");
  if (artifact.site !== null) validatePublicSite(artifact.site);
  assertNoInternalKeys(artifact);
  return artifact;
}

export function renderArtifactModule(artifact) {
  validatePublicArtifact(artifact);
  return `${ARTIFACT_PREFIX}${JSON.stringify(artifact, null, 2)}${ARTIFACT_SUFFIX}`;
}

export function parseArtifactModule(source) {
  if (
    typeof source !== "string" ||
    !source.startsWith(ARTIFACT_PREFIX) ||
    !source.endsWith(ARTIFACT_SUFFIX)
  ) {
    fail("generated artifact module wrapper is invalid");
  }
  const json = source.slice(ARTIFACT_PREFIX.length, -ARTIFACT_SUFFIX.length);
  let artifact;
  try {
    artifact = JSON.parse(json);
  } catch {
    fail("generated artifact JSON is invalid");
  }
  return validatePublicArtifact(artifact);
}

export function assertStableCatalogVersion(before, after) {
  if (!CATALOG_VERSION_PATTERN.test(before) || !CATALOG_VERSION_PATTERN.test(after)) {
    fail("catalog version RPC returned an invalid value");
  }
  if (before !== after) fail("catalog changed while the public artifact was being built");
  return before;
}

export function assertStablePublicationSourceVersion(before, after) {
  if (!CATALOG_VERSION_PATTERN.test(before) || !CATALOG_VERSION_PATTERN.test(after)) {
    fail("publication source version RPC returned an invalid value");
  }
  if (before !== after)
    fail("publication source changed while the public artifact was being built");
  return before;
}

function buildHeaders(secretKey, extra = {}) {
  return {
    accept: "application/json",
    apikey: secretKey,
    authorization: `Bearer ${secretKey}`,
    ...extra,
  };
}

async function responseJson(response, label) {
  if (!response.ok) fail(`${label} failed with HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    fail(`${label} returned invalid JSON`);
  }
}

async function fetchTable({ origin, secretKey, table, params, fetchImpl }) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`/rest/v1/${table}`, origin);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      headers: buildHeaders(secretKey, {
        range: `${offset}-${offset + pageSize - 1}`,
        "range-unit": "items",
      }),
    });
    const page = await responseJson(response, `read ${table}`);
    if (!Array.isArray(page)) fail(`read ${table} did not return an array`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function fetchVersion({ origin, secretKey, rpc, label, fetchImpl }) {
  const response = await fetchImpl(new URL(`/rest/v1/rpc/${rpc}`, origin), {
    method: "POST",
    redirect: "error",
    headers: buildHeaders(secretKey, { "content-type": "application/json" }),
    body: "{}",
  });
  const value = await responseJson(response, `read ${label}`);
  if (typeof value !== "string") fail(`${label} RPC did not return a string`);
  return value;
}

async function fetchCatalogVersion(options) {
  return fetchVersion({
    ...options,
    rpc: "compute_operational_catalog_version",
    label: "catalog version",
  });
}

async function fetchPublicationSourceVersion(options) {
  return fetchVersion({
    ...options,
    rpc: "compute_catalog_publication_source_version",
    label: "publication source version",
  });
}

export async function fetchCatalogRows({ origin, secretKey, fetchImpl = fetch }) {
  const common = { origin, secretKey, fetchImpl };
  const [products, variants, options, productMedia, portfolioItems, portfolioMedia, site] =
    await Promise.all([
      fetchTable({
        ...common,
        table: "products",
        params: {
          select:
            "id,code,slug,product_type,title,summary,description,is_active,is_featured,seo_title,seo_description,seo_canonical_path,seo_robots,sort_order,updated_at",
          is_active: "eq.true",
          order: "sort_order.asc,id.asc",
        },
      }),
      fetchTable({
        ...common,
        table: "product_variants",
        params: {
          select:
            "id,product_id,stone_code,size_code,price_type,amount_toman,price_updated_at,includes,excludes,is_available,sort_order",
          is_available: "eq.true",
          order: "sort_order.asc,id.asc",
        },
      }),
      fetchTable({
        ...common,
        table: "product_options",
        params: {
          select:
            "id,variant_id,title,price_type,amount_toman,price_updated_at,is_available,compatible_size_codes,sort_order",
          is_available: "eq.true",
          order: "sort_order.asc,id.asc",
        },
      }),
      fetchTable({
        ...common,
        table: "product_media",
        params: {
          select:
            "product_id,media_key,alt,privacy_cleared,consent_reference,width,height,sort_order",
          privacy_cleared: "eq.true",
          order: "sort_order.asc,media_key.asc",
        },
      }),
      fetchTable({
        ...common,
        table: "portfolio_items",
        params: {
          select:
            "public_reference_id,stone_code,size_code,summary,is_active,sort_order,updated_at",
          is_active: "eq.true",
          order: "sort_order.asc,public_reference_id.asc",
        },
      }),
      fetchTable({
        ...common,
        table: "portfolio_media",
        params: {
          select:
            "public_reference_id,media_key,alt,privacy_cleared,consent_reference,width,height,sort_order",
          privacy_cleared: "eq.true",
          order: "sort_order.asc,media_key.asc",
        },
      }),
      fetchTable({
        ...common,
        table: "site_settings",
        params: {
          select:
            "id,display_name,latin_name,phone,whatsapp_url,telegram,address,working_hours,instagram_url,website_url,map_url",
          id: "eq.primary",
          limit: "2",
        },
      }),
    ]);
  return { products, variants, options, productMedia, portfolioItems, portfolioMedia, site };
}

export async function generateCatalog({ supabaseOrigin, secretKey, outputDir, fetchImpl = fetch }) {
  const origin = normalizeSupabaseOrigin(supabaseOrigin);
  const key = validateSecretKey(secretKey);
  const versionOptions = { origin, secretKey: key, fetchImpl };
  const [before, publicationBefore] = await Promise.all([
    fetchCatalogVersion(versionOptions),
    fetchPublicationSourceVersion(versionOptions),
  ]);
  const rows = await fetchCatalogRows({ origin, secretKey: key, fetchImpl });
  const references = collectMediaReferences(rows);
  const mediaById = await materializeMediaReferences({
    references,
    supabaseOrigin: origin,
    secretKey: key,
    outputDir,
    fetchImpl,
  });
  const [after, publicationAfter] = await Promise.all([
    fetchCatalogVersion(versionOptions),
    fetchPublicationSourceVersion(versionOptions),
  ]);
  const catalogVersion = assertStableCatalogVersion(before, after);
  assertStablePublicationSourceVersion(publicationBefore, publicationAfter);
  return buildArtifactFromRows({ rows, catalogVersion, mediaById });
}

async function assertCanonicalCheckout() {
  const source = await readFile(ARTIFACT_PATH, "utf8");
  if (source !== renderArtifactModule(EMPTY_CATALOG_ARTIFACT)) {
    fail("the committed catalog artifact must remain canonical and empty");
  }

  try {
    const entries = await readdir(MEDIA_OUTPUT_PATH);
    if (entries.length > 0) fail("generated public media must not be committed");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function validateCurrentArtifact({ release }) {
  const artifact = parseArtifactModule(await readFile(ARTIFACT_PATH, "utf8"));
  if (!release) return;
  if (artifact.catalogVersion === null) fail("release catalog version is missing");
  if (artifact.products.length === 0) fail("release catalog has no active product");
  if (artifact.site === null) fail("release site settings are missing");
  for (const product of artifact.products) {
    if (product.media.length === 0) fail(`release product ${product.id} has no approved media`);
  }
}

async function writeGeneratedCatalog() {
  const supabaseOrigin = process.env["CONTENT_SUPABASE_URL"]?.trim() ?? "";
  const secretKey = process.env["CONTENT_SUPABASE_SECRET_KEY"]?.trim() ?? "";
  if (supabaseOrigin === "" || secretKey === "") fail("trusted build configuration is missing");

  await mkdir(MEDIA_PARENT_PATH, { recursive: true });
  const tempMediaPath = await mkdtemp(join(MEDIA_PARENT_PATH, ".catalog-build-"));
  const tempArtifactPath = `${ARTIFACT_PATH}.tmp-${process.pid}`;

  try {
    const artifact = await generateCatalog({
      supabaseOrigin,
      secretKey,
      outputDir: pathToFileURL(`${tempMediaPath}/`),
    });
    await writeFile(tempArtifactPath, renderArtifactModule(artifact), {
      encoding: "utf8",
      flag: "wx",
    });
    await rm(MEDIA_OUTPUT_PATH, { recursive: true, force: true });
    await rename(tempMediaPath, MEDIA_OUTPUT_PATH);
    await rename(tempArtifactPath, ARTIFACT_PATH);
  } finally {
    await rm(tempMediaPath, { recursive: true, force: true });
    await rm(tempArtifactPath, { force: true });
  }
}

async function main() {
  const mode = process.argv[2] ?? "--build";
  if (mode === "--check") await assertCanonicalCheckout();
  else if (mode === "--validate") await validateCurrentArtifact({ release: false });
  else if (mode === "--release-check") await validateCurrentArtifact({ release: true });
  else if (mode === "--build") await writeGeneratedCatalog();
  else fail("unknown command mode");
}

const entryPath =
  process.argv[1] === undefined ? "" : fileURLToPath(pathToFileURL(process.argv[1]));
if (entryPath === fileURLToPath(import.meta.url)) {
  await main();
}
