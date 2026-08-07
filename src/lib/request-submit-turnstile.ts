import type { RequestPayload } from "./request-form";
import type { RequestSubmitTransport, SubmitOutcome } from "./request-submit";
import { sameOriginTransport, submitRequest } from "./request-submit";

const TOKEN_MAX_LENGTH = 2048;

export function isTurnstileToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= TOKEN_MAX_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export async function submitRequestWithTurnstile(input: {
  readonly payload: RequestPayload;
  readonly turnstileToken: string;
  readonly transport?: RequestSubmitTransport;
}): Promise<SubmitOutcome> {
  if (!isTurnstileToken(input.turnstileToken)) return { kind: "bot_verification_invalid" };

  const baseTransport = input.transport ?? sameOriginTransport;
  const protectedTransport: RequestSubmitTransport = (request) =>
    baseTransport({
      ...request,
      headers: {
        ...request.headers,
        "X-Turnstile-Token": input.turnstileToken,
      },
    });

  return submitRequest({ payload: input.payload, transport: protectedTransport });
}
