import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyStructuredTranslations,
  parseTranslationJson,
  translationAuthoringSource,
  translationSourceHash,
} from "../../../scripts/structured-translations.mjs";
import type { StructuredSource } from "../../../scripts/structured-translations.mjs";
import type { Product } from "./types";

const asset = "a".repeat(24);
const product: Product = {
  locale: "fa",
  id: "p-1",
  code: "TEST-1",
  slug: "test-stone",
  type: "simple",
  title: "سنگ آزمون",
  summary: "خلاصه آزمون",
  description: "شرح آزمون",
  isActive: true,
  isFeatured: false,
  media: [
    {
      src: `/media/${asset}/${"a".repeat(16)}-1280w.webp`,
      srcSet: "",
      width: 1280,
      height: 1600,
      alt: "عکس آزمون",
    },
  ],
  variants: [
    {
      id: "v-1",
      stoneCode: "granite",
      sizeCode: "120x60",
      priceType: "estimate",
      amountToman: 12000,
      priceUpdatedAt: "2026-10-13T00:00:00Z",
      includes: ["مورد شامل"],
      excludes: ["مورد خارج"],
      isAvailable: true,
      options: [
        {
          id: "o-1",
          title: "گزینه آزمون",
          priceType: "fixed",
          amountToman: 3000,
          priceUpdatedAt: "2026-10-13T00:00:00Z",
          isAvailable: false,
          compatibleSizeCodes: ["120x60"],
        },
      ],
    },
  ],
  seo: {
    title: "عنوان آزمون",
    description: null,
    canonicalPath: "/grave-stones/test-stone",
    robots: null,
  },
  updatedAt: "2026-10-13T00:00:00Z",
};
const base: StructuredSource = {
  products: [product],
  portfolio: [
    {
      locale: "fa",
      publicReferenceId: "pf-1001",
      summary: "شرح پروژه",
      stoneCode: "granite",
      sizeCode: "120x60",
      media: product.media,
    },
  ],
  site: {
    locale: "fa",
    displayName: "نام آزمون",
    latinName: "Test brand",
    phone: "+989120000000",
    whatsappUrl: null,
    telegram: null,
    address: "نشانی آزمون",
    workingHours: "ساعت آزمون",
    links: { instagram: null, website: null, map: null },
  },
  catalogVersion: "c".repeat(64),
};
function translation() {
  return {
    schemaVersion: 1,
    locale: "en",
    revision: "test-editorial-v1",
    status: "published",
    reviewed: true,
    products: {
      "p-1": {
        sourceHash: translationSourceHash("product", product),
        title: "Test stone",
        summary: "Test summary",
        description: "Test description",
        seo: {
          title: "Test title",
          description: null,
          canonicalPath: "/en/grave-stones/test-stone",
          robots: null,
        },
        media: { [asset]: "Test stone photo" },
        variants: {
          "v-1": {
            includes: ["Included item"],
            excludes: ["Excluded item"],
            options: { "o-1": { title: "Test option" } },
          },
        },
      },
    },
    portfolio: {
      "pf-1001": {
        sourceHash: translationSourceHash("portfolio", base.portfolio[0]!),
        summary: "Test project",
        media: { [asset]: "Test project photo" },
      },
    },
    site: {
      sourceHash: translationSourceHash("site", base.site!),
      displayName: "Test brand",
      address: "Test address",
      workingHours: "Test hours",
    },
  };
}
test("reviewed translations change only editorial fields while preserving operational identity and price", () => {
  const before = structuredClone(base),
    output = applyStructuredTranslations(base, translation()),
    english = output.products[1]!;
  assert.deepEqual(base, before);
  assert.equal(english.locale, "en");
  assert.equal(english.title, "Test stone");
  assert.equal(english.variants[0]!.options[0]!.title, "Test option");
  assert.equal(english.media[0]!.alt, "Test stone photo");
  const operational = (item: Product) => ({
    id: item.id,
    code: item.code,
    slug: item.slug,
    type: item.type,
    isActive: item.isActive,
    isFeatured: item.isFeatured,
    updatedAt: item.updatedAt,
    variants: item.variants.map((v) => ({
      ...v,
      includes: undefined,
      excludes: undefined,
      options: v.options.map((o) => ({ ...o, title: undefined })),
    })),
    media: item.media.map((m) => ({ ...m, alt: undefined })),
  });
  assert.deepEqual(operational(english), operational(product));
  assert.equal(output.catalogVersion, base.catalogVersion);
  assert.equal(output.portfolio[1]!.publicReferenceId, "pf-1001");
  assert.equal(output.sites.en!.phone, base.site!.phone);
  assert.equal(output.sites.en!.address, "Test address");
  assert.equal(JSON.stringify(english).includes("sourceHash"), false);
  assert.equal(JSON.stringify(english).includes("reviewed"), false);
  assert.equal(/[\u0600-\u06ff]/.test(JSON.stringify(english)), false);
});

