import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("structured generator still runs directly with isolated offline build data", async () => {
  const root = await mkdtemp(join(tmpdir(), "genesis-structured-cli-"));
  try {
    await mkdir(join(root, "scripts"));
    await mkdir(join(root, "src/lib/content"), { recursive: true });
    for (const name of ["generate-structured-content.mjs", "media-geometry.mjs"]) {
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
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
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
    assert.equal(await readFile(join(root, "calls.txt"), "utf8"), "5");
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
