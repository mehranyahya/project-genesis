import { readBoundedBytes, readBoundedJson } from "./bounded-response.mjs";
import { createDataApiBudget, readPaginatedRows } from "./data-api-pagination.mjs";
import { validateSiteLink } from "./site-links.mjs";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { isAllowedMediaAspect } from "./media-geometry.mjs";
import {
  applyStructuredTranslations,
  readStructuredTranslations,
  translationAuthoringSource,
} from "./structured-translations.mjs";
import { installStructuredBuild } from "./install-structured-build.mjs";

const OUTPUT_FILE = new URL("../src/lib/content/generated-structured-content.ts", import.meta.url);
const MEDIA_DIRECTORY = new URL("../public/media/", import.meta.url);
const TRANSLATION_FILE = new URL("../content/translations/en.json", import.meta.url);
const BUCKET = "catalog-media";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_DATA_API_BYTES = 4 * 1024 * 1024;
const MAX_TABLE_ROWS = 10_000;
const PARENT_BATCH_SIZE = 25;
const MAX_SOURCE_PIXELS = 40_000_000;
const MIN_SOURCE_WIDTH = 1280;
const OUTPUT_WIDTHS = [320, 640, 1280];
const WEBP_BUDGETS = new Map([
  [320, 30 * 1024],
  [640, 70 * 1024],
  [1280, 220 * 1024],
]);
const MEDIA_KEY =
  /^(products|portfolio|building-stone)\/[A-Za-z0-9][A-Za-z0-9._-]{0,79}\/[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const CATALOG_VERSION = /^[0-9a-f]{64}$/;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for structured content generation`);
  return value;
}

function config() {
  const rawUrl = requiredEnv("BUILD_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("BUILD_SUPABASE_SERVICE_ROLE_KEY");
  const parsed = new URL(rawUrl);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/"
  ) {
    throw new Error("BUILD_SUPABASE_URL must be an HTTPS project origin");
  }
  return { baseUrl: parsed.origin, serviceRoleKey };
}

function authHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function checkedFetch(url, init = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Build content request unavailable");
  }
  if (!response.ok) throw new Error(`Build content request failed (${response.status})`);
  return response;
}

async function dataApi(path, init = {}) {
  const { baseUrl, serviceRoleKey } = config();
  const response = await checkedFetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: authHeaders(serviceRoleKey, {
      accept: "application/json",
      ...(init.headers ?? {}),
    }),
  });
  return readBoundedJson(response, MAX_DATA_API_BYTES);
}

async function dataRows(path, columns, budget, maxRows = MAX_TABLE_ROWS) {
  const { baseUrl, serviceRoleKey } = config();
  return readPaginatedRows(
    (headers) =>
      checkedFetch(`${baseUrl}/rest/v1/${path}`, {
        headers: authHeaders(serviceRoleKey, { accept: "application/json", ...headers }),
      }),
    columns,
    { budget, maxRows },
  );
}

async function relatedRows(table, select, foreignKey, parentIds, order, columns, budget) {
  if (
    parentIds.some(
      (id) => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(id),
    ) ||
    new Set(parentIds).size !== parentIds.length
  ) {
    throw new Error("Build content has invalid parent identifiers");
  }
  const rows = [];
  const seen = new Set();
  for (let offset = 0; offset < parentIds.length; offset += PARENT_BATCH_SIZE) {
    const ids = parentIds.slice(offset, offset + PARENT_BATCH_SIZE);
    const batch = await dataRows(
      `${table}?select=${select}&${foreignKey}=${encodeURIComponent(idsFilter(ids))}&order=${order}`,
      columns,
      budget,
      MAX_TABLE_ROWS - rows.length,
    );
    const allowed = new Set(ids);
    if (batch.some((row) => !allowed.has(row[foreignKey]))) {
      throw new Error("Build content has an unexpected parent relationship");
    }
    for (const row of batch) {
      const key = JSON.stringify(columns.map((column) => row[column]));
      if (seen.has(key)) throw new Error("Build content repeats a related row across batches");
      seen.add(key);
    }
    rows.push(...batch);
  }
  return rows;
}

async function readCatalogVersion() {
  const version = await dataApi("rpc/compute_operational_catalog_version", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (typeof version !== "string" || !CATALOG_VERSION.test(version)) {
    throw new Error("Database returned an invalid catalog version");
  }
  return version;
}

function storagePath(path) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function downloadPrivateMedia(mediaKey) {
  if (!MEDIA_KEY.test(mediaKey) || mediaKey.includes("..")) {
    throw new Error("Invalid private media key");
  }
  const { baseUrl, serviceRoleKey } = config();
  const response = await checkedFetch(
    `${baseUrl}/storage/v1/object/authenticated/${BUCKET}/${storagePath(mediaKey)}`,
    { headers: authHeaders(serviceRoleKey, { accept: "image/*" }) },
  );
  const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim();
  const bytes = await readBoundedBytes(response, MAX_SOURCE_BYTES);
  return { bytes, contentType };
}

function looksLikeMarkup(bytes) {
  const prefix = bytes
    .subarray(0, Math.min(bytes.length, 512))
    .toString("utf8")
    .trimStart()
    .toLowerCase();
  return (
    prefix.startsWith("<svg") ||
    prefix.startsWith("<!doctype") ||
    prefix.startsWith("<html") ||
    prefix.startsWith("<?xml")
  );
}

function detectMagic(bytes) {
  if (looksLikeMarkup(bytes)) return null;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { format: "jpeg", mime: "image/jpeg" };
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { format: "png", mime: "image/png" };
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { format: "webp", mime: "image/webp" };
  }
  if (bytes.length >= 16 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const brands = bytes.subarray(8, Math.min(bytes.length, 40)).toString("ascii");
    if (brands.includes("avif") || brands.includes("avis")) {
      return { format: "heif", mime: "image/avif" };
    }
  }
  return null;
}

function orientedDimensions(metadata) {
  if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) return null;
  const orientation = metadata.orientation ?? 1;
  const swaps = orientation >= 5 && orientation <= 8;
  return swaps
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height };
}

export async function validateSource(bytes, declaredMime, ownerKind) {
  const magic = detectMagic(bytes);
  if (!magic) throw new Error("Unsupported or suspicious media magic bytes");
  if (declaredMime !== magic.mime) throw new Error("Media MIME does not match magic bytes");

  const metadata = await sharp(bytes, {
    failOn: "error",
    limitInputPixels: MAX_SOURCE_PIXELS,
    pages: 1,
  }).metadata();
  const dimensions = orientedDimensions(metadata);
  if (!dimensions) throw new Error("Media dimensions are missing");
  if ((metadata.pages ?? 1) !== 1) throw new Error("Animated or multi-page media is not allowed");
  if (dimensions.width < MIN_SOURCE_WIDTH) {
    throw new Error("Media source is narrower than 1280px");
  }
  if (dimensions.width * dimensions.height > MAX_SOURCE_PIXELS) {
    throw new Error("Media source exceeds decoded pixel limit");
  }
  if (!isAllowedMediaAspect(dimensions.width, dimensions.height, ownerKind)) {
    throw new Error(
      "Media source must be approximately 4:5 portrait; portfolio and building media also accept 3:2 landscape",
    );
  }
  if (
    metadata.format !== magic.format &&
    !(magic.mime === "image/avif" && metadata.format === "heif")
  ) {
    throw new Error("Decoded image format does not match magic bytes");
  }
  return dimensions;
}

export async function encodeWithinBudget(input, width, format, budget) {
  for (let quality = format === "webp" ? 82 : 58; quality >= 46; quality -= 4) {
    let pipeline = sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_SOURCE_PIXELS,
      pages: 1,
    })
      .autoOrient()
      .resize({ width, withoutEnlargement: true, kernel: sharp.kernel.lanczos3 });
    pipeline =
      format === "webp"
        ? pipeline.webp({ quality, effort: 6, smartSubsample: true })
        : pipeline.avif({ quality, effort: 6, chromaSubsampling: "4:2:0" });
    const result = await pipeline.toBuffer({ resolveWithObject: true });
    if (result.data.length <= budget) return result;
  }
  throw new Error(`${format.toUpperCase()} ${width}w exceeds media byte budget`);
}

export async function assertMetadataStripped(buffer) {
  const metadata = await sharp(buffer, {
    failOn: "error",
    limitInputPixels: MAX_SOURCE_PIXELS,
  }).metadata();
  if (metadata.exif || metadata.xmp || metadata.iptc) {
    throw new Error("Generated media still contains EXIF/XMP/IPTC metadata");
  }
}

async function writeMediaOutputs(mediaKey, bytes, mediaDirectory) {
  const rawHash = createHash("sha256").update(bytes).digest("hex");
  const assetId = createHash("sha256")
    .update(mediaKey)
    .update("\0")
    .update(rawHash)
    .digest("hex")
    .slice(0, 24);
  const assetDir = new URL(`./${assetId}/`, mediaDirectory);
  await mkdir(assetDir, { recursive: true });

  const webpCandidates = [];
  let largest = null;
  for (const width of OUTPUT_WIDTHS) {
    const budget = WEBP_BUDGETS.get(width);
    if (!budget) throw new Error(`Missing media byte budget for ${width}w`);
    const [webp, avif] = await Promise.all([
      encodeWithinBudget(bytes, width, "webp", budget),
      encodeWithinBudget(bytes, width, "avif", budget),
    ]);
    await Promise.all([assertMetadataStripped(webp.data), assertMetadataStripped(avif.data)]);

    const base = `${rawHash.slice(0, 16)}-${width}w`;
    await Promise.all([
      writeFile(new URL(`${base}.webp`, assetDir), webp.data),
      writeFile(new URL(`${base}.avif`, assetDir), avif.data),
    ]);
    webpCandidates.push(`/media/${assetId}/${base}.webp ${width}w`);
    if (width === 1280) largest = webp.info;
  }
  if (!largest) throw new Error("Largest media output was not generated");
  return {
    src: webpCandidates.at(-1).split(" ", 1)[0],
    srcSet: webpCandidates.join(", "),
    width: largest.width,
    height: largest.height,
  };
}

function cleanText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function validateWhatsAppUrl(value) {
  return validateSiteLink(value, "whatsapp");
}

function idsFilter(ids) {
  return `in.(${ids.join(",")})`;
}

function seoFromProduct(row) {
  if (!row.seo_title) return null;
  return {
    title: row.seo_title,
    description: row.seo_description,
    canonicalPath: row.seo_canonical_path,
    robots: row.seo_robots,
  };
}

async function approvedMedia(mediaRows, ownerKind, mediaDirectory) {
  const result = new Map();
  for (const row of mediaRows) {
    if (row.privacy_cleared !== true) continue;
    const mediaKey = cleanText(row.media_key);
    const alt = cleanText(row.alt);
    if (!mediaKey || !alt) throw new Error("Approved media requires media_key and alt");
    if (ownerKind === "portfolio" && !cleanText(row.consent_reference)) {
      throw new Error("Portfolio media requires consent_reference before publication");
    }
    const { bytes, contentType } = await downloadPrivateMedia(mediaKey);
    await validateSource(bytes, contentType, ownerKind);
    const publicAsset = await writeMediaOutputs(mediaKey, bytes, mediaDirectory);
    result.set(mediaKey, { ...publicAsset, alt });
  }
  return result;
}

function mapMedia(rows, publicByKey) {
  return rows
    .filter((row) => row.privacy_cleared === true)
    .sort((a, b) => a.sort_order - b.sort_order || a.media_key.localeCompare(b.media_key))
    .map((row) => publicByKey.get(row.media_key))
    .filter(Boolean);
}

async function loadStructuredContent(mediaDirectory) {
  const budget = createDataApiBudget();
  const catalogVersion = await readCatalogVersion();
  const products = await dataRows(
    "products?select=id,code,slug,product_type,title,summary,description,is_active,is_featured,seo_title,seo_description,seo_canonical_path,seo_robots,sort_order,updated_at&is_active=eq.true&order=sort_order.asc,updated_at.desc,id.asc",
    ["id"],
    budget,
  );
  const productIds = products.map((row) => row.id);
  const [variants, productMediaRows] = productIds.length
    ? await Promise.all([
        relatedRows(
          "product_variants",
          "id,product_id,stone_code,size_code,price_type,amount_toman,price_updated_at,includes,excludes,is_available,sort_order",
          "product_id",
          productIds,
          "product_id.asc,sort_order.asc,id.asc",
          ["id"],
          budget,
        ),
        relatedRows(
          "product_media",
          "product_id,media_key,alt,caption,privacy_cleared,consent_reference,width,height,sort_order",
          "product_id",
          productIds,
          "product_id.asc,sort_order.asc,media_key.asc",
          ["product_id", "media_key"],
          budget,
        ),
      ])
    : [[], []];
  const variantIds = variants.map((row) => row.id);
  const options = variantIds.length
    ? await relatedRows(
        "product_options",
        "id,variant_id,title,price_type,amount_toman,price_updated_at,is_available,compatible_size_codes,sort_order",
        "variant_id",
        variantIds,
        "variant_id.asc,sort_order.asc,id.asc",
        ["id"],
        budget,
      )
    : [];

  const portfolioRows = await dataRows(
    "portfolio_items?select=public_reference_id,stone_code,size_code,summary,sort_order&is_active=eq.true&order=sort_order.asc,public_reference_id.asc",
    ["public_reference_id"],
    budget,
  );
  const portfolioRefs = portfolioRows.map((row) => row.public_reference_id);
  const portfolioMediaRows = portfolioRefs.length
    ? await relatedRows(
        "portfolio_media",
        "public_reference_id,media_key,alt,caption,privacy_cleared,consent_reference,width,height,sort_order",
        "public_reference_id",
        portfolioRefs,
        "public_reference_id.asc,sort_order.asc,media_key.asc",
        ["public_reference_id", "media_key"],
        budget,
      )
    : [];

  const buildingRows = await dataRows(
    "building_stone_items?select=id&is_active=eq.true&order=sort_order.asc,id.asc",
    ["id"],
    budget,
  );
  const buildingIds = buildingRows.map((row) => row.id);
  const buildingMediaRows = buildingIds.length
    ? await relatedRows(
        "building_stone_media",
        "item_id,media_key,alt,caption,privacy_cleared,consent_reference,width,height,sort_order",
        "item_id",
        buildingIds,
        "item_id.asc,sort_order.asc,media_key.asc",
        ["item_id", "media_key"],
        budget,
      )
    : [];

  const siteRows = await dataRows(
    "site_settings?select=id,display_name,latin_name,phone,whatsapp_url,telegram,address,working_hours,instagram_url,website_url,map_url&id=eq.primary&order=id.asc",
    ["id"],
    budget,
    1,
  );

  const productMedia = await approvedMedia(productMediaRows, "product", mediaDirectory);
  const portfolioMedia = await approvedMedia(portfolioMediaRows, "portfolio", mediaDirectory);
  await approvedMedia(buildingMediaRows, "building", mediaDirectory);

  const mappedProducts = products.map((row) => {
    const mediaRows = productMediaRows.filter((media) => media.product_id === row.id);
    const media = mapMedia(mediaRows, productMedia);
    if (media.length === 0) {
      throw new Error(`Active product has no approved media: ${row.id}`);
    }
    const productVariants = variants
      .filter((item) => item.product_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      .map((item) => ({
        id: item.id,
        stoneCode: item.stone_code,
        sizeCode: item.size_code,
        priceType: item.price_type,
        amountToman: item.amount_toman,
        priceUpdatedAt: item.price_updated_at,
        includes: item.includes,
        excludes: item.excludes,
        options: options
          .filter((option) => option.variant_id === item.id)
          .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
          .map((option) => ({
            id: option.id,
            title: option.title,
            priceType: option.price_type,
            amountToman: option.amount_toman,
            priceUpdatedAt: option.price_updated_at,
            isAvailable: option.is_available,
            compatibleSizeCodes: option.compatible_size_codes,
          })),
        isAvailable: item.is_available,
      }));
    return {
      locale: "fa",
      id: row.id,
      code: row.code,
      slug: row.slug,
      type: row.product_type,
      title: row.title,
      summary: row.summary,
      description: row.description,
      isActive: row.is_active,
      isFeatured: row.is_featured,
      media,
      variants: productVariants,
      seo: seoFromProduct(row),
      updatedAt: row.updated_at,
    };
  });

  const mappedPortfolio = portfolioRows.map((row) => {
    const media = mapMedia(
      portfolioMediaRows.filter((entry) => entry.public_reference_id === row.public_reference_id),
      portfolioMedia,
    );
    if (media.length === 0) {
      throw new Error(`Active portfolio item has no approved media: ${row.public_reference_id}`);
    }
    return {
      locale: "fa",
      publicReferenceId: row.public_reference_id,
      media,
      stoneCode: row.stone_code,
      sizeCode: row.size_code,
      summary: row.summary,
    };
  });

  const siteRow = siteRows[0] ?? null;
  const site = siteRow
    ? {
        locale: "fa",
        displayName: siteRow.display_name,
        latinName: siteRow.latin_name,
        phone: siteRow.phone,
        whatsappUrl: validateWhatsAppUrl(siteRow.whatsapp_url),
        telegram: validateSiteLink(siteRow.telegram, "telegram"),
        address: siteRow.address,
        workingHours: siteRow.working_hours,
        links: {
          instagram: validateSiteLink(siteRow.instagram_url, "instagram"),
          website: validateSiteLink(siteRow.website_url, "website"),
          map: validateSiteLink(siteRow.map_url, "map"),
        },
      }
    : null;

  if ((await readCatalogVersion()) !== catalogVersion) {
    throw new Error("Operational catalog changed during content generation");
  }

  return {
    products: mappedProducts,
    portfolio: mappedPortfolio,
    site,
    catalogVersion,
  };
}

function generatedSource({ products, portfolio, site, sites, catalogVersion }) {
  return [
    "/* Generated by scripts/generate-structured-content.mjs. Do not edit by hand. */",
    'import type { CatalogVersion, PortfolioItem, Product, Site } from "./types";',
    'import type { Locale } from "../i18n/locale";',
    "",
    "export const STRUCTURED_CONTENT_GENERATED = true;",
    "export const STRUCTURED_TRANSLATIONS_SUPPORTED = true;",
    `export const GENERATED_PRODUCTS: readonly Product[] = Object.freeze(${JSON.stringify(products, null, 2)} as Product[]);`,
    `export const GENERATED_PORTFOLIO_ITEMS: readonly PortfolioItem[] = Object.freeze(${JSON.stringify(portfolio, null, 2)} as PortfolioItem[]);`,
    `export const GENERATED_SITE: Site | null = ${JSON.stringify(site, null, 2)};`,
    `export const GENERATED_SITES: Readonly<Record<Locale, Site | null>> = { fa: GENERATED_SITE, en: ${JSON.stringify(sites.en, null, 2)} };`,
    `export const GENERATED_CATALOG_VERSION: CatalogVersion = ${JSON.stringify(
      catalogVersion,
    )} as CatalogVersion;`,
    "",
  ].join("\n");
}

// Importing the build-only media checks must not read credentials, fetch content,
// or replace generated artifacts. Direct CLI execution keeps the existing flow.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const authoringOnly = args.length === 2 && args[0] === "--translation-source" && !!args[1];
  if (args.length && !authoringOnly) throw new Error("Invalid structured generator arguments");
  const translation = authoringOnly ? null : await readStructuredTranslations(TRANSLATION_FILE);
  const stage = pathToFileURL(
    (await mkdtemp(new URL("../.structured-build-", import.meta.url))) + "/",
  );
  const stageMedia = new URL("media/", stage),
    stageArtifact = new URL("structured.ts", stage),
    backupMedia = new URL("previous-media/", stage);
  let preserveRecovery = false;
  try {
    await mkdir(stageMedia);
    const base = await loadStructuredContent(stageMedia);
    if (authoringOnly) {
      await writeFile(
        resolve(args[1]),
        JSON.stringify(translationAuthoringSource(base), null, 2) + "\n",
        { encoding: "utf8", flag: "wx" },
      );
    } else {
      const structured = applyStructuredTranslations(base, translation);
      await writeFile(stageArtifact, generatedSource(structured), "utf8");
      await mkdir(new URL("../public/", import.meta.url), { recursive: true });
      try {
        await installStructuredBuild({
          stageMedia,
          stageArtifact,
          mediaDirectory: MEDIA_DIRECTORY,
          artifactFile: OUTPUT_FILE,
          backupMedia,
        });
      } catch (error) {
        preserveRecovery = error.message.includes("requires recovery");
        throw error;
      }
    }
  } finally {
    if (!preserveRecovery) await rm(stage, { recursive: true, force: true });
  }
}
