import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PAGES = "src/lib/content/generated-pages.ts",
  REGISTRY = "supabase/functions/_shared/terms-registry.generated.ts";
function page(locale: "fa" | "en", slug = "terms", version = "test-v1", status = "published") {
  return [
    "---",
    `slug: "${slug}"`,
    `locale: "${locale}"`,
    `status: "${status}"`,
    `reviewed: ${status === "published"}`,
    'title: "Test page"',
    `version: "${version}"`,
    "---",
    status === "draft" ? "synthetic-private-draft" : "Synthetic public test text.",
  ].join("\n");
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "genesis-git-pages-cli-"));
  for (const directory of [
    "scripts",
    "content/pages/fa",
    "content/pages/en",
    "src/lib/content",
    "supabase/functions/_shared",
  ])
    await mkdir(join(root, directory), { recursive: true });
  for (const file of [
    "generate-content-pages.mjs",
    "git-pages.mjs",
    "git-guides.mjs",
    "guide-links.mjs",
    "guide-policy.mjs",
  ])
    await copyFile(
      new URL(`../../../scripts/${file}`, import.meta.url),
      join(root, "scripts", file),
    );
  await symlink(
    fileURLToPath(new URL("../../../node_modules", import.meta.url)),
    join(root, "node_modules"),
    "dir",
  );
  await writeFile(join(root, PAGES), "previous-test-pages\n");
  await writeFile(join(root, REGISTRY), "previous-test-registry\n");
  await writeFile(
    join(root, "src/lib/content/generated-structured-content.ts"),
    "export const STRUCTURED_CONTENT_GENERATED = false;\n",
  );
  return root;
}
function run(root: string, ...args: string[]) {
  const result = spawnSync("node", ["scripts/generate-content-pages.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 15_000,
    env: { PATH: process.env["PATH"] ?? "" },
  });
  assert.equal(result.error, undefined);
  return result;
}

