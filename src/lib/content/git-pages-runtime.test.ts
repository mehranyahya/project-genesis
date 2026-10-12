import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("real adapters and page/form route loaders read the requested compiled translation without fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "genesis-git-pages-runtime-"));
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  try {
    const source = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { parseGitPage } from ${JSON.stringify(join(repository, "scripts/git-pages.mjs"))};
import { validatePageLookup } from ${JSON.stringify(join(repository, "src/lib/content/page-lookup.ts"))};
const pages = { fa: {}, en: {} }, calls = [];
for (const locale of ["fa", "en"]) for (const slug of ["about", "privacy", "terms", "contact", "not-found"]) {
  const raw = ["---", 'slug: "' + slug + '"', 'locale: "' + locale + '"', 'status: "published"', "reviewed: true",
    'title: "' + locale + ' test title"', 'version: "test-v1"', 'seoTitle: "Test title"',
    'canonicalPath: "' + (locale === "en" ? "/en" : "") + "/" + slug + '"', "---", locale + " synthetic test body"].join("\\n");
  pages[locale][slug] = parseGitPage(raw, slug, locale);
}
mock.module(${JSON.stringify(join(repository, "src/lib/content/generated-pages.ts"))}, () => ({ GIT_PAGES: pages }));
const { loadGitPage } = await import(${JSON.stringify(join(repository, "src/lib/content/git.server.ts"))});
mock.module(${JSON.stringify(join(repository, "src/lib/content/git.functions.ts"))}, () => ({ getPageFromGitServer: async (input) => {
  const lookup = validatePageLookup(input.data);
  assert.ok(input.data.locale === "fa" || input.data.locale === "en");
  calls.push(lookup);
  return loadGitPage(lookup.slug, lookup.locale);
} }));
const product = { id: "p-1", code: "TEST-1", slug: "test-product", title: "Test product", type: "simple", isActive: true,
  isFeatured: false, summary: null, description: null, media: [],
  variants: [{ id: "v-1", stoneCode: "test-stone", sizeCode: "120x60", priceType: "review", amountToman: null,
    priceUpdatedAt: null, includes: [], excludes: [], options: [], isAvailable: true }], seo: null, updatedAt: "2026-10-12" };
mock.module(${JSON.stringify(join(repository, "src/lib/content/supabase.functions.ts"))}, () => ({
  getSiteFromServer: async () => null, getCatalogVersionFromServer: async () => null,
  getProductsFromServer: async () => [], getPortfolioItemsFromServer: async () => [],
  getProductFromServer: async ({ data }) => ({ ...product, locale: data.locale }),
}));
globalThis.fetch = async () => { throw new Error("No network in page fixture"); };
const adapters = await import(${JSON.stringify(join(repository, "src/lib/content/adapters.ts"))});
const routes = await import(${JSON.stringify(join(repository, "src/lib/route-defs/pages.tsx"))});
const { getRequestTermsDocument } = await import(${JSON.stringify(join(repository, "src/lib/request-terms.ts"))});
for (const locale of ["fa", "en"]) {
  for (const slug of ["about", "privacy", "terms"]) {
    const options = routes[slug + "RouteOptions"](locale), page = await options.loader();
    assert.equal(page.title, locale + " test title");
    assert.equal(page.canonicalPath, (locale === "en" ? "/en" : "") + "/" + slug);
  }
  assert.equal((await routes.contactRouteOptions(locale).loader()).page.title, locale + " test title");
  const doc = await getRequestTermsDocument(locale);
  assert.equal(doc.locale, locale);
  assert.equal(doc.contentHash, pages[locale].terms.contentHash);
  for (const data of [await routes.customFunnelRouteOptions(locale).loader(),
    await routes.productDetailRouteOptions(locale).loader({ params: { slug: "test-product" } }),
    await routes.buildingStoneRouteOptions(locale).loader(),
    await routes.quoteRouteOptions(locale).loader({ deps: { reference: null, category: null } })]) assert.deepEqual(data.termsDocument, doc);
}
const copy = await loadGitPage("terms", "en");
copy.seo.title = "Changed test title";
assert.equal((await loadGitPage("terms", "en")).seo.title, "Test title");
assert.equal((await adapters.getPage("terms")).locale, "fa");
assert.notEqual(pages.fa.terms.contentHash, pages.en.terms.contentHash);
delete pages.en.terms;
assert.equal(await getRequestTermsDocument("en"), null);
assert.equal(await routes.termsRouteOptions("en").loader(), null);
assert.ok(await getRequestTermsDocument("fa"));
assert.equal(await loadGitPage("terms", "ar"), null);
assert.equal(await loadGitPage("unknown", "fa"), null);
assert.ok(calls.some((call) => call.slug === "terms" && call.locale === "en"));
console.log("git-page-runtime-fixture-passed");
`;
    const file = join(root, "runtime-fixture.ts");
    await writeFile(file, source);
    const result = spawnSync(process.execPath, [file], {
      cwd: repository,
      encoding: "utf8",
      timeout: 15_000,
      env: { PATH: process.env["PATH"] ?? "" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "git-page-runtime-fixture-passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the active Edge business path stores the accepted translation hash with the existing RPC contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "genesis-terms-business-"));
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  try {
    const source = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
const fa = "${"a".repeat(64)}", en = "${"b".repeat(64)}";
mock.module(${JSON.stringify(join(repository, "supabase/functions/_shared/terms-registry.generated.ts"))}, () => ({
  CURRENT_TERMS_RELEASES: { fa: { version: "test-v1", currentContentHash: fa, allowedContentHashes: [fa] },
    en: { version: "test-v1", currentContentHash: en, allowedContentHashes: [en] } },
}));
globalThis.fetch = async () => { throw new Error("No network in business fixture"); };
const { prepareBusinessRequest } = await import(${JSON.stringify(join(repository, "supabase/functions/_shared/request-business.ts"))});
const base = { submission_id: "11111111-1111-4111-8111-111111111111", request_type: "contact", customer_name: "Synthetic test customer",
  phone: "+989120000000", city: null, location_text: null, preferred_contact: "phone", preferred_contact_time: null,
  customer_note: null, terms_accepted: true, terms_version: "test-v1" };
const options = { config: {}, fingerprint: "${"c".repeat(64)}", fingerprintKeyId: "test-v1", botVerification: "unverified_no_token",
  riskFlags: [], ipHash: null, trackingCodePrefix: "REQ", nowIso: "2026-10-12T00:00:00Z" };
for (const hash of [fa, en]) {
  const result = await prepareBusinessRequest({ ...options, request: { ...base, terms_content_hash: hash } });
  assert.equal(result.ok, true);
  assert.equal(result.storage.p_terms_content_hash, hash);
  assert.equal(result.storage.p_terms_version, "test-v1");
  assert.equal(result.storage.p_request_fingerprint, options.fingerprint);
  assert.equal(Object.hasOwn(result.storage, "p_locale"), false);
  assert.equal(Object.hasOwn(result.storage, "p_terms_locale"), false);
}
const result = await prepareBusinessRequest({ ...options, request: { ...base, terms_content_hash: "${"d".repeat(64)}" } });
assert.equal(result.ok, false);
assert.equal(result.status, 409);
assert.equal(result.body.terms_by_locale.en.content_hash, en);
console.log("terms-business-fixture-passed");
`;
    const file = join(root, "business-fixture.ts");
    await writeFile(file, source);
    const result = spawnSync(process.execPath, [file], {
      cwd: repository,
      encoding: "utf8",
      timeout: 15_000,
      env: { PATH: process.env["PATH"] ?? "" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "terms-business-fixture-passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
