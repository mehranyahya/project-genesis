import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const OUTPUTS = [
  "src/lib/content/generated-pages.ts",
  "supabase/functions/_shared/terms-registry.generated.ts",
  "src/lib/content/generated-guides.ts",
];
function article(
  locale: "fa" | "en",
  overrides: Record<string, unknown> = {},
  body = "Synthetic reviewed article body.",
) {
  const meta = {
    slug: "stone-care",
    locale,
    title: locale === "fa" ? "عنوان آزمون" : "Test title",
    summary: locale === "fa" ? "خلاصه آزمون" : "Test summary",
    status: "published",
    reviewed: true,
    version: "test-v1",
    updatedAt: "2026-10-13",
    ...overrides,
  };
  return [
    "---",
    ...Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    "---",
    body,
  ].join("\n");
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "genesis-git-guides-cli-"));
  for (const directory of [
    "scripts",
    "content/pages/fa",
    "content/pages/en",
    "content/guides/fa",
    "content/guides/en",
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
  for (const output of OUTPUTS) await writeFile(join(root, output), "previous-public-artifact\n");
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
async function artifacts(root: string) {
  return Promise.all(OUTPUTS.map((output) => readFile(join(root, output), "utf8")));
}

test("actual guide CLI publishes reviewed bilingual articles deterministically and strips draft/review/revision fields", async () => {
  const root = await fixture();
  try {
    for (const locale of ["fa", "en"] as const)
      await writeFile(join(root, `content/guides/${locale}/stone-care.md`), article(locale));
    await writeFile(
      join(root, "content/guides/en/unfinished.md"),
      article(
        "en",
        { slug: "unfinished", status: "draft", reviewed: false },
        "synthetic-private-draft",
      ),
    );
    assert.equal(run(root).status, 0);
    const before = await artifacts(root),
      guides = before[2]!;
    assert.ok(guides.includes('locale: "fa"') && guides.includes('locale: "en"'));
    assert.ok(guides.includes("Synthetic reviewed article body."));
    for (const value of [
      "unfinished",
      "synthetic-private-draft",
      "test-v1",
      "reviewed:",
      "status:",
    ])
      assert.equal(guides.includes(value), false);
    assert.equal(run(root, "--check").status, 0);
    assert.equal(run(root).status, 0);
    assert.deepEqual(await artifacts(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("stale guide checks never overwrite artifacts and empty/absent optional sources produce no article", async () => {
  const root = await fixture();
  try {
    assert.equal(run(root).status, 0);
    const empty = await artifacts(root);
    assert.ok(empty[2]!.includes("fa: []") && empty[2]!.includes("en: []"));
    await rm(join(root, "content/guides"), { recursive: true });
    assert.equal(run(root, "--check").status, 0);
    await mkdir(join(root, "content/guides/fa"), { recursive: true });
    await writeFile(join(root, "content/guides/fa/stone-care.md"), article("fa"));
    const result = run(root, "--check");
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes("Generated Git guide artifact is stale"));
    assert.deepEqual(await artifacts(root), empty);
    assert.equal(run(root).status, 0);
    assert.equal((await artifacts(root))[2]!.includes("en: []"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("invalid guide publication or paired revision preserves all three previous artifacts", async () => {
  for (const scenario of ["review", "date", "language", "canonical", "revision"] as const) {
    const root = await fixture();
    try {
      await writeFile(join(root, "content/guides/fa/stone-care.md"), article("fa"));
      const overrides =
        scenario === "review"
          ? { reviewed: false }
          : scenario === "date"
            ? { updatedAt: "2026-02-29" }
            : scenario === "language"
              ? { summary: "synthetic-private متن" }
              : scenario === "canonical"
                ? { seoTitle: "SEO", canonicalPath: "/guides/stone-care" }
                : { version: "test-v2" };
      await writeFile(join(root, "content/guides/en/stone-care.md"), article("en", overrides));
      const before = await artifacts(root),
        result = run(root);
      assert.notEqual(result.status, 0, scenario);
      assert.deepEqual(await artifacts(root), before);
      assert.equal((result.stdout + result.stderr).includes("synthetic-private"), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
test("actual guide CLI rejects linked/oversized/UTF-8/flat/unknown/nested inputs without publishing", async () => {
  for (const scenario of [
    "symlink",
    "hardlink",
    "directory",
    "oversized",
    "utf8",
    "flat",
    "locale",
    "nested",
    "root-link",
    "locale-link",
  ] as const) {
    const root = await fixture();
    try {
      const target = join(root, "content/guides/fa/stone-care.md"),
        external = join(root, "synthetic-private-input.md");
      if (scenario === "symlink" || scenario === "hardlink") {
        await writeFile(external, article("fa", {}, "synthetic-private-body"));
        if (scenario === "symlink") await symlink(external, target);
        else await link(external, target);
      } else if (scenario === "directory") await mkdir(target);
      else if (scenario === "oversized") await writeFile(target, "x".repeat(64 * 1024 + 1));
      else if (scenario === "utf8") await writeFile(target, Buffer.from([0xff, 0xfe]));
      else if (scenario === "flat")
        await writeFile(join(root, "content/guides/stone-care.md"), article("fa"));
      else if (scenario === "locale") await mkdir(join(root, "content/guides/ar"));
      else if (scenario === "nested") await mkdir(join(root, "content/guides/fa/unknown"));
      else {
        const source = join(root, "synthetic-private-directory");
        await mkdir(source);
        const directory = join(
          root,
          scenario === "root-link" ? "content/guides" : "content/guides/fa",
        );
        await rm(directory, { recursive: true });
        await symlink(source, directory, "dir");
      }
      const before = await artifacts(root),
        result = run(root);
      assert.notEqual(result.status, 0, scenario);
      assert.deepEqual(await artifacts(root), before);
      assert.equal((result.stdout + result.stderr).includes("synthetic-private-body"), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
test("guide source count includes drafts and stops before altering prior artifacts", async () => {
  const root = await fixture();
  try {
    for (let index = 0; index < 101; index++)
      await writeFile(
        join(root, `content/guides/fa/a-${index}.md`),
        article("fa", { slug: `a-${index}`, status: "draft", reviewed: false }),
      );
    const before = await artifacts(root),
      result = run(root);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes("Too many Git guide sources"));
    assert.deepEqual(await artifacts(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
