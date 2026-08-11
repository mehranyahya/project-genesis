import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import sharp from "sharp";

export const MEDIA_BUCKET = "catalog-media";
export const MEDIA_MAX_BYTES = 20 * 1024 * 1024;
export const MEDIA_DOWNLOAD_TIMEOUT_MS = 30_000;
export const MEDIA_MAX_INPUT_PIXELS = 64 * 1024 * 1024;
export const MEDIA_MIN_DIMENSION = 320;
export const MEDIA_MAX_DIMENSION = 12_000;
export const MEDIA_MIN_ASPECT_RATIO = 0.5;
export const MEDIA_MAX_ASPECT_RATIO = 2;
export const MEDIA_OUTPUT_WIDTHS = [480, 800, 1200, 1600];

const ALLOWED_CONTENT_TYPES = new Map([
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

function fail(message) {
  throw new Error(`Secure media pipeline: ${message}`);
}

export function normalizeSupabaseOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("CONTENT_SUPABASE_URL must be a valid URL");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname)
  ) {
    fail("CONTENT_SUPABASE_URL must be a clean hosted Supabase HTTPS origin");
  }

  return parsed.origin;
}

export function validateSecretKey(value) {
  if (typeof value !== "string" || !/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(value)) {
    fail("CONTENT_SUPABASE_SECRET_KEY must be a server-only sb_secret key");
  }
  return value;
}

export function validateMediaKey(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 240 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("//") ||
    value.includes("\\") ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) ||
    value.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    fail("media key is not a safe relative object path");
  }
  return value;
}

export function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  if (buffer.length >= 16 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brands = buffer.subarray(8, Math.min(buffer.length, 40)).toString("ascii");
    if (brands.includes("avif") || brands.includes("avis")) return "avif";
  }
  return null;
}

function normalizedContentType(value) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function orientedDimensions(metadata) {
  const width = metadata.width;
  const height = metadata.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    fail("decoded dimensions are unavailable");
  }
  return metadata.orientation != null && metadata.orientation >= 5
    ? { width: height, height: width }
    : { width, height };
}

function validateDimensions(width, height, declaredWidth, declaredHeight) {
  if (
    width < MEDIA_MIN_DIMENSION ||
    height < MEDIA_MIN_DIMENSION ||
    width > MEDIA_MAX_DIMENSION ||
    height > MEDIA_MAX_DIMENSION ||
    width * height > MEDIA_MAX_INPUT_PIXELS
  ) {
    fail("decoded dimensions are outside the approved bounds");
  }

  const ratio = width / height;
  if (ratio < MEDIA_MIN_ASPECT_RATIO || ratio > MEDIA_MAX_ASPECT_RATIO) {
    fail("image aspect ratio is outside the approved bounds");
  }

  const hasDeclaredWidth = declaredWidth != null;
  const hasDeclaredHeight = declaredHeight != null;
  if (hasDeclaredWidth !== hasDeclaredHeight) fail("declared dimensions must be paired");
  if (
    hasDeclaredWidth &&
    (!Number.isSafeInteger(declaredWidth) ||
      !Number.isSafeInteger(declaredHeight) ||
      declaredWidth !== width ||
      declaredHeight !== height)
  ) {
    fail("declared dimensions do not match decoded media");
  }
}

function outputName(buffer, width, extension) {
  const digest = createHash("sha256").update(buffer).digest("hex");
  return `${digest}-${width}.${extension}`;
}

async function writeVariant({ buffer, width, extension, outputDir }) {
  const name = outputName(buffer, width, extension);
  await writeFile(new URL(name, outputDir), buffer, { flag: "wx" }).catch((error) => {
    if (error?.code !== "EEXIST") throw error;
  });
  return `/media/catalog/${name}`;
}

async function readLimitedBody(response, expectedLength) {
  if (response.body === null) fail("private object response has no body");

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) fail("private object response body is invalid");
      total += value.byteLength;
      if (total > MEDIA_MAX_BYTES) {
        fail("downloaded object size is outside the approved bounds");
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (total === 0) fail("downloaded object size is outside the approved bounds");
  if (expectedLength !== null && total !== expectedLength) {
    fail("private object content-length does not match the downloaded body");
  }
  return Buffer.concat(chunks, total);
}

