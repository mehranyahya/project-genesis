export function installStructuredBuild(input: {
  stageMedia: URL | string;
  stageArtifact: URL | string;
  mediaDirectory: URL | string;
  artifactFile: URL | string;
  backupMedia: URL | string;
}): Promise<void>;
