import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import sharp from "sharp";

import {
  detectImageFormat,
  downloadPrivateMedia,
  MEDIA_MAX_BYTES,
  normalizeSupabaseOrigin,
  transformMedia,
  validateMediaKey,
  validateSecretKey,
} from "./prepare-media.mjs";

test("trusted build configuration rejects public keys, foreign origins and unsafe object paths", () => {
  assert.equal(
    normalizeSupabaseOrigin("https://project-ref.supabase.co"),
    "https://project-ref.supabase.co",
  );
  assert.throws(() => normalizeSupabaseOrigin("https://example.test"));
  assert.throws(() => normalizeSupabaseOrigin("http://project-ref.supabase.co"));
  assert.equal(validateSecretKey(`sb_secret_${"a".repeat(32)}`), `sb_secret_${"a".repeat(32)}`);
  assert.throws(() => validateSecretKey(`sb_publishable_${"a".repeat(32)}`));
  assert.equal(validateMediaKey("products/p-1/front.jpg"), "products/p-1/front.jpg");
  for (const unsafe of [
    "/root.jpg",
    "../root.jpg",
    "a/../../root.jpg",
    "a\\root.jpg",
    "a//b.jpg",
  ]) {
    assert.throws(() => validateMediaKey(unsafe));
  }
});

test("magic-byte detection rejects SVG, HTML and extension-only claims", () => {
  assert.equal(detectImageFormat(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(detectImageFormat(Buffer.from("<!doctype html><title>x</title>")), null);
  assert.equal(detectImageFormat(Buffer.from("not really a photo.jpg")), null);
  assert.equal(detectImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xdb])), "jpeg");
});

test("private downloads keep the secret in headers and enforce MIME and streaming limits", async () => {
  const secretKey = `sb_secret_${"a".repeat(32)}`;
  let requestUrl = "";
  let requestInit;
  const buffer = await downloadPrivateMedia({
    supabaseOrigin: "https://project-ref.supabase.co",
    secretKey,
    mediaKey: "products/p-1/front.jpg",
    fetchImpl: async (url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xdb]), {
        headers: { "content-type": "image/jpeg" },
      });
    },
  });

  assert.deepEqual(buffer, Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
  assert.equal(requestUrl.includes(secretKey), false);
  assert.equal(requestUrl.endsWith("/catalog-media/products/p-1/front.jpg"), true);
  assert.equal(requestInit.redirect, "error");
  assert.equal(requestInit.headers.apikey, secretKey);
  assert.equal(requestInit.headers.authorization, `Bearer ${secretKey}`);

  await assert.rejects(
    downloadPrivateMedia({
      supabaseOrigin: "https://project-ref.supabase.co",
      secretKey,
      mediaKey: "products/p-1/front.jpg",
      fetchImpl: async () =>
        new Response(Buffer.from("<svg/>"), { headers: { "content-type": "image/svg+xml" } }),
    }),
    /MIME type is not approved/,
  );

  await assert.rejects(
    downloadPrivateMedia({
      supabaseOrigin: "https://project-ref.supabase.co",
      secretKey,
      mediaKey: "products/p-1/front.jpg",
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(MEDIA_MAX_BYTES + 1));
              controller.close();
            },
          }),
          { headers: { "content-type": "image/jpeg" } },
        ),
    }),
    /size is outside/,
  );

  await assert.rejects(
    downloadPrivateMedia({
      supabaseOrigin: "https://project-ref.supabase.co",
      secretKey,
      mediaKey: "products/p-1/front.jpg",
      fetchImpl: async () =>
        new Response(Buffer.from([0xff, 0xd8, 0xff, 0xdb]), {
          headers: { "content-length": "5", "content-type": "image/jpeg" },
        }),
    }),
    /content-length does not match/,
  );
});

test("raster processing strips metadata and emits only hashed AVIF/WebP variants", async () => {
  const outputPath = await mkdtemp(join(tmpdir(), "mehrara-media-test-"));
  try {
    const input = await sharp({
      create: {
        width: 640,
        height: 800,
        channels: 3,
        background: { r: 30, g: 50, b: 45 },
      },
    })
      .jpeg({ quality: 90 })
      .withExif({ IFD0: { Copyright: "private-test-metadata" } })
      .toBuffer();

    assert.ok((await sharp(input).metadata()).exif);
    const processed = await transformMedia({
      buffer: input,
      declaredWidth: 640,
      declaredHeight: 800,
      outputDir: pathToFileURL(`${outputPath}/`),
    });

    assert.equal(processed.sourceWidth, 640);
    assert.equal(processed.sourceHeight, 800);
    assert.equal(processed.asset.width, 640);
    assert.equal(processed.asset.height, 800);
    assert.match(processed.asset.src, /^\/media\/catalog\/[0-9a-f]{64}-640\.webp$/);

    const files = await readdir(outputPath);
    assert.ok(files.length >= 4);
    assert.ok(files.every((name) => /^[0-9a-f]{64}-[1-9][0-9]{1,3}\.(avif|webp)$/.test(name)));
    for (const name of files) {
      const metadata = await sharp(join(outputPath, name)).metadata();
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.xmp, undefined);
    }
  } finally {
    await rm(outputPath, { recursive: true, force: true });
  }
});

test("processing rejects undersized, extreme-ratio and mismatched-dimension images", async () => {
  const outputPath = await mkdtemp(join(tmpdir(), "mehrara-media-reject-"));
  try {
    const small = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "black" },
    })
      .png()
      .toBuffer();
    await assert.rejects(
      transformMedia({
        buffer: small,
        declaredWidth: 100,
        declaredHeight: 100,
        outputDir: pathToFileURL(`${outputPath}/`),
      }),
    );

    const extreme = await sharp({
      create: { width: 320, height: 1000, channels: 3, background: "black" },
    })
      .png()
      .toBuffer();
    await assert.rejects(
      transformMedia({
        buffer: extreme,
        declaredWidth: 320,
        declaredHeight: 1000,
        outputDir: pathToFileURL(`${outputPath}/`),
      }),
    );

    const valid = await sharp({
      create: { width: 400, height: 500, channels: 3, background: "black" },
    })
      .png()
      .toBuffer();
    await assert.rejects(
      transformMedia({
        buffer: valid,
        declaredWidth: 401,
        declaredHeight: 500,
        outputDir: pathToFileURL(`${outputPath}/`),
      }),
    );
  } finally {
    await rm(outputPath, { recursive: true, force: true });
  }
});
