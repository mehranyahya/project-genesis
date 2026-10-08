import { describeError, safeErrorArguments } from "./safe-error";

// h3 can swallow a throw into a generic 500. Retain a safe diagnostic only,
// never a request's Error object, body, cause, stack or free-form message.
let lastCapturedError: { summary: string; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { summary: describeError(error), at: Date.now() };
}

const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  for (const arg of args) {
    if (arg instanceof Error) record(arg);
  }
  originalConsoleError(...safeErrorArguments(args));
};

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): string | undefined {
  const captured = lastCapturedError;
  lastCapturedError = undefined;
  return captured && Date.now() - captured.at <= TTL_MS ? captured.summary : undefined;
}
