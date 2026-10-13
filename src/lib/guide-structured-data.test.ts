import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGuideDetailModel } from "./guides";
import { guideStructuredData } from "./guide-structured-data";
import type { Guide } from "./content/types";
import { localizedHead } from "./route-defs/shared";

function guide(overrides: Partial<Guide> = {}) {
  return buildGuideDetailModel(
    {
      locale: "en",
      slug: "synthetic-care",
      title: "Visible synthetic title",
      summary: "Reviewed synthetic summary.",
      body: "Reviewed synthetic article body.",
      updatedAt: "2026-10-13",
      seo: {
        title: "Search title",
        description: null,
        robots: "index,follow",
        canonicalPath: null,
      },
      translationLocales: ["en"],
      ...overrides,
    },
    "en",
  )!;
}

test("Article uses its visible reviewed heading and language without inventing author, image, publication time or commerce", () => {
  const data = JSON.parse(
    guideStructuredData(guide(), "en", "https://example.com/en/guides/synthetic-care")!,
  );
  assert.deepEqual(data, {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Visible synthetic title",
    inLanguage: "en",
    url: "https://example.com/en/guides/synthetic-care",
  });
});

test("schema JSON cannot terminate the data script or inject HTML, while parsing preserves the original visible title", () => {
  const title = 'Synthetic </SCRIPT><script>alert("synthetic")</script> <>& \u2028\u2029 retained';
  const json = guideStructuredData(
    guide({ title }),
    "en",
    "https://example.com/en/guides/synthetic-care",
  )!;
  assert.doesNotMatch(json, /[<>&\u2028\u2029]/);
  assert.equal(JSON.parse(json).headline, title);
});

test("unapproved search eligibility, missing prose and wrong language produce no schema", () => {
  const model = guide();
  for (const robots of ["noindex,follow", "none", "NoIndex, nofollow"])
    assert.equal(
      guideStructuredData(
        { ...model, robots },
        "en",
        "https://example.com/en/guides/synthetic-care",
      ),
      null,
    );
  assert.equal(
    guideStructuredData(
      { ...model, translationLocales: [] },
      "en",
      "https://example.com/en/guides/synthetic-care",
    ),
    null,
  );
  assert.equal(
    guideStructuredData(
      { ...model, blocks: [] },
      "en",
      "https://example.com/en/guides/synthetic-care",
    ),
    null,
  );
  assert.equal(guideStructuredData(model, "fa", "https://example.com/guides/synthetic-care"), null);
});

test("schema needs a configured clean HTTPS canonical and cannot incorporate a query, hash or credentials", () => {
  for (const url of [
    "/en/guides/synthetic-care",
    "http://example.com/en/guides/synthetic-care",
    "https://user:pass@example.com/en/guides/synthetic-care",
    "https://example.com/en/guides/other",
    "https://example.com/en/guides/synthetic-care?phone=private",
    "https://example.com/en/guides/synthetic-care#private",
  ])
    assert.equal(guideStructuredData(guide(), "en", url), null);
});

test("social metadata describes its own locale and type without asserting a nonexistent alternate or image", () => {
  for (const locale of ["fa", "en"] as const) {
    const head = localizedHead({
      locale,
      basePath: "/guides/synthetic-care",
      title: "راهنماها",
      ogType: "article",
      translationLocales: [locale],
    });
    assert.ok(
      head.meta.some(
        (item) =>
          item.property === "og:locale" && item.content === (locale === "fa" ? "fa_IR" : "en_US"),
      ),
    );
    assert.ok(head.meta.some((item) => item.property === "og:type" && item.content === "article"));
    assert.equal(
      head.meta.some(
        (item) => item.property === "og:image" || item.property === "og:locale:alternate",
      ),
      false,
    );
  }
});
