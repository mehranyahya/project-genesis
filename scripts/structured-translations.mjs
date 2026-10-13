import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";

export const MAX_TRANSLATION_BYTES = 8 * 1024 * 1024;
const HASH = /^[0-9a-f]{64}$/;
const ASSET = /^\/media\/([0-9a-f]{24})\//;
const ARABIC = /[\u0600-\u06ff]/;
const fail = () => {
  throw new Error("Invalid or stale reviewed structured translation");
};

function record(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    fail();
  return value;
}
function text(value, maximum, nullable = false) {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximum ||
    ARABIC.test(value)
  )
    fail();
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail();
    } else if (c >= 0xdc00 && c <= 0xdfff) fail();
  }
  return value.trim();
}
function keyed(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length > 10_000
  )
    fail();
  return value;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}
function assetId(media) {
  const id = ASSET.exec(media.src)?.[1];
  if (!id) fail();
  return id;
}
function mediaSource(media) {
  return media.map((image) => ({ assetId: assetId(image), alt: image.alt }));
}
export function translationSourceHash(kind, source) {
  let editorial;
  if (kind === "product")
    editorial = {
      id: source.id,
      code: source.code,
      slug: source.slug,
      title: source.title,
      summary: source.summary,
      description: source.description,
      seo: source.seo,
      media: mediaSource(source.media),
      variants: source.variants.map((variant) => ({
        id: variant.id,
        stoneCode: variant.stoneCode,
        sizeCode: variant.sizeCode,
        includes: variant.includes,
        excludes: variant.excludes,
        options: variant.options.map((option) => ({ id: option.id, title: option.title })),
      })),
    };
  else if (kind === "portfolio")
    editorial = {
      publicReferenceId: source.publicReferenceId,
      stoneCode: source.stoneCode,
      sizeCode: source.sizeCode,
      summary: source.summary,
      media: mediaSource(source.media),
    };
  else if (kind === "site")
    editorial = {
      displayName: source.displayName,
      latinName: source.latinName,
      address: source.address,
      workingHours: source.workingHours,
    };
  else fail();
  return createHash("sha256")
    .update(`structured-translation-v1\n${kind}\n${JSON.stringify(stable(editorial))}`)
    .digest("hex");
}
function matchesSource(value, kind, source) {
  if (
    typeof value.sourceHash !== "string" ||
    !HASH.test(value.sourceHash) ||
    value.sourceHash !== translationSourceHash(kind, source)
  )
    fail();
}
function translatedMedia(value, source) {
  const alts = keyed(value);
  const ids = source.map(assetId);
  if (
    new Set(ids).size !== ids.length ||
    Object.keys(alts).length !== ids.length ||
    Object.keys(alts).some((id) => !ids.includes(id))
  )
    fail();
  return source.map((image) => ({ ...image, alt: text(alts[assetId(image)], 500) }));
}
function lines(value, source) {
  if (
    !Array.isArray(value) ||
    !Array.isArray(source) ||
    value.length !== source.length ||
    value.length > 1_000
  )
    fail();
  return value.map((line) => text(line, 2_000));
}
function seo(value, slug) {
  if (value === null) return null;
  const entry = record(value, ["title", "description", "canonicalPath", "robots"]);
  if (entry.canonicalPath !== null && entry.canonicalPath !== `/en/grave-stones/${slug}`) fail();
  return {
    title: text(entry.title, 160),
    description: text(entry.description, 320, true),
    canonicalPath: entry.canonicalPath,
    robots: text(entry.robots, 120, true),
  };
}
function translateProduct(entry, source) {
  record(entry, ["sourceHash", "title", "summary", "description", "seo", "media", "variants"]);
  matchesSource(entry, "product", source);
  const variants = keyed(entry.variants);
  if (
    Object.keys(variants).length !== source.variants.length ||
    Object.keys(variants).some((id) => !source.variants.some((item) => item.id === id))
  )
    fail();
  return {
    ...source,
    locale: "en",
    title: text(entry.title, 160),
    summary: text(entry.summary, 2_000, true),
    description: text(entry.description, 40_000, true),
    seo: seo(entry.seo, source.slug),
    media: translatedMedia(entry.media, source.media),
    variants: source.variants.map((variant) => {
      const translation = record(variants[variant.id], ["includes", "excludes", "options"]);
      const options = keyed(translation.options);
      if (
        Object.keys(options).length !== variant.options.length ||
        Object.keys(options).some((id) => !variant.options.some((option) => option.id === id))
      )
        fail();
      return {
        ...variant,
        includes: lines(translation.includes, variant.includes),
        excludes: lines(translation.excludes, variant.excludes),
        options: variant.options.map((option) => ({
          ...option,
          title: text(record(options[option.id], ["title"]).title, 160),
        })),
      };
    }),
  };
}

