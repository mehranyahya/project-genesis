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

function normalizePublicSiteOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("PUBLIC_SITE_ORIGIN must be a valid URL");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(
      "PUBLIC_SITE_ORIGIN must be an HTTPS origin without credentials, path, query or hash",
    );
  }

  return parsed.origin;
}

let publicSiteOrigin = null;
if (deployTarget === "production") {
  const rawOrigin = process.env["PUBLIC_SITE_ORIGIN"]?.trim() ?? "";
  if (rawOrigin === "") throw new Error("PUBLIC_SITE_ORIGIN is required for production");
  publicSiteOrigin = normalizePublicSiteOrigin(rawOrigin);
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

if (deployTarget !== "") {
  const vars =
    typeof config.vars === "object" && config.vars !== null && !Array.isArray(config.vars)
      ? { ...config.vars }
      : {};
  delete vars.PUBLIC_SITE_ORIGIN;
  config.vars = {
    ...vars,
    DEPLOY_TARGET: deployTarget,
    PUBLIC_INDEXING: deployTarget === "production" ? "true" : "false",
    ...(publicSiteOrigin === null ? {} : { PUBLIC_SITE_ORIGIN: publicSiteOrigin }),
  };
}

if (typeof config.assets === "object" && config.assets !== null && !Array.isArray(config.assets)) {
  config.assets = {
    ...config.assets,
    run_worker_first: ["/api/*", "/sitemap.xml"],
  };
}

await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
