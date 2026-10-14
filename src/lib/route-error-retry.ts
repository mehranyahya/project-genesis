import { isModuleNotFoundError } from "@tanstack/router-core";

/** Called only by an explicit retry action, never while rendering an error. */
export function retryRouteError(error: unknown, retryData: () => void): void {
  try {
    // A rejected lazy module remains cached after data invalidation.
    if (typeof window !== "undefined" && isModuleNotFoundError(error)) {
      window.location.reload();
      return;
    }
  } catch {
    // An unreadable error or blocked reload still allows the existing data retry.
  }
  retryData();
}
