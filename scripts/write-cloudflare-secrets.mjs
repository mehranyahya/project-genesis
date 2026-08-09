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

function requireFunctionBaseUrl() {
  const value = requireValue("SUPABASE_FUNCTION_BASE_URL");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SUPABASE_FUNCTION_BASE_URL is invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error("SUPABASE_FUNCTION_BASE_URL must be a clean HTTPS URL");
  }
  return value.replace(/\/+$/, "");
}

function requireGatewayKeyMap() {
  const raw = requireValue("EDGE_GATEWAY_KEYS_JSON");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("EDGE_GATEWAY_KEYS_JSON must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("EDGE_GATEWAY_KEYS_JSON must be an object");
  }

  const entries = Object.entries(parsed);
  if (entries.length < 1 || entries.length > 2) {
    throw new Error("EDGE_GATEWAY_KEYS_JSON must contain one or two keys");
  }
  for (const [keyId, secret] of entries) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId)) {
      throw new Error("EDGE_GATEWAY_KEYS_JSON contains an invalid key id");
    }
    if (typeof secret !== "string" || secret.length < 32) {
      throw new Error("EDGE_GATEWAY_KEYS_JSON contains an invalid secret");
    }
  }
  return { raw, keys: parsed };
}

const gatewayKeyMap = requireGatewayKeyMap();
const primaryKeyId = requireValue("EDGE_GATEWAY_PRIMARY_KEY_ID");
if (!/^[A-Za-z0-9._-]{1,64}$/.test(primaryKeyId) || !(primaryKeyId in gatewayKeyMap.keys)) {
  throw new Error("EDGE_GATEWAY_PRIMARY_KEY_ID must reference EDGE_GATEWAY_KEYS_JSON");
}

const secrets = {
  SUPABASE_FUNCTION_BASE_URL: requireFunctionBaseUrl(),
  EDGE_GATEWAY_KEYS_JSON: gatewayKeyMap.raw,
  EDGE_GATEWAY_PRIMARY_KEY_ID: primaryKeyId,
  IP_HASH_SECRET: requireLongSecret("IP_HASH_SECRET"),
};

await writeFile(outputPath, `${JSON.stringify(secrets)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
await chmod(outputPath, 0o600);
