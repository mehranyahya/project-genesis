/** Shared, side-effect-free policy for the build validator and safe renderer. */
export function isSafeGuideHref(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    /[\s<>"'\\\u0000-\u001f\u007f]/u.test(value)
  )
    return false;
  if (value.startsWith("/")) {
    try {
      const decoded = decodeURIComponent(value);
      return !decoded.startsWith("//") && !/[\\\u0000-\u001f\u007f]/u.test(decoded);
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(value);
    return (
      /^https:\/\//i.test(value) &&
      url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
