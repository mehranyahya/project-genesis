import { createSerializationAdapter } from "@tanstack/react-router";

// SSR sends match errors to the browser as well as rendering an error view.
// Keep the Error type for retry/hydration without publishing server messages,
// stacks, causes or custom properties. The router's HTTP status is separate.
export const publicErrorSerialization = createSerializationAdapter<Error, null>({
  key: "public-error",
  test: (value): value is Error => value instanceof Error,
  toSerializable: () => null,
  fromSerializable: () => new Error("Page data unavailable"),
});
