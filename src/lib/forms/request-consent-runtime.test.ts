import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("actual request handlers require deliberate price and terms consent without losing entered values, retry identity or validated success", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const directory = await mkdtemp(join(repository, ".request-consent-runtime-"));
  try {
    const script = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
const originalReact = { ...await import("react") };
const { translatorFor } = await import("../src/lib/i18n/messages.ts");
let active, locale = "fa";
function nextSlot(make) {
  const index = active.cursor++;
  return active.slots[index] ??= make();
}
mock.module("react", () => ({
  ...originalReact,
  useState(initial) {
    const slot = nextSlot(() => ({ value: typeof initial === "function" ? initial() : initial }));
    return [slot.value, next => { slot.value = typeof next === "function" ? next(slot.value) : next; }];
  },
  useRef(initial) { return nextSlot(() => ({ current: initial })); },
  useCallback(callback) { return callback; },
  useEffect(effect, deps) {
    const slot = nextSlot(() => ({ deps: undefined, cleanup: undefined }));
    if (!slot.deps || deps.some((value, index) => !Object.is(value, slot.deps[index]))) {
      slot.deps = deps;
      active.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
    }
  },
}));
mock.module("../src/lib/i18n/react.tsx", () => ({
  useLocale: () => locale, useT: () => translatorFor(locale), LocaleLink: originalReact.Fragment,
}));
const documents = (version, faHash, enHash) => ({
  fa: { locale: "fa", version, contentHash: faHash.repeat(64) },
  en: { locale: "en", version, contentHash: enHash.repeat(64) },
});
const oldTerms = documents("1.0", "a", "b"), newTerms = documents("2.0", "c", "d");
const { handleSignedSubmitGateway } = await import("../src/lib/gateway-submit.server.ts");
const { validateTermsConsent } = await import("../supabase/functions/_shared/terms-consent.ts");
const gatewayEnv = {
  SUPABASE_FUNCTION_BASE_URL: "https://backend.synthetic.invalid/functions/v1",
  EDGE_GATEWAY_KEYS_JSON: JSON.stringify({ test: "g".repeat(40) }),
  EDGE_GATEWAY_PRIMARY_KEY_ID: "test", IP_HASH_SECRET: "i".repeat(40),
  ALLOWED_ORIGINS: "https://preview.synthetic.invalid",
};
const registry = Object.fromEntries(Object.entries(newTerms).map(([key, doc]) => [key, {
  version: doc.version, currentContentHash: doc.contentHash, allowedContentHashes: [doc.contentHash],
}]));
let gatewayUpdates = 0;
let readTerms = async requested => newTerms[requested];
mock.module("../src/lib/request-terms.ts", () => ({
  getRequestTermsDocument: (...args) => readTerms(...args),
}));
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw new Error("Offline consent test rejected network"); };
const stored = [];
globalThis.sessionStorage = { setItem: (key, value) => stored.push({ key, value }) };
const { RequestForm } = await import("../src/components/request-form/request-form.tsx");
const { RequestFormFields } = await import("../src/components/request-form/request-form-fields.tsx");
const { RequestFormState } = await import("../src/components/request-form/request-form-state.tsx");
const { RequestSuccess } = await import("../src/components/request-form/request-success.tsx");
const { EMPTY_REQUEST_FORM_VALUES } = await import("../src/lib/request-form.ts");
const { formatSubmitPrice } = await import("../src/components/request-form/request-form-state.tsx");
const values = { customerName: "Synthetic customer", phone: "09121234567", city: "Synthetic city",
  locationText: "Synthetic location", locationUnknown: false, preferredContact: "phone",
  preferredContactTime: "", customerNote: "Synthetic private note", termsAccepted: true };
function graveSource(variantId = "22222222-2222-4222-8222-222222222222") {
  return { kind: "grave_stone", draft: {
    requestType: "grave_stone", catalogVersion: "e".repeat(64),
    productId: "11111111-1111-4111-8111-111111111111", productCode: "TEST-1",
    variantId, stoneCode: "S-1", sizeCode: "160x60", optionIds: [],
    displaySnapshot: { productTitle: "Synthetic stone", productTypeLabel: "Synthetic type",
      stoneCode: "S-1", sizeLabel: "160x60", optionTitles: [], priceType: "fixed",
      amountToman: 1000, priceLabel: "Synthetic display price", priceUpdatedAt: null,
      includes: [], excludes: [] },
  }};
}
const contact = () => ({ kind: "contact", portfolioReferenceId: null });
const reply = (status, body) => ({ status, body: JSON.stringify(body) });
const temporary = reply(503, { code: "TEMPORARILY_UNAVAILABLE" });
const success = code => reply(201, { code: "REQUEST_CREATED", tracking_code: code });
const changed = (type = "estimate", amount = 1200) => reply(409, {
  code: "PRICE_CHANGED", price: { price_type: type, amount_toman: amount },
});
const updated = requested => async input => {
  const response = await handleSignedSubmitGateway(new Request(
    "https://preview.synthetic.invalid/api/submit-request", {
      method: "POST", body: input.body,
      headers: { ...input.headers, origin: gatewayEnv.ALLOWED_ORIGINS,
        "cf-connecting-ip": "192.0.2.1" },
    }), gatewayEnv, {
      nowUnix: () => 1786319000, randomNonce: () => "1".repeat(32),
      randomUuid: () => "11111111-1111-4111-8111-111111111111",
      fetchUpstream: async (_url, init) => {
        const { payload } = JSON.parse(init.body);
        assert.equal(payload.terms_content_hash, oldTerms[requested].contentHash);
        const failure = validateTermsConsent(payload, registry);
        assert.equal(failure?.body.code, "TERMS_UPDATED");
        gatewayUpdates++;
        return new Response(JSON.stringify(failure.body), { status: failure.status });
      },
    });
  assert.equal(response.status, 409);
  return { status: response.status, body: await response.text() };
};
function find(element, type) {
  if (!element || typeof element !== "object") return null;
  if (Array.isArray(element)) return element.map(child => find(child, type)).find(Boolean) ?? null;
  return element.type === type ? element : find(element.props?.children, type);
}
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
};
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
function mount(nextLocale, responses, source = graveSource()) {
  locale = nextLocale;
  const instance = { cursor: 0, slots: [], effects: [], tree: null, requests: [], success: [], props: {
    source, site: null, termsDocument: oldTerms[locale],
    submitRequest: async input => {
      instance.requests.push(input);
      const response = responses[instance.requests.length - 1];
      assert.notEqual(response, undefined, "unexpected extra transport");
      return typeof response === "function" ? response(input) : response;
    },
    onSuccess: code => instance.success.push(code),
  }};
  instance.render = () => {
    active = instance; locale = nextLocale; instance.cursor = 0;
    instance.tree = RequestForm(instance.props);
    instance.effects.splice(0).forEach(effect => effect());
    return instance.tree;
  };
  instance.render();
  find(instance.tree, RequestFormFields).props.onChange(values);
  instance.render();
  instance.fields = () => { instance.render(); return find(instance.tree, RequestFormFields)?.props; };
  instance.actions = () => { instance.render(); return find(instance.tree, RequestFormState)?.props; };
  instance.button = () => { instance.render(); return find(instance.tree, "button")?.props; };
  instance.change = next => { instance.fields().onChange(next); instance.render(); };
  instance.submit = () => {
    instance.render(); find(instance.tree, "form").props.onSubmit({ preventDefault() {} }); instance.render();
  };
  instance.payload = index => JSON.parse(instance.requests[index].body);
  return instance;
}
let scenarios = 0;
for (const nextLocale of ["fa", "en"]) {
  for (const [type, amount] of [["fixed", 1200], ["estimate", 1200], ["review", null]]) {
    const form = mount(nextLocale, [changed(type, amount), temporary, success("REQ-2001")]);
    form.submit(); await settle();
    assert.equal(form.actions().outcome.kind, "price_changed");
    assert.equal(form.requests.length, 1, "price update never starts an automatic request");
    // Call the actual onSubmit, including the Enter path, even if the DOM
    // would prevent clicking a disabled submit button.
    form.submit(); await settle();
    assert.equal(form.requests.length, 1, "generic submit must not accept a new price");
    form.actions().onRetry(); await settle();
    assert.equal(form.requests.length, 1, "ordinary retry cannot bypass price consent");
    assert.equal(form.button().disabled, true);
    assert.deepEqual(form.fields().values, values);
    const html = renderToStaticMarkup(originalReact.createElement(RequestFormState, form.actions()));
    assert.ok(html.includes(formatSubmitPrice({ priceType: type, amountToman: amount }, nextLocale)));
    if (nextLocale === "en") assert.doesNotMatch(html, /[\\u0600-\\u06FF]/);
    form.change({ phone: "" });
    form.actions().onConfirmPrice(); await settle();
    assert.equal(form.requests.length, 1);
    assert.equal(form.button().disabled, true, "invalid fields do not release pending consent");
    form.change({ phone: values.phone });
    const confirm = form.actions().onConfirmPrice;
    confirm(); confirm(); await settle();
    assert.equal(form.requests.length, 2, "double confirmation is one logical attempt");
    assert.equal(form.actions().outcome.kind, "temporarily_unavailable");
    assert.equal(form.button().disabled, false, "a deliberate confirmation survives a transport failure");
    assert.deepEqual(form.fields().values, values);
    assert.equal(form.payload(1).client_price_type, type);
    assert.equal(form.payload(1).client_displayed_price, amount);
    assert.equal(form.payload(0).submission_id, form.payload(1).submission_id);
    form.actions().onRetry(); await settle(); form.render();
    assert.deepEqual(form.payload(2), form.payload(1), "retry preserves the approved price, terms and id");
    assert.equal(find(form.tree, RequestSuccess).props.trackingCode, "REQ-2001");
    assert.deepEqual(form.success, ["REQ-2001"]);
    assert.ok(form.slots.some(slot => slot.value === EMPTY_REQUEST_FORM_VALUES));
    scenarios++;
  }
  for (const code of ["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_EXPIRED"]) {
    const form = mount(nextLocale, [changed("fixed", 1300), reply(409, { code }),
      reply(200, { code: "REQUEST_REPLAYED", tracking_code: "REQ-2002" })]);
    form.submit(); await settle(); form.actions().onConfirmPrice(); await settle();
    assert.equal(form.button().disabled, true, "blocked identifier must not leave an enabled inert main action");
    form.submit(); form.actions().onRetry(); await settle();
    assert.equal(form.requests.length, 2);
    assert.deepEqual(form.fields().values, values);
    const restart = form.actions().onNewAttempt;
    restart(); restart(); await settle(); form.render();
    assert.equal(form.requests.length, 3);
    assert.notEqual(form.payload(2).submission_id, form.payload(1).submission_id);
    assert.equal(form.payload(2).client_displayed_price, 1300);
    assert.equal(find(form.tree, RequestSuccess).props.trackingCode, "REQ-2002");
    scenarios++;
  }
  {
    const form = mount(nextLocale, [changed(), temporary]);
    form.submit(); await settle();
    form.props.source = graveSource(); form.render();
    assert.equal(form.button().disabled, true, "same semantic choice retains the consent gate");
    form.props.source = graveSource("33333333-3333-4333-8333-333333333333"); form.render();
    assert.equal(form.actions().outcome, null);
    assert.deepEqual(form.fields().values, values);
    assert.equal(form.button().disabled, false);
    form.submit(); await settle();
    assert.equal(form.payload(1).client_displayed_price, 1000);
    assert.equal(form.payload(1).variant_id, "33333333-3333-4333-8333-333333333333");
    assert.notEqual(form.payload(1).submission_id, form.payload(0).submission_id);
    scenarios++;
  }
  {
    const late = deferred();
    const form = mount(nextLocale, [changed(), () => late.promise, temporary]);
    form.submit(); await settle(); form.actions().onConfirmPrice(); await settle();
    form.props.source = graveSource("33333333-3333-4333-8333-333333333333"); form.render();
    form.props.source = graveSource(); form.render();
    late.resolve(changed("fixed", 1400)); await settle();
    assert.equal(form.actions().outcome, null);
    assert.equal(form.button().disabled, false);
    assert.equal(form.success.length, 0);
    form.submit(); await settle();
    assert.equal(form.payload(2).client_displayed_price, 1000);
    assert.notEqual(form.payload(2).submission_id, form.payload(1).submission_id);
    scenarios++;
  }
  for (const matching of [true, false]) {
    const reads = [];
    readTerms = async requested => { reads.push(requested); return (matching ? newTerms : oldTerms)[requested]; };
    const form = mount(nextLocale, [updated(nextLocale), temporary], contact());
    form.submit(); await settle();
    assert.equal(form.actions().outcome.kind, "terms_updated");
    assert.deepEqual(reads, [nextLocale]);
    assert.deepEqual(form.fields().values, { ...values, termsAccepted: false });
    form.submit(); await settle(); assert.equal(form.requests.length, 1);
    form.change({ termsAccepted: true });
    if (matching) {
      assert.equal(form.button().disabled, false);
      form.submit(); await settle();
      assert.equal(form.payload(1).terms_version, newTerms[nextLocale].version);
      assert.equal(form.payload(1).terms_content_hash, newTerms[nextLocale].contentHash);
      assert.equal(form.payload(1).terms_accepted, true);
      assert.notEqual(form.payload(1).submission_id, form.payload(0).submission_id);
    } else {
      assert.equal(form.button().disabled, true, "server metadata alone is not a reviewed same-language page");
      form.submit(); await settle(); assert.equal(form.requests.length, 1);
    }
    assert.equal(form.success.length, 0);
    scenarios++;
  }
  for (const pricePending of [true, false]) {
    const form = mount(nextLocale, [pricePending ? changed() : reply(409, { code: "IDEMPOTENCY_CONFLICT" }),
      pricePending ? changed() : temporary, temporary]);
    form.submit(); await settle(); assert.equal(form.button().disabled, true);
    form.props.termsDocument = newTerms[nextLocale]; form.render();
    assert.equal(form.actions().outcome, null);
    assert.deepEqual(form.fields().values, { ...values, termsAccepted: false });
    form.submit(); await settle(); assert.equal(form.requests.length, 1);
    form.change({ termsAccepted: true });
    assert.equal(form.button().disabled, false, "a new document must not hide the only action that releases an old block");
    form.submit(); await settle();
    assert.notEqual(form.payload(1).submission_id, form.payload(0).submission_id);
    assert.equal(form.payload(1).terms_content_hash, newTerms[nextLocale].contentHash);
    assert.equal(form.payload(1).client_displayed_price, 1000, "old pending price is not silently accepted in a new consent context");
    if (pricePending) {
      assert.equal(form.button().disabled, true);
      form.submit(); await settle(); assert.equal(form.requests.length, 2);
      form.actions().onConfirmPrice(); await settle();
      assert.equal(form.requests.length, 3);
      assert.equal(form.payload(2).client_displayed_price, 1200);
    }
    assert.equal(form.success.length, 0);
    scenarios++;
  }
  {
    const form = mount(nextLocale, [reply(409, { code: "SELECTION_UNAVAILABLE" }), temporary]);
    form.submit(); await settle();
    form.props.termsDocument = newTerms[nextLocale]; form.render();
    assert.equal(form.actions().outcome?.kind, "selection_unavailable", "a new document cannot hide why the selection remains blocked");
    form.change({ termsAccepted: true });
    assert.deepEqual(form.fields().values, values);
    assert.equal(form.button().disabled, true);
    form.submit(); form.actions().onRetry(); await settle();
    assert.equal(form.requests.length, 1, "new Terms do not restore an unavailable selection");
    form.props.source = graveSource("33333333-3333-4333-8333-333333333333"); form.render();
    assert.equal(form.actions().outcome, null);
    assert.equal(form.button().disabled, false);
    form.submit(); await settle();
    assert.equal(form.payload(1).terms_content_hash, newTerms[nextLocale].contentHash);
    assert.notEqual(form.payload(1).submission_id, form.payload(0).submission_id);
    scenarios++;
  }
  {
    const form = mount(nextLocale, [success("REQ-2003")], contact());
    form.submit(); await settle(); form.render();
    assert.equal(find(form.tree, RequestSuccess).props.trackingCode, "REQ-2003");
    form.props.termsDocument = newTerms[nextLocale]; form.render(); form.render();
    assert.equal(find(form.tree, RequestSuccess)?.props.trackingCode, "REQ-2003", "updated Terms cannot erase a validated received request");
    assert.equal(form.requests.length, 1);
    assert.deepEqual(form.success, ["REQ-2003"]);
    scenarios++;
  }
}
assert.equal(scenarios, 26);
assert.equal(gatewayUpdates, 4, "both locales and matching/mismatching pages pass through the real Gateway");
assert.equal(fetchCalls, 0);
assert.equal(stored.length, 12);
assert.ok(stored.every(entry => entry.key === "request:last-tracking-code" && /^REQ-200[123]$/.test(entry.value)));
console.log("request-consent-runtime-passed: 26 scenarios; fetch=0; no DOM");
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
      "request-consent-runtime-passed: 26 scenarios; fetch=0; no DOM",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
