import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("custom funnel retires obsolete drafts across catalog, model and language changes", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const directory = await mkdtemp(join(repository, ".custom-funnel-scope-"));
  try {
    const script = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
const react = { ...await import("react") };
const { translatorFor } = await import("../src/lib/i18n/messages.ts");
let active, locale = "fa", data;
mock.module("react", () => ({ ...react,
  useState(initial) {
    const i = active.cursor++;
    const slot = active.slots[i] ??= { value: typeof initial === "function" ? initial() : initial };
    return [slot.value, next => { slot.value = typeof next === "function" ? next(slot.value) : next; }];
  },
  useMemo: make => make(),
  useEffect() {},
}));
mock.module("../src/lib/i18n/react.tsx", () => ({
  useLocale: () => locale, useT: () => translatorFor(locale), LocaleLink: react.Fragment,
}));
mock.module("../src/lib/route-defs/shared.tsx", () => ({ useRouteData: () => data }));
let network = 0, storage = 0;
globalThis.fetch = async () => { network++; throw new Error("Offline funnel test forbids network"); };
const { CustomFunnelRoute } = await import("../src/lib/route-defs/views/custom-funnel.tsx");
const { CustomFunnelStepper } = await import("../src/components/custom-funnel/custom-funnel-stepper.tsx");
const { CustomFunnelEmpty } = await import("../src/components/custom-funnel/custom-funnel-states.tsx");
const { RequestForm } = await import("../src/components/request-form/request-form.tsx");
const { buildCustomFunnelDraft, EMPTY_CUSTOM_FUNNEL_SELECTION } = await import("../src/lib/custom-funnel.ts");
const { buildRequestPayload } = await import("../src/lib/request-form.ts");
const forbidden = new Proxy({}, { get() { return () => { storage++; throw new Error("Draft must not use storage"); }; } });
globalThis.localStorage = forbidden; globalThis.sessionStorage = forbidden;
function find(node, type) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) return node.map(n => find(n, type)).find(Boolean) ?? null;
  return node.type === type ? node : find(node.props?.children, type);
}
function product() {
  return { locale, id: "11111111-1111-4111-8111-111111111111", code: "SYN-A", slug: "synthetic-a",
    type: "simple", title: locale === "fa" ? "مدل آزمایشی" : "Synthetic model", summary: null,
    description: null, isActive: true, isFeatured: false, media: [], seo: null, updatedAt: "2026-01-01",
    variants: [{ id: "22222222-2222-4222-8222-222222222222", stoneCode: "SYN-A", sizeCode: "120x60",
      priceType: "fixed", amountToman: 100000, priceUpdatedAt: "2026-01-01", includes: [], excludes: [],
      isAvailable: true, options: [] }] };
}
const values = { customerName: "Synthetic customer", phone: "09121234567", city: "Synthetic city",
  locationText: "Synthetic location", locationUnknown: false, preferredContact: "phone",
  preferredContactTime: "", customerNote: "", termsAccepted: true };
let transitions = 0;
for (const lang of ["fa", "en"]) for (const change of ["version", "missing_version", "invalid_version", "empty_catalog", "removed_same_version", "price_same_version", "locale"]) {
  locale = lang;
  data = { products: [product()], catalogVersion: "a".repeat(64), site: null,
    termsDocument: { locale, version: "1.0", contentHash: "c".repeat(64) } };
  let instance, key, type;
  function render() {
    const element = CustomFunnelRoute();
    // Controlled hook slots model React's type/key boundary; no DOM/reconciler acceptance claim.
    if (!instance || key !== element.key || type !== element.type) {
      instance = { cursor: 0, slots: [] }; key = element.key; type = element.type;
    }
    active = instance; active.cursor = 0; return element.type(element.props);
  }
  function deliver() {
    const child = find(render(), CustomFunnelStepper); assert.ok(child);
    const stone = child.props.model.stones[0];
    const draft = buildCustomFunnelDraft({ model: child.props.model, catalogVersion: data.catalogVersion,
      selection: { ...EMPTY_CUSTOM_FUNNEL_SELECTION, stoneKey: stone.key, variantId: stone.sizes[0].variantId } });
    assert.ok(draft); child.props.onDraftReady(draft); return draft;
  }
  const prior = deliver();
  assert.deepEqual(find(render(), RequestForm).props.source.draft, prior);
  // A new loader object with the same semantic content must not discard an unfinished request.
  data = { ...data, products: JSON.parse(JSON.stringify(data.products)) };
  assert.deepEqual(find(render(), RequestForm).props.source.draft, prior);
  if (change === "empty_catalog" || change === "removed_same_version")
    data = { ...data, products: [], catalogVersion: change === "empty_catalog" ? "b".repeat(64) : data.catalogVersion };
  else if (change === "price_same_version")
    data = { ...data, products: data.products.map(p => ({ ...p, variants: p.variants.map(v => ({ ...v, amountToman: 200000 })) })) };
  else if (change === "locale") {
    locale = lang === "fa" ? "en" : "fa";
    data = { ...data, products: [product()], termsDocument: { ...data.termsDocument, locale } };
  } else data = { ...data, catalogVersion: change === "version" ? "b".repeat(64) : change === "missing_version" ? null : "invalid" };
  const tree = render();
  assert.equal(find(tree, RequestForm), null, "obsolete RequestForm after " + change + " in " + lang);
  if (change === "empty_catalog" || change === "removed_same_version") assert.ok(find(tree, CustomFunnelEmpty));
  if (["version", "price_same_version", "locale"].includes(change)) {
    const fresh = deliver(), form = find(render(), RequestForm); assert.ok(form);
    const payload = buildRequestPayload({ submissionId: "88888888-8888-4888-8888-888888888888",
      source: form.props.source, termsDocument: data.termsDocument, values });
    assert.ok(payload); assert.equal(payload.client_catalog_version, data.catalogVersion);
    assert.equal(payload.client_displayed_price, change === "price_same_version" ? 200000 : 100000);
    assert.equal(fresh.displaySnapshot.productTitle, data.products[0].title);
  }
  transitions++;
}
assert.equal(transitions, 14); assert.equal(network, 0); assert.equal(storage, 0);
console.log("custom-funnel-scope-passed: 14 transitions; fetch=0; storage=0; synthetic hooks, no DOM");
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
      "custom-funnel-scope-passed: 14 transitions; fetch=0; storage=0; synthetic hooks, no DOM",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
