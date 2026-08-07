import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";

const outputPath = process.argv[2];
if (typeof outputPath !== "string" || outputPath.trim() === "") {
  throw new Error("Cloudflare secret output path is required");
}
if (!path.isAbsolute(outputPath)) {
  throw new Error("Cloudflare secret output path must be absolute");
}

const env = process.env;

function requireValue(name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Required deployment value is missing: ${name}`);
  return value;
}

function requireLongSecret(name) {
  const value = requireValue(name);
  if (value.length < 32) throw new Error(`Deployment secret is too short: ${name}`);
  return value;
}

function requireHttpsUrl(name) {
  const value = requireValue(name);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Deployment URL is invalid: ${name}`);
  }
  if (parsed.protocol !== "https:") throw new Error(`Deployment URL must use HTTPS: ${name}`);
  return value;
}

function requireFingerprintKeyId() {
  const value = requireValue("REQUEST_FINGERPRINT_KEY_ID");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(value)) {
    throw new Error("REQUEST_FINGERPRINT_KEY_ID has an invalid format");
  }
  return value;
}

function requireTurnstileHostnames() {
  const value = requireValue("TURNSTILE_ALLOWED_HOSTNAMES");
  const rawItems = value.split(",");
  const items = rawItems.map((item) => item.trim().toLowerCase());
  if (
    items.length === 0 ||
    items.some(
      (item) =>
        item.length === 0 ||
        item.length > 253 ||
        item.startsWith(".") ||
        item.endsWith(".") ||
        item.includes("..") ||
        !/^[a-z0-9.-]+$/.test(item),
    )
  ) {
    throw new Error("TURNSTILE_ALLOWED_HOSTNAMES contains an invalid hostname");
  }
  return items.join(",");
}

function requireTelegramChatId() {
  const value = requireValue("TELEGRAM_ADMIN_CHAT_ID");
  if (!/^-?[1-9][0-9]*$/.test(value)) {
    throw new Error("TELEGRAM_ADMIN_CHAT_ID has an invalid format");
  }
  return value;
}

const secrets = {
  SUPABASE_URL: requireHttpsUrl("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: requireValue("SUPABASE_SERVICE_ROLE_KEY"),
  REQUEST_FINGERPRINT_KEY: requireLongSecret("REQUEST_FINGERPRINT_KEY"),
  REQUEST_FINGERPRINT_KEY_ID: requireFingerprintKeyId(),
  IP_HASH_KEY: requireLongSecret("IP_HASH_KEY"),
  TURNSTILE_SECRET_KEY: requireValue("TURNSTILE_SECRET_KEY"),
  TURNSTILE_ALLOWED_HOSTNAMES: requireTurnstileHostnames(),
  TELEGRAM_BOT_TOKEN: requireValue("TELEGRAM_BOT_TOKEN"),
  TELEGRAM_ADMIN_CHAT_ID: requireTelegramChatId(),
};

await writeFile(outputPath, `${JSON.stringify(secrets)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
await chmod(outputPath, 0o600);
