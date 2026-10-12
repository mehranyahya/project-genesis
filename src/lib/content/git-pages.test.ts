import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  computeTermsContentHash,
  MAX_FILE_BYTES,
  parseGitPage,
  termsReleases,
} from "../../../scripts/git-pages.mjs";
import { validatePageLookup } from "./page-lookup";
import type { Page, PageSlug } from "./types";
import type { Locale } from "../i18n/locale";

const BODY = "Synthetic approved test text.";
const metadata = {
  slug: "terms",
  locale: "fa",
  status: "published",
  reviewed: true,
  title: "Test terms",
  version: "test-v1",
};
function source(overrides: Record<string, unknown> = {}, body = BODY) {
  return [
    "---",
    ...Object.entries({ ...metadata, ...overrides }).map(
      ([key, value]) => `${key}: ${JSON.stringify(value)}`,
    ),
    "---",
    body,
  ].join("\n");
}

test("published Git pages expose only approved public DTO fields", () => {
  const page = parseGitPage(source(), "terms", "fa");
  assert.deepEqual(page, {
    locale: "fa",
    slug: "terms",
    title: "Test terms",
    body: BODY,
    seo: null,
    version: "test-v1",
    contentHash: computeTermsContentHash("test-v1", BODY),
  });
  assert.equal(Object.hasOwn(page!, "reviewed"), false);
  assert.equal(Object.hasOwn(page!, "status"), false);
});

test("a draft Terms page publishes neither text nor an acceptance hash", () => {
  assert.equal(
    parseGitPage(
      source({ status: "draft", reviewed: false, version: null }, "synthetic-private-draft"),
      "terms",
    ),
    null,
  );
});

test("an unreviewed or empty published page fails instead of inventing content", () => {
  assert.throws(() => parseGitPage(source({ reviewed: false }), "terms"), /must be reviewed/);
  assert.throws(() => parseGitPage(source({}, " \n "), "terms"), /has no body/);
  for (const version of [null, "", "x".repeat(81), 1])
    assert.throws(() => parseGitPage(source({ version }), "terms"), /require a reviewed version/);
});

test("Git source must identify the exact filename slug and directory language", () => {
  for (const overrides of [{ locale: "en" }, { locale: "ar" }, { locale: null }, { slug: "about" }])
    assert.throws(() => parseGitPage(source(overrides), "terms", "fa"), /publication contract/);
  assert.throws(() => parseGitPage(source(), "../terms" as PageSlug), /Invalid Git page source/);
});

test("unknown, duplicate and malformed frontmatter values fail without echoing their values", () => {
  for (const raw of [
    source({ secret: "synthetic-private-value" }),
    source().replace(
      'title: "Test terms"',
      'title: "Test terms"\ntitle: "synthetic-private-value"',
    ),
    source().replace('title: "Test terms"', "title: synthetic-private-value"),
    source({ reviewed: "synthetic-private-value" }),
  ]) {
    assert.throws(
      () => parseGitPage(raw, "terms"),
      (error: unknown) =>
        error instanceof Error && !error.message.includes("synthetic-private-value"),
    );
  }
});

test("Git page size is bounded by UTF-8 bytes rather than character count", () => {
  const raw = source({}, "سنگ".repeat(MAX_FILE_BYTES / 4));
  assert.ok(raw.length < MAX_FILE_BYTES);
  assert.throws(() => parseGitPage(raw, "terms"), /Invalid Git page source/);
});

test("Persian Terms hashing preserves the existing normalized acceptance contract", () => {
  const version = "test-v1",
    body = "\r\n  متن آزمون\r\n ";
  const expected = createHash("sha256").update(`${version}\nمتن آزمون`, "utf8").digest("hex");
  assert.equal(computeTermsContentHash(` ${version} `, body, "fa"), expected);
  const page = parseGitPage(source({}, "\r\n" + BODY + "\r\n").replaceAll("\n", "\r\n"), "terms");
  assert.equal(page?.contentHash, computeTermsContentHash("test-v1", BODY));
});

test("identical translated text still has a distinct acceptance hash per language", () => {
  assert.notEqual(
    computeTermsContentHash("test-v1", BODY, "fa"),
    computeTermsContentHash("test-v1", BODY, "en"),
  );
  assert.notEqual(
    computeTermsContentHash("test-v1", BODY),
    computeTermsContentHash("test-v2", BODY),
  );
  assert.notEqual(
    computeTermsContentHash("test-v1", BODY),
    computeTermsContentHash("test-v1", BODY + " changed"),
  );
});

test("SEO canonical paths must match their actual language and page", () => {
  for (const locale of ["fa", "en"] as const) {
    const canonicalPath = locale === "fa" ? "/terms" : "/en/terms";
    assert.equal(
      parseGitPage(source({ locale, seoTitle: "Test", canonicalPath }), "terms", locale)?.seo
        ?.canonicalPath,
      canonicalPath,
    );
    for (const wrong of [
      "https://fixtures.invalid/terms",
      "/privacy",
      locale === "fa" ? "/en/terms" : "/terms",
    ])
      assert.throws(
        () =>
          parseGitPage(source({ locale, seoTitle: "Test", canonicalPath: wrong }), "terms", locale),
        /canonical/,
      );
  }
  assert.throws(
    () => parseGitPage(source({ canonicalPath: "/terms" }), "terms"),
    /require a title/,
  );
});

test("the bilingual Terms registry includes only published pages sharing one version", () => {
  const fa = parseGitPage(source(), "terms", "fa")!;
  const en = parseGitPage(source({ locale: "en" }), "terms", "en")!;
  assert.deepEqual(termsReleases({ fa: { terms: fa }, en: { terms: en } }), {
    fa: {
      version: "test-v1",
      currentContentHash: fa.contentHash,
      allowedContentHashes: [fa.contentHash],
    },
    en: {
      version: "test-v1",
      currentContentHash: en.contentHash,
      allowedContentHashes: [en.contentHash],
    },
  });
  assert.deepEqual(termsReleases({ fa: {}, en: {} }), { fa: null, en: null });
  assert.equal(termsReleases({ fa: { terms: fa }, en: {} }).en, null);
  assert.throws(
    () => termsReleases({ fa: { terms: fa }, en: { terms: { ...en, version: "test-v2" } } }),
    /share one version/,
  );
});

test("page lookups are allowlisted, default to Persian and reject unsupported languages", () => {
  assert.deepEqual(validatePageLookup({ slug: "terms" }), { slug: "terms", locale: "fa" });
  assert.deepEqual(validatePageLookup({ slug: "terms", locale: "en" }), {
    slug: "terms",
    locale: "en",
  });
  for (const value of [
    null,
    [],
    "terms",
    { slug: "../terms" },
    { slug: "terms", locale: "ar" },
    { slug: "terms", locale: null },
    { slug: "terms", locale: ["en"] },
  ])
    assert.throws(() => validatePageLookup(value), /Invalid page/);
});

test("a published home canonical uses the language root without a duplicated prefix", () => {
  for (const locale of ["fa", "en"] as Locale[]) {
    const page: Page | null = parseGitPage(
      source({
        locale,
        slug: "home",
        seoTitle: "Test",
        canonicalPath: locale === "fa" ? "/" : "/en",
      }),
      "home",
      locale,
    );
    assert.equal(page?.slug, "home");
    assert.equal(page?.version, undefined);
    assert.equal(page?.contentHash, undefined);
  }
});