test("building alt translations are individually source-bound and cannot override encoded media", () => {
  const image = product.media[0]!;
  const input = { ...base, buildingMedia: [image] };
  const value = {
    ...translation(),
    buildingMedia: {
      [asset]: {
        sourceHash: translationSourceHash("buildingMedia", image),
        alt: "Synthetic building stone",
      },
    },
  };
  const result = applyStructuredTranslations(input, value);
  assert.deepEqual(result.buildingMediaByLocale.en, [
    { ...image, alt: "Synthetic building stone" },
  ]);
  assert.deepEqual(result.buildingMediaByLocale.fa, [image]);
  assert.equal(Object.hasOwn(result.buildingMediaByLocale.en[0]!, "sourceHash"), false);
  const draft = translationAuthoringSource(input) as typeof value;
  assert.equal(draft.buildingMedia[asset]!.sourceHash, value.buildingMedia[asset]!.sourceHash);
  for (const next of [
    { ...image, alt: "متن تازه" },
    { ...image, src: image.src.replace(asset, "d".repeat(24)) },
  ])
    assert.throws(
      () => applyStructuredTranslations({ ...input, buildingMedia: [next] }, value),
      /Invalid or stale/,
    );
  for (const entry of [
    { ...value.buildingMedia[asset], alt: "عکس فارسی" },
    { ...value.buildingMedia[asset], src: "https://fixtures.invalid/private" },
  ])
    assert.throws(
      () => applyStructuredTranslations(input, { ...value, buildingMedia: { [asset]: entry } }),
      /Invalid or stale/,
    );
});

