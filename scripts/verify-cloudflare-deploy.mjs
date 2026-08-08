import { readFile } from "node:fs/promises";

const GENERATED_CONFIG = new URL("../.output/server/wrangler.json", import.meta.url);
const REDIRECT_CONFIG = new URL("../.wrangler/deploy/config.json", import.meta.url);

const deployTarget = process.env["DEPLOY_TARGET"]?.trim() ?? "";
if (deployTarget !== "" && deployTarget !== "preview" && deployTarget !== "production") {
  throw new Error("DEPLOY_TARGET must be preview or production when provided");
}

const config = JSON.parse(await readFile(GENERATED_CONFIG, "utf8"));
const redirect = JSON.parse(await readFile(REDIRECT_CONFIG, "utf8"));

if (
  !Array.isArray(config.compatibility_flags) ||
  !config.compatibility_flags.includes("nodejs_compat")
) {
  throw new Error("Cloudflare deploy config must enable nodejs_compat");
}
if (JSON.stringify(config.triggers?.crons) !== JSON.stringify(["0 * * * *"])) {
  throw new Error("Cloudflare deploy config must expose exactly the hourly Telegram recovery cron");
}
if (
  config.assets &&
  JSON.stringify(config.assets.run_worker_first) !== JSON.stringify(["/api/*"])
) {
  throw new Error("Cloudflare assets must route API requests through the Worker first");
}

const submitFloodLimiters = Array.isArray(config.ratelimits)
  ? config.ratelimits.filter((value) => value?.name === "SUBMIT_FLOOD_LIMITER")
  : [];
if (submitFloodLimiters.length !== 1) {
  throw new Error("Cloudflare deploy config must expose exactly one submit flood limiter");
}
const submitFloodLimiter = submitFloodLimiters[0];
if (
  submitFloodLimiter.namespace_id !== "1322772730" ||
  submitFloodLimiter.simple?.limit !== 300 ||
  submitFloodLimiter.simple?.period !== 60
) {
  throw new Error("Cloudflare submit flood limiter must be 300 attempts per IP per minute");
}

if (deployTarget !== "") {
  const expectedIndexing = deployTarget === "production" ? "true" : "false";
  if (
    config.vars?.DEPLOY_TARGET !== deployTarget ||
    config.vars?.PUBLIC_INDEXING !== expectedIndexing
  ) {
    throw new Error("Cloudflare deploy indexing bindings do not match DEPLOY_TARGET");
  }
}

if (typeof config.main !== "string" || !config.main.endsWith("index.mjs")) {
  throw new Error("Cloudflare generated worker entry is unexpected");
}
if (typeof config.name !== "string" || config.name.trim() === "") {
  throw new Error("Cloudflare generated worker name is missing");
}
if (
  typeof redirect.configPath !== "string" ||
  !redirect.configPath.includes(".output/server/wrangler.json")
) {
  throw new Error("Wrangler deploy redirect must target Nitro's generated configuration");
}

console.log(`Cloudflare deploy preflight passed for ${config.name}`);
