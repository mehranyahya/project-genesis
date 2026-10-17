import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

async function runOfflineGenerator(fetchSource: string, image?: Buffer) {
  const root = await mkdtemp(join(tmpdir(), "genesis-content-traversal-"));
  try {
    await mkdir(join(root, "scripts"));
    await mkdir(join(root, "src/lib/content"), { recursive: true });
    for (const name of [
      "generate-structured-content.mjs",
      "structured-translations.mjs",
      "install-structured-build.mjs",
      "media-geometry.mjs",
      "bounded-response.mjs",
      "data-api-pagination.mjs",
      "site-links.mjs",
    ]) {
      await copyFile(
        new URL(`../../../scripts/${name}`, import.meta.url),
        join(root, "scripts", name),
      );
    }
    await symlink(
      fileURLToPath(new URL("../../../node_modules", import.meta.url)),
      join(root, "node_modules"),
      "dir",
    );
    await writeFile(
      join(root, "src/lib/content/generated-structured-content.ts"),
      "previous-synthetic-artifact\n",
    );
    if (image) await writeFile(join(root, "source.png"), image);
    await writeFile(join(root, "offline-fetch.mjs"), fetchSource);
    const result = spawnSync(
      "node",
      ["--import", "./offline-fetch.mjs", "scripts/generate-structured-content.mjs"],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 60_000,
        env: {
          PATH: process.env["PATH"] ?? "",
          BUILD_SUPABASE_URL: "https://fixtures.invalid",
          BUILD_SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-key",
        },
      },
    );
    assert.equal(result.error, undefined);
    return {
      ...result,
      artifact: await readFile(
        join(root, "src/lib/content/generated-structured-content.ts"),
        "utf8",
      ),
      audit: await readFile(join(root, "audit.json"), "utf8")
        .then((value) => JSON.parse(value))
        .catch(() => null),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("structured generator still runs directly with isolated offline build data", async () => {
  const root = await mkdtemp(join(tmpdir(), "genesis-structured-cli-"));
  try {
    await mkdir(join(root, "scripts"));
    await mkdir(join(root, "src/lib/content"), { recursive: true });
    for (const name of [
      "generate-structured-content.mjs",
      "structured-translations.mjs",
      "install-structured-build.mjs",
      "media-geometry.mjs",
      "bounded-response.mjs",
      "data-api-pagination.mjs",
      "site-links.mjs",
    ]) {
      await copyFile(
        new URL(`../../../scripts/${name}`, import.meta.url),
        join(root, "scripts", name),
      );
    }
    await symlink(
      fileURLToPath(new URL("../../../node_modules", import.meta.url)),
      join(root, "node_modules"),
      "dir",
    );
    await writeFile(
      join(root, "offline-fetch.mjs"),
      `import { writeFileSync } from "node:fs";
let calls = 0;
globalThis.fetch = async (input) => {
  const url = new URL(input);
  if (url.origin !== "https://fixtures.invalid" || !url.pathname.startsWith("/rest/v1/")) {
    throw new Error("Offline fixture rejected an unexpected request");
  }
  calls += 1;
  const result = url.pathname.endsWith("/compute_operational_catalog_version") ? "${"a".repeat(64)}" : [];
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json", "content-range": "*/0" } });
};
process.on("beforeExit", () => writeFileSync("calls.txt", String(calls)));
`,
    );
    const result = spawnSync(
      "node",
      ["--import", "./offline-fetch.mjs", "scripts/generate-structured-content.mjs"],
      {
        cwd: root,
        env: {
          PATH: process.env["PATH"] ?? "",
          BUILD_SUPABASE_URL: "https://fixtures.invalid",
          BUILD_SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-key",
        },
        encoding: "utf8",
        timeout: 15_000,
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(root, "calls.txt"), "utf8"), "6");
    const artifact = await readFile(
      join(root, "src/lib/content/generated-structured-content.ts"),
      "utf8",
    );
    assert.ok(artifact.includes("STRUCTURED_CONTENT_GENERATED = true"));
    assert.ok(artifact.includes("Object.freeze([] as Product[])"));
    assert.ok(artifact.includes("GENERATED_SITE: Site | null = null"));
    assert.ok(artifact.includes("a".repeat(64)));
    assert.equal(artifact.includes("synthetic-test-key"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Native AVIF encoding uses a subprocess bounded at 60s; the parent must allow
// it to finish and clean up instead of terminating the runner at its 5s default.
test(
  "the actual generator traverses every catalog table, short page and bounded parent batch",
  { timeout: 75_000 },
  async () => {
    const image = await sharp({
      create: { width: 1280, height: 1600, channels: 3, background: { r: 80, g: 80, b: 80 } },
    })
      .png()
      .toBuffer();
    const result = await runOfflineGenerator(
      `
import { readFileSync, writeFileSync } from "node:fs";
const total = 1005;
const tables = {
  products: [{ id: "p-1", code: "TEST-1", slug: "test-stone", product_type: "simple", title: "Source fixture",
    summary: null, description: null, is_active: true, is_featured: false, seo_title: null,
    sort_order: 0, updated_at: "2026-10-11T00:00:00Z" }],
  product_variants: Array.from({ length: total }, (_, i) => ({ id: "v-" + String(i).padStart(4, "0"), product_id: "p-1",
    stone_code: "stone-" + i, size_code: "120x60", price_type: "review", amount_toman: null,
    price_updated_at: null, includes: [], excludes: [], is_available: false, sort_order: i })),
  product_options: Array.from({ length: total }, (_, i) => ({ id: "o-" + String(i).padStart(4, "0"), variant_id: "v-1004",
    title: "Option fixture", price_type: "review", amount_toman: null, price_updated_at: null,
    is_available: false, compatible_size_codes: [], sort_order: i })),
  product_media: [{ product_id: "p-1", media_key: "products/p-1/source.png", alt: "Source fixture", privacy_cleared: true,
    consent_reference: "synthetic-private-consent", sort_order: 0 }],
  portfolio_items: [{ public_reference_id: "pf-1001", summary: null, stone_code: null, size_code: null, sort_order: 0 }],
  portfolio_media: [{ public_reference_id: "pf-1001", media_key: "portfolio/pf-1001/source.png", alt: "Work fixture",
    privacy_cleared: true, consent_reference: "synthetic-private-consent", sort_order: 0 }],
  building_stone_items: Array.from({ length: total }, (_, i) => ({ id: "b-" + String(i).padStart(4, "0") })),
  building_stone_media: Array.from({ length: total }, (_, i) => ({ item_id: "b-" + String(i).padStart(4, "0"),
    media_key: "building-stone/b-" + i + "/source.png", privacy_cleared: false, sort_order: 0 })),
  site_settings: [{ id: "primary", display_name: "Site fixture", latin_name: "Site fixture", phone: null, whatsapp_url: null,
    telegram: null, address: null, working_hours: null, instagram_url: null, website_url: null, map_url: null }],
};
const counted = {};
let versions = 0;
let maxBatch = 0;
const filterColumns = { product_variants: "product_id", product_media: "product_id", product_options: "variant_id",
  portfolio_media: "public_reference_id", building_stone_media: "item_id" };
globalThis.fetch = async (input, init) => {
  const url = new URL(input);
  if (url.origin !== "https://fixtures.invalid") throw new Error("Offline fixture only");
  if (url.pathname.startsWith("/storage/v1/object/authenticated/catalog-media/")) {
    return new Response(readFileSync("source.png"), { headers: { "content-type": "image/png" } });
  }
  if (url.pathname.endsWith("compute_operational_catalog_version")) {
    versions++;
    if (init.method !== "POST" || init.body !== "{}") throw new Error("Invalid version request");
    return new Response(JSON.stringify("${"a".repeat(64)}"));
  }
  const table = url.pathname.split("/").at(-1);
  if (!Object.hasOwn(tables, table)) throw new Error("Unexpected table");
  const headers = new Headers(init.headers);
  if (headers.get("prefer") !== "count=exact" || headers.get("range-unit") !== "items") throw new Error("Missing pagination");
  if (!url.searchParams.get("order")) throw new Error("Missing deterministic order");
  let rows = tables[table];
  const column = filterColumns[table];
  if (column) {
    const filter = url.searchParams.get(column);
    if (!filter?.startsWith("in.(") || !filter.endsWith(")")) throw new Error("Invalid parent filter");
    const ids = filter.slice(4, -1).split(",");
    maxBatch = Math.max(maxBatch, ids.length);
    if (ids.length > 25) throw new Error("Unbounded URL filter");
    rows = rows.filter((row) => ids.includes(row[column]));
  }
  const [first, end] = headers.get("range").split("-").map(Number);
  const selected = rows.slice(first, Math.min(end + 1, first + 73));
  counted[table] = (counted[table] ?? 0) + selected.length;
  return new Response(JSON.stringify(selected), { status: rows.length > selected.length ? 206 : 200,
    headers: { "content-range": rows.length ? first + "-" + (first + selected.length - 1) + "/" + rows.length : "*/0" } });
};
process.on("beforeExit", () => writeFileSync("audit.json", JSON.stringify({ counted, versions, maxBatch })));
`,
      image,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.audit.counted, {
      products: 1,
      product_variants: 1005,
      product_media: 1,
      product_options: 1005,
      portfolio_items: 1,
      portfolio_media: 1,
      building_stone_items: 1005,
      building_stone_media: 1005,
      site_settings: 1,
    });
    assert.equal(result.audit.versions, 2);
    assert.equal(result.audit.maxBatch, 25);
    const productsMatch =
      /GENERATED_PRODUCTS:[\s\S]*?Object\.freeze\(([\s\S]*?) as Product\[\]\)/.exec(
        result.artifact,
      );
    assert.ok(productsMatch);
    const products = JSON.parse(productsMatch[1]!);
    assert.equal(products.length, 1);
    assert.equal(products[0].locale, "fa");
    assert.equal(products[0].variants.length, 1005);
    assert.equal(products[0].variants[1004].options.length, 1005);
    assert.equal(products[0].variants[1004].options[1004].id, "o-1004");
    assert.equal(products[0].variants[1004].amountToman, null);
    assert.equal(products[0].variants[1004].isAvailable, false);
    assert.equal(products[0].media.length, 1);
    for (const value of [
      "synthetic-test-key",
      "synthetic-private-consent",
      "media_key",
      "privacy_cleared",
      "https://fixtures.invalid",
      "products/p-1/source.png",
      "portfolio/pf-1001/source.png",
    ]) {
      assert.equal(result.artifact.includes(value), false);
    }
  },
);

test("an operational version change fails the CLI and preserves the previous artifact", async () => {
  const result = await runOfflineGenerator(`
let versions = 0;
globalThis.fetch = async (input) => new Response(JSON.stringify(new URL(input).pathname.endsWith("compute_operational_catalog_version")
  ? (++versions === 1 ? "${"a".repeat(64)}" : "${"b".repeat(64)}") : []), { headers: { "content-range": "*/0" } });
`);
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes("Operational catalog changed during content generation"));
  assert.equal(result.artifact, "previous-synthetic-artifact\n");
});

test("a clipped or uncounted root response fails generation rather than overwriting the artifact", async () => {
  const result = await runOfflineGenerator(`
globalThis.fetch = async (input) => new Response(JSON.stringify(new URL(input).pathname.endsWith("compute_operational_catalog_version")
  ? "${"a".repeat(64)}" : []));
`);
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes("Build table requires an exact Content-Range"));
  assert.equal(result.artifact, "previous-synthetic-artifact\n");
});

test("invalid parent relationships and duplicate related IDs across batches stop the actual generator", async () => {
  for (const scenario of ["wrong-parent", "duplicate-option", "invalid-parent"]) {
    const result = await runOfflineGenerator(`
const scenario = ${JSON.stringify(scenario)};
globalThis.fetch = async (input) => {
  const url = new URL(input);
  const table = url.pathname.split("/").at(-1);
  if (table === "compute_operational_catalog_version") return new Response(JSON.stringify("${"a".repeat(64)}"));
  let rows = [];
  if (table === "products") rows = [{ id: scenario === "invalid-parent" ? "synthetic-private-id,unsafe" : "p-1" }];
  if (table === "product_variants") rows = scenario === "wrong-parent" ? [{ id: "v-1", product_id: "synthetic-private-parent" }] :
    Array.from({ length: 26 }, (_, i) => ({ id: "v-" + i, product_id: "p-1" }));
  if (table === "product_options") {
    const ids = url.searchParams.get("variant_id").slice(4, -1).split(",");
    rows = [{ id: "same-option", variant_id: ids[0] }];
  }
  return new Response(JSON.stringify(rows), { headers: { "content-range": rows.length ? "0-" + (rows.length - 1) + "/" + rows.length : "*/0" } });
};
`);
    assert.notEqual(result.status, 0);
    assert.equal(result.artifact, "previous-synthetic-artifact\n");
    const expected =
      scenario === "wrong-parent"
        ? "unexpected parent relationship"
        : scenario === "duplicate-option"
          ? "repeats a related row across batches"
          : "invalid parent identifiers";
    assert.ok(result.stderr.includes(expected), result.stderr);
    assert.equal((result.stderr + result.stdout).includes("synthetic-private-parent"), false);
    assert.equal((result.stderr + result.stdout).includes("synthetic-private-id,unsafe"), false);
  }
});

test("offline CLI rejects an unsafe operational link without printing its private value", async () => {
  const root = await mkdtemp(join(tmpdir(), "genesis-invalid-site-cli-"));
  try {
    await mkdir(join(root, "scripts"));
    await mkdir(join(root, "src/lib/content"), { recursive: true });
    for (const name of [
      "generate-structured-content.mjs",
      "structured-translations.mjs",
      "install-structured-build.mjs",
      "media-geometry.mjs",
      "bounded-response.mjs",
      "data-api-pagination.mjs",
      "site-links.mjs",
    ]) {
      await copyFile(
        new URL(`../../../scripts/${name}`, import.meta.url),
        join(root, "scripts", name),
      );
    }
    await symlink(
      fileURLToPath(new URL("../../../node_modules", import.meta.url)),
      join(root, "node_modules"),
      "dir",
    );
    await writeFile(
      join(root, "offline-fetch.mjs"),
      `
      globalThis.fetch = async (input) => {
        const url = new URL(input);
        if (url.origin !== "https://fixtures.invalid") throw new Error("Unexpected offline URL");
        const value = url.pathname.endsWith("compute_operational_catalog_version") ? "${"a".repeat(64)}" :
          url.pathname.endsWith("site_settings") ? [{ id: "primary", display_name: "Fixture", latin_name: "Fixture", telegram: "javascript:synthetic-private-value" }] : [];
        return new Response(JSON.stringify(value), { headers: { "content-range": Array.isArray(value) && value.length ? "0-0/1" : "*/0" } });
      };
    `,
    );
    const result = spawnSync(
      "node",
      ["--import", "./offline-fetch.mjs", "scripts/generate-structured-content.mjs"],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 15000,
        env: {
          PATH: process.env["PATH"] ?? "",
          BUILD_SUPABASE_URL: "https://fixtures.invalid",
          BUILD_SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-key",
        },
      },
    );
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes("Site link must use a public, credential-free HTTPS host"));
    assert.equal((result.stdout + result.stderr).includes("synthetic-private-value"), false);
    assert.equal((result.stdout + result.stderr).includes("synthetic-test-key"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
