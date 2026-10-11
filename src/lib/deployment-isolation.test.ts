import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  assertDeploymentDataSources,
  cleanOrigin,
  getDeploymentIsolation,
} from "../../scripts/deployment-isolation.mjs";

function fixture(target = "preview"): Record<string, string> {
  const env: Record<string, string> = {
    DEPLOY_TARGET: target,
    PREVIEW_WORKER_NAME: "genesis-preview",
    PRODUCTION_WORKER_NAME: "genesis-production",
    PREVIEW_SUPABASE_PROJECT_REF: "p".repeat(20),
    PRODUCTION_SUPABASE_PROJECT_REF: "s".repeat(20),
    PREVIEW_SITE_URL: "https://preview.example.com",
    PREVIEW_ALLOWED_ORIGINS: "https://preview.example.com,https://extra-preview.example.com",
    PRODUCTION_SITE_URL: "https://www.example.com",
    PRODUCTION_ALLOWED_ORIGINS: "https://www.example.com",
    EDGE_GATEWAY_KEYS_JSON: JSON.stringify({ v1: "p".repeat(40) }),
    OTHER_EDGE_GATEWAY_KEYS_JSON: JSON.stringify({ v1: "s".repeat(40) }),
    IP_HASH_SECRET: "p".repeat(40),
    OTHER_IP_HASH_SECRET: "s".repeat(40),
    BUILD_SUPABASE_SERVICE_ROLE_KEY: "synthetic-preview-build-only",
    OTHER_BUILD_SUPABASE_SERVICE_ROLE_KEY: "synthetic-production-build-only",
    VITE_TURNSTILE_SITE_KEY: "synthetic-preview-site-key",
    OTHER_VITE_TURNSTILE_SITE_KEY: "synthetic-production-site-key",
  };
  const prefix = target.toUpperCase();
  env["SITE_URL"] = env[`${prefix}_SITE_URL`]!;
  env["ALLOWED_ORIGINS"] = env[`${prefix}_ALLOWED_ORIGINS`]!;
  env["BUILD_SUPABASE_URL"] = `https://${env[`${prefix}_SUPABASE_PROJECT_REF`]}.supabase.co`;
  env["SUPABASE_FUNCTION_BASE_URL"] = `${env["BUILD_SUPABASE_URL"]}/functions/v1`;
  return env;
}

test("each target resolves a distinct Worker, project, flood namespace and schedule", () => {
  const preview = getDeploymentIsolation(fixture());
  const production = getDeploymentIsolation(fixture("production"));
  assert.equal(preview.worker, "genesis-preview");
  assert.notEqual(preview.projectRef, production.projectRef);
  assert.notEqual(preview.floodNamespace, production.floodNamespace);
  assert.deepEqual(preview.crons, []);
  assert.deepEqual(production.crons, ["0 * * * *"]);
  for (const target of ["preview", "production"]) {
    const env = fixture(target);
    assertDeploymentDataSources(env, getDeploymentIsolation(env));
  }
});

test("isolation rejects shared identity, origins, wrong selection and missing settings", () => {
  const patches: Record<string, string>[] = [
    { PRODUCTION_WORKER_NAME: "genesis-preview" },
    { PRODUCTION_SUPABASE_PROJECT_REF: "p".repeat(20) },
    { PRODUCTION_ALLOWED_ORIGINS: "https://www.example.com,https://preview.example.com" },
    { SITE_URL: "https://www.example.com" },
    { ALLOWED_ORIGINS: "https://www.example.com" },
    { PREVIEW_WORKER_NAME: "" },
    { PREVIEW_WORKER_NAME: "x".repeat(56) },
    { PREVIEW_SUPABASE_PROJECT_REF: "not-a-standard-reference" },
    { DEPLOY_TARGET: "staging" },
    { PREVIEW_ALLOWED_ORIGINS: "https://preview.example.com,https://preview.example.com/" },
  ];
  for (const patch of patches)
    assert.throws(() => getDeploymentIsolation({ ...fixture(), ...patch }));
});

test("origins reject credentials, paths, port, controls, local hosts, IPs and empty entries", () => {
  for (const value of [
    "http://example.com",
    "https://example.com/path",
    "https://example.com?private=yes",
    "https://example.com#private",
    "https://localhost",
    "https://example.local",
    "https://127.0.0.1",
    "https://example.com:8443",
    "https://example.com\\path",
    "https://example.com\n",
    "https://synthetic-user@example.com",
    "",
  ])
    assert.throws(() => cleanOrigin(value, "SITE_URL"));
  assert.throws(() =>
    getDeploymentIsolation({
      ...fixture(),
      PREVIEW_ALLOWED_ORIGINS: "https://preview.example.com,",
    }),
  );
});

test("build and Edge sources must both match the selected project exactly", () => {
  for (const key of ["BUILD_SUPABASE_URL", "SUPABASE_FUNCTION_BASE_URL"]) {
    for (const value of [
      "https://wrong.supabase.co",
      "https://example.com?synthetic-private-marker",
    ]) {
      const env = { ...fixture(), [key]: value };
      assert.throws(
        () => assertDeploymentDataSources(env, getDeploymentIsolation(env)),
        (error: unknown) =>
          error instanceof Error && !error.message.includes("synthetic-private-marker"),
      );
    }
  }
});

