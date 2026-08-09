import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PREVIEW_ROBOTS_HEADER, applyDeploymentIndexingHeaders } from "../server";

const sourceRobots = readFileSync(new URL("../../public/robots.txt", import.meta.url), "utf8");
const prepareIndexing = readFileSync(
  new URL("../../scripts/prepare-deploy-indexing.mjs", import.meta.url),
  "utf8",
);
const prepareCloudflare = readFileSync(
  new URL("../../scripts/prepare-cloudflare-deploy.mjs", import.meta.url),
  "utf8",
);
const verifyCloudflare = readFileSync(
  new URL("../../scripts/verify-cloudflare-deploy.mjs", import.meta.url),
  "utf8",
);
const deployWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-cloudflare.yml", import.meta.url),
  "utf8",
);

test("indexing fails closed unless PUBLIC_INDEXING is exactly true", async () => {
  const missing = applyDeploymentIndexingHeaders(new Response("missing"), {});
  assert.equal(missing.headers.get("x-robots-tag"), PREVIEW_ROBOTS_HEADER);
  assert.equal(await missing.text(), "missing");

  const preview = applyDeploymentIndexingHeaders(new Response("preview"), {
    PUBLIC_INDEXING: "false",
  });
  assert.equal(preview.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");

  const wrongType = applyDeploymentIndexingHeaders(new Response("wrong"), {
    PUBLIC_INDEXING: true,
  });
  assert.equal(wrongType.headers.get("x-robots-tag"), PREVIEW_ROBOTS_HEADER);

  const production = applyDeploymentIndexingHeaders(new Response("production"), {
    PUBLIC_INDEXING: "true",
  });
  assert.equal(production.headers.get("x-robots-tag"), null);
  assert.equal(await production.text(), "production");
});

test("indexing header wrapper preserves response status and existing headers", () => {
  const response = new Response("limited", {
    status: 429,
    statusText: "Too Many Requests",
    headers: { "cache-control": "no-store" },
  });
  const wrapped = applyDeploymentIndexingHeaders(response, { PUBLIC_INDEXING: "false" });

  assert.equal(wrapped.status, 429);
  assert.equal(wrapped.statusText, "Too Many Requests");
  assert.equal(wrapped.headers.get("cache-control"), "no-store");
  assert.equal(wrapped.headers.get("x-robots-tag"), PREVIEW_ROBOTS_HEADER);
});

test("repository robots policy remains production-safe before target-specific preparation", () => {
  assert.equal(sourceRobots, "User-agent: *\nAllow: /\nDisallow: /api/\n");
});

test("deployment indexing script closes preview and requires production SITE_URL", () => {
  assert.match(prepareIndexing, /target !== "preview" && target !== "production"/);
  assert.match(prepareIndexing, /"User-agent: \*\\nDisallow: \/\\n"/);
  assert.match(prepareIndexing, /rm\(sitemapPath, \{ force: true \}\)/);
  assert.match(prepareIndexing, /SITE_URL is required for production/);
  assert.match(prepareIndexing, /Sitemap: \$\{origin\}\/sitemap\.xml/);
  assert.equal(prepareIndexing.includes("PUBLIC_SITE_ORIGIN"), false);
});

test("Wrangler target bindings expose SITE_URL, origin allowlist and exact indexing mode", () => {
  assert.match(prepareCloudflare, /DEPLOY_TARGET/);
  assert.match(prepareCloudflare, /PUBLIC_INDEXING/);
  assert.match(prepareCloudflare, /SITE_URL/);
  assert.match(prepareCloudflare, /ALLOWED_ORIGINS/);
  assert.match(prepareCloudflare, /deployTarget === "production" \? "true" : "false"/);
  assert.match(prepareCloudflare, /run_worker_first: \["\/api\/\*", "\/sitemap\.xml"\]/);
  assert.match(verifyCloudflare, /expectedIndexing/);
  assert.match(verifyCloudflare, /config\.vars\?\.SITE_URL/);
  assert.match(verifyCloudflare, /config\.vars\?\.ALLOWED_ORIGINS/);
  assert.match(verifyCloudflare, /Legacy PUBLIC_SITE_ORIGIN binding must not be emitted/);

  assert.match(deployWorkflow, /Prepare deployment indexing policy/);
  assert.match(deployWorkflow, /node scripts\/prepare-deploy-indexing\.mjs "\$DEPLOY_TARGET"/);
  assert.match(deployWorkflow, /PREVIEW_SITE_URL: \$\{\{ vars\.PREVIEW_SITE_URL \}\}/);
  assert.match(deployWorkflow, /PRODUCTION_SITE_URL: \$\{\{ vars\.PRODUCTION_SITE_URL \}\}/);
  assert.match(
    deployWorkflow,
    /PREVIEW_ALLOWED_ORIGINS: \$\{\{ vars\.PREVIEW_ALLOWED_ORIGINS \}\}/,
  );
  assert.match(
    deployWorkflow,
    /PRODUCTION_ALLOWED_ORIGINS: \$\{\{ vars\.PRODUCTION_ALLOWED_ORIGINS \}\}/,
  );
  assert.equal(/secrets\.SITE_URL/.test(deployWorkflow), false);
  assert.equal(/secrets\.ALLOWED_ORIGINS/.test(deployWorkflow), false);
  assert.equal(/secrets\.PUBLIC_INDEXING/.test(deployWorkflow), false);
  assert.equal(/^\s*environment:/m.test(deployWorkflow), false);
});
