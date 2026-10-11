import { getDeploymentIsolation, assertDeploymentDataSources } from "./deployment-isolation.mjs";

try {
  const identity = getDeploymentIsolation(process.env);
  assertDeploymentDataSources(process.env, identity);
  console.log(
    "Deployment identity and credential isolation checks passed; live access and notification destinations still require verification.",
  );
} catch (error) {
  // Messages originate only in our fixed validators, never parser/HTTP errors.
  console.error(`Deployment isolation check failed: ${error.message}`);
  process.exitCode = 1;
}