test("the real CLI generates deterministic bilingual DTOs and never publishes draft frontmatter", async () => {
  const root = await fixture();
  try {
    for (const locale of ["fa", "en"] as const)
      await writeFile(join(root, `content/pages/${locale}/terms.md`), page(locale));
    await writeFile(join(root, "content/pages/en/about.md"), page("en", "about", "", "draft"));
    assert.equal(run(root).status, 0);
    const output = await readFile(join(root, PAGES), "utf8"),
      registry = await readFile(join(root, REGISTRY), "utf8");
    for (const value of ["synthetic-private-draft", '"reviewed"', '"status"', '"about"'])
      assert.equal(output.includes(value), false);
    assert.ok(output.includes('locale: "en"'));
    assert.ok(output.includes('locale: "fa"'));
    assert.ok(registry.includes("CURRENT_TERMS_RELEASES"));
    assert.equal(run(root, "--check").status, 0);
    assert.equal(run(root).status, 0);
    assert.equal(await readFile(join(root, PAGES), "utf8"), output);
    assert.equal(await readFile(join(root, REGISTRY), "utf8"), registry);
    await writeFile(join(root, "content/pages/en/terms.md"), page("en") + " changed");
    const stale = run(root, "--check");
    assert.notEqual(stale.status, 0);
    assert.ok(stale.stderr.includes("Generated Git page artifact is stale"));
    assert.equal(await readFile(join(root, PAGES), "utf8"), output);
    assert.equal(await readFile(join(root, REGISTRY), "utf8"), registry);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release checks stay blocked until both legal translations and structured content exist", async () => {
  const root = await fixture();
  try {
    for (const locale of ["fa", "en"] as const)
      for (const slug of ["privacy", "terms"])
        await writeFile(join(root, `content/pages/${locale}/${slug}.md`), page(locale, slug));
    assert.equal(run(root).status, 0);
    const before = await readFile(join(root, PAGES), "utf8");
    assert.notEqual(run(root, "--release-check").status, 0);
    assert.equal(await readFile(join(root, PAGES), "utf8"), before);
    await writeFile(
      join(root, "src/lib/content/generated-structured-content.ts"),
      "export const STRUCTURED_CONTENT_GENERATED = true;\n",
    );
    assert.equal(run(root, "--release-check").status, 0);
    await rm(join(root, "content/pages/en/privacy.md"));
    assert.equal(run(root).status, 0);
    assert.ok(run(root, "--release-check").stderr.includes("en.privacy"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a stale Edge Terms registry fails a non-mutating content check", async () => {
  const root = await fixture();
  try {
    assert.equal(run(root).status, 0);
    const before = await readFile(join(root, PAGES), "utf8");
    await writeFile(join(root, REGISTRY), "synthetic-stale-registry\n");
    const result = run(root, "--check");
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes("Generated Terms registry is stale"));
    assert.equal(await readFile(join(root, PAGES), "utf8"), before);
    assert.equal(await readFile(join(root, REGISTRY), "utf8"), "synthetic-stale-registry\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mismatched legal versions stop the actual CLI before either artifact is overwritten", async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, "content/pages/fa/terms.md"), page("fa"));
    await writeFile(join(root, "content/pages/en/terms.md"), page("en", "terms", "test-v2"));
    assert.ok(run(root).stderr.includes("share one version"));
    assert.equal(await readFile(join(root, PAGES), "utf8"), "previous-test-pages\n");
    assert.equal(await readFile(join(root, REGISTRY), "utf8"), "previous-test-registry\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the actual CLI rejects linked, oversized, malformed and unallowlisted sources safely", async () => {
  for (const scenario of [
    "symlink",
    "hardlink",
    "directory",
    "flat",
    "unknown",
    "oversized",
    "utf8",
  ] as const) {
    const root = await fixture();
    try {
      const target = join(root, "content/pages/fa/terms.md");
      if (scenario === "symlink" || scenario === "hardlink") {
        const external = join(root, "synthetic-private-input.md");
        await writeFile(external, page("fa"));
        if (scenario === "symlink") await symlink(external, target);
        else await link(external, target);
      } else if (scenario === "directory") await mkdir(target);
      else if (scenario === "flat")
        await writeFile(join(root, "content/pages/terms.md"), page("fa"));
      else if (scenario === "unknown")
        await writeFile(join(root, "content/pages/fa/unknown.md"), "synthetic-private-body");
      else if (scenario === "oversized") await writeFile(target, "x".repeat(256 * 1024 + 1));
      else await writeFile(target, Buffer.from([0xff, 0xfe]));
      const result = run(root);
      assert.notEqual(result.status, 0, scenario);
      assert.equal(await readFile(join(root, PAGES), "utf8"), "previous-test-pages\n");
      assert.equal(await readFile(join(root, REGISTRY), "utf8"), "previous-test-registry\n");
      assert.equal((result.stdout + result.stderr).includes("synthetic-private-body"), false);
      assert.equal((result.stdout + result.stderr).includes("Synthetic public test text."), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("the real CLI compiles service text and preserves identical category IDs across languages", async () => {
  const root = await fixture();
  try {
    for (const locale of ["fa", "en"] as const) {
      await writeFile(
        join(root, `content/pages/${locale}/building-stone.md`),
        page(locale, "building-stone"),
      );
      await writeFile(
        join(root, `content/pages/${locale}/stoneworks.md`),
        page(locale, "stoneworks").replace(
          'version: "test-v1"',
          'stoneworkCategories: ["water_landscape", "sculpture_art"]',
        ),
      );
    }
    assert.equal(run(root).status, 0);
    const before = await readFile(join(root, PAGES), "utf8");
    assert.ok(before.includes('slug: "building-stone"'));
    assert.ok(before.includes('slug: "stoneworks"'));
    assert.ok(before.includes('stoneworkCategories: ["water_landscape", "sculpture_art"]'));
    assert.equal(run(root, "--check").status, 0);
    const registry = await readFile(join(root, REGISTRY), "utf8");
    await writeFile(
      join(root, "content/pages/en/stoneworks.md"),
      page("en", "stoneworks").replace(
        'version: "test-v1"',
        'stoneworkCategories: ["sculpture_art", "water_landscape"]',
      ),
    );
    assert.ok(run(root).stderr.includes("share category IDs and order"));
    assert.equal(await readFile(join(root, PAGES), "utf8"), before);
    assert.equal(await readFile(join(root, REGISTRY), "utf8"), registry);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
