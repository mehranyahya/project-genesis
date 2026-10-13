import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("verification still passes after the real deployment generators replace empty artifacts and editorial selections", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const root = await mkdtemp(join(tmpdir(), "genesis-generated-verification-"));
  try {
    // Copy only tracked sources, including their current edits. Never copy a
    // checkout's untracked environment/credential files or generated output.
    const tracked = spawnSync("git", ["ls-files", "-z"], {
      cwd: repository,
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.equal(tracked.error, undefined);
    assert.equal(tracked.status, 0, tracked.stderr);
    for (const path of tracked.stdout.split("\0").filter(Boolean)) {
      assert.ok(!path.startsWith("/") && !path.split("/").includes(".."));
      const source = join(repository, path),
        destination = join(root, path);
      assert.equal((await lstat(source)).isFile(), true);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }
    await symlink(join(repository, "node_modules"), join(root, "node_modules"), "dir");
    // Authoring inputs belong to this fixture too. A release's real translation
    // hashes/articles cannot be applied to our synthetic empty operational data.
    for (const name of ["pages", "guides", "translations"])
      await rm(join(root, "content", name), { recursive: true, force: true });
    for (const name of ["pages", "guides"])
      for (const locale of ["fa", "en"])
        await mkdir(join(root, "content", name, locale), { recursive: true });
    await writeFile(
      join(root, "offline-fetch.mjs"),
      `
globalThis.fetch = async (input) => {
  const url = new URL(input);
  if (url.origin !== "https://fixtures.invalid" || !url.pathname.startsWith("/rest/v1/")) throw new Error("Offline verification rejected network");
  return new Response(JSON.stringify(url.pathname.endsWith("/compute_operational_catalog_version") ? "${"a".repeat(64)}" : []), { headers: { "content-type": "application/json", "content-range": "*/0" } });
};
`,
    );
    for (const locale of ["fa", "en"]) {
      const source = [
        "---",
        'slug: "test-care"',
        `locale: "${locale}"`,
        'title: "Synthetic article"',
        'summary: "Synthetic summary"',
        'status: "published"',
        "reviewed: true",
        'version: "fixture-v1"',
        'updatedAt: "2026-10-13"',
        "---",
        "Synthetic article body.",
      ].join("\n");
      await writeFile(join(root, `content/guides/${locale}/test-care.md`), source);
    }
    // A release's reviewed selections must not change an unconfigured-home
    // fixture. These IDs exist only in this temporary synthetic repository.
    await writeFile(
      join(root, "src/lib/home-editorial-config.ts"),
      `
import type { HomeEditorialReferences } from "./home-editorial";
const reference = { publicReferenceId: "pf-1001", assetId: "${"a".repeat(24)}" };
export const HOME_EDITORIAL_REFERENCES: Readonly<Record<"fa" | "en", HomeEditorialReferences>> = { fa: { hero: reference }, en: { hero: reference } };
`,
    );
    const env = {
      PATH: process.env["PATH"] ?? "",
      BUILD_SUPABASE_URL: "https://fixtures.invalid",
      BUILD_SUPABASE_SERVICE_ROLE_KEY: "synthetic-fixture-key",
    };
    for (const args of [
      ["--import", "./offline-fetch.mjs", "scripts/generate-structured-content.mjs"],
      ["scripts/generate-content-pages.mjs"],
      ["scripts/generate-content-pages.mjs", "--check"],
    ]) {
      const result = spawnSync("node", args, { cwd: root, env, encoding: "utf8", timeout: 15_000 });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr);
    }
    const structured = await readFile(
      join(root, "src/lib/content/generated-structured-content.ts"),
      "utf8",
    );
    const guides = await readFile(join(root, "src/lib/content/generated-guides.ts"), "utf8");
    assert.match(structured, /STRUCTURED_CONTENT_GENERATED = true/);
    assert.doesNotMatch(structured, /synthetic-fixture-key/);
    assert.match(guides, /Synthetic article/);
    for (const language of ["fa", "en"]) assert.ok(guides.includes(`locale: "${language}"`));
    const files = [
      "src/lib/content/adapters.test.ts",
      "src/lib/route-defs/lazy-routes.test.tsx",
      "src/lib/home-editorial.test.ts",
      "src/lib/content/git-guides-runtime.test.ts",
    ];
    const result = spawnSync(process.execPath, ["test", ...files], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      env: { PATH: process.env["PATH"] ?? "" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /0 fail/);
    assert.match(result.stderr, /17 pass/);
    for (const file of files) assert.ok(result.stderr.includes(file));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
