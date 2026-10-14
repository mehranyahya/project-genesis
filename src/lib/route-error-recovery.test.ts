import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("public retry handlers request a fresh document for cached code failures and preserve ordinary loader recovery", async () => {
  const repository = fileURLToPath(new URL("../../", import.meta.url));
  const directory = await mkdtemp(join(repository, ".route-error-recovery-"));
  try {
    const script = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
const originalReact = { ...await import("react") };
const originalRouter = { ...await import("@tanstack/react-router") };
const originalLocale = { ...await import("../src/lib/i18n/react.tsx") };
const { translatorFor } = await import("../src/lib/i18n/messages.ts");
const { createRoute, createRouter, createMemoryHistory, lazyRouteComponent } = originalRouter;
let currentRouter;
let currentLocale = "fa";
mock.module("react", () => ({ ...originalReact, useEffect: () => {} }));
mock.module("@tanstack/react-router", () => ({
  ...originalRouter,
  useRouter: () => currentRouter,
  useRouterState: options => options.select(currentRouter.state),
}));
mock.module("../src/lib/i18n/react.tsx", () => ({
  ...originalLocale,
  useLocale: () => currentLocale,
  useT: () => translatorFor(currentLocale),
}));
mock.module("../src/lib/content/adapters.ts", () => ({
  getSite: async () => ({ site: null, routeAvailability: {} }),
  getPage: async () => null,
}));
mock.module("../src/styles.css?url", () => ({ default: "/synthetic-test.css" }));
const { Route } = await import("../src/routes/__root.tsx");
const { GraveStoneListError } = await import("../src/components/grave-stones/grave-stone-list-states.tsx");
const { ProductDetailError } = await import("../src/components/product/product-detail-states.tsx");
const { CustomFunnelError } = await import("../src/components/custom-funnel/custom-funnel-states.tsx");
const { PortfolioError } = await import("../src/components/portfolio/portfolio-states.tsx");
const { GuidesError, GuideError } = await import("../src/components/guides/guides.tsx");
let fetchCalls = 0, reloadCalls = 0, storageWrites = 0, scenarios = 0;
globalThis.fetch = async () => { fetchCalls++; throw new Error("Offline route recovery test rejected network"); };
globalThis.window = { location: {
  origin: "https://synthetic.invalid", href: "https://synthetic.invalid/",
  reload() { reloadCalls++; },
}};
// Model the framework's earlier automatic reload already being used.
globalThis.sessionStorage = { getItem: () => "1", setItem: () => { storageWrites++; } };
const diagnostics = [];
console.error = (...args) => diagnostics.push(...args);
function find(element, type) {
  if (!element || typeof element !== "object") return null;
  if (Array.isArray(element)) return element.map(child => find(child, type)).find(Boolean) ?? null;
  if (typeof element.type === "function") return find(element.type(element.props), type);
  return element.type === type ? element : find(element.props?.children, type);
}
function view(error, locale) {
  let resets = 0;
  const tree = Route.options.errorComponent({ error, reset: () => { resets++; } });
  const html = renderToStaticMarkup(tree);
  assert.equal((html.match(/<h1\\b/g) ?? []).length, 1);
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('href="' + (locale === "en" ? "/en" : "/") + '"'));
  assert.ok(html.includes(locale === "en" ? "Try again" : "تلاش دوباره"));
  if (locale === "en") assert.doesNotMatch(html, /[\\u0600-\\u06FF]/);
  assert.doesNotMatch(html, /Synthetic internal detail|synthetic\\.invalid|route-chunk\\.js/);
  const before = reloadCalls;
  return { click: () => find(tree, "button").props.onClick(), resetCount: () => resets, before };
}
function routerFor(locale, component, loader) {
  const pathname = (locale === "en" ? "/en" : "") + "/synthetic-recovery";
  // A router tree is immutable after initialization; each scenario gets fresh
  // route objects with the actual production Root options.
  const root = originalRouter.createRootRouteWithContext()({ ...Route.options });
  const child = createRoute({ getParentRoute: () => root, path: pathname, component, loader });
  currentRouter = createRouter({
    routeTree: root.addChildren([child]),
    context: { queryClient: null },
    history: createMemoryHistory({ initialEntries: [pathname] }),
    isServer: true,
  });
  return currentRouter;
}
function GoodView() { return originalReact.createElement("p", null, "Synthetic reviewed data"); }
for (const locale of ["fa", "en"]) {
  currentLocale = locale;
  for (const message of [
    "Failed to fetch dynamically imported module: https://synthetic.invalid/assets/route-chunk.js",
    "error loading dynamically imported module: https://synthetic.invalid/assets/route-chunk.js",
    "Importing a module script failed.",
  ]) {
    const failure = new TypeError(message);
    let imports = 0, loads = 0;
    const lazy = lazyRouteComponent(async () => {
      imports++;
      if (imports === 1) throw failure;
      return { default: GoodView };
    });
    const router = routerFor(locale, lazy, async () => { loads++; return { locale }; });
    await router.load();
    assert.throws(() => lazy({}), error => error === failure);
    await router.invalidate();
    assert.equal(loads, 2, "router invalidation reruns the actual loader");
    assert.equal(imports, 1, "the installed lazy module promise stays cached after failure");
    assert.throws(() => lazy({}), error => error === failure);
    const retry = view(failure, locale);
    assert.equal(reloadCalls, retry.before, "rendering the fallback must not reload automatically");
    retry.click();
    assert.equal(reloadCalls, retry.before + 1, "explicit retry must request a fresh document for a cached code failure");
    assert.equal(retry.resetCount(), 0);
    assert.equal(loads, 2, "module recovery must not masquerade as another data retry");
    assert.equal(imports, 1);
    // A fresh module realm can import successfully after the failure clears.
    const fresh = lazyRouteComponent(async () => ({ default: GoodView }));
    await fresh.preload();
    assert.equal(fresh({}).type, GoodView);
    scenarios++;
  }
  for (const persistent of [false, true]) {
    let loads = 0;
    const failure = new Error("Synthetic internal detail");
    const router = routerFor(locale, GoodView, async () => {
      loads++;
      if (loads === 1 || persistent) throw failure;
      return { locale, reviewed: true };
    });
    await router.load();
    assert.equal(router.state.matches.at(-1).status, "error");
    const retry = view(failure, locale);
    retry.click();
    await router.latestLoadPromise;
    assert.equal(reloadCalls, retry.before);
    assert.equal(retry.resetCount(), 1);
    assert.equal(loads, 2);
    assert.equal(router.state.matches.at(-1).status, persistent ? "error" : "success");
    if (!persistent) assert.deepEqual(router.state.matches.at(-1).loaderData, { locale, reviewed: true });
    scenarios++;
  }
  {
    const failure = new Error();
    Object.defineProperty(failure, "message", { get() { throw new Error("Synthetic accessor"); } });
    let invalidations = 0;
    currentRouter = { state: { location: { pathname: locale === "en" ? "/en/quote" : "/quote" } },
      invalidate: () => { invalidations++; return Promise.resolve(); } };
    const retry = view(failure, locale);
    assert.doesNotThrow(retry.click);
    assert.equal(invalidations, 1);
    assert.equal(retry.resetCount(), 1);
    assert.equal(reloadCalls, retry.before);
    scenarios++;
  }
  {
    const reload = window.location.reload;
    window.location.reload = () => { throw new Error("Synthetic blocked reload"); };
    let invalidations = 0;
    currentRouter = { state: { location: { pathname: locale === "en" ? "/en/quote" : "/quote" } },
      invalidate: () => { invalidations++; return Promise.resolve(); } };
    const retry = view(new TypeError("Importing a module script failed."), locale);
    try {
      assert.doesNotThrow(retry.click);
      assert.equal(invalidations, 1);
      assert.equal(retry.resetCount(), 1);
      assert.equal(reloadCalls, retry.before);
    } finally {
      window.location.reload = reload;
    }
    scenarios++;
  }
}
for (const locale of ["fa", "en"]) {
  currentLocale = locale;
  for (const Component of [GraveStoneListError, ProductDetailError, CustomFunnelError, PortfolioError, GuidesError, GuideError]) {
    for (const codeFailure of [true, false]) {
      let invalidations = 0;
      currentRouter = { state: { location: { pathname: locale === "en" ? "/en/synthetic-recovery" : "/synthetic-recovery" } },
        invalidate: () => { invalidations++; return Promise.resolve(); } };
      const error = codeFailure ? new TypeError("Importing a module script failed.") : new Error("Synthetic internal detail");
      const before = reloadCalls;
      const tree = Component({ error });
      const html = renderToStaticMarkup(tree);
      assert.ok(html.includes('role="alert"'));
      assert.ok(html.includes(locale === "en" ? "Try again" : "تلاش دوباره"));
      assert.doesNotMatch(html, /Importing a module|Synthetic internal detail/);
      if (locale === "en") assert.doesNotMatch(html, /[\\u0600-\\u06FF]/);
      assert.equal(reloadCalls, before);
      find(tree, "button").props.onClick();
      assert.equal(reloadCalls, before + (codeFailure ? 1 : 0), Component.name);
      assert.equal(invalidations, codeFailure ? 0 : 1, Component.name);
      scenarios++;
    }
  }
}
assert.equal(scenarios, 38);
assert.equal(fetchCalls, 0);
assert.equal(storageWrites, 0);
assert.ok(diagnostics.length > 0);
assert.ok(diagnostics.every(value => /^\\{"category":"(?:Error|TypeError)"\\}$/.test(value)));
console.log("route-error-recovery-passed: 38 scenarios; fetch=0; reload substituted; no DOM");
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
      "route-error-recovery-passed: 38 scenarios; fetch=0; reload substituted; no DOM",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
