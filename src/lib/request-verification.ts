/** Application watchdog, independent of the security provider's callbacks. */
export const REQUEST_VERIFICATION_TIMEOUT_MS = 60_000;

export type RequestVerification =
  { readonly kind: "ready"; readonly token: string | null } | { readonly kind: "unavailable" };

const UNAVAILABLE: RequestVerification = { kind: "unavailable" };

/**
 * An absent optional widget may still defer verification to the server.
 * A stalled or rejected execution must instead recover locally without sending.
 * The losing promise remains handled; a late token never resumes this attempt.
 */
export async function waitForRequestVerification(
  execute: () => Promise<string | null>,
  timeoutMs = REQUEST_VERIFICATION_TIMEOUT_MS,
): Promise<RequestVerification> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<RequestVerification>((resolve) => {
      timer = setTimeout(() => resolve(UNAVAILABLE), timeoutMs);
    });
    const proof = Promise.resolve()
      .then(execute)
      .then((token): RequestVerification => ({ kind: "ready", token }))
      .catch(() => UNAVAILABLE);
    return await Promise.race([proof, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
