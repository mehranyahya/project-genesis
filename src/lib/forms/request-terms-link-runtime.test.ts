import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("reading localized Terms uses the native link without navigating away from any request form", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const directory = await mkdtemp(join(repository, ".request-terms-link-"));
  try {
    const script = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
// Bun selects the Node server export. Let the real router's isServer flag
// choose SSR or client Link logic in this offline callback fixture.
const serverExports = { ...await import("@tanstack/router-core/isServer") };
mock.module("@tanstack/router-core/isServer", () => ({ ...serverExports, isServer: undefined }));
const originalReact = { ...await import("react") };
const routerLibrary = { ...await import("@tanstack/react-router") };
const localeLibrary = { ...await import("../src/lib/i18n/react.tsx") };
let currentRouter, currentLocale = "fa";
const hooks = {
  ...originalReact,
  useContext: context => context._currentValue === "fa" ? currentLocale : currentRouter,
  useMemo: calculate => calculate(),
  useCallback: callback => callback,
  useRef: value => ({ current: value }),
  useState: initial => [typeof initial === "function" ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useImperativeHandle: () => {},
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
};
mock.module("react", () => ({ ...hooks, default: hooks }));
mock.module("@tanstack/react-store", () => ({ useSelector: (store, select) => select(store.get()) }));
const { RequestFormFields } = await import("../src/components/request-form/request-form-fields.tsx");
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw new Error("Offline link test rejected network"); };
const values = { customerName: "Synthetic customer", phone: "09121234567", city: "Synthetic city",
  locationText: "Synthetic location", locationUnknown: false, preferredContact: "phone",
  preferredContactTime: "", customerNote: "Synthetic private note", termsAccepted: false };
function find(element, type) {
  if (!element || typeof element !== "object") return null;
  if (Array.isArray(element)) return element.map(child => find(child, type)).find(Boolean) ?? null;
  return element.type === type ? element : find(element.props?.children, type);
}
function event(props) {
  return { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    defaultPrevented: false, currentTarget: { getAttribute: key => props[key] ?? null },
    preventDefault() { this.defaultPrevented = true; } };
}
let scenarios = 0;
for (const locale of ["fa", "en"]) for (const kind of ["grave_stone", "building_stone", "contact"]) {
  currentLocale = locale;
  const prefix = locale === "en" ? "/en" : "";
  const formPath = prefix + "/quote", termsPath = prefix + "/terms";
  const root = routerLibrary.createRootRoute();
  const formRoute = routerLibrary.createRoute({ getParentRoute: () => root, path: formPath });
  const termsRoute = routerLibrary.createRoute({ getParentRoute: () => root, path: termsPath });
  const router = currentRouter = routerLibrary.createRouter({ routeTree: root.addChildren([formRoute, termsRoute]),
    history: routerLibrary.createMemoryHistory({ initialEntries: [formPath + "?reference=pf-1001"] }), isServer: true });
  await router.load();
  router.update({ isServer: false, origin: "https://synthetic.invalid" });
  let navigations = 0;
  const originalNavigate = router.navigate;
  router.navigate = options => { navigations++; return originalNavigate(options); };
  const fieldsProps = { values, errors: {}, source: { kind }, disabled: false, onChange: () => {} };
  const tree = RequestFormFields(fieldsProps);
  const terms = find(tree, localeLibrary.LocaleLink);
  assert.ok(terms, "the real fields expose their localized Terms link");
  const localized = localeLibrary.LocaleLink(terms.props);
  const link = routerLibrary.useLinkProps(localized.props);
  assert.equal(link.href, termsPath, "Terms URL carries neither form fields nor reference query");
  assert.equal(typeof link.onClick, "function", "exercise installed client Link logic");
  const click = event(link);
  link.onClick(click);
  assert.equal(navigations, 0, "reading Terms must not leave the in-memory form route");
  assert.equal(click.defaultPrevented, false, "browser-native activation remains available");
  assert.equal(router.history.location.pathname, formPath);
  assert.ok(router.state.matches.some(match => match.routeId === formRoute.id));
  assert.equal(link.target, "_blank");
  assert.ok(link.rel.split(" ").includes("noopener"));
  assert.ok(link.rel.split(" ").includes("noreferrer"));

  router.isServer = true;
  const html = renderToStaticMarkup(originalReact.createElement(RequestFormFields, fieldsProps));
  const anchor = html.match(/<a\\b[^>]*href="(?:\\/en)?\\/terms"[^>]*>/)?.[0];
  assert.ok(anchor);
  const descriptionId = anchor.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(descriptionId, "opening a new tab is explained before activation");
  const hint = html.match(new RegExp('<p[^>]*id="' + descriptionId + '"[^>]*>([^<]+)</p>'))?.[1];
  assert.ok(hint?.includes(locale === "en" ? "new tab" : "زبانه"));
  assert.ok(hint?.includes(locale === "en" ? "form" : "فرم"));
  assert.ok(html.includes("Synthetic customer"));
  if (locale === "en") assert.doesNotMatch(html, /[\\u0600-\\u06FF]/);
  const invalidHtml = renderToStaticMarkup(originalReact.createElement(RequestFormFields,
    { ...fieldsProps, errors: { termsAccepted: "پذیرش شرایط ثبت الزامی است." } }));
  const checkbox = invalidHtml.match(/<input[^>]*id="request-termsAccepted"[^>]*>/)?.[0];
  assert.ok(checkbox?.includes('aria-invalid="true"'));
  assert.ok(checkbox?.includes('aria-errormessage="request-termsAccepted-error"'));
  assert.ok(checkbox?.includes("request-termsAccepted-error"), "the new hint never removes the existing field error");

  // Control case: the same installed client handler still intercepts _self.
  router.isServer = false;
  const self = routerLibrary.useLinkProps({ ...localized.props, target: "_self" });
  const selfClick = event(self);
  self.onClick(selfClick);
  assert.equal(navigations, 1);
  assert.equal(selfClick.defaultPrevented, true);
  assert.equal(router.history.location.pathname, termsPath);
  router.isServer = true;
  await router.load();
  assert.ok(router.state.matches.some(match => match.routeId === termsRoute.id));
  scenarios++;
}
assert.equal(scenarios, 6);
assert.equal(fetchCalls, 0);
console.log("request-terms-link-passed: 6 scenarios; fetch=0; no DOM");
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
    assert.equal(result.stdout.trim(), "request-terms-link-passed: 6 scenarios; fetch=0; no DOM");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