test("missing or draft building translation has no English fallback and unknown assets fail", () => {
  const input = { ...base, buildingMedia: product.media };
  for (const value of [null, { ...translation(), status: "draft", reviewed: false }, translation()])
    assert.deepEqual(applyStructuredTranslations(input, value).buildingMediaByLocale.en, []);
  assert.throws(
    () =>
      applyStructuredTranslations(input, {
        ...translation(),
        buildingMedia: { unknown: { sourceHash: "a".repeat(64), alt: "Test" } },
      }),
    /Invalid or stale/,
  );
});
test("missing or draft English source publishes no translated record or draft prose", () => {
  for (const value of [
    null,
    {
      ...translation(),
      status: "draft",
      reviewed: false,
      products: { "p-1": { title: "synthetic-private-draft" } },
    },
  ]) {
    const result = applyStructuredTranslations(base, value);
    assert.equal(result.products.length, 1);
    assert.equal(result.portfolio.length, 1);
    assert.equal(result.sites.en, null);
    assert.equal(JSON.stringify(result).includes("synthetic-private-draft"), false);
  }
});
test("publication requires an explicit reviewed English source and editorial revision", () => {
  for (const override of [
    { reviewed: false },
    { locale: "fa" },
    { locale: "ar" },
    { revision: null },
    { schemaVersion: 2 },
    { status: "unknown" },
  ])
    assert.throws(
      () => applyStructuredTranslations(base, { ...translation(), ...override }),
      /Invalid or stale/,
    );
});
test("unknown properties cannot override operational amounts, IDs, availability or media URLs", () => {
  for (const override of [
    { amountToman: 1 },
    { id: "p-new" },
    { slug: "new" },
    { isActive: false },
    { src: "https://fixtures.invalid/private" },
  ]) {
    const value = translation();
    assert.throws(
      () =>
        applyStructuredTranslations(base, {
          ...value,
          products: { "p-1": { ...value.products["p-1"], ...override } },
        }),
      /Invalid or stale/,
    );
  }
});
test("unmatched and ambiguous translated record IDs fail rather than attaching prose to another product", () => {
  const value = translation();
  assert.throws(
    () =>
      applyStructuredTranslations(base, { ...value, products: { unknown: value.products["p-1"] } }),
    /Invalid or stale/,
  );
  assert.throws(
    () => applyStructuredTranslations({ ...base, products: [product, product] }, value),
    /Invalid or stale/,
  );
  assert.throws(
    () =>
      applyStructuredTranslations({ ...base, products: [{ ...product, isActive: false }] }, value),
    /Invalid or stale/,
  );
});
test("every existing variant, option and public media asset requires a matching translation", () => {
  for (const field of ["variants", "media"] as const) {
    const value = translation();
    assert.throws(
      () =>
        applyStructuredTranslations(base, {
          ...value,
          products: { "p-1": { ...value.products["p-1"], [field]: {} } },
        }),
      /Invalid or stale/,
    );
  }
  const value = translation();
  value.products["p-1"].variants["v-1"].options =
    {} as (typeof value.products)["p-1"]["variants"]["v-1"]["options"];
  assert.throws(() => applyStructuredTranslations(base, value), /Invalid or stale/);
});
test("a translation cannot silently drop included or excluded items", () => {
  const value = translation();
  value.products["p-1"].variants["v-1"].includes = [];
  assert.throws(() => applyStructuredTranslations(base, value), /Invalid or stale/);
});
test("stale source prose is rejected even if the operational catalog hash did not change", () => {
  assert.throws(
    () =>
      applyStructuredTranslations(
        { ...base, products: [{ ...product, description: "متن جدید" }] },
        translation(),
      ),
    /Invalid or stale/,
  );
  assert.throws(
    () =>
      applyStructuredTranslations(
        { ...base, site: { ...base.site!, address: "نشانی تازه" } },
        translation(),
      ),
    /Invalid or stale/,
  );
});
test("price and stock updates preserve a valid prose translation and expose the current operational values", () => {
  const changed = structuredClone(base),
    p = changed.products[0]!;
  p.variants[0]!.amountToman = 24000;
  p.variants[0]!.isAvailable = false;
  p.variants[0]!.options[0]!.amountToman = 6000;
  assert.equal(translationSourceHash("product", p), translationSourceHash("product", product));
  const result = applyStructuredTranslations(changed, translation());
  assert.equal(result.products[1]!.variants[0]!.amountToman, 24000);
  assert.equal(result.products[1]!.variants[0]!.isAvailable, false);
});
test("changed image bytes or original alt text invalidates the reviewed translation", () => {
  for (const image of [
    { ...product.media[0]!, alt: "عکس تازه" },
    { ...product.media[0]!, src: `/media/${"b".repeat(24)}/bbbbbbbbbbbbbbbb-1280w.webp` },
  ])
    assert.throws(
      () =>
        applyStructuredTranslations(
          { ...base, products: [{ ...product, media: [image] }] },
          translation(),
        ),
      /Invalid or stale/,
    );
});
test("English source cannot contain leaked Persian prose or a foreign-language canonical", () => {
  const value = translation();
  value.products["p-1"].title = "عنوان فارسی";
  assert.throws(() => applyStructuredTranslations(base, value), /Invalid or stale/);
  const wrong = translation();
  wrong.products["p-1"].seo.canonicalPath = "/grave-stones/test-stone";
  assert.throws(() => applyStructuredTranslations(base, wrong), /Invalid or stale/);
});
test("partial reviewed catalogue selection does not create fallback translations for missing products or site", () => {
  const value = translation();
  const result = applyStructuredTranslations(base, {
    ...value,
    products: {},
    portfolio: {},
    site: null,
  });
  assert.equal(result.products.length, 1);
  assert.equal(result.portfolio.length, 1);
  assert.equal(result.sites.en, null);
});
test("duplicate decoded JSON keys are rejected at every depth", () => {
  for (const raw of [
    '{"title":"one","title":"two"}',
    '{"title":"one","\\u0074itle":"two"}',
    '{"products":[{"id":1,"id":2}]}',
  ])
    assert.throws(() => parseTranslationJson(raw), /Invalid or stale/);
  const sample = { text: '{"id":1}', array: [1, 2, { id: 1 }] };
  assert.deepEqual(parseTranslationJson(JSON.stringify(sample)), sample);
});
test("malformed and deeply nested JSON fails with a fixed safe diagnostic", () => {
  for (const raw of [
    '{"synthetic-private-value":',
    '{"x":'.repeat(65) + "null" + "}".repeat(65),
    "null",
    "[]",
  ])
    assert.throws(
      () => parseTranslationJson(raw),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "Invalid or stale reviewed structured translation",
    );
});
test("the authoring reference is always an unpublished public-field draft with stable source hashes", () => {
  const draft = translationAuthoringSource(base);
  assert.equal(draft["status"], "draft");
  assert.equal(draft["reviewed"], false);
  const encoded = JSON.stringify(draft);
  assert.equal(encoded.includes("amountToman"), false);
  assert.equal(encoded.includes("media_key"), false);
  assert.equal(encoded.includes("consent_reference"), false);
  assert.equal(encoded.includes(translationSourceHash("product", product)), true);
  assert.equal(applyStructuredTranslations(base, draft).products.length, 1);
});
