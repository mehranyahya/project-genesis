// Build/operations only. No requests, credentials in errors, or runtime imports.
function required(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

export function cleanOrigin(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a clean HTTPS origin`);
  }
  if (
    /[\s\\\x00-\x1f\x7f]/.test(value) ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(url.hostname) ||
    /\.(?:localhost|local|internal)$/.test(url.hostname)
  ) {
    throw new Error(`${label} must be a clean public HTTPS origin`);
  }
  return url.origin;
}

function origins(value, label) {
  const parts = value.split(",").map((part) => part.trim());
  const result = parts.map((part) => cleanOrigin(part, label));
  if (new Set(result).size !== result.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
  return result;
}

export function getDeploymentIsolation(env) {
  const target = required(env, "DEPLOY_TARGET");
  if (target !== "preview" && target !== "production") {
    throw new Error("DEPLOY_TARGET must be preview or production");
  }
  const destinations = {};
  for (const name of ["preview", "production"]) {
    const prefix = name.toUpperCase();
    const worker = required(env, `${prefix}_WORKER_NAME`);
    // staging-<worker> must fit in a single 63-character DNS label.
    if (!/^[a-z][a-z0-9-]{0,53}[a-z0-9]$/.test(worker)) {
      throw new Error(`${prefix}_WORKER_NAME must be a lowercase name of 2–55 characters`);
    }
    const projectRef = required(env, `${prefix}_SUPABASE_PROJECT_REF`);
    if (!/^[a-z]{20}$/.test(projectRef)) {
      throw new Error(`${prefix}_SUPABASE_PROJECT_REF must be a standard project reference`);
    }
    const site = cleanOrigin(required(env, `${prefix}_SITE_URL`), `${prefix}_SITE_URL`);
    const allowed = origins(
      required(env, `${prefix}_ALLOWED_ORIGINS`),
      `${prefix}_ALLOWED_ORIGINS`,
    );
    if (!allowed.includes(site))
      throw new Error(`${prefix}_ALLOWED_ORIGINS must include its SITE_URL`);
    destinations[name] = { worker, projectRef, site, allowed };
  }
  const preview = destinations.preview;
  const production = destinations.production;
  if (preview.worker === production.worker)
    throw new Error("Preview and production Worker names must differ");
  if (preview.projectRef === production.projectRef)
    throw new Error("Preview and production database projects must differ");
  if (preview.allowed.some((origin) => production.allowed.includes(origin))) {
    throw new Error("Preview and production origin allowlists must not overlap");
  }
  const selected = destinations[target];
  if (
    cleanOrigin(required(env, "SITE_URL"), "SITE_URL") !== selected.site ||
    origins(required(env, "ALLOWED_ORIGINS"), "ALLOWED_ORIGINS").join(",") !==
      selected.allowed.join(",")
  ) {
    throw new Error("Selected site and origins do not match the target identity");
  }
  return {
    ...selected,
    target,
    floodNamespace: target === "preview" ? "1322772731" : "1322772730",
    crons: target === "preview" ? [] : ["0 * * * *"],
  };
}

function keyValues(raw, label) {
  let keys;
  try {
    keys = JSON.parse(raw);
  } catch {
    throw new Error(`${label} is invalid`);
  }
  if (
    !keys ||
    typeof keys !== "object" ||
    Array.isArray(keys) ||
    JSON.stringify(keys) !== raw ||
    Object.keys(keys).length < 1 ||
    Object.keys(keys).length > 2 ||
    Object.entries(keys).some(
      ([key, value]) =>
        !/^[A-Za-z0-9._-]{1,64}$/.test(key) || typeof value !== "string" || value.length < 32,
    )
  )
    throw new Error(`${label} is invalid`);
  return Object.values(keys);
}

export function assertDeploymentDataSources(env, identity) {
  const root = `https://${identity.projectRef}.supabase.co`;
  for (const [name, expected] of [
    ["BUILD_SUPABASE_URL", root],
    ["SUPABASE_FUNCTION_BASE_URL", `${root}/functions/v1`],
  ]) {
    if (required(env, name).replace(/\/$/, "") !== expected) {
      throw new Error(`${name} does not match the selected database project`);
    }
  }
  const selectedKeys = keyValues(required(env, "EDGE_GATEWAY_KEYS_JSON"), "EDGE_GATEWAY_KEYS_JSON");
  const otherKeys = keyValues(
    required(env, "OTHER_EDGE_GATEWAY_KEYS_JSON"),
    "OTHER_EDGE_GATEWAY_KEYS_JSON",
  );
  if (selectedKeys.some((key) => otherKeys.includes(key))) {
    throw new Error("Gateway key material must not overlap between environments");
  }
  for (const name of [
    "IP_HASH_SECRET",
    "BUILD_SUPABASE_SERVICE_ROLE_KEY",
    "VITE_TURNSTILE_SITE_KEY",
  ]) {
    const current = required(env, name);
    if (current === required(env, `OTHER_${name}`))
      throw new Error(`${name} must differ between environments`);
    if (name === "IP_HASH_SECRET" && current.length < 32)
      throw new Error("IP_HASH_SECRET must contain at least 32 characters");
  }
}
