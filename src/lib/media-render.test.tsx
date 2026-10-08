import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n/react";
import { PublicMedia } from "@/components/media/public-media";
import { ProductMediaStage } from "@/components/product/product-media-stage";
import { PortfolioCard } from "@/components/portfolio/portfolio-card";
import type { Media } from "@/lib/content/types";

const media = (id: string, width = 1280, height = 1600): Media => {
  const base = `/media/${"a".repeat(24)}/${id.repeat(16)}`;
  return {
    src: `${base}-1280w.webp`,
    srcSet: [320, 640, 1280].map((size) => `${base}-${size}w.webp ${size}w`).join(", "),
    width,
    height,
    alt: "Natural stone, full view",
  };
};

test("gallery SSR exposes only its first image with reserved geometry and high priority", () => {
  const first = media("b");
  const second = media("c");
  const html = renderToStaticMarkup(
    <LocaleProvider locale="en">
      <ProductMediaStage media={[first, second]} />
    </LocaleProvider>,
  );
  assert.equal((html.match(/<img /g) ?? []).length, 1);
  assert.ok(html.includes(first.src));
  assert.equal(html.includes(second.src), false);
  assert.match(html, /width="1280" height="1600"/);
  assert.match(html, /loading="eager" fetchPriority="high"/);
  assert.match(html, /object-contain/);
  assert.match(html, /aria-label="Product image gallery"/);
  assert.match(html, /Next image/);
  assert.match(html, /1 of 2/);
  assert.doesNotMatch(html, /[\u0600-\u06FF]/);
});

test("gallery empty and single-image states provide no false controls or media", () => {
  const empty = renderToStaticMarkup(
    <LocaleProvider locale="en">
      <ProductMediaStage media={[]} />
    </LocaleProvider>,
  );
  assert.doesNotMatch(empty, /<img|<button/);
  assert.match(empty, /No approved image has been published for this model\./);
  const single = renderToStaticMarkup(<ProductMediaStage media={[media("b")]} />);
  assert.doesNotMatch(single, /<button/);
  assert.equal((single.match(/<img /g) ?? []).length, 1);
});

test("responsive media stays lazy by default; requested swaps are eager without high priority", () => {
  const image = media("b");
  const lazy = renderToStaticMarkup(<PublicMedia media={image} />);
  assert.match(lazy, /loading="lazy" fetchPriority="auto"/);
  assert.match(lazy, /type="image\/avif"/);
  const requested = renderToStaticMarkup(<PublicMedia media={image} eager fit="contain" />);
  assert.match(requested, /loading="eager" fetchPriority="auto"/);
  assert.match(requested, /object-contain/);
  assert.doesNotMatch(requested, /rel="preload"/);
});

test("portfolio preserves the entire landscape and the public reference in both languages", () => {
  for (const locale of ["fa", "en"] as const) {
    const html = renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <PortfolioCard
          card={{
            publicReferenceId: "pf-1001",
            quotePath: "/quote?source=portfolio&reference=pf-1001",
            media: media("b", 1280, 853),
            stoneCode: null,
            sizeCode: "120x60",
            sizeLabel: "۱۲۰×۶۰",
            summary: null,
          }}
        />
      </LocaleProvider>,
    );
    assert.match(html, /aspect-\[3\/2\]/);
    assert.doesNotMatch(html, /\bstyle=/);
    assert.match(html, /object-contain/);
    assert.match(html, /loading="lazy" fetchPriority="auto"/);
    const prefix = locale === "en" ? "/en" : "";
    assert.ok(html.includes(`href="${prefix}/quote?source=portfolio&amp;reference=pf-1001"`));
    if (locale === "en") assert.doesNotMatch(html, /[\u0600-\u06FF]/);
  }
});
