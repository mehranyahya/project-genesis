/**
 * Pure, side-effect free static / legal / not-found page view-models.
 *
 * Content comes exclusively from the official adapters (`getPage`, `getSite`).
 * Nothing is fabricated: a missing page yields `null` and the route stays in a
 * neutral CONTENT_BLOCKED state. Adapter input is never mutated. Body markup is
 * rendered through the first-party safe markdown model built in Prompt 10.
 */

import { parseGuideMarkdown } from "./guides";
import type { GuideBlock } from "./guides";
import type { Page, PageSlug, Site } from "./content/types";

/** Trims a possible string; empty or non-string becomes null. */
function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Only real, same-origin absolute paths may act as canonical URLs. */
export function isSafeCanonicalPath(value: unknown): boolean {
  const path = cleanText(value);
  if (path === null) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (/[\s<>"']/.test(path)) return false;
  return true;
}

export const NOINDEX = "noindex";

export interface StaticPageModel {
  slug: PageSlug;
  title: string;
  blocks: GuideBlock[];
  metaTitle: string;
  metaDescription: string | null;
  canonicalPath: string | null;
  robots: string | null;
}

/**
 * Builds a static page model from the adapter value.
 * Returns null when the adapter has no usable page — the CONTENT_BLOCKED state.
 * A page whose slug disagrees with the requested slug is not usable.
 */
export function buildStaticPageModel(
  page: Page | null | undefined,
  expectedSlug: PageSlug,
): StaticPageModel | null {
  if (!page) return null;
  const slug = cleanText(page.slug);
  const title = cleanText(page.title);
  if (slug === null || slug !== expectedSlug) return null;
  if (title === null) return null;

  const seo = page.seo ?? null;

  return {
    slug: expectedSlug,
    title,
    blocks: parseGuideMarkdown(page.body),
    metaTitle: cleanText(seo?.title) ?? title,
    metaDescription: cleanText(seo?.description),
    canonicalPath: isSafeCanonicalPath(seo?.canonicalPath)
      ? (cleanText(seo?.canonicalPath) as string)
      : null,
    robots: cleanText(seo?.robots),
  };
}

/** Head metadata for a page that has no real content yet. Never indexable. */
export function contentBlockedMeta(): { name: string; content: string }[] {
  return [{ name: "robots", content: NOINDEX }];
}

/* ------------------------------------------------------------------ *
 * Contact
 * ------------------------------------------------------------------ */

export type ContactEntryKind = "tel" | "link" | "text";

export interface ContactEntry {
  key: string;
  label: string;
  value: string;
  href: string | null;
  kind: ContactEntryKind;
}

const EXTERNAL_LINK = /^https:\/\/[^/\s]+/i;

function isSafeExternalHref(value: string): boolean {
  if (/[\s<>"']/.test(value)) return false;
  return EXTERNAL_LINK.test(value);
}

/**
 * Contact details built strictly from the Site adapter.
 * A null Site, or any absent field, produces no entry at all.
 */
export function buildContactDetails(site: Site | null | undefined): ContactEntry[] {
  if (!site) return [];
  const entries: ContactEntry[] = [];

  const phone = cleanText(site.phone);
  if (phone !== null) {
    entries.push({ key: "phone", label: "تلفن", value: phone, href: `tel:${phone}`, kind: "tel" });
  }

  const linkFields: { key: string; label: string; value: string | null }[] = [
    { key: "whatsapp", label: "واتساپ", value: cleanText(site.whatsapp) },
    { key: "telegram", label: "تلگرام", value: cleanText(site.telegram) },
    { key: "instagram", label: "اینستاگرام", value: cleanText(site.links?.instagram) },
    { key: "website", label: "وب‌سایت", value: cleanText(site.links?.website) },
    { key: "map", label: "نقشه", value: cleanText(site.links?.map) },
  ];

  for (const field of linkFields) {
    if (field.value === null) continue;
    if (!isSafeExternalHref(field.value)) continue;
    entries.push({
      key: field.key,
      label: field.label,
      value: field.value,
      href: field.value,
      kind: "link",
    });
  }

  const address = cleanText(site.address);
  if (address !== null) {
    entries.push({ key: "address", label: "نشانی", value: address, href: null, kind: "text" });
  }

  const workingHours = cleanText(site.workingHours);
  if (workingHours !== null) {
    entries.push({
      key: "hours",
      label: "ساعات کاری",
      value: workingHours,
      href: null,
      kind: "text",
    });
  }

  return entries;
}

export interface ContactPageModel {
  page: StaticPageModel | null;
  details: ContactEntry[];
}

/** Contact combines real page copy with real site data; neither invents the other. */
export function buildContactPageModel(
  page: Page | null | undefined,
  site: Site | null | undefined,
): ContactPageModel {
  return {
    page: buildStaticPageModel(page, "contact"),
    details: buildContactDetails(site),
  };
}

/* ------------------------------------------------------------------ *
 * Not found
 * ------------------------------------------------------------------ */

export const NOT_FOUND_MARKER = "۴۰۴";

/** Not-found UI model. Without a real page there is only a structural marker. */
export function buildNotFoundModel(page: Page | null | undefined): StaticPageModel | null {
  return buildStaticPageModel(page, "not-found");
}
