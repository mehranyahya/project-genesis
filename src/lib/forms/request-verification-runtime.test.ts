import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("actual request handlers recover from security stalls without sending, losing values or applying stale responses", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const directory = await mkdtemp(join(repository, ".request-verification-runtime-"));
  try {
    const script = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
const originalReact = { ...await import("react") };
const { translatorFor } = await import("../src/lib/i18n/messages.ts");
let active;
let locale = "fa";
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
  useLocale: () => locale,
  useT: () => translatorFor(locale),
  LocaleLink: originalReact.Fragment,
}));
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("Offline handler test rejected network"); };
const stored = [];
globalThis.sessionStorage = { setItem: (key, value) => stored.push({ key, value }) };
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
const watchdogs = new Map();
let timerId = 0;
globalThis.setTimeout = (callback, ms, ...args) => {
  if (ms !== 60000) return nativeSetTimeout(callback, ms, ...args);
  const id = { syntheticTimer: ++timerId };
  watchdogs.set(id, () => callback(...args));
  return id;
};
globalThis.clearTimeout = id => {
  if (watchdogs.delete(id)) return;
  nativeClearTimeout(id);
};
const { RequestForm } = await import("../src/components/request-form/request-form.tsx");
const { RequestFormFields } = await import("../src/components/request-form/request-form-fields.tsx");
const { RequestFormState } = await import("../src/components/request-form/request-form-state.tsx");
const { RequestSuccess } = await import("../src/components/request-form/request-success.tsx");
const { TurnstileField } = await import("../src/components/request-form/turnstile-field.tsx");
const values = { customerName: "Synthetic customer", phone: "09121234567", city: "Synthetic city",
  locationText: "Synthetic location", locationUnknown: false, preferredContact: "phone",
  preferredContactTime: "", customerNote: "Synthetic private note", termsAccepted: true };
