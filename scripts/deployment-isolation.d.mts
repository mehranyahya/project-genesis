export type DeploymentIdentity = {
  worker: string;
  projectRef: string;
  site: string;
  allowed: string[];
  target: "preview" | "production";
  floodNamespace: string;
  crons: string[];
};
export function cleanOrigin(value: string, label: string): string;
export function getDeploymentIsolation(env: Record<string, string | undefined>): DeploymentIdentity;
export function assertDeploymentDataSources(
  env: Record<string, string | undefined>,
  identity: DeploymentIdentity,
): void;
