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
const deployWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-cloudflare.yml", import.meta.url),
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
  for (const path of ["https://evil.example/path", "//evil.example/path", "relative", "/bad path"] as const) {
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

test("every route that owns a canonical link uses the shared origin-aware helper", () => {
  assert.equal(routeSources.length, 13);
  for (const { path, source } of routeSources) {
    assert.match(source, /rel: "canonical"/, `${path} must still own its canonical link`);
    assert.match(source, /canonicalHref\(/, `${path} must use canonicalHref`);
    assert.equal(/rel: "canonical", href: "\//.test(source), false, `${path} has a raw relative canonical`);
    assert.equal(/rel: "canonical", href: page\.canonicalPath/.test(source), false, `${path} bypasses helper`);
    assert.equal(/rel: "canonical", href: guide\.path/.test(source), false, `${path} bypasses helper`);
  }
});

test("dynamic product canonical is derived from loaded validated product data", () => {
  const productRoute = routeSources.find(({ path }) => path.includes("grave-stones/$slug"));
  assert.ok(productRoute);
  assert.match(productRoute.source, /loaderData\.model\.slug/);
  assert.equal(/canonicalHref\(`\/grave-stones\/\$\{params\.slug\}`\)/.test(productRoute.source), false);
});

test("production build receives the same public origin as sitemap preparation", () => {
  assert.match(deployWorkflow, /VITE_PUBLIC_SITE_ORIGIN: \$\{\{ vars\.PUBLIC_SITE_ORIGIN \}\}/);
  assert.equal(/secrets\.VITE_PUBLIC_SITE_ORIGIN/.test(deployWorkflow), false);
  assert.equal(/secrets\.PUBLIC_SITE_ORIGIN/.test(deployWorkflow), false);
});
