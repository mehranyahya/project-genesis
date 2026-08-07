/**
 * Pure, side-effect free guides view-model and first-party safe markdown model.
 *
 * No fixtures, no fabricated copy, no HTML execution. Adapter output is the only
 * source of content and is never mutated. Unsupported markdown syntax degrades to
 * inert text; raw HTML is never parsed, injected or executed.
 */

import type { Guide } from "./content/types";

const dateFormatter = new Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeZone: "UTC" });

/** Trims a possible string; empty or non-string becomes null. */
function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Builds the internal guide path. Never an absolute URL. */
export function guidePath(slug: string): string {
  return `/guides/${slug}`;
}

function formatUpdatedAt(value: unknown): string | null {
  const raw = cleanText(value);
  if (raw === null) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return dateFormatter.format(parsed);
}

/* ------------------------------------------------------------------ *
 * Safe markdown model
 * ------------------------------------------------------------------ */

export type GuideInline =
  { kind: "text"; text: string } | { kind: "link"; href: string; text: string };

export type GuideBlock =
  | { kind: "paragraph"; content: GuideInline[] }
  | { kind: "heading"; level: 2 | 3; content: GuideInline[] }
  | { kind: "list"; ordered: boolean; items: GuideInline[][] };

const LINK_PATTERN = /\[([^\]\n]*)\]\(([^)\s]*)\)/g;

/** Only same-origin absolute paths and explicit https URLs may become links. */
export function isSafeGuideHref(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const href = value.trim();
  if (href === "" || href !== value.trim() || /[\s<>"']/.test(href)) return false;
  for (const char of href) if (char.charCodeAt(0) < 0x20) return false;
  if (href.startsWith("//")) return false;
  if (href.startsWith("/")) return true;
  return /^https:\/\/[^/\s]+/i.test(href);
}

/** Splits one line of text into inert text and safe links. Raw HTML stays text. */
function parseInline(line: string): GuideInline[] {
  const nodes: GuideInline[] = [];
  let cursor = 0;
  LINK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (text: string) => {
    if (text === "") return;
    const previous = nodes[nodes.length - 1];
    if (previous && previous.kind === "text") previous.text += text;
    else nodes.push({ kind: "text", text });
  };

  while ((match = LINK_PATTERN.exec(line)) !== null) {
    const [whole, label = "", href = ""] = match;
    pushText(line.slice(cursor, match.index));
    const text = label.trim();
    if (text !== "" && isSafeGuideHref(href)) {
      nodes.push({ kind: "link", href: href.trim(), text });
    } else {
      pushText(whole);
    }
    cursor = match.index + whole.length;
  }
  pushText(line.slice(cursor));

  return nodes;
}

function listMarker(line: string): { ordered: boolean; text: string } | null {
  const unordered = /^[-*]\s+(.*)$/.exec(line);
  if (unordered) return { ordered: false, text: unordered[1] ?? "" };
  const ordered = /^\d{1,3}[.)]\s+(.*)$/.exec(line);
  if (ordered) return { ordered: true, text: ordered[1] ?? "" };
  return null;
}

/**
 * Converts guide body markdown into a safe, semantic React-renderable model.
 * A leading `#` never yields a second H1: it is demoted to H2.
 */
export function parseGuideMarkdown(body: unknown): GuideBlock[] {
  const source = typeof body === "string" ? body : "";
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: GuideBlock[] = [];

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: GuideInline[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const content = parseInline(paragraph.join(" ").trim());
    paragraph = [];
    if (content.length > 0) blocks.push({ kind: "paragraph", content });
  };
  const flushList = () => {
    if (list && list.items.length > 0) {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
    }
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level: 2 | 3 = (heading[1] ?? "").length >= 3 ? 3 : 2;
      const content = parseInline((heading[2] ?? "").trim());
      if (content.length > 0) blocks.push({ kind: "heading", level, content });
      continue;
    }

    const item = listMarker(line);
    if (item) {
      flushParagraph();
      if (list && list.ordered !== item.ordered) flushList();
      if (!list) list = { ordered: item.ordered, items: [] };
      const content = parseInline(item.text.trim());
      if (content.length > 0) list.items.push(content);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

/* ------------------------------------------------------------------ *
 * View-models
 * ------------------------------------------------------------------ */

export interface GuideListItem {
  slug: string;
  path: string;
  title: string;
  summary: string | null;
  updatedAt: string | null;
  updatedLabel: string | null;
}

export interface GuideDetailModel {
  slug: string;
  path: string;
  title: string;
  summary: string | null;
  updatedAt: string | null;
  updatedLabel: string | null;
  blocks: GuideBlock[];
  metaTitle: string;
  metaDescription: string | null;
}

/** Ordered list model. Entries without a real slug and title are dropped. */
export function buildGuideListModel(guides: readonly Guide[] | null | undefined): GuideListItem[] {
  const items: GuideListItem[] = [];
  const seen = new Set<string>();

  for (const guide of guides ?? []) {
    if (!guide) continue;
    const slug = cleanText(guide.slug);
    const title = cleanText(guide.title);
    if (slug === null || title === null) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);

    const updatedAt = cleanText(guide.updatedAt);
    items.push({
      slug,
      path: guidePath(slug),
      title,
      summary: cleanText(guide.summary),
      updatedAt,
      updatedLabel: formatUpdatedAt(updatedAt),
    });
  }

  return items;
}

/** Detail model. Returns null when the adapter has no usable guide. */
export function buildGuideDetailModel(guide: Guide | null | undefined): GuideDetailModel | null {
  if (!guide) return null;
  const slug = cleanText(guide.slug);
  const title = cleanText(guide.title);
  if (slug === null || title === null) return null;

  const updatedAt = cleanText(guide.updatedAt);
  const summary = cleanText(guide.summary);

  return {
    slug,
    path: guidePath(slug),
    title,
    summary,
    updatedAt,
    updatedLabel: formatUpdatedAt(updatedAt),
    blocks: parseGuideMarkdown(guide.body),
    metaTitle: cleanText(guide.seo?.title) ?? title,
    metaDescription: cleanText(guide.seo?.description) ?? summary,
  };
}
