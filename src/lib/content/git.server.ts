import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Page, PageSlug, SeoMeta } from "./types";
import { PAGE_SLUGS } from "./types";

const CONTENT_ROOT = path.resolve(process.cwd(), "content", "pages");
const FRONTMATTER_DELIMITER = "---";
const MAX_FILE_BYTES = 256 * 1024;

const PAGE_SLUG_SET = new Set<PageSlug>(PAGE_SLUGS);

type Frontmatter = Record<string, unknown>;

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function parseFrontmatter(raw: string): { meta: Frontmatter; body: string } | null {
  const normalized = normalizeNewlines(raw);
  if (!normalized.startsWith(`${FRONTMATTER_DELIMITER}\n`)) return null;

  const close = normalized.indexOf(`\n${FRONTMATTER_DELIMITER}\n`, 4);
  if (close < 0) return null;

  const header = normalized.slice(4, close);
  const body = normalized.slice(close + 5).trim();
  if (body.length === 0) return null;

  const meta: Frontmatter = {};
  for (const line of header.split("\n")) {
    if (line.trim().length === 0) continue;
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/.exec(line);
    if (!match) return null;
    const key = match[1]!;
    if (Object.prototype.hasOwnProperty.call(meta, key)) return null;
    try {
      meta[key] = JSON.parse(match[2]!);
    } catch {
      return null;
    }
  }

  return { meta, body };
}

function optionalString(meta: Frontmatter, key: string, max: number): string | null | undefined {
  const value = meta[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return undefined;
  return trimmed;
}

function buildSeo(meta: Frontmatter): SeoMeta | null {
  const title = optionalString(meta, "seoTitle", 160);
  if (title == null) return null;

  const description = optionalString(meta, "seoDescription", 320);
  const canonicalPath = optionalString(meta, "canonicalPath", 240);
  const robots = optionalString(meta, "robots", 120);

  if (description === undefined || canonicalPath === undefined || robots === undefined) return null;
  if (canonicalPath !== null && !/^\/(?!\/)[^\s]*$/.test(canonicalPath)) return null;

  return { title, description, canonicalPath, robots };
}

export function computeTermsContentHash(version: string, body: string): string {
  const normalizedVersion = version.trim();
  const normalizedBody = normalizeNewlines(body).trim();
  return createHash("sha256")
    .update(`${normalizedVersion}\n${normalizedBody}`, "utf8")
    .digest("hex");
}

export function parseGitPage(raw: string, expectedSlug: PageSlug): Page | null {
  const parsed = parseFrontmatter(raw);
  if (parsed === null) return null;

  const slug = parsed.meta["slug"];
  const title = parsed.meta["title"];
  if (slug !== expectedSlug || typeof title !== "string") return null;

  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0 || trimmedTitle.length > 160) return null;

  const page: Page = {
    slug: expectedSlug,
    title: trimmedTitle,
    body: parsed.body,
    seo: buildSeo(parsed.meta),
  };

  if (expectedSlug === "terms") {
    const version = optionalString(parsed.meta, "version", 80);
    if (version == null) return null;
    page.version = version;
    page.contentHash = computeTermsContentHash(version, parsed.body);
  }

  return page;
}

export async function loadGitPage(slug: PageSlug): Promise<Page | null> {
  if (!PAGE_SLUG_SET.has(slug)) return null;

  const filePath = path.join(CONTENT_ROOT, `${slug}.md`);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "ENOENT") return null;
    throw error;
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_FILE_BYTES) return null;
  return parseGitPage(raw, slug);
}