/** English prose is reviewed independently; operational values remain authoritative. */
export function applyStructuredTranslations(base, translation) {
  const sites = { fa: base.site, en: null };
  const result = { ...base, sites };
  if (translation === null) return result;
  record(translation, [
    "schemaVersion",
    "locale",
    "revision",
    "status",
    "reviewed",
    "products",
    "portfolio",
    "site",
  ]);
  if (
    translation.schemaVersion !== 1 ||
    translation.locale !== "en" ||
    !["draft", "published"].includes(translation.status) ||
    typeof translation.reviewed !== "boolean"
  )
    fail();
  if (translation.status === "draft") return result;
  if (translation.reviewed !== true) fail();
  text(translation.revision, 80);
  const productEntries = keyed(translation.products),
    portfolioEntries = keyed(translation.portfolio);
  const englishProducts = Object.entries(productEntries).map(([id, entry]) => {
    const matches = base.products.filter(
      (product) => product.id === id && product.isActive === true,
    );
    if (matches.length !== 1) fail();
    return translateProduct(entry, matches[0]);
  });
  const englishPortfolio = Object.entries(portfolioEntries).map(([id, value]) => {
    const matches = base.portfolio.filter((item) => item.publicReferenceId === id);
    if (matches.length !== 1) fail();
    const source = matches[0],
      entry = record(value, ["sourceHash", "summary", "media"]);
    matchesSource(entry, "portfolio", source);
    return {
      ...source,
      locale: "en",
      summary: text(entry.summary, 4_000, true),
      media: translatedMedia(entry.media, source.media),
    };
  });
  if (translation.site !== null) {
    if (!base.site) fail();
    const entry = record(translation.site, [
      "sourceHash",
      "displayName",
      "address",
      "workingHours",
    ]);
    matchesSource(entry, "site", base.site);
    sites.en = {
      ...base.site,
      locale: "en",
      displayName: text(entry.displayName, 160),
      address: text(entry.address, 2_000, true),
      workingHours: text(entry.workingHours, 500, true),
    };
  }
  return {
    ...result,
    products: [...base.products, ...englishProducts],
    portfolio: [...base.portfolio, ...englishPortfolio],
  };
}

/** JSON.parse does not detect duplicate keys; scan actual decoded object keys first. */
export function parseTranslationJson(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > MAX_TRANSLATION_BYTES) fail();
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    fail();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const stack = [];
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]/g;
  for (const match of raw.matchAll(tokens)) {
    const token = match[0];
    if (token === "{" || token === "[") {
      if (stack.length >= 64) fail();
      stack.push({ object: token === "{", key: token === "{", seen: new Set() });
    } else if (token === "}" || token === "]") stack.pop();
    else if (token === ":") {
      if (stack.at(-1)?.object) stack.at(-1).key = false;
    } else if (token === ",") {
      if (stack.at(-1)?.object) stack.at(-1).key = true;
    } else if (stack.at(-1)?.object && stack.at(-1).key) {
      const key = JSON.parse(token),
        current = stack.at(-1);
      if (current.seen.has(key)) fail();
      current.seen.add(key);
    }
  }
  return value;
}
export async function readStructuredTranslations(url) {
  let file;
  try {
    file = await open(url, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    fail();
  }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_TRANSLATION_BYTES) fail();
    const bytes = Buffer.alloc(MAX_TRANSLATION_BYTES + 1);
    let used = 0;
    while (used < bytes.length) {
      const { bytesRead } = await file.read(bytes, used, bytes.length - used, null);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > MAX_TRANSLATION_BYTES) fail();
    let raw;
    try {
      raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, used));
    } catch {
      fail();
    }
    return parseTranslationJson(raw);
  } finally {
    await file.close();
  }
}

/** Draft authoring reference only. Contains public fields, never private source keys. */
export function translationAuthoringSource(base) {
  const media = (items) => Object.fromEntries(items.map((image) => [assetId(image), image.alt]));
  return {
    schemaVersion: 1,
    locale: "en",
    revision: null,
    status: "draft",
    reviewed: false,
    products: Object.fromEntries(
      base.products.map((product) => [
        product.id,
        {
          sourceHash: translationSourceHash("product", product),
          title: product.title,
          summary: product.summary,
          description: product.description,
          seo: product.seo
            ? { ...product.seo, canonicalPath: `/en/grave-stones/${product.slug}` }
            : null,
          media: media(product.media),
          variants: Object.fromEntries(
            product.variants.map((variant) => [
              variant.id,
              {
                includes: variant.includes,
                excludes: variant.excludes,
                options: Object.fromEntries(
                  variant.options.map((option) => [option.id, { title: option.title }]),
                ),
              },
            ]),
          ),
        },
      ]),
    ),
    portfolio: Object.fromEntries(
      base.portfolio.map((item) => [
        item.publicReferenceId,
        {
          sourceHash: translationSourceHash("portfolio", item),
          summary: item.summary,
          media: media(item.media),
        },
      ]),
    ),
    site: base.site
      ? {
          sourceHash: translationSourceHash("site", base.site),
          displayName: base.site.displayName,
          address: base.site.address,
          workingHours: base.site.workingHours,
        }
      : null,
  };
}
