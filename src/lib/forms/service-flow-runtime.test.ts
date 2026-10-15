import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("actual architectural and commission pages preserve editable details and bind retries to the current selection in both languages", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const directory = await mkdtemp(join(repository, ".service-flow-runtime-"));
  try {
    const script = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
const react = { ...await import("react") };
const router = { ...await import("@tanstack/react-router") };
const { translatorFor } = await import("../src/lib/i18n/messages.ts");
let active, locale = "fa", navigate;
function slot(make) { const index = active.cursor++; return active.slots[index] ??= make(); }
mock.module("react", () => ({ ...react,
  useState(initial) { const state = slot(() => ({ value: typeof initial === "function" ? initial() : initial }));
    return [state.value, next => { state.value = typeof next === "function" ? next(state.value) : next; }]; },
  useRef(initial) { return slot(() => ({ current: initial })); },
  useCallback(callback) { return callback; },
  useEffect(effect, deps) {
    const state = slot(() => ({ deps: undefined, cleanup: undefined }));
    if (!state.deps || deps.some((value, index) => !Object.is(value, state.deps[index]))) {
      state.deps = deps;
      active.effects.push(() => { state.cleanup?.(); state.cleanup = effect(); });
    }
  },
}));
mock.module("@tanstack/react-router", () => ({ ...router, useNavigate: () => navigate }));
mock.module("../src/lib/i18n/react.tsx", () => ({ useLocale: () => locale,
  useT: () => translatorFor(locale), LocaleLink: react.Fragment }));
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw new Error("Offline service test rejected network"); };
const { BuildingStonePage } = await import("../src/components/building-stone/building-stone-page.tsx");
const { BuildingStoneFields } = await import("../src/components/building-stone/building-stone-fields.tsx");
const { BuildingStoneSummary } = await import("../src/components/building-stone/building-stone-summary.tsx");
const { QuotePage } = await import("../src/components/request-form/quote-page.tsx");
const { RequestForm } = await import("../src/components/request-form/request-form.tsx");
const { RequestFormFields } = await import("../src/components/request-form/request-form-fields.tsx");
const { RequestFormState } = await import("../src/components/request-form/request-form-state.tsx");
const { RequestSuccess } = await import("../src/components/request-form/request-success.tsx");
const { TurnstileField } = await import("../src/components/request-form/turnstile-field.tsx");
const { STONEWORK_CATEGORIES } = await import("../src/lib/stoneworks.ts");
const stored = [];
globalThis.sessionStorage = { getItem: () => null,
  setItem(key, value) { stored.push({ key, value }); } };
globalThis.localStorage = { getItem() { throw new Error("No draft storage"); },
  setItem() { throw new Error("No draft storage"); } };
const brief = "120 × 60 × 40 cm; honed stone; synthetic indoor table.";
const values = { customerName: "Synthetic customer", phone: "09121234567", city: "Synthetic city",
  locationText: "Synthetic location", locationUnknown: false, preferredContact: "phone",
  preferredContactTime: "", customerNote: brief, termsAccepted: true };
function find(element, type) {
  if (!element || typeof element !== "object") return null;
  if (Array.isArray(element)) return element.map(child => find(child, type)).find(Boolean) ?? null;
  return element.type === type ? element : find(element.props?.children, type);
}
function instance() { return { cursor: 0, slots: [], effects: [], tree: null }; }
function render(component, props, target) {
  active = target; target.cursor = 0;
  target.tree = component(props);
  target.effects.splice(0).forEach(effect => effect());
  return target.tree;
}
const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const temporary = { status: 503, body: JSON.stringify({ code: "TEMPORARILY_UNAVAILABLE" }) };
function mount(kind, nextLocale, responses) {
  locale = nextLocale;
  const page = instance(), form = instance(), requests = [], navigations = [];
  const pageProps = { site: null,
    termsDocument: { locale, version: "1.0", contentHash: (locale === "fa" ? "a" : "b").repeat(64) },
    ...(kind === "commission" ? { portfolioReferenceId: null, stoneworkCategoryId: STONEWORK_CATEGORIES[0].id } : {}),
  };
  const component = kind === "building" ? BuildingStonePage : QuotePage;
  const transport = async input => {
    requests.push(input);
    const response = responses[requests.length - 1];
    assert.notEqual(response, undefined, "unexpected extra transport");
    return response;
  };
  const system = {
    requests, navigations, pageProps,
    render() {
      locale = nextLocale;
      navigate = async input => { navigations.push(input); };
      for (let pass = 0; pass < 2; pass++) {
        const tree = render(component, pageProps, page);
        const element = find(tree, RequestForm);
        render(RequestForm, { ...element.props, submitRequest: transport }, form);
        const challenge = find(form.tree, TurnstileField);
        if (challenge) challenge.props.ref.current = { execute: async () => "synthetic-proof", reset() {} };
      }
      return form.tree;
    },
    fields() { this.render(); return find(form.tree, RequestFormFields)?.props ?? null; },
    actions() { this.render(); return find(form.tree, RequestFormState)?.props ?? null; },
    buildingFields() { this.render(); return find(form.tree, BuildingStoneFields).props; },
    change(next) { this.fields().onChange(next); this.render(); },
    select(next) { this.buildingFields().onChange(next); this.render(); },
    category(id) { pageProps.stoneworkCategoryId = id; this.render(); },
    async submit() { this.render(); find(form.tree, "form").props.onSubmit({ preventDefault() {} }); await settle(); this.render(); },
    async retry() { this.actions().onRetry(); await settle(); this.render(); },
    payload(index) { return JSON.parse(requests[index].body); },
    summaryHtml() { const item = find(page.tree, BuildingStoneSummary); return renderToStaticMarkup(react.createElement(item.type, item.props)); },
    removeCategory() { find(page.tree, "button").props.onClick(); pageProps.stoneworkCategoryId = null; this.render(); },
    successCode() { this.render(); return find(form.tree, RequestSuccess)?.props.trackingCode ?? null; },
  };
  system.render(); system.change(values);
  return system;
}
let buildingRequests = 0, commissionRequests = 0;
for (const [index, nextLocale] of ["fa", "en"].entries()) {
  const t = translatorFor(nextLocale);
  const success = code => ({ status: 201, body: JSON.stringify({ code: "REQUEST_CREATED", tracking_code: code }) });
  {
    const code = "REQ-" + (5101 + index * 10);
    const form = mount("building", nextLocale, [temporary, temporary, temporary, success(code)]);
    await form.submit();
    assert.equal(form.requests.length, 0);
    assert.ok(form.buildingFields().errors.stoneType);
    assert.ok(form.buildingFields().errors.application);
    form.select({ stoneType: "granite", application: "other", areaM2Input: "۱۲٫۵" });
    form.change({ customerNote: "" });
    await form.submit();
    assert.equal(form.requests.length, 0);
    assert.ok(form.fields().errors.customerNote);
    form.change({ customerNote: brief });
    await form.submit();
    assert.equal(form.actions().outcome.kind, "temporarily_unavailable");
    assert.deepEqual(form.fields().values, values);
    const first = form.payload(0);
    assert.equal(first.request_type, "building_stone");
    assert.equal(first.stone_type, "granite");
    assert.equal(first.application, "other");
    assert.equal(first.area_m2, 12.5);
    assert.equal(first.customer_note, brief);
    assert.equal(first.client_price_type, "review");
    assert.equal(first.client_displayed_price, null);
    form.select({ areaM2Input: "12.500" });
    assert.equal(form.actions().outcome.kind, "temporarily_unavailable");
    await form.retry();
    assert.deepEqual(form.payload(1), first, "same normalized selection keeps the retry payload and id");
    form.select({ application: "facade" });
    assert.equal(form.actions().outcome, null);
    assert.deepEqual(form.fields().values, values);
    await form.submit();
    const changed = form.payload(2);
    assert.equal(changed.application, "facade");
    assert.equal(changed.area_m2, 12.5);
    assert.notEqual(changed.submission_id, first.submission_id);
    const html = form.summaryHtml();
    assert.ok(html.includes("12.5") && html.includes(t("گرانیت")) && html.includes(t("نما")));
    assert.equal(html.includes(values.customerName) || html.includes(brief), false);
    if (nextLocale === "en") assert.doesNotMatch(html, /[\\u0600-\\u06FF]/);
    await form.retry();
    assert.deepEqual(form.payload(3), changed);
    assert.equal(form.successCode(), code);
    assert.equal(form.fields(), null);
    buildingRequests += form.requests.length;
  }
  {
    const code = "REQ-" + (5102 + index * 10);
    const form = mount("commission", nextLocale, [temporary, temporary, temporary, temporary, success(code)]);
    const [a, b] = STONEWORK_CATEGORIES;
    assert.equal(form.fields().commission, true);
    await form.submit();
    const first = form.payload(0);
    const note = category => t("درخواست ساخت: {category}", { category: t(category.label) }) + "\\n" + brief;
    assert.equal(first.request_type, "contact");
    assert.equal(first.customer_note, note(a));
    assert.deepEqual(form.fields().values, values, "category prefix never overwrites the editable brief");
    await form.retry();
    assert.deepEqual(form.payload(1), first, "retry never duplicates the category prefix");
    form.category(b.id);
    assert.equal(form.actions().outcome, null);
    assert.deepEqual(form.fields().values, values);
    await form.submit();
    const changed = form.payload(2);
    assert.equal(changed.customer_note, note(b));
    assert.notEqual(changed.submission_id, first.submission_id);
    form.removeCategory();
    assert.deepEqual(form.navigations, [{ to: nextLocale === "en" ? "/en/quote" : "/quote", search: {}, replace: true }]);
    assert.equal(form.fields().commission, false);
    assert.deepEqual(form.fields().values, values);
    await form.submit();
    const cleared = form.payload(3);
    assert.equal(cleared.customer_note, brief);
    assert.notEqual(cleared.submission_id, changed.submission_id);
    await form.retry();
    assert.deepEqual(form.payload(4), cleared);
    assert.equal(form.successCode(), code);
    for (const input of form.requests) {
      const payload = JSON.parse(input.body);
      assert.equal("category" in payload || "dimensions" in payload, false);
      if (nextLocale === "en") assert.doesNotMatch(payload.customer_note, /[\\u0600-\\u06FF]/);
    }
    commissionRequests += form.requests.length;
  }
}
assert.equal(buildingRequests, 8);
assert.equal(commissionRequests, 10);
assert.equal(fetchCalls, 0);
assert.equal(stored.length, 4);
assert.ok(stored.every(entry => entry.key === "request:last-tracking-code" && /^REQ-5[0-9]{3}$/.test(entry.value)));
console.log("service-flow-runtime-passed: fa+en; building=8; commissions=10; tracking-only storage; no DOM");
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
      "service-flow-runtime-passed: fa+en; building=8; commissions=10; tracking-only storage; no DOM",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
