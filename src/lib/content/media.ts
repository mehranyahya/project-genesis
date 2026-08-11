import type { Media } from "./types";

export const PUBLIC_MEDIA_MAX_WIDTH = 1600;
export const PUBLIC_MEDIA_MAX_HEIGHT = 3200;

const MEDIA_PATH_PATTERN = /^\/media\/catalog\/[0-9a-f]{64}-([1-9][0-9]{1,3})\.(avif|webp)$/;

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function parseSrcSet(value: unknown, extension: "avif" | "webp"): string[] | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) return null;

  const urls: string[] = [];
  let previousWidth = 0;

  for (const candidate of value.split(",")) {
    const match =
      /^(\/media\/catalog\/[0-9a-f]{64}-([1-9][0-9]{1,3})\.(avif|webp)) ([1-9][0-9]{1,3})w$/.exec(
        candidate.trim(),
      );
    if (match === null || match[3] !== extension || match[2] !== match[4]) return null;

    const width = Number(match[2]);
    if (!Number.isSafeInteger(width) || width <= previousWidth || width > PUBLIC_MEDIA_MAX_WIDTH) {
      return null;
    }

    previousWidth = width;
    urls.push(match[1]!);
  }

  return urls.length > 0 && urls.length <= 8 ? urls : null;
}

export function isPublicMedia(value: unknown): value is Media {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (!hasExactKeys(value, ["alt", "height", "src", "srcSet", "width"])) return false;

  const media = value as Record<string, unknown>;
  if (
    typeof media["alt"] !== "string" ||
    media["alt"] !== media["alt"].trim() ||
    media["alt"].length === 0 ||
    media["alt"].length > 300 ||
    hasControlCharacters(media["alt"])
  ) {
    return false;
  }

  if (
    !Number.isSafeInteger(media["width"]) ||
    Number(media["width"]) < 1 ||
    Number(media["width"]) > PUBLIC_MEDIA_MAX_WIDTH ||
    !Number.isSafeInteger(media["height"]) ||
    Number(media["height"]) < 1 ||
    Number(media["height"]) > PUBLIC_MEDIA_MAX_HEIGHT
  ) {
    return false;
  }

  if (typeof media["src"] !== "string") return false;
  const srcMatch = MEDIA_PATH_PATTERN.exec(media["src"]);
  if (srcMatch === null || srcMatch[2] !== "webp" || Number(srcMatch[1]) !== media["width"]) {
    return false;
  }

  if (
    typeof media["srcSet"] !== "object" ||
    media["srcSet"] === null ||
    Array.isArray(media["srcSet"])
  ) {
    return false;
  }
  if (!hasExactKeys(media["srcSet"], ["avif", "webp"])) return false;

  const srcSet = media["srcSet"] as Record<string, unknown>;
  const avif = parseSrcSet(srcSet["avif"], "avif");
  const webp = parseSrcSet(srcSet["webp"], "webp");
  if (avif === null || webp === null || avif.length !== webp.length) return false;

  const avifWidths = avif.map((url) => Number(MEDIA_PATH_PATTERN.exec(url)?.[1]));
  const webpWidths = webp.map((url) => Number(MEDIA_PATH_PATTERN.exec(url)?.[1]));
  if (avifWidths.some((width, index) => width !== webpWidths[index])) return false;
  if (webp.at(-1) !== media["src"] || webpWidths.at(-1) !== media["width"]) return false;

  return true;
}
