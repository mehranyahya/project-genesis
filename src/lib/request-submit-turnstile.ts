import type { RequestPayload } from "./request-form";
import type { RequestSubmitTransport, SubmitOutcome } from "./request-submit";
import { sameOriginTransport, submitRequest } from "./request-submit";

const TOKEN_MAX_LENGTH = 2048;

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

export function isTurnstileToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= TOKEN_MAX_LENGTH &&
    !hasControlCharacters(value)
  );
}

export async function submitRequestWithTurnstile(input: {
  readonly payload: RequestPayload;
  readonly turnstileToken: string | null;
  readonly transport?: RequestSubmitTransport;
}): Promise<SubmitOutcome> {
  const token = input.turnstileToken;
  if (token !== null && !isTurnstileToken(token)) {
    return { kind: "bot_verification_invalid" };
  }

  const baseTransport = input.transport ?? sameOriginTransport;
  if (token === null) {
    return submitRequest({ payload: input.payload, transport: baseTransport });
  }

  const protectedTransport: RequestSubmitTransport = (request) =>
    baseTransport({
      ...request,
      headers: {
        ...request.headers,
        "X-Turnstile-Token": token,
      },
    });

  return submitRequest({ payload: input.payload, transport: protectedTransport });
}
