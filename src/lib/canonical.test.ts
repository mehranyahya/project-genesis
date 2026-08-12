import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canonicalHref, normalizeCanonicalOrigin } from "./canonical";

const routePaths = [
  "../routes/index.tsx",
  "../routes/about.tsx",
  "../routes/building-stone.tsx",
  "../routes/contact.tsx",
  "../routes/portfolio.tsx",
  "../routes/privacy.tsx",
  "../routes/quote.tsx",
  "../routes/terms.tsx",
  "../routes/grave-stones/index.tsx",
  "../routes/grave-stones/custom.tsx",
  "../routes/grave-stones/$slug.tsx",
  "../routes/guides/index.tsx",
  "../routes/guides/$slug.tsx",
] as const;

const routeSources = routePaths.map((path) => ({
  path,
  source: readFileSync(new URL(path, import.meta.url), "utf8"),
}));
const sharedSource = readFileSync(new URL("./route-defs/shared.tsx", import.meta.url), "utf8");
const factorySource = readFileSync(new URL("./route-defs/pages.tsx", import.meta.url), "utf8");
const deployWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-cloudflare.yml", import.meta.url),
  "utf8",
);
const reusableDeployWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-cloudflare-reusable.yml", import.meta.url),
  "utf8",
);

test("canonical helper preserves relative paths without an origin and emits absolute HTTPS URLs", () => {
  assert.equal(canonicalHref("/", null), "/");
  assert.equal(canonicalHref("/grave-stones/natanz-simple", null), "/grave-stones/natanz-simple");
  assert.equal(
    canonicalHref("/grave-stones/natanz-simple", "https://example.com"),
    "https://example.com/grave-stones/natanz-simple",
  );
  assert.equal(normalizeCanonicalOrigin("https://example.com/"), "https://example.com");
});

test("canonical helper rejects unsafe paths and non-clean production origins", () => {
  for (const path of [
    "https://evil.example/path",
    "//evil.example/path",
    "relative",
    "/bad path",
  ] as const) {
    assert.throws(() => canonicalHref(path, "https://example.com"));
  }

  for (const origin of [
    "http://example.com",
    "https://user@example.com",
    "https://example.com/path",
    "https://example.com/?query=1",
    "https://example.com/#hash",
    "not-a-url",
  ] as const) {
    assert.throws(() => normalizeCanonicalOrigin(origin));
  }
});

test("every public route exists in both locales and delegates to the shared factory", () => {
  assert.equal(routeSources.length, 13);
  for (const { path, source } of routeSources) {
    assert.match(source, /createFileRoute\("/, `${path} must declare its route id`);
    assert.match(
      source,
      /from "@\/lib\/route-defs\/pages"/,
      `${path} must delegate to the shared factory`,
    );
    assert.equal(/rel: "canonical"/.test(source), false, `${path} must not inline a canonical`);
  }
  for (const { path } of routeSources) {
    const english = path.replace("../routes/", "../routes/en/");
    assert.ok(
      readFileSync(new URL(english, import.meta.url), "utf8").includes("createFileRoute("),
      `${english} must exist`,
    );
  }
});

test("the shared head helper owns every canonical and hreflang link", () => {
  assert.match(sharedSource, /rel: "canonical"/);
  assert.match(sharedSource, /canonicalHref\(localizeRawPath\(basePath, locale\)\)/);
  assert.match(sharedSource, /hrefLang: alternate/);
  assert.match(sharedSource, /hrefLang: "x-default"/);
  assert.equal(/rel: "canonical", href: "\//.test(sharedSource), false);
  assert.equal(/rel: "canonical", href: page\.canonicalPath/.test(sharedSource), false);
  assert.equal(/rel: "canonical", href: guide\.path/.test(sharedSource), false);
});

test("dynamic product canonical is derived from loaded validated product data", () => {
  assert.match(factorySource, /localizedLinks\(`\/grave-stones\/\$\{data\.model\.slug\}`, locale\)/);
  assert.equal(
    /canonicalHref\(`\/grave-stones\/\$\{params\.slug\}`\)/.test(factorySource),
    false,
  );
  assert.match(factorySource, /localizedLinks\(guide\.path, locale\)/);
  assert.match(factorySource, /localizedLinks\(page\.canonicalPath \?\? basePath, locale\)/);
});

test("build canonical origin is derived from the selected repository SITE_URL", () => {
  assert.match(reusableDeployWorkflow, /VITE_SITE_URL: \$\{\{ inputs\.site_url \}\}/);
  assert.match(deployWorkflow, /site_url: \$\{\{ vars\.PREVIEW_SITE_URL \}\}/);
  assert.match(deployWorkflow, /site_url: \$\{\{ vars\.PRODUCTION_SITE_URL \}\}/);
  assert.equal(/vars\.PUBLIC_SITE_ORIGIN/.test(deployWorkflow), false);
  assert.equal(/secrets\.SITE_URL/.test(deployWorkflow), false);
});
