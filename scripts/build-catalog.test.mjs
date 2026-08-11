import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EMPTY_CATALOG_ARTIFACT,
  assertStableCatalogVersion,
  assertStablePublicationSourceVersion,
  buildArtifactFromRows,
  collectMediaReferences,
  parseArtifactModule,
  renderArtifactModule,
  validatePublicArtifact,
} from "./build-catalog.mjs";

const version = "b".repeat(64);
const hash = "c".repeat(64);
const publicMedia = {
  src: `/media/catalog/${hash}-800.webp`,
  srcSet: {
    avif: `/media/catalog/${hash}-480.avif 480w, /media/catalog/${hash}-800.avif 800w`,
    webp: `/media/catalog/${hash}-480.webp 480w, /media/catalog/${hash}-800.webp 800w`,
  },
  width: 800,
  height: 1000,
  alt: "نمای سنگ",
};

function rows() {
  return {
    products: [
      {
        id: "p-1",
        code: "M-1",
        slug: "model-one",
        product_type: "simple",
        title: "مدل یک",
        summary: null,
        description: null,
        is_active: true,
        is_featured: true,
        seo_title: null,
        seo_description: null,
        seo_canonical_path: null,
        seo_robots: null,
        sort_order: 1,
        updated_at: "2026-08-10T12:00:00Z",
      },
    ],
    variants: [
      {
        id: "v-1",
        product_id: "p-1",
        stone_code: "ST-1",
        size_code: "120x60",
        price_type: "fixed",
        amount_toman: 1_000_000,
        price_updated_at: "2026-08-10T12:00:00Z",
        includes: ["حکاکی"],
        excludes: ["نصب"],
        is_available: true,
        sort_order: 1,
      },
    ],
    options: [
      {
        id: "o-1",
        variant_id: "v-1",
        title: "گزینه",
        price_type: "review",
        amount_toman: null,
        price_updated_at: null,
        is_available: true,
        compatible_size_codes: ["120x60"],
        sort_order: 1,
      },
    ],
    productMedia: [
      {
        product_id: "p-1",
        media_key: "products/p-1/front.jpg",
        alt: "نمای سنگ",
        privacy_cleared: true,
        consent_reference: null,
        width: 800,
        height: 1000,
        sort_order: 1,
      },
    ],
    portfolioItems: [
      {
        public_reference_id: "pf-1001",
        stone_code: "ST-1",
        size_code: "120x60",
        summary: null,
        is_active: true,
        sort_order: 1,
        updated_at: "2026-08-10T12:00:00Z",
      },
    ],
    portfolioMedia: [
      {
        public_reference_id: "pf-1001",
        media_key: "portfolio/pf-1001/front.jpg",
        alt: "نمونه اجرا",
        privacy_cleared: true,
        consent_reference: "consent-reviewed-1",
        width: 800,
        height: 1000,
        sort_order: 1,
      },
    ],
    site: [
      {
        id: "primary",
        display_name: "مهرآرا",
        latin_name: "Mehrara",
        phone: "+989123456789",
        whatsapp_url: "https://wa.me/989123456789",
        telegram: null,
        address: null,
        working_hours: null,
        instagram_url: null,
        website_url: null,
        map_url: null,
      },
    ],
  };
}

test("canonical empty artifact round-trips byte-for-byte", () => {
  const source = renderArtifactModule(EMPTY_CATALOG_ARTIFACT);
  assert.deepEqual(parseArtifactModule(source), EMPTY_CATALOG_ARTIFACT);
  assert.equal(source, renderArtifactModule(parseArtifactModule(source)));
});

test("public artifact retains only processed media and drops private publication metadata", () => {
  const input = rows();
  const references = collectMediaReferences(input);
  const mediaById = new Map(
    references.map((reference) => [reference.id, { ...publicMedia, alt: reference.alt }]),
  );
  const artifact = buildArtifactFromRows({ rows: input, catalogVersion: version, mediaById });
  const serialized = JSON.stringify(artifact);

  assert.equal(artifact.products.length, 1);
  assert.equal(artifact.portfolioItems.length, 1);
  assert.equal(artifact.site?.whatsapp, "https://wa.me/989123456789");
  assert.equal(artifact.products[0].variants[0].priceUpdatedAt, "2026-08-10");
  assert.doesNotMatch(serialized, /media_key|mediaKey|privacy|consent|sb_secret|supabase/i);
  assert.deepEqual(Object.keys(artifact.products[0].media[0]).sort(), [
    "alt",
    "height",
    "src",
    "srcSet",
    "width",
  ]);
});

test("portfolio media without a consent reference is omitted fail-closed", () => {
  const input = rows();
  input.portfolioMedia[0].consent_reference = null;
  const references = collectMediaReferences(input);
  assert.equal(
    references.some((reference) => reference.id.startsWith("portfolio:")),
    false,
  );

  const mediaById = new Map(
    references.map((reference) => [reference.id, { ...publicMedia, alt: reference.alt }]),
  );
  const artifact = buildArtifactFromRows({ rows: input, catalogVersion: version, mediaById });
  assert.deepEqual(artifact.portfolioItems, []);
});

test("catalog generation stops when price/catalog state changes during the read", () => {
  assert.equal(assertStableCatalogVersion(version, version), version);
  assert.throws(() => assertStableCatalogVersion(version, "d".repeat(64)), /changed/);
  assert.throws(() => assertStableCatalogVersion("invalid", version), /invalid/);
  assert.equal(assertStablePublicationSourceVersion(version, version), version);
  assert.throws(
    () => assertStablePublicationSourceVersion(version, "d".repeat(64)),
    /publication source changed/,
  );
});

test("artifact validation rejects extra or malformed nested public fields", () => {
  assert.throws(
    () => validatePublicArtifact({ ...EMPTY_CATALOG_ARTIFACT, unexpected: true }),
    /unexpected public shape/,
  );

  const input = rows();
  const references = collectMediaReferences(input);
  const mediaById = new Map(
    references.map((reference) => [reference.id, { ...publicMedia, alt: reference.alt }]),
  );
  const artifact = buildArtifactFromRows({ rows: input, catalogVersion: version, mediaById });
  const poisoned = structuredClone(artifact);
  poisoned.products[0].media[0].mediaKey = "private/object.jpg";
  assert.throws(() => validatePublicArtifact(poisoned), /invalid|unexpected public shape/);
});
