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
const deployEntryWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-cloudflare.yml", import.meta.url),
  "utf8",
);
const deployReusableWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-cloudflare-reusable.yml", import.meta.url),
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

test("deployment indexing script closes preview and requires a real production sitemap origin", () => {
  assert.match(prepareIndexing, /target !== "preview" && target !== "production"/);
  assert.match(prepareIndexing, /"User-agent: \*\\nDisallow: \/\\n"/);
  assert.match(prepareIndexing, /rm\(sitemapPath, \{ force: true \}\)/);
  assert.match(prepareIndexing, /PUBLIC_SITE_ORIGIN is required for production/);
  assert.match(prepareIndexing, /Sitemap: \$\{origin\}\/sitemap\.xml/);
  assert.equal(prepareIndexing.includes("http://"), false);
});

test("repository-scoped deployment configuration is isolated and preview uses a stable alias", () => {
  assert.match(prepareCloudflare, /DEPLOY_TARGET/);
  assert.match(prepareCloudflare, /PUBLIC_INDEXING/);
  assert.match(prepareCloudflare, /PUBLIC_SITE_ORIGIN/);
  assert.match(prepareCloudflare, /deployTarget === "production" \? "true" : "false"/);
  assert.match(prepareCloudflare, /run_worker_first: \["\/api\/\*", "\/sitemap\.xml"\]/);
  assert.match(verifyCloudflare, /expectedIndexing/);
  assert.match(verifyCloudflare, /config\.vars\?\.PUBLIC_INDEXING/);
  assert.match(verifyCloudflare, /config\.vars\?\.PUBLIC_SITE_ORIGIN/);
  assert.match(verifyCloudflare, /Preview deployment must not expose PUBLIC_SITE_ORIGIN/);

  assert.equal(/\benvironment:/.test(deployEntryWorkflow), false);
  assert.equal(/\benvironment:/.test(deployReusableWorkflow), false);
  assert.match(deployEntryWorkflow, /secrets\.PREVIEW_CLOUDFLARE_ACCOUNT_ID/);
  assert.match(deployEntryWorkflow, /secrets\.PRODUCTION_CLOUDFLARE_ACCOUNT_ID/);
  assert.match(deployEntryWorkflow, /secrets\.PREVIEW_TURNSTILE_ALLOWED_HOSTNAMES/);
  assert.match(deployEntryWorkflow, /secrets\.PRODUCTION_TURNSTILE_ALLOWED_HOSTNAMES/);
  assert.match(
    deployEntryWorkflow,
    /public_site_origin: \$\{\{ vars\.PRODUCTION_PUBLIC_SITE_ORIGIN \}\}/,
  );
  assert.match(deployReusableWorkflow, /--preview-alias staging/);
  assert.match(deployReusableWorkflow, /npx --yes wrangler@4\.97\.0 versions upload/);
  assert.equal(/vars\.PUBLIC_SITE_ORIGIN/.test(deployEntryWorkflow), false);

  const targetEnvOccurrences =
    deployReusableWorkflow.match(/DEPLOY_TARGET: \$\{\{ inputs\.target \}\}/g) ?? [];
  assert.ok(targetEnvOccurrences.length >= 3);
  const originInputOccurrences =
    deployReusableWorkflow.match(
      /PUBLIC_SITE_ORIGIN: \$\{\{ inputs\.public_site_origin \}\}/g,
    ) ?? [];
  assert.ok(originInputOccurrences.length >= 3);
});