export async function transformMedia({ buffer, declaredWidth, declaredHeight, outputDir }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MEDIA_MAX_BYTES) {
    fail("downloaded object size is outside the approved bounds");
  }

  const detectedFormat = detectImageFormat(buffer);
  if (detectedFormat === null) fail("magic bytes are not an approved raster image");

  const metadata = await sharp(buffer, {
    failOn: "error",
    limitInputPixels: MEDIA_MAX_INPUT_PIXELS,
    sequentialRead: true,
  }).metadata();
  const decodedFormat = metadata.format === "heif" ? "avif" : metadata.format;
  if (decodedFormat !== detectedFormat) fail("decoded format does not match magic bytes");
  if ((metadata.pages ?? 1) !== 1) fail("animated or multi-page media is not allowed");

  const dimensions = orientedDimensions(metadata);
  validateDimensions(dimensions.width, dimensions.height, declaredWidth, declaredHeight);

  const largestWidth = Math.min(dimensions.width, MEDIA_OUTPUT_WIDTHS.at(-1));
  const widths = [
    ...new Set([...MEDIA_OUTPUT_WIDTHS.filter((width) => width < largestWidth), largestWidth]),
  ]
    .filter((width) => width > 0)
    .sort((a, b) => a - b);

  await mkdir(outputDir, { recursive: true });

  const avifEntries = [];
  const webpEntries = [];
  let fallback = null;
  let fallbackHeight = null;

  for (const width of widths) {
    const base = () =>
      sharp(buffer, {
        failOn: "error",
        limitInputPixels: MEDIA_MAX_INPUT_PIXELS,
        sequentialRead: true,
      })
        .rotate()
        .resize({ width, withoutEnlargement: true });

    const avifBuffer = await base().avif({ quality: 52, effort: 4 }).toBuffer();
    const webpResult = await base()
      .webp({ quality: 84, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const avifUrl = await writeVariant({
      buffer: avifBuffer,
      width: webpResult.info.width,
      extension: "avif",
      outputDir,
    });
    const webpUrl = await writeVariant({
      buffer: webpResult.data,
      width: webpResult.info.width,
      extension: "webp",
      outputDir,
    });

    avifEntries.push(`${avifUrl} ${webpResult.info.width}w`);
    webpEntries.push(`${webpUrl} ${webpResult.info.width}w`);
    fallback = webpUrl;
    fallbackHeight = webpResult.info.height;
  }

  if (fallback === null || fallbackHeight === null) fail("no public variant was produced");

  return {
    asset: {
      src: fallback,
      srcSet: { avif: avifEntries.join(", "), webp: webpEntries.join(", ") },
      width: largestWidth,
      height: fallbackHeight,
    },
    sourceWidth: dimensions.width,
    sourceHeight: dimensions.height,
  };
}

export async function downloadPrivateMedia({
  supabaseOrigin,
  secretKey,
  mediaKey,
  fetchImpl = fetch,
}) {
  const origin = normalizeSupabaseOrigin(supabaseOrigin);
  const key = validateSecretKey(secretKey);
  const objectPath = validateMediaKey(mediaKey)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = `${origin}/storage/v1/object/authenticated/${MEDIA_BUCKET}/${objectPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MEDIA_DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg",
        apikey: key,
        authorization: `Bearer ${key}`,
      },
    });

    if (!response.ok) fail(`private object download failed with HTTP ${response.status}`);

    const contentLength = response.headers.get("content-length");
    let declaredLength = null;
    if (contentLength !== null) {
      declaredLength = Number(contentLength);
      if (
        !Number.isSafeInteger(declaredLength) ||
        declaredLength < 1 ||
        declaredLength > MEDIA_MAX_BYTES
      ) {
        fail("private object content-length is invalid");
      }
    }

    const contentType = normalizedContentType(response.headers.get("content-type"));
    const expectedFormat = ALLOWED_CONTENT_TYPES.get(contentType);
    if (expectedFormat === undefined) fail("private object MIME type is not approved");

    const buffer = await readLimitedBody(response, declaredLength);
    if (detectImageFormat(buffer) !== expectedFormat) {
      fail("private object MIME type does not match magic bytes");
    }
    return buffer;
  } catch (error) {
    if (controller.signal.aborted) fail("private object download timed out");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function materializeMediaReferences({
  references,
  supabaseOrigin,
  secretKey,
  outputDir,
  fetchImpl = fetch,
}) {
  const cache = new Map();
  const result = new Map();

  for (const reference of references) {
    const mediaKey = validateMediaKey(reference.mediaKey);
    let processed = cache.get(mediaKey);
    if (processed === undefined) {
      const buffer = await downloadPrivateMedia({
        supabaseOrigin,
        secretKey,
        mediaKey,
        fetchImpl,
      });
      processed = await transformMedia({
        buffer,
        declaredWidth: reference.width,
        declaredHeight: reference.height,
        outputDir,
      });
      cache.set(mediaKey, processed);
    } else {
      validateDimensions(
        processed.sourceWidth,
        processed.sourceHeight,
        reference.width,
        reference.height,
      );
    }
    result.set(reference.id, { ...processed.asset, alt: reference.alt });
  }

  return result;
}
