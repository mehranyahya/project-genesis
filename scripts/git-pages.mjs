import { createHash } from "node:crypto";

export const PAGE_LOCALES = ["fa", "en"];
export const ALLOWED_PAGE_SLUGS = new Set([
  "home",
  "building-stone",
  "stoneworks",
  "about",
  "contact",
  "privacy",
  "terms",
  "not-found",
]);
export const MAX_FILE_BYTES = 256 * 1024;
const META_KEYS = new Set([
  "slug",
  "locale",
  "title",
  "status",
  "reviewed",
  "version",
  "seoTitle",
  "seoDescription",
  "canonicalPath",
  "robots",
  "stoneworkCategories",
  "mediaReferences",
]);
// Kept in parity with the stable request IDs; a contract test checks both sets.
const STONEWORK_CATEGORY_IDS = new Set([
  "sculpture_art",
  "water_landscape",
  "architectural_elements",
  "furniture_interiors",
  "monuments_bespoke",
]);

export function computeTermsContentHash(version, body, locale = "fa") {
  if (!PAGE_LOCALES.includes(locale)) throw new Error("Invalid Terms locale");
  const input = `${version.trim()}\n${body.replace(/\r\n?/g, "\n").trim()}`;
  return createHash("sha256")
    .update(locale === "fa" ? input : `en\n${input}`, "utf8")
    .digest("hex");
}

function seo(meta, slug, locale) {
  if (
    meta.seoTitle != null &&
    (typeof meta.seoTitle !== "string" ||
      !meta.seoTitle.trim() ||
      meta.seoTitle.trim().length > 160)
  )
    throw new Error("Invalid Git page SEO title");
  const values = {};
  for (const [key, max] of [
    ["seoDescription", 320],
    ["canonicalPath", 240],
    ["robots", 120],
  ]) {
    const value = meta[key];
    if (value == null) values[key] = null;
    else if (typeof value === "string" && value.trim() && value.trim().length <= max)
      values[key] = value.trim();
    else throw new Error("Invalid Git page SEO field");
  }
  const base = slug === "home" ? "/" : `/${slug}`;
  const canonical = locale === "fa" ? base : base === "/" ? "/en" : `/en${base}`;
  if (values.canonicalPath !== null && values.canonicalPath !== canonical)
    throw new Error("Git page canonical does not match slug and locale");
  if (meta.seoTitle == null) {
    if (Object.values(values).some((value) => value !== null))
      throw new Error("Git page SEO fields require a title");
    return null;
  }
  return {
    title: meta.seoTitle.trim(),
    description: values.seoDescription,
    canonicalPath: values.canonicalPath,
    robots: values.robots,
  };
}

/** Compile approved public fields only; draft pages have no DTO or release. */
export function parseGitPage(raw, expectedSlug, expectedLocale = "fa") {
  if (
    typeof raw !== "string" ||
    Buffer.byteLength(raw, "utf8") > MAX_FILE_BYTES ||
    !ALLOWED_PAGE_SLUGS.has(expectedSlug) ||
    !PAGE_LOCALES.includes(expectedLocale)
  )
    throw new Error("Invalid Git page source");
  const normalized = raw.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) throw new Error("Invalid Git page frontmatter");
  const close = normalized.indexOf("\n---\n", 4);
  if (close < 0) throw new Error("Invalid Git page frontmatter");
  const meta = {};
  for (const line of normalized.slice(4, close).split("\n")) {
    if (!line.trim()) continue;
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/.exec(line);
    if (!match || !META_KEYS.has(match[1]) || Object.hasOwn(meta, match[1]))
      throw new Error("Invalid Git page metadata key");
    try {
      meta[match[1]] = JSON.parse(match[2]);
    } catch {
      throw new Error("Invalid Git page metadata value");
    }
  }
  if (
    meta.slug !== expectedSlug ||
    meta.locale !== expectedLocale ||
    typeof meta.title !== "string" ||
    !meta.title.trim() ||
    meta.title.trim().length > 160 ||
    !["draft", "published"].includes(meta.status) ||
    typeof meta.reviewed !== "boolean"
  )
    throw new Error("Git page metadata does not match its publication contract");
  if (meta.status === "draft") return null;
  if (meta.reviewed !== true) throw new Error("Published Git page must be reviewed");
  if (meta.mediaReferences !== undefined) {
    const refs = meta.mediaReferences;
    if (
      !["building-stone", "stoneworks"].includes(expectedSlug) ||
      !Array.isArray(refs) ||
      refs.length > 3 ||
      refs.some((ref) => {
        if (
          !ref ||
          typeof ref !== "object" ||
          Array.isArray(ref) ||
          typeof ref.assetId !== "string" ||
          !/^[0-9a-f]{24}$/.test(ref.assetId)
        )
          return true;
        const keys = Object.keys(ref).sort().join(",");
        return ref.source === "building"
          ? expectedSlug !== "building-stone" || keys !== "assetId,source"
          : ref.source !== "portfolio" ||
              keys !== "assetId,publicReferenceId,source" ||
              typeof ref.publicReferenceId !== "string" ||
              !/^pf-[0-9]{4,}$/.test(ref.publicReferenceId);
      }) ||
      new Set(refs.map((ref) => ref.assetId)).size !== refs.length
    )
      throw new Error("Invalid approved service media references");
  }
  if (expectedSlug !== "stoneworks" && meta.stoneworkCategories !== undefined)
    throw new Error("Stonework categories require the Stoneworks page");
  if (expectedSlug === "stoneworks") {
    const ids = meta.stoneworkCategories;
    if (
      !Array.isArray(ids) ||
      ids.length > STONEWORK_CATEGORY_IDS.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !STONEWORK_CATEGORY_IDS.has(id))
    )
      throw new Error("Published Stoneworks requires explicit approved category IDs");
  }
  const body = normalized.slice(close + 5).trim();
  if (!body) throw new Error("Published Git page has no body");
  if (
    expectedLocale === "en" &&
    [meta.title, meta.seoTitle, meta.seoDescription, body].some(
      (value) => typeof value === "string" && /[\u0600-\u06FF]/u.test(value),
    )
  )
    throw new Error("Published English Git page contains untranslated text");
  const page = {
    locale: expectedLocale,
    slug: expectedSlug,
    title: meta.title.trim(),
    body,
    seo: seo(meta, expectedSlug, expectedLocale),
  };
  if (expectedSlug === "stoneworks") page.stoneworkCategories = [...meta.stoneworkCategories];
  if (meta.mediaReferences !== undefined)
    page.mediaReferences = meta.mediaReferences.map((ref) => ({ ...ref }));
  if (expectedSlug === "terms") {
    if (typeof meta.version !== "string" || !meta.version.trim() || meta.version.trim().length > 80)
      throw new Error("Published Terms require a reviewed version");
    page.version = meta.version.trim();
    page.contentHash = computeTermsContentHash(page.version, body, expectedLocale);
  }
  return page;
}

export function termsReleases(pages) {
  const releases = { fa: null, en: null };
  let version = null;
  for (const locale of PAGE_LOCALES) {
    const page = pages[locale]?.terms;
    if (!page) continue;
    if (version !== null && version !== page.version)
      throw new Error("Published Terms translations must share one version");
    version = page.version;
    releases[locale] = {
      version: page.version,
      currentContentHash: page.contentHash,
      allowedContentHashes: [page.contentHash],
    };
  }
  return releases;
}
