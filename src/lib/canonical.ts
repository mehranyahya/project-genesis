const SAFE_CANONICAL_PATH = /^\/(?!\/)[^\s<>"']*$/;

function configuredPublicOrigin(): string | null {
  const value = import.meta.env?.["VITE_PUBLIC_SITE_ORIGIN"];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function normalizeCanonicalOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Canonical origin must be a valid URL");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error("Canonical origin must be a clean HTTPS origin");
  }

  return parsed.origin;
}

export function canonicalHref(path: string, origin = configuredPublicOrigin()): string {
  if (!SAFE_CANONICAL_PATH.test(path)) {
    throw new Error("Canonical path must be a safe same-origin absolute path");
  }
  if (origin === null) return path;
  const normalizedOrigin = normalizeCanonicalOrigin(origin);
  return new URL(path, `${normalizedOrigin}/`).toString();
}
