import { readFile, writeFile } from "node:fs/promises";

const CONFIG_PATH = new URL("../.output/server/wrangler.json", import.meta.url);
const TELEGRAM_RECOVERY_CRON = "0 * * * *";
const SUBMIT_FLOOD_LIMITER = {
  name: "SUBMIT_FLOOD_LIMITER",
  namespace_id: "1322772730",
  simple: {
    limit: 300,
    period: 60,
  },
};

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

let siteUrl = null;
let allowedOrigins = null;
if (deployTarget !== "") {
  const rawSiteUrl = process.env["SITE_URL"]?.trim() ?? "";
  const rawAllowedOrigins = process.env["ALLOWED_ORIGINS"]?.trim() ?? "";
  if (rawSiteUrl === "") throw new Error("SITE_URL is required for deployment");
  if (rawAllowedOrigins === "") throw new Error("ALLOWED_ORIGINS is required for deployment");
  siteUrl = normalizeOrigin(rawSiteUrl, "SITE_URL");
  allowedOrigins = normalizeAllowedOrigins(rawAllowedOrigins);
  if (!allowedOrigins.split(",").includes(siteUrl)) {
    throw new Error("ALLOWED_ORIGINS must include SITE_URL");
  }
}

const raw = await readFile(CONFIG_PATH, "utf8");
const config = JSON.parse(raw);

if (typeof config !== "object" || config === null || Array.isArray(config)) {
  throw new Error("Generated Wrangler config must be a JSON object");
}
if (typeof config.name !== "string" || config.name.trim() === "") {
  throw new Error("Generated Wrangler config has no worker name");
}
if (typeof config.main !== "string" || config.main.trim() === "") {
  throw new Error("Generated Wrangler config has no worker entry");
}
if (
  typeof config.compatibility_date !== "string" ||
  !/^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date)
) {
  throw new Error("Generated Wrangler config has no valid compatibility date");
}

const flags = Array.isArray(config.compatibility_flags)
  ? config.compatibility_flags.filter((value) => typeof value === "string")
  : [];
if (!flags.includes("nodejs_compat")) flags.push("nodejs_compat");
config.compatibility_flags = [...new Set(flags)].sort();

config.triggers = {
  ...(typeof config.triggers === "object" && config.triggers !== null ? config.triggers : {}),
  crons: [TELEGRAM_RECOVERY_CRON],
};

const rateLimits = Array.isArray(config.ratelimits)
  ? config.ratelimits.filter(
      (value) =>
        typeof value !== "object" || value === null || value.name !== SUBMIT_FLOOD_LIMITER.name,
    )
  : [];
config.ratelimits = [...rateLimits, SUBMIT_FLOOD_LIMITER];

if (deployTarget !== "" && siteUrl !== null && allowedOrigins !== null) {
  const vars =
    typeof config.vars === "object" && config.vars !== null && !Array.isArray(config.vars)
      ? { ...config.vars }
      : {};
  delete vars.PUBLIC_SITE_ORIGIN;
  config.vars = {
    ...vars,
    DEPLOY_TARGET: deployTarget,
    SITE_URL: siteUrl,
    ALLOWED_ORIGINS: allowedOrigins,
    PUBLIC_INDEXING: deployTarget === "production" ? "true" : "false",
  };
}

if (typeof config.assets === "object" && config.assets !== null && !Array.isArray(config.assets)) {
  config.assets = {
    ...config.assets,
    run_worker_first: ["/api/*", "/sitemap.xml"],
  };
}

await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