function find(element, type) {
  if (!element || typeof element !== "object") return null;
  if (Array.isArray(element)) return element.map(child => find(child, type)).find(Boolean) ?? null;
  return element.type === type ? element : find(element.props?.children, type);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function mount(nextLocale = "fa", response = { status: 201, body: JSON.stringify({ code: "REQUEST_CREATED", tracking_code: "REQ-1001" }) }) {
  locale = nextLocale;
  const instance = { cursor: 0, slots: [], effects: [], props: {
    source: { kind: "contact", portfolioReferenceId: null }, site: null,
    termsDocument: { locale, version: "1.0", contentHash: "a".repeat(64) },
    submitRequest: async input => { instance.requests.push(input); return response; },
    onSuccess: code => instance.success.push(code),
  }, requests: [], success: [], tree: null };
  instance.render = () => {
    active = instance;
    instance.cursor = 0;
    instance.tree = RequestForm(instance.props);
    instance.effects.splice(0).forEach(effect => effect());
    return instance.tree;
  };
  instance.render();
  find(instance.tree, RequestFormFields).props.onChange(values);
  instance.render();
  instance.attach = (execute, reset = () => {}) => {
    find(instance.tree, TurnstileField).props.ref.current = { execute, reset };
  };
  instance.submit = () => {
    find(instance.tree, "form").props.onSubmit({ preventDefault() {} });
    instance.render();
  };
  instance.state = () => { instance.render(); return find(instance.tree, RequestFormState)?.props.outcome; };
  instance.fields = () => { instance.render(); return find(instance.tree, RequestFormFields)?.props; };
  instance.expire = async () => { [...watchdogs.values()].forEach(callback => callback()); await flush(); instance.render(); };
  instance.unmount = () => { instance.slots.forEach(slot => slot.cleanup?.()); };
  return instance;
}
let scenarios = 0;
for (const nextLocale of ["fa", "en"]) {
  const proof = deferred();
  const form = mount(nextLocale);
  let resets = 0;
  form.attach(() => proof.promise, () => { resets++; });
  form.submit();
  form.submit();
  assert.equal(form.fields().disabled, true);
  assert.equal(form.requests.length, 0);
  await form.expire();
  assert.equal(form.fields().disabled, false, "a stalled security callback must release the actual form");
  assert.equal(form.state().kind, "bot_verification_invalid");
  assert.deepEqual(form.fields().values, values, "recovery must preserve all private form values in memory");
  assert.equal(form.success.length, 0);
  assert.equal(resets, 1);
  proof.resolve("late-synthetic-token");
  await flush();
  assert.equal(form.requests.length, 0, "a late proof must not send the abandoned attempt");
  form.attach(async () => "fresh-synthetic-token");
  find(form.tree, RequestFormState).props.onRetry();
  await flush();
  form.render();
  assert.equal(form.requests.length, 1);
  assert.equal(form.requests[0].headers["X-Turnstile-Token"], "fresh-synthetic-token");
  assert.equal(JSON.parse(form.requests[0].body).customer_name, values.customerName);
  assert.equal(find(form.tree, RequestSuccess).props.trackingCode, "REQ-1001");
  assert.deepEqual(form.success, ["REQ-1001"]);
  assert.equal(watchdogs.size, 0);
  scenarios++;
}
for (const execute of [() => { throw new Error("Synthetic SDK exception"); }, () => Promise.reject(new Error("Synthetic SDK rejection"))]) {
  const form = mount();
  form.attach(execute, () => { throw new Error("Synthetic reset exception"); });
  form.submit();
  await flush();
  assert.equal(form.fields().disabled, false);
  assert.deepEqual(form.fields().values, values);
  assert.equal(form.state().kind, "bot_verification_invalid");
  assert.equal(form.requests.length, 0);
  scenarios++;
}
for (const token of ["synthetic-token", null]) {
  const form = mount("en", { status: 200, body: JSON.stringify({ code: "REQUEST_REPLAYED", tracking_code: "REQ-1002" }) });
  form.attach(async () => token, () => { throw new Error("Synthetic reset exception"); });
  form.submit();
  await flush();
  form.render();
  assert.equal(find(form.tree, RequestSuccess).props.trackingCode, "REQ-1002", "cleanup failure cannot erase validated server success");
  assert.equal(form.requests.length, 1);
  assert.equal(form.requests[0].headers["X-Turnstile-Token"], token ?? undefined);
  scenarios++;
}
{
  const form = mount("en", { status: 503, body: JSON.stringify({ code: "TEMPORARILY_UNAVAILABLE" }) });
  form.attach(async () => null);
  form.submit();
  await flush();
  assert.equal(form.state().kind, "temporarily_unavailable");
  assert.deepEqual(form.fields().values, values);
  assert.equal(form.success.length, 0);
  assert.equal(find(form.tree, RequestSuccess), null);
  scenarios++;
}
for (const change of ["source", "aba", "terms", "locale", "unmount"]) {
  const proof = deferred();
  const form = mount();
  let resets = 0;
  form.attach(() => proof.promise, () => { resets++; });
  form.submit();
  if (change === "source") form.props.source = { kind: "contact", portfolioReferenceId: "different-reference" };
  if (change === "aba") {
    form.props.source = { kind: "contact", portfolioReferenceId: "different-reference" };
    form.render();
    form.props.source = { kind: "contact", portfolioReferenceId: null };
  }
  if (change === "terms") form.props.termsDocument = { locale: "fa", version: "2.0", contentHash: "b".repeat(64) };
  if (change === "locale") {
    locale = "en";
    form.props.termsDocument = { locale, version: "1.0", contentHash: "a".repeat(64) };
  }
  if (change === "unmount") form.unmount(); else form.render();
  await form.expire();
  assert.equal(form.requests.length, 0);
  assert.equal(form.success.length, 0);
  assert.equal(resets, 0, "an old attempt cannot reset the current widget");
  if (change !== "unmount") assert.equal(form.state(), null);
  proof.resolve("stale-synthetic-token");
  await flush();
  assert.equal(form.requests.length, 0);
  scenarios++;
}
assert.equal(scenarios, 12);
assert.equal(networkCalls, 0);
assert.equal(watchdogs.size, 0);
assert.equal(stored.length, 4);
assert.ok(stored.every(entry => entry.key === "request:last-tracking-code" && /^REQ-100[12]$/.test(entry.value)));
console.log("request-verification-runtime-passed: 12 scenarios; fetch=0; no DOM");
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
      "request-verification-runtime-passed: 12 scenarios; fetch=0; no DOM",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
