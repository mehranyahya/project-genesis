import { readFile } from "node:fs/promises";

const GENERATED_CONFIG = new URL("../.output/server/wrangler.json", import.meta.url);
const REDIRECT_CONFIG = new URL("../.wrangler/deploy/config.json", import.meta.url);

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
