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

test("repository robots policy is production-safe and excludes operational API crawling", () => {
  assert.equal(sourceRobots, "User-agent: *\nAllow: /\nDisallow: /api/\n");
});

test("deployment indexing script creates a closed preview and removes preview sitemap", () => {
  assert.match(prepareIndexing, /target !== "preview" && target !== "production"/);
  assert.match(prepareIndexing, /"User-agent: \*\\nDisallow: \/\\n"/);
  assert.match(prepareIndexing, /rm\(sitemapPath, \{ force: true \}\)/);
  assert.match(prepareIndexing, /"User-agent: \*\\nAllow: \/\\nDisallow: \/api\/\\n"/);
});

test("Wrangler target bindings are explicit non-secret vars and verified before upload", () => {
  assert.match(prepareCloudflare, /DEPLOY_TARGET/);
  assert.match(prepareCloudflare, /PUBLIC_INDEXING/);
  assert.match(prepareCloudflare, /deployTarget === "production" \? "true" : "false"/);
  assert.match(verifyCloudflare, /expectedIndexing/);
  assert.match(verifyCloudflare, /config\.vars\?\.PUBLIC_INDEXING/);

  assert.match(deployWorkflow, /Prepare deployment indexing policy/);
  assert.match(deployWorkflow, /node scripts\/prepare-deploy-indexing\.mjs "\$DEPLOY_TARGET"/);
  assert.equal(/secrets\.PUBLIC_INDEXING/.test(deployWorkflow), false);
  assert.equal(/secrets\.DEPLOY_TARGET/.test(deployWorkflow), false);

  const targetEnvOccurrences = deployWorkflow.match(/DEPLOY_TARGET: \$\{\{ inputs\.target \}\}/g) ?? [];
  assert.ok(targetEnvOccurrences.length >= 3);
});
