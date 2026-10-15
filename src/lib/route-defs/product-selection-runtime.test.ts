import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("actual product selection handlers discard obsolete drafts across route identities and retain unchanged selections", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const directory = await mkdtemp(join(repository, ".product-selection-runtime-"));
  try {
    const script = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
const originalReact = { ...await import("react") };
const { translatorFor } = await import("../src/lib/i18n/messages.ts");
let active, locale = "fa", data;
mock.module("react", () => ({
  ...originalReact,
  useState(initial) {
    const index = active.cursor++;
    const slot = active.slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
    return [slot.value, next => { slot.value = typeof next === "function" ? next(slot.value) : next; }];
  },
  useMemo: make => make(),
}));
mock.module("../src/lib/i18n/react.tsx", () => ({
  useLocale: () => locale, useT: () => translatorFor(locale), LocaleLink: originalReact.Fragment,
}));
mock.module("../src/lib/route-defs/shared.tsx", () => ({ useRouteData: () => data }));
let fetchCalls = 0, storageCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw new Error("Offline product selection test rejected network"); };
const { ProductDetailRoute } = await import("../src/lib/route-defs/views/product.tsx");
const { ProductSelection } = await import("../src/components/product/product-selection.tsx");
const { ProductDraftSummary } = await import("../src/components/product/product-draft-summary.tsx");
const { RequestForm } = await import("../src/components/request-form/request-form.tsx");
const { buildProductDetailModel } = await import("../src/lib/product-detail.ts");
const { buildRequestPayload } = await import("../src/lib/request-form.ts");
// Framework import may inspect its scroll cache. Measure draft interactions
// after imports, without treating that unrelated initialization as draft I/O.
const storage = new Proxy({}, { get() { return () => { storageCalls++; throw new Error("Draft must not use storage"); }; } });
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
function find(element, type) {
  if (!element || typeof element !== "object") return null;
  if (Array.isArray(element)) return element.map(child => find(child, type)).find(Boolean) ?? null;
  return element.type === type ? element : find(element.props?.children, type);
}
function product(kind, nextLocale) {
  const id = kind === "a" ? "11111111-1111-4111-8111-111111111111" : "44444444-4444-4444-8444-444444444444";
  const variantIds = kind === "a"
    ? ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"]
    : ["55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666"];
  const source = { locale: nextLocale, id, code: "SYN-" + kind, slug: "synthetic-" + kind,
    type: "simple", title: nextLocale === "fa" ? "مدل آزمایشی " + kind : "Synthetic model " + kind,
    summary: null, description: null, isActive: true, isFeatured: false, media: [], seo: null,
    updatedAt: "2026-01-01", variants: variantIds.map((variantId, index) => ({
      id: variantId, stoneCode: "SYN-" + kind + "-" + index, sizeCode: index ? "160x60" : "120x60",
      priceType: "fixed", amountToman: 100000 + index * 10000, priceUpdatedAt: "2026-01-01",
      includes: [], excludes: [], isAvailable: true, options: [{
        id: "77777777-7777-4777-8777-777777777777", title: nextLocale === "fa" ? "گزینه آزمایشی" : "Synthetic option",
        priceType: "fixed", amountToman: 1000, priceUpdatedAt: "2026-01-01", isAvailable: true,
        compatibleSizeCodes: ["120x60", "160x60"],
      }],
    })) };
  const model = buildProductDetailModel(source, source.slug);
  assert.ok(model);
  return model;
}
function routeData(kind, nextLocale, version = "a".repeat(64)) {
  return { model: product(kind, nextLocale), catalogVersion: version, site: null,
    termsDocument: { locale: nextLocale, version: "1.0", contentHash: "c".repeat(64) } };
}
const values = { customerName: "Synthetic customer", phone: "09121234567", city: "Synthetic city",
  locationText: "Synthetic location", locationUnknown: false, preferredContact: "phone",
  preferredContactTime: "", customerNote: "", termsAccepted: true };
function harness(initialData, initialLocale) {
  let instance, previousKey, previousType, tree;
  data = initialData; locale = initialLocale;
  function render() {
    const element = ProductDetailRoute();
    // Synthetic hook slots follow React's type/key instance boundary; this is
    // source/handler execution, not a DOM or reconciler acceptance test.
    if (!instance || element.key !== previousKey || element.type !== previousType) {
      instance = { cursor: 0, slots: [] };
      previousKey = element.key; previousType = element.type;
    }
    active = instance; active.cursor = 0;
    tree = element.type(element.props);
    return tree;
  }
  return {
    render,
    selection() { return find(render(), ProductSelection).props; },
    draft() { return find(render(), ProductDraftSummary)?.props.draft ?? null; },
    source() { return find(render(), RequestForm)?.props.source ?? null; },
    review() { const button = find(render(), "button"); assert.equal(button.props.disabled, false); button.props.onClick(); render(); },
    update(nextData, nextLocale = locale) { data = nextData; locale = nextLocale; render(); },
    payload() { return buildRequestPayload({ submissionId: "88888888-8888-4888-8888-888888888888",
      source: this.source(), values, termsDocument: data.termsDocument }); },
  };
}
let transitions = 0;
for (const initialLocale of ["fa", "en"]) {
  for (const change of ["product", "version", "missing_version", "invalid_version", "locale"]) {
    const initial = routeData("a", initialLocale), form = harness(initial, initialLocale);
    const selected = initial.model.variants[1];
    form.selection().onSelectVariant(selected.id);
    form.selection().onToggleOption(selected.options[0].id);
    form.review();
    const prior = form.draft();
    assert.equal(prior.variantId, selected.id);
    assert.deepEqual(prior.optionIds, [selected.options[0].id]);
    assert.equal(form.payload().product_id, initial.model.id);
    assert.equal(form.payload().variant_id, selected.id);
    // A new loader object with the same semantic identity preserves choice.
    form.update({ ...initial, model: { ...initial.model, variants: [...initial.model.variants] } });
    assert.deepEqual(form.draft(), prior);
    assert.equal(form.selection().selectedVariant.id, selected.id);
    const nextLocale = change === "locale" ? (initialLocale === "fa" ? "en" : "fa") : initialLocale;
    const version = change === "version" ? "b".repeat(64) : change === "missing_version" ? null : change === "invalid_version" ? "invalid" : initial.catalogVersion;
    const next = routeData(change === "product" ? "b" : "a", nextLocale, version);
    form.update(next, nextLocale);
    assert.equal(form.draft(), null, "obsolete draft remains visible after " + change + " in " + initialLocale);
    assert.equal(form.source(), null, "obsolete selection must not reach RequestForm");
    assert.equal(form.selection().selectedVariant.id, next.model.variants[0].id);
    assert.deepEqual(form.selection().selectedOptionIds, []);
    if (version === null || version === "invalid") {
      assert.equal(find(form.render(), "button").props.disabled, true);
    } else {
      form.review();
      const payload = form.payload();
      assert.ok(payload);
      assert.equal(payload.product_id, next.model.id);
      assert.equal(payload.variant_id, next.model.variants[0].id);
      assert.equal(payload.client_catalog_version, version);
      assert.deepEqual(payload.option_ids, []);
      assert.equal(form.draft().displaySnapshot.productTitle, next.model.title);
      assert.equal(payload.client_displayed_price, next.model.variants[0].amountToman);
    }
    transitions++;
  }
}
assert.equal(transitions, 10);
assert.equal(fetchCalls, 0);
assert.equal(storageCalls, 0);
console.log("product-selection-runtime-passed: 10 transitions; fetch=0; storage=0; synthetic hooks, no DOM");
`;
    const file = join(directory, "fixture.ts");
    await writeFile(file, script);
    const result = spawnSync(process.execPath, [file], {
      cwd: repository,
      encoding: "utf8",
      timeout: 30_000,
      env: { PATH: process.env["PATH"] ?? "", NODE_ENV: "production" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout.trim(),
      "product-selection-runtime-passed: 10 transitions; fetch=0; storage=0; synthetic hooks, no DOM",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
