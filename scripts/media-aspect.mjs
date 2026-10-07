/** Bounded editorial frames. Unknown owners fail closed. No crop or private metadata. */
export function isAllowedMediaAspect(width, height, ownerKind) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return false;
  }
  if (!["product", "portfolio", "building"].includes(ownerKind)) return false;
  const ratio = width / height;
  const portrait = ratio >= 0.78 && ratio <= 0.82;
  const landscape = ratio >= 1.47 && ratio <= 1.53;
  return portrait || (ownerKind !== "product" && landscape);
}