test("all gateway rotation keys and other sensitive material must be independent", () => {
  const env = fixture();
  for (const key of [
    "IP_HASH_SECRET",
    "BUILD_SUPABASE_SERVICE_ROLE_KEY",
    "VITE_TURNSTILE_SITE_KEY",
  ]) {
    assert.throws(() =>
      assertDeploymentDataSources(
        { ...env, [`OTHER_${key}`]: env[key] },
        getDeploymentIsolation(env),
      ),
    );
  }
  const overlapping = {
    ...env,
    OTHER_EDGE_GATEWAY_KEYS_JSON: JSON.stringify({ old: "p".repeat(40), new: "s".repeat(40) }),
  };
  assert.throws(() =>
    assertDeploymentDataSources(overlapping, getDeploymentIsolation(overlapping)),
  );
  for (const raw of ["{}", "[]", "not-json", '{ "v1": "synthetic" }']) {
    assert.throws(() =>
      assertDeploymentDataSources(
        { ...env, OTHER_EDGE_GATEWAY_KEYS_JSON: raw },
        getDeploymentIsolation(env),
      ),
    );
  }
});

test("isolated credential comparison never writes the opposite environment to the Worker artifact", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "genesis-isolation-"));
  try {
    mkdirSync(path.join(dir, "scripts"));
    mkdirSync(path.join(dir, ".output/server"), { recursive: true });
    mkdirSync(path.join(dir, ".output/public"), { recursive: true });
    mkdirSync(path.join(dir, ".wrangler/deploy"), { recursive: true });
    mkdirSync(path.join(dir, "public"));
    for (const name of [
      "deployment-isolation.mjs",
      "prepare-cloudflare-deploy.mjs",
      "verify-cloudflare-deploy.mjs",
    ]) {
      cpSync(new URL(`../../scripts/${name}`, import.meta.url), path.join(dir, "scripts", name));
    }
    const headers = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");
    writeFileSync(path.join(dir, "public/_headers"), headers);
    writeFileSync(
      path.join(dir, ".output/public/_headers"),
      `${headers.trimEnd()}\n\n/assets/*\n  cache-control: public, max-age=31536000, immutable\n`,
    );
    writeFileSync(
      path.join(dir, ".wrangler/deploy/config.json"),
      JSON.stringify({ configPath: path.join(dir, ".output/server/wrangler.json") }),
    );
    const configPath = path.join(dir, ".output/server/wrangler.json");
    for (const target of ["preview", "production"]) {
      writeFileSync(
        configPath,
        JSON.stringify({
          name: "unsafe-inherited-name",
          main: "index.mjs",
          compatibility_date: "2026-10-05",
          assets: { directory: "../public" },
          route: "www.example.com/*",
          env: { production: {} },
          vars: { UNREVIEWED: "synthetic-private-marker" },
        }),
      );
      const env = { PATH: process.env["PATH"], ...fixture(target) };
      const run = (script: string) =>
        spawnSync(process.execPath, [path.join(dir, "scripts", script)], { encoding: "utf8", env });
      assert.equal(run("prepare-cloudflare-deploy.mjs").status, 0);
      const verified = run("verify-cloudflare-deploy.mjs");
      assert.equal(verified.status, 0, verified.stderr);
      const output = readFileSync(configPath, "utf8");
      const parsed = JSON.parse(output);
      assert.equal(parsed.name, `genesis-${target}`);
      assert.equal(parsed.keep_vars, false);
      assert.doesNotMatch(output, /synthetic-private-marker|OTHER_|SERVICE_ROLE_KEY/);
      if (target === "preview") {
        assert.deepEqual(parsed.triggers.crons, []);
        assert.deepEqual(parsed.routes, []);
        assert.equal(parsed.route, undefined);
        assert.equal(parsed.env, undefined);
        assert.equal(parsed.workers_dev, false);
        assert.equal(parsed.preview_urls, true);
      }
      for (const mutate of [
        (value: typeof parsed) => {
          value.name = "genesis-wrong";
        },
        (value: typeof parsed) => {
          value.ratelimits[0].namespace_id = "wrong";
        },
        (value: typeof parsed) => {
          value.keep_vars = true;
        },
        (value: typeof parsed) => {
          value.vars["UNREVIEWED"] = "wrong";
        },
      ]) {
        const changed = structuredClone(parsed);
        mutate(changed);
        writeFileSync(configPath, JSON.stringify(changed));
        assert.notEqual(run("verify-cloudflare-deploy.mjs").status, 0);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI rejects bad private configuration with a fixed message and no input values", () => {
  const marker = "synthetic-private-marker";
  const result = spawnSync(
    process.execPath,
    [new URL("../../scripts/check-deployment-isolation.mjs", import.meta.url).pathname],
    {
      encoding: "utf8",
      env: { PATH: process.env["PATH"], ...fixture(), OTHER_EDGE_GATEWAY_KEYS_JSON: marker },
    },
  );
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, new RegExp(marker));
  assert.doesNotMatch(result.stderr, /at .*\(/);
});

test("deployment and audit verify isolation before content fetch and target only the Preview Edge project", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/deploy-cloudflare-reusable.yml", import.meta.url),
    "utf8",
  );
  assert.ok(
    workflow.indexOf("node scripts/check-deployment-isolation.mjs") <
      workflow.indexOf("bun run structured:generate"),
  );
  const audit = readFileSync(
    new URL("../../.github/workflows/audit-preview-config.yml", import.meta.url),
    "utf8",
  );
  assert.match(audit, /SUPABASE_PROJECT_REF: \$\{\{ vars\.PREVIEW_SUPABASE_PROJECT_REF \}\}/);
  assert.doesNotMatch(audit, /SUPABASE_PROJECT_REF: \$\{\{ secrets\.SUPABASE_PROJECT_REF/);
  assert.match(audit, /node scripts\/check-deployment-isolation\.mjs/);
});
