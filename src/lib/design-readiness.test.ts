import assert from "node:assert/strict";
import { test } from "node:test";
import { assessDesignReadiness } from "./design-readiness";
import type { DesignReadinessInput } from "./design-readiness";
import { HOME_EDITORIAL_REFERENCES } from "./home-editorial-config";
import type { Page, PortfolioItem, Product } from "./content/types";

const EMPTY: DesignReadinessInput = {
  generated: false,
  catalogVersion: null,
  products: [],
  portfolioItems: [],
  site: null,
  pages: [],
  guides: [],
  editorial: HOME_EDITORIAL_REFERENCES,
  termsRelease: null,
  capabilities: { englishSources: false, guides: false },
};
const hash = "a".repeat(64);
const locales = ["fa", "en"] as const;
function populated(): DesignReadinessInput {
  const image = {
    src: "/media/aaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa-1280w.webp",
    srcSet: "",
    width: 1280,
    height: 1600,
    alt: "private-looking editorial value",
  };
  const products: Product[] = locales.map((locale) => ({
    locale,
    id: "p",
    code: "p",
    slug: "p",
    type: "simple",
    title: "unpublished product title",
    summary: null,
    description: null,
    isActive: true,
    isFeatured: false,
    media: [image],
    variants: [],
    seo: null,
    updatedAt: "2026-10-08",
  }));
  const portfolioItems: PortfolioItem[] = locales.flatMap((locale) =>
    ["pf-1001", "pf-1002", "pf-1003"].map((publicReferenceId) => ({
      locale,
      publicReferenceId,
      media: [image],
      summary: "unpublished project text",
    })),
  );
  const pages: Page[] = locales.flatMap((locale) =>
    (["about", "building-stone", "privacy", "terms"] as const).map((slug) => ({
      locale,
      slug,
      title: "unpublished page title",
      body: "unpublished legal text",
      seo: null,
      version: "1",
      contentHash: hash,
    })),
  );
  const references = {
    hero: { publicReferenceId: "pf-1001", assetId: "a".repeat(24) },
    heroMobile: { publicReferenceId: "pf-1001", assetId: "a".repeat(24) },
    services: {
      memorial: { publicReferenceId: "pf-1001", assetId: "a".repeat(24) },
      architectural: { publicReferenceId: "pf-1002", assetId: "a".repeat(24) },
      bespoke: { publicReferenceId: "pf-1003", assetId: "a".repeat(24) },
    },
    projects: { memorial: "pf-1001", architectural: "pf-1002", bespoke: "pf-1003" },
  };
  return {
    ...EMPTY,
    generated: true,
    catalogVersion: hash,
    products,
    portfolioItems,
    pages,
    site: {
      displayName: "Unpublished name",
      latinName: "Unpublished Latin name",
      phone: "unpublished phone",
      whatsappUrl: null,
      telegram: null,
      address: "unpublished address",
      workingHours: null,
      links: { instagram: null, website: null, map: null },
    },
    editorial: { fa: references, en: references },
    termsRelease: { version: "1", currentContentHash: hash },
    capabilities: { englishSources: true, guides: false },
  };
}

test("an empty baseline reports blockers instead of claiming publication readiness", () => {
  const report = assessDesignReadiness(EMPTY);
  assert.equal(report.automaticChecksPass, false);
  assert.equal(report.readyForPublication, false);
  assert.equal(report.checks.find((check) => check.key === "fa.hero")?.status, "blocked");
  assert.equal(
    report.checks.find((check) => check.key === "english_source_ingestion")?.status,
    "blocked",
  );
  assert.equal(
    report.checks.find((check) => check.key === "guide_source_ingestion")?.status,
    "deferred",
  );
  assert.deepEqual(report.counts.fa, { products: 0, portfolioItems: 0, guides: 0 });
});

test("complete automated content checks still leave real Preview checks pending", () => {
  const report = assessDesignReadiness(populated());
  assert.equal(report.automaticChecksPass, true);
  assert.equal(report.readyForPublication, false);
  assert.ok(report.manualChecks.every((check) => check.status === "pending"));
});

test("Persian-only content cannot satisfy English readiness", () => {
  const input = populated();
  const report = assessDesignReadiness({
    ...input,
    products: input.products.filter((item) => item.locale === "fa"),
    portfolioItems: input.portfolioItems.filter((item) => item.locale === "fa"),
    pages: input.pages.filter((item) => item.locale === "fa"),
  });
  assert.equal(report.automaticChecksPass, false);
  assert.ok(
    report.checks
      .filter((check) => check.key.startsWith("en.") && check.required)
      .every((check) => check.status === "blocked"),
  );
});

test("unversioned or stale Terms cannot satisfy acceptance readiness", () => {
  const input = populated();
  const report = assessDesignReadiness({
    ...input,
    termsRelease: { version: "2", currentContentHash: hash },
  });
  assert.ok(
    report.checks
      .filter((check) => check.key.endsWith(".versioned_terms"))
      .every((check) => check.status === "blocked"),
  );
});

test("missing product media, catalogue hash or English ingestion remain blockers", () => {
  const input = populated();
  const report = assessDesignReadiness({
    ...input,
    catalogVersion: "invalid",
    products: input.products.map((item) => ({ ...item, media: [] })),
    capabilities: { englishSources: false, guides: false },
  });
  for (const key of [
    "catalog_version",
    "fa.product_media",
    "en.product_media",
    "english_source_ingestion",
  ])
    assert.equal(report.checks.find((check) => check.key === key)?.status, "blocked");
});

test("the report contains fixed labels and counts without source text or contact values", () => {
  const output = JSON.stringify(assessDesignReadiness(populated()));
  assert.equal(/unpublished|private-looking|\/media\//i.test(output), false);
  assert.equal(output.includes("pf-1001"), false);
});
