export const MAX_GUIDE_BYTES = 64 * 1024;
export const MAX_GUIDES_PER_LOCALE = 100;
export function isGuideSlug(value) {
  return (
    typeof value === "string" && value.length <= 80 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)
  );
}
