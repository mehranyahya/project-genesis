import { isSafeGuideHref } from "./guide-links.mjs";
import { isGuideSlug, MAX_GUIDE_BYTES, MAX_GUIDES_PER_LOCALE } from "./guide-policy.mjs";
export { isGuideSlug, MAX_GUIDE_BYTES, MAX_GUIDES_PER_LOCALE } from "./guide-policy.mjs";
const META_KEYS = new Set([
  "slug",
  "locale",
  "title",
  "summary",
  "status",
  "reviewed",
  "version",
  "updatedAt",
  "seoTitle",
  "seoDescription",
  "canonicalPath",
  "robots",
]);

function text(value, max) {
  return typeof value === "string" && value.trim() && value.trim().length <= max;
}

function validDate(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) ||
    value.startsWith("0000")
  )
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Drafts are never emitted. The revision remains an authoring/review field. */
export function parseGitGuide(raw, expectedSlug, expectedLocale) {
  if (
    typeof raw !== "string" ||
    Buffer.byteLength(raw, "utf8") > MAX_GUIDE_BYTES ||
    !isGuideSlug(expectedSlug) ||
    !["fa", "en"].includes(expectedLocale)
  )
    throw new Error("Invalid Git guide source");
  const normalized = raw.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) throw new Error("Invalid Git guide frontmatter");
  const close = normalized.indexOf("\n---\n", 4);
  if (close < 0) throw new Error("Invalid Git guide frontmatter");
  const meta = {};
  for (const line of normalized.slice(4, close).split("\n")) {
    if (!line.trim()) continue;
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/.exec(line);
    if (!match || !META_KEYS.has(match[1]) || Object.hasOwn(meta, match[1]))
      throw new Error("Invalid Git guide metadata key");
    try {
      meta[match[1]] = JSON.parse(match[2]);
    } catch {
      throw new Error("Invalid Git guide metadata value");
    }
  }
  if (
    meta.slug !== expectedSlug ||
    meta.locale !== expectedLocale ||
    !text(meta.title, 160) ||
    !["draft", "published"].includes(meta.status) ||
    typeof meta.reviewed !== "boolean"
  )
    throw new Error("Git guide metadata does not match its publication contract");
  if (meta.status === "draft") return null;
  if (meta.reviewed !== true || !text(meta.version, 80))
    throw new Error("Published Git guide requires a reviewed revision");
  if (!text(meta.summary, 500) || !validDate(meta.updatedAt))
    throw new Error("Published Git guide requires a summary and a valid calendar date");
  const body = normalized.slice(close + 5).trim();
  if (!body) throw new Error("Published Git guide has no body");
  const canonical = `${expectedLocale === "en" ? "/en" : ""}/guides/${expectedSlug}`;
  if (meta.canonicalPath != null && meta.canonicalPath !== canonical)
    throw new Error("Git guide canonical does not match slug and locale");
  for (const [key, max] of [
    ["seoTitle", 160],
    ["seoDescription", 320],
  ])
    if (meta[key] != null && !text(meta[key], max)) throw new Error("Invalid Git guide SEO field");
  if (
    meta.robots != null &&
    !["index,follow", "noindex,follow", "noindex,nofollow"].includes(meta.robots)
  )
    throw new Error("Invalid Git guide robots policy");
  if (
    meta.seoTitle == null &&
    [meta.seoDescription, meta.canonicalPath, meta.robots].some((value) => value != null)
  )
    throw new Error("Git guide SEO fields require a title");
  if (
    expectedLocale === "en" &&
    [meta.title, meta.summary, meta.seoTitle, meta.seoDescription, body].some(
      (value) => typeof value === "string" && /[\u0600-\u06FF]/u.test(value),
    )
  )
    throw new Error("Published English Git guide contains untranslated text");
  // Match only the simple inline syntax supported by the existing renderer.
  for (const match of body.matchAll(/\[([^\]\n]*)\]\(([^)\s]*)\)/g)) {
    const href = match[2];
    if (!isSafeGuideHref(href)) throw new Error("Published Git guide contains an unsafe link");
    if (href.startsWith("/")) {
      const decoded = decodeURIComponent(href).split(/[?#]/, 1)[0];
      if (decoded.split("/").some((part) => part === "." || part === ".."))
        throw new Error("Git guide internal link contains a dot segment");
      const englishPath = decoded === "/en" || decoded.startsWith("/en/");
      if ((expectedLocale === "en") !== englishPath)
        throw new Error("Git guide internal link does not match its locale");
    }
  }
  return {
    guide: {
      locale: expectedLocale,
      slug: expectedSlug,
      title: meta.title.trim(),
      summary: meta.summary.trim(),
      body,
      updatedAt: meta.updatedAt,
      seo:
        meta.seoTitle == null
          ? null
          : {
              title: meta.seoTitle.trim(),
              description: meta.seoDescription?.trim() ?? null,
              canonicalPath: meta.canonicalPath ?? null,
              robots: meta.robots ?? null,
            },
    },
    revision: meta.version.trim(),
  };
}

/** Stable, date-descending order; paired publications require one reviewed revision. */
export function compileGuides(records) {
  const output = { fa: [], en: [] };
  for (const locale of ["fa", "en"]) {
    if (records[locale].length > MAX_GUIDES_PER_LOCALE) throw new Error("Too many Git guides");
    const seen = new Set();
    for (const record of records[locale]) {
      if (seen.has(record.guide.slug)) throw new Error("Duplicate Git guide slug");
      seen.add(record.guide.slug);
      const other = records[locale === "fa" ? "en" : "fa"].find(
        (item) => item.guide.slug === record.guide.slug,
      );
      if (other && other.revision !== record.revision)
        throw new Error("Published guide translations must share one reviewed revision");
      output[locale].push(record.guide);
    }
    output[locale].sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt, "en") || a.slug.localeCompare(b.slug, "en"),
    );
  }
  return output;
}
