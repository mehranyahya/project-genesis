import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compileGuides,
  isGuideSlug,
  MAX_GUIDE_BYTES,
  parseGitGuide,
} from "../../../scripts/git-guides.mjs";
import { validateGuideLookup, validateGuideQuery } from "./guide-lookup";

function source(
  overrides: Record<string, unknown> = {},
  body = "## Synthetic heading\n\nSynthetic reviewed body.",
) {
  const meta = {
    slug: "stone-care",
    locale: "fa",
    title: "عنوان آزمون",
    summary: "خلاصه آزمون",
    status: "published",
    reviewed: true,
    version: "test-v1",
    updatedAt: "2026-10-13",
    ...overrides,
  };
  return [
    "---",
    ...Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    "---",
    body,
  ].join("\n");
}
const en = { locale: "en", title: "Synthetic test title", summary: "Synthetic test summary" };

test("reviewed guides emit public fields only and normalize line endings", () => {
  const record = parseGitGuide(source().replaceAll("\n", "\r\n"), "stone-care", "fa")!;
  assert.equal(record.revision, "test-v1");
  assert.equal(record.guide.title, "عنوان آزمون");
  assert.equal(record.guide.updatedAt, "2026-10-13");
  assert.equal(record.guide.body.includes("\r"), false);
  assert.deepEqual(Object.keys(record.guide).sort(), [
    "body",
    "locale",
    "seo",
    "slug",
    "summary",
    "title",
    "updatedAt",
  ]);
});
test("unfinished drafts emit nothing and published guides require reviewed revision/body/summary", () => {
  assert.equal(
    parseGitGuide(
      source(
        { ...en, status: "draft", reviewed: false, version: null, updatedAt: null, summary: null },
        "متن پیش نویس",
      ),
      "stone-care",
      "en",
    ),
    null,
  );
  for (const overrides of [
    { reviewed: false },
    { version: null },
    { version: "" },
    { summary: null },
    { summary: "" },
  ])
    assert.throws(() => parseGitGuide(source(overrides), "stone-care", "fa"));
  assert.throws(() => parseGitGuide(source({}, "   "), "stone-care", "fa"));
});
test("slug identity, unknown keys, duplicate keys and malformed JSON fail without echoing input", () => {
  for (const raw of [
    source({ slug: "other" }),
    source({ locale: "en" }),
    source({ privateKey: "synthetic-private" }),
    source().replace('locale: "fa"', 'locale: "fa"\nlocale: "fa"'),
    source().replace("reviewed: true", "reviewed: yes"),
    "not frontmatter",
  ]) {
    assert.throws(
      () => parseGitGuide(raw, "stone-care", "fa"),
      (error: Error) => !error.message.includes("synthetic-private"),
    );
  }
  for (const value of [
    "",
    "../x",
    "A",
    "a_1",
    "a--b",
    "a-",
    "/guides/a",
    "a".repeat(81),
    "سنگ",
    null,
  ])
    assert.equal(isGuideSlug(value), false);
  for (const value of ["a", "stone-care", "a1-2b", "a".repeat(80)])
    assert.equal(isGuideSlug(value), true);
});
test("guide source and editorial field limits reject oversized content", () => {
  assert.throws(
    () => parseGitGuide(source({}, "x".repeat(MAX_GUIDE_BYTES)), "stone-care", "fa"),
    /source/,
  );
  for (const overrides of [
    { title: "x".repeat(161) },
    { summary: "x".repeat(501) },
    { version: "x".repeat(81) },
    { title: [] },
    { summary: 5 },
  ])
    assert.throws(() => parseGitGuide(source(overrides), "stone-care", "fa"));
});
test("editorial dates must be real calendar dates and are never generated from the clock", () => {
  for (const value of [
    null,
    "",
    "2026-02-29",
    "2026-04-31",
    "0000-01-01",
    "2026-13-01",
    "2026-10-13T00:00:00Z",
    "2026-1-01",
    123,
  ])
    assert.throws(
      () => parseGitGuide(source({ updatedAt: value }), "stone-care", "fa"),
      /calendar date/,
    );
  assert.equal(
    parseGitGuide(source({ updatedAt: "2024-02-29" }), "stone-care", "fa")!.guide.updatedAt,
    "2024-02-29",
  );
});
test("real SEO uses a self canonical and allowlisted robots policy", () => {
  const guide = parseGitGuide(
    source({
      ...en,
      seoTitle: "Real SEO",
      seoDescription: "Real description",
      canonicalPath: "/en/guides/stone-care",
      robots: "noindex,follow",
    }),
    "stone-care",
    "en",
  )!.guide;
  assert.deepEqual(guide.seo, {
    title: "Real SEO",
    description: "Real description",
    canonicalPath: "/en/guides/stone-care",
    robots: "noindex,follow",
  });
  for (const overrides of [
    { canonicalPath: "/guides/wrong" },
    { seoTitle: "Valid", canonicalPath: "https://external.invalid" },
    { seoDescription: "No title" },
    { seoTitle: "Valid", robots: "all" },
    { seoTitle: "x".repeat(161) },
    { seoTitle: "Valid", seoDescription: "x".repeat(321) },
  ])
    assert.throws(() => parseGitGuide(source(overrides), "stone-care", "fa"));
});
test("English publication rejects untranslated title, summary, body and SEO", () => {
  for (const field of ["title", "summary", "seoTitle", "seoDescription"])
    assert.throws(
      () =>
        parseGitGuide(source({ ...en, seoTitle: "Valid", [field]: "فارسی" }), "stone-care", "en"),
      /untranslated/,
    );
  assert.throws(() => parseGitGuide(source(en, "متن فارسی"), "stone-care", "en"), /untranslated/);
  assert.ok(parseGitGuide(source(en), "stone-care", "en"));
});
test("published inline links must be safe and keep their article locale", () => {
  assert.ok(
    parseGitGuide(
      source({}, "[خدمت](/building-stone)\n\n[منبع](https://example.com/stone)"),
      "stone-care",
      "fa",
    ),
  );
  assert.ok(parseGitGuide(source(en, "[Service](/en/building-stone)"), "stone-care", "en"));
  for (const href of [
    "javascript:alert",
    "//evil.invalid",
    "/\\evil.invalid",
    "/%2fevil.invalid",
    "/%5cevil.invalid",
    "/%00x",
    "/bad%zz",
    "https://user:password@example.com/x",
    "https://",
  ])
    assert.throws(
      () => parseGitGuide(source({}, `[Test](${href})`), "stone-care", "fa"),
      /unsafe link/,
    );
  for (const href of ["/building-stone", "/en/../quote", "/en/%2e%2e/quote"])
    assert.throws(
      () => parseGitGuide(source(en, `[Service](${href})`), "stone-care", "en"),
      /internal link/,
    );
  assert.throws(
    () => parseGitGuide(source({}, "[Service](/en/quote)"), "stone-care", "fa"),
    /locale/,
  );
});
test("compiled order is stable by date then slug and empty locales never fall back", () => {
  const records = [
    parseGitGuide(source({ slug: "b", updatedAt: "2026-10-12" }), "b", "fa")!,
    parseGitGuide(source({ slug: "c" }), "c", "fa")!,
    parseGitGuide(source({ slug: "a" }), "a", "fa")!,
  ];
  const before = JSON.stringify(records),
    result = compileGuides({ fa: records, en: [] });
  assert.deepEqual(
    result.fa.map((item) => item.slug),
    ["a", "c", "b"],
  );
  assert.deepEqual(result.en, []);
  assert.equal(JSON.stringify(records), before);
});
test("duplicate publications, excess sources and mismatched paired revisions fail", () => {
  const fa = parseGitGuide(source(), "stone-care", "fa")!;
  const english = parseGitGuide(source({ ...en, version: "test-v2" }), "stone-care", "en")!;
  assert.throws(() => compileGuides({ fa: [fa, fa], en: [] }), /Duplicate/);
  assert.throws(() => compileGuides({ fa: Array(101).fill(fa), en: [] }), /Too many/);
  assert.throws(() => compileGuides({ fa: [fa], en: [english] }), /reviewed revision/);
  assert.equal(compileGuides({ fa: [fa], en: [{ ...english, revision: "test-v1" }] }).en.length, 1);
});
test("GET guide boundaries validate locale, slug, integer limits and unknown fields", () => {
  assert.deepEqual(validateGuideLookup({ slug: "stone-care" }), {
    slug: "stone-care",
    locale: "fa",
  });
  assert.deepEqual(validateGuideLookup({ slug: "stone-care", locale: "en" }), {
    slug: "stone-care",
    locale: "en",
  });
  assert.deepEqual(validateGuideQuery({}), { locale: "fa", limit: 100 });
  assert.deepEqual(validateGuideQuery({ locale: "en", limit: 1 }), { locale: "en", limit: 1 });
  for (const input of [
    null,
    [],
    "a",
    { slug: "../a" },
    { slug: "a", locale: "ar" },
    { slug: "a", locale: null },
    { slug: "a", privateKey: "synthetic" },
  ])
    assert.throws(() => validateGuideLookup(input));
  for (const input of [
    null,
    [],
    { locale: "ar" },
    { locale: null },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: "1" },
    { limit: NaN },
    { privateKey: "synthetic" },
  ])
    assert.throws(() => validateGuideQuery(input));
});
