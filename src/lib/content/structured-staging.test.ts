import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { installStructuredBuild } from "../../../scripts/install-structured-build.mjs";
import {
  MAX_TRANSLATION_BYTES,
  readStructuredTranslations,
} from "../../../scripts/structured-translations.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "genesis-staged-content-"));
  const mediaDirectory = join(root, "media"),
    stageMedia = join(root, "stage-media"),
    artifactFile = join(root, "artifact.ts"),
    stageArtifact = join(root, "stage.ts"),
    backupMedia = join(root, "backup-media");
  for (const path of [mediaDirectory, stageMedia]) await mkdir(path);
  await writeFile(join(mediaDirectory, "old.webp"), "old-synthetic-media");
  await writeFile(join(stageMedia, "new.webp"), "new-synthetic-media");
  await writeFile(artifactFile, "old-synthetic-artifact");
  await writeFile(stageArtifact, "new-synthetic-artifact");
  return { root, mediaDirectory, stageMedia, artifactFile, stageArtifact, backupMedia };
}
test("a complete staged build replaces the artifact/media pair and retains the old media for cleanup", async () => {
  const paths = await fixture();
  try {
    await installStructuredBuild(paths);
    assert.equal(await readFile(paths.artifactFile, "utf8"), "new-synthetic-artifact");
    assert.deepEqual(await readdir(paths.mediaDirectory), ["new.webp"]);
    assert.equal(
      await readFile(join(paths.backupMedia, "old.webp"), "utf8"),
      "old-synthetic-media",
    );
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});
test("failure to install the staged artifact restores the original image bytes and artifact", async () => {
  const paths = await fixture();
  try {
    await rm(paths.stageArtifact);
    await assert.rejects(installStructuredBuild(paths), /previous artifacts preserved/);
    assert.equal(await readFile(paths.artifactFile, "utf8"), "old-synthetic-artifact");
    assert.deepEqual(await readdir(paths.mediaDirectory), ["old.webp"]);
    assert.equal(
      await readFile(join(paths.mediaDirectory, "old.webp"), "utf8"),
      "old-synthetic-media",
    );
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});
test("failure before installing new media restores the old directory without changing the artifact", async () => {
  const paths = await fixture();
  try {
    await rm(paths.stageMedia, { recursive: true });
    await assert.rejects(installStructuredBuild(paths), /previous artifacts preserved/);
    assert.equal(await readFile(paths.artifactFile, "utf8"), "old-synthetic-artifact");
    assert.deepEqual(await readdir(paths.mediaDirectory), ["old.webp"]);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});
test("a linked public media directory is rejected without following or modifying its target", async () => {
  const paths = await fixture();
  try {
    const external = join(paths.root, "external");
    await mkdir(external);
    await writeFile(join(external, "keep.webp"), "synthetic-external-bytes");
    await rm(paths.mediaDirectory, { recursive: true });
    await symlink(external, paths.mediaDirectory, "dir");
    await assert.rejects(
      installStructuredBuild({
        ...paths,
        mediaDirectory: pathToFileURL(paths.mediaDirectory + "/"),
      }),
      /previous artifacts preserved/,
    );
    assert.equal(await readFile(join(external, "keep.webp"), "utf8"), "synthetic-external-bytes");
    assert.equal(await readFile(paths.artifactFile, "utf8"), "old-synthetic-artifact");
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});
test("translation file reads are bounded, regular-file-only and reject malformed UTF-8", async () => {
  const root = await mkdtemp(join(tmpdir(), "genesis-translation-read-"));
  try {
    const file = join(root, "en.json"),
      external = join(root, "linked.json"),
      url = pathToFileURL(file);
    assert.equal(await readStructuredTranslations(url), null);
    await writeFile(file, '{"schemaVersion":1}');
    assert.deepEqual(await readStructuredTranslations(url), { schemaVersion: 1 });
    await rm(file);
    await writeFile(external, "{}");
    for (const type of ["symbolic", "hard"] as const) {
      if (type === "symbolic") await symlink(external, file);
      else await link(external, file);
      await assert.rejects(readStructuredTranslations(url), /Invalid or stale/);
      await rm(file);
    }
    await writeFile(file, Buffer.from([0xff, 0xfe]));
    await assert.rejects(readStructuredTranslations(url), /Invalid or stale/);
    await writeFile(file, "x".repeat(MAX_TRANSLATION_BYTES + 1));
    await assert.rejects(readStructuredTranslations(url), /Invalid or stale/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
