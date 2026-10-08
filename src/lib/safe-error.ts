// Retain only a closed category and HTTP status. Messages, stacks, causes,
// URLs, custom names and arbitrary objects can contain private request data.
const CATEGORIES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
]);

export function describeError(error: unknown): string {
  let category = "UnknownError";
  let status: number | undefined;
  try {
    if (error instanceof Response) {
      category = "HttpResponse";
      status = error.status;
    } else if (error instanceof Error) {
      const name = error.name;
      category = CATEGORIES.has(name) ? name : "Error";
      const candidate =
        (error as { status?: unknown; statusCode?: unknown }).status ??
        (error as { statusCode?: unknown }).statusCode;
      if (typeof candidate === "number") status = candidate;
    }
  } catch {
    // A throwing accessor must not make logging fail or expose its value.
  }
  return JSON.stringify({
    category,
    ...(Number.isInteger(status) && status! >= 100 && status! <= 599 ? { status } : {}),
  });
}

const SAFE_EVENTS = new Set([
  "Worker submit flood limiter unavailable",
  "Sitemap content load failed",
]);

export function safeErrorArguments(args: readonly unknown[]): readonly string[] {
  return args.map((arg) =>
    typeof arg === "string" && SAFE_EVENTS.has(arg) ? arg : describeError(arg),
  );
}
