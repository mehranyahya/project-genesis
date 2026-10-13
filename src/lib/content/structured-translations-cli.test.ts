import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import sharp from "sharp";

test(
  "the actual CLI authors a draft, publishes reviewed English and preserves the previous build on stale or incomplete translation",
  { timeout: 45_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "genesis-translated-cli-"));
    try {
      for (const dir of ["scripts", "src/lib/content", "content/translations", "public/media"])
        await mkdir(join(root, dir), { recursive: true });
      for (const name of [
        "generate-structured-content.mjs",
        "structured-translations.mjs",
        "install-structured-build.mjs",
        "media-geometry.mjs",
        "bounded-response.mjs",
        "data-api-pagination.mjs",
        "site-links.mjs",
      ])
        await copyFile(
          new URL(`../../../scripts/${name}`, import.meta.url),
          join(root, "scripts", name),
        );
      await symlink(
        fileURLToPath(new URL("../../../node_modules", import.meta.url)),
        join(root, "node_modules"),
        "dir",
      );
      const artifactPath = join(root, "src/lib/content/generated-structured-content.ts");
      await writeFile(artifactPath, "previous-synthetic-artifact\n");
      await writeFile(join(root, "public/media/old.webp"), "previous-synthetic-media");
      await writeFile(
        join(root, "source.png"),
        await sharp({
          create: { width: 1280, height: 1600, channels: 3, background: { r: 80, g: 80, b: 80 } },
        })
          .png()
          .toBuffer(),
      );
      await writeFile(
        join(root, "offline-fetch.mjs"),
        `
import { readFileSync, existsSync } from "node:fs";
globalThis.fetch = async (input) => {
  const url = new URL(input);
  if (url.origin !== "https://fixtures.invalid") throw new Error("Unexpected offline host");
  if (url.pathname.includes("/storage/")) return new Response(readFileSync("source.png"), { headers: { "content-type": "image/png" } });
  const table = url.pathname.split("/").at(-1);
  if (table === "compute_operational_catalog_version") return new Response(JSON.stringify("${"c".repeat(64)}"));
  const tables = {
    products: [{ id: "p-1", code: "TEST-1", slug: "test-stone", product_type: "simple", title: "سنگ آزمون", summary: null,
      description: existsSync("changed-prose.txt") ? "متن تازه" : "شرح آزمون", is_active: true, is_featured: false, seo_title: null, updated_at: "2026-10-13T00:00:00Z", sort_order: 0 }],
    product_variants: [{ id: "v-1", product_id: "p-1", stone_code: "granite", size_code: "120x60", price_type: "estimate", amount_toman: 12000,
      price_updated_at: "2026-10-13T00:00:00Z", includes: ["شامل آزمون"], excludes: ["خارج آزمون"], is_available: true, sort_order: 0 }],
    product_options: [{ id: "o-1", variant_id: "v-1", title: "گزینه آزمون", price_type: "fixed", amount_toman: 3000,
      price_updated_at: "2026-10-13T00:00:00Z", is_available: false, compatible_size_codes: ["120x60"], sort_order: 0 }],
    product_media: [{ product_id: "p-1", media_key: "products/p-1/source.png", alt: "عکس آزمون", privacy_cleared: true, consent_reference: "synthetic-private-consent", sort_order: 0 }],
    portfolio_items: [], building_stone_items: [],
    site_settings: [{ id: "primary", display_name: "برند آزمون", latin_name: "Test brand", phone: "+989120000000", whatsapp_url: null, telegram: null,
      address: "نشانی آزمون", working_hours: "ساعت آزمون", instagram_url: null, website_url: null, map_url: null }],
  };
  if (!Object.hasOwn(tables, table)) throw new Error("Unexpected offline table");
  const rows = tables[table];
  return new Response(JSON.stringify(rows), { headers: { "content-range": rows.length ? "0-" + (rows.length - 1) + "/" + rows.length : "*/0" } });
};
`,
      );
      const run = (...args: string[]) => {
        const result = spawnSync(
          "node",
          ["--import", "./offline-fetch.mjs", "scripts/generate-structured-content.mjs", ...args],
          {
            cwd: root,
            encoding: "utf8",
            timeout: 45_000,
            env: {
              PATH: process.env["PATH"] ?? "",
              BUILD_SUPABASE_URL: "https://fixtures.invalid",
              BUILD_SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-key",
            },
          },
        );
        assert.equal(result.error, undefined);
        return result;
      };
      const draftPath = join(root, "draft-en.json");
      const authored = run("--translation-source", draftPath);
      assert.equal(authored.status, 0, authored.stderr);
      assert.equal(await readFile(artifactPath, "utf8"), "previous-synthetic-artifact\n");
      assert.equal(
        await readFile(join(root, "public/media/old.webp"), "utf8"),
        "previous-synthetic-media",
      );
      const draft = JSON.parse(await readFile(draftPath, "utf8"));
      assert.equal(draft.status, "draft");
      assert.equal(draft.reviewed, false);
      assert.equal(JSON.stringify(draft).includes("synthetic-private-consent"), false);
      draft.status = "published";
      draft.reviewed = true;
      draft.revision = "test-editorial-v1";
      const translated = draft.products["p-1"];
      translated.title = "Test stone";
      translated.summary = null;
      translated.description = "Test description";
      for (const id of Object.keys(translated.media)) translated.media[id] = "Test stone photo";
      translated.variants["v-1"].includes = ["Test included item"];
      translated.variants["v-1"].excludes = ["Test excluded item"];
      translated.variants["v-1"].options["o-1"].title = "Test option";
      draft.site.displayName = "Test brand";
      draft.site.address = "Test address";
      draft.site.workingHours = "Test hours";
      const translationFile = join(root, "content/translations/en.json");
      await writeFile(translationFile, JSON.stringify(draft));
      const generated = run();
      assert.equal(generated.status, 0, generated.stderr);
      const artifact = await readFile(artifactPath, "utf8");
      const match = /GENERATED_PRODUCTS:[\s\S]*?Object\.freeze\(([\s\S]*?) as Product\[\]\)/.exec(
        artifact,
      );
      assert.ok(match);
      const products = JSON.parse(match[1]!);
      assert.equal(products.length, 2);
      assert.equal(products[1].locale, "en");
      assert.equal(products[1].id, products[0].id);
      assert.equal(products[1].variants[0].amountToman, products[0].variants[0].amountToman);
      assert.equal(products[1].variants[0].options[0].isAvailable, false);
      assert.equal(products[1].media[0].src, products[0].media[0].src);
      assert.equal(/[\u0600-\u06ff]/.test(JSON.stringify(products[1])), false);
      for (const value of [
        "synthetic-test-key",
        "synthetic-private-consent",
        "media_key",
        "privacy_cleared",
        "products/p-1/source.png",
        "sourceHash",
        "reviewed",
      ])
        assert.equal(artifact.includes(value), false);
      const files = (await readdir(join(root, "public/media"), { recursive: true })).sort();
      assert.equal(files.includes("old.webp"), false);
      await writeFile(join(root, "changed-prose.txt"), "synthetic-change");
      const stale = run();
      assert.notEqual(stale.status, 0);
      assert.ok(stale.stderr.includes("Invalid or stale reviewed structured translation"));
      assert.equal(await readFile(artifactPath, "utf8"), artifact);
      assert.deepEqual(
        (await readdir(join(root, "public/media"), { recursive: true })).sort(),
        files,
      );
      await rm(join(root, "changed-prose.txt"));
      translated.variants["v-1"].options = {};
      await writeFile(translationFile, JSON.stringify(draft));
      assert.notEqual(run().status, 0);
      assert.equal(await readFile(artifactPath, "utf8"), artifact);
      assert.deepEqual(
        (await readdir(join(root, "public/media"), { recursive: true })).sort(),
        files,
      );
      assert.equal(
        (await readdir(root)).some((name) => name.startsWith(".structured-build-")),
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
