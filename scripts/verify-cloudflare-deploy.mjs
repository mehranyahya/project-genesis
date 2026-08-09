import { readFile } from "node:fs/promises";

const GENERATED_CONFIG = new URL("../.output/server/wrangler.json", import.meta.url);
const REDIRECT_CONFIG = new URL("../.wrangler/deploy/config.json", import.meta.url);

const deployTarget = process.env["DEPLOY_TARGET"]?.trim() ?? "";
if (deployTarget !== "" && deployTarget !== "preview" && deployTarget !== "production") {
  throw new Error("DEPLOY_TARGET must be preview or production when provided");
}

function normalizeOrigin(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(`${label} must be a clean HTTPS origin`);
  }

  return parsed.origin;
}

function normalizeAllowedOrigins(value) {
  const origins = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => normalizeOrigin(item, `ALLOWED_ORIGINS[${index}]`));
  if (origins.length === 0) throw new Error("ALLOWED_ORIGINS must not be empty");
  if (new Set(origins).size !== origins.length) {
    throw new Error("ALLOWED_ORIGINS must not contain duplicates");
  }
  return origins.join(",");
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
  throw new Error("Cloudflare deploy config must expose exactly the hourly recovery cron");
}
if (
  config.assets &&
  JSON.stringify(config.assets.run_worker_first) !== JSON.stringify(["/api/*", "/sitemap.xml"])
) {
  throw new Error("Cloudflare assets must route API and sitemap requests through the Worker first");
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
  const rawSiteUrl = process.env["SITE_URL"]?.trim() ?? "";
  const rawAllowedOrigins = process.env["ALLOWED_ORIGINS"]?.trim() ?? "";
  if (rawSiteUrl === "") throw new Error("SITE_URL is required for deployment");
  if (rawAllowedOrigins === "") throw new Error("ALLOWED_ORIGINS is required for deployment");

  const expectedSiteUrl = normalizeOrigin(rawSiteUrl, "SITE_URL");
  const expectedAllowedOrigins = normalizeAllowedOrigins(rawAllowedOrigins);
  if (!expectedAllowedOrigins.split(",").includes(expectedSiteUrl)) {
    throw new Error("ALLOWED_ORIGINS must include SITE_URL");
  }

  if (
    config.vars?.DEPLOY_TARGET !== deployTarget ||
    config.vars?.PUBLIC_INDEXING !== expectedIndexing ||
    config.vars?.SITE_URL !== expectedSiteUrl ||
    config.vars?.ALLOWED_ORIGINS !== expectedAllowedOrigins
  ) {
    throw new Error("Cloudflare deployment bindings do not match the selected target");
  }
  if (config.vars?.PUBLIC_SITE_ORIGIN != null) {
    throw new Error("Legacy PUBLIC_SITE_ORIGIN binding must not be emitted");
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
