import { describeError } from "./safe-error";

type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lovableReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const message = describeError(error);
  const safeError = new Error(message);
  delete safeError.stack;
  const boundary =
    context["boundary"] === "tanstack_root_error_component"
      ? "tanstack_root_error_component"
      : "unknown_boundary";
  window.__lovableEvents?.captureException?.(
    safeError,
    { source: "react_error_boundary", boundary },
    { mechanism: "react_error_boundary", handled: false, severity: "error" },
  );
  // Editor hooks receive the same safe diagnostic; never a URL, stack or cause.
  window.__lovableReportRuntimeError?.({ message });
}
