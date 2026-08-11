import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { ResponsiveImage } from "@/components/media/responsive-image";
import { isPublicMedia } from "@/lib/content/media";
import type { Media } from "@/lib/content/types";

const hash = "a".repeat(64);
const validMedia = (overrides: Partial<Media> = {}): Media => ({
  src: `/media/catalog/${hash}-800.webp`,
  srcSet: {
    avif: `/media/catalog/${hash}-480.avif 480w, /media/catalog/${hash}-800.avif 800w`,
    webp: `/media/catalog/${hash}-480.webp 480w, /media/catalog/${hash}-800.webp 800w`,
  },
  width: 800,
  height: 1000,
  alt: "نمای کامل سنگ",
  ...overrides,
});

test("public media accepts only exact same-origin hash-addressed DTOs", () => {
  assert.equal(isPublicMedia(validMedia()), true);
  assert.equal(isPublicMedia({ ...validMedia(), mediaKey: "private/object.jpg" }), false);
  assert.equal(isPublicMedia(validMedia({ src: `https://example.test/${hash}-800.webp` })), false);
  assert.equal(
    isPublicMedia(
      validMedia({
        srcSet: {
          avif: `/media/catalog/${hash}-800.avif 800w, /media/catalog/${hash}-480.avif 480w`,
          webp: `/media/catalog/${hash}-480.webp 480w, /media/catalog/${hash}-800.webp 800w`,
        },
      }),
    ),
    false,
  );
  assert.equal(isPublicMedia(validMedia({ width: 1200 })), false);
  assert.equal(isPublicMedia(validMedia({ alt: "  نمای کامل سنگ" })), false);
});

test("responsive image emits AVIF/WebP sources, fixed dimensions and one high-priority LCP", () => {
  const html = renderToStaticMarkup(
    <ResponsiveImage
      media={validMedia()}
      fit="contain"
      sizes="(min-width: 1024px) 58vw, 100vw"
      priority
    />,
  );

  assert.match(html, /<picture/);
  assert.match(html, /type="image\/avif"/);
  assert.match(html, /type="image\/webp"/);
  assert.match(html, /width="800"/);
  assert.match(html, /height="1000"/);
  assert.match(html, /fetchPriority="high"/);
  assert.match(html, /loading="eager"/);
  assert.match(html, /object-contain/);
  assert.doesNotMatch(html, /mediaKey|consent|supabase/i);
});

test("non-priority media is lazy and invalid media renders nothing", () => {
  const lazy = renderToStaticMarkup(
    <ResponsiveImage media={validMedia()} fit="cover" sizes="100vw" />,
  );
  assert.match(lazy, /loading="lazy"/);
  assert.doesNotMatch(lazy, /fetchPriority="high"/);
  assert.match(lazy, /object-cover/);

  const invalid = validMedia({ src: "/private/file.webp" });
  assert.equal(
    renderToStaticMarkup(<ResponsiveImage media={invalid} fit="cover" sizes="100vw" />),
    "",
  );
});
