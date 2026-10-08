/** Build-only aspect allowlist. Catalogue portraits remain strictly 4:5. */
export function isAllowedMediaAspect(width, height, ownerKind) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    return false;
  if (!["product", "portfolio", "building"].includes(ownerKind)) return false;
  const aspect = width / height;
  const portrait = aspect >= 0.78 && aspect <= 0.82;
  const landscape = aspect >= 1.48 && aspect <= 1.52;
  return portrait || (ownerKind !== "product" && landscape);
}
