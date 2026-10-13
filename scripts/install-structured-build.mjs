import { lstat, rename, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Keep the previous artifact and media if a staged generation cannot install. */
export async function installStructuredBuild({
  stageMedia,
  stageArtifact,
  mediaDirectory,
  artifactFile,
  backupMedia,
}) {
  mediaDirectory = (
    mediaDirectory instanceof URL ? fileURLToPath(mediaDirectory) : mediaDirectory
  ).replace(/\/+$/, "");
  backupMedia = (backupMedia instanceof URL ? fileURLToPath(backupMedia) : backupMedia).replace(
    /\/+$/,
    "",
  );
  stageMedia = (stageMedia instanceof URL ? fileURLToPath(stageMedia) : stageMedia).replace(
    /\/+$/,
    "",
  );
  let hadMedia = false,
    installedMedia = false;
  try {
    const stat = await lstat(mediaDirectory).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat) {
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error("Invalid existing public media directory");
      await rename(mediaDirectory, backupMedia);
      hadMedia = true;
    }
    await rename(stageMedia, mediaDirectory);
    installedMedia = true;
    await rename(stageArtifact, artifactFile);
  } catch {
    try {
      if (installedMedia) await rm(mediaDirectory, { recursive: true, force: true });
      if (hadMedia) await rename(backupMedia, mediaDirectory);
    } catch {
      throw new Error("Structured build rollback requires recovery; staged backup retained");
    }
    throw new Error("Structured build was not installed; previous artifacts preserved");
  }
}
