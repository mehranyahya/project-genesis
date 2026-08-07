const TRACKING_CODE_PATTERN = /^MA-[1-9][0-9]{3,}$/;

export const TELEGRAM_DELIVERY_SIGNAL_HEADER = "x-genesis-telegram-tracking-code";

export function isTelegramTrackingCode(value: string): boolean {
  return TRACKING_CODE_PATTERN.test(value);
}

export async function attachTelegramDeliverySignal(response: Response): Promise<Response> {
  if (response.status !== 201) return response;

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  if (payload === null || typeof payload !== "object") return response;
  const record = payload as Record<string, unknown>;
  if (record["code"] !== "REQUEST_CREATED") return response;

  const trackingCode = record["tracking_code"];
  if (typeof trackingCode !== "string" || !isTelegramTrackingCode(trackingCode)) return response;

  const headers = new Headers(response.headers);
  headers.set(TELEGRAM_DELIVERY_SIGNAL_HEADER, trackingCode);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function consumeTelegramDeliverySignal(response: Response): {
  readonly response: Response;
  readonly trackingCode: string | null;
} {
  const raw = response.headers.get(TELEGRAM_DELIVERY_SIGNAL_HEADER);
  if (raw === null) return { response, trackingCode: null };

  const headers = new Headers(response.headers);
  headers.delete(TELEGRAM_DELIVERY_SIGNAL_HEADER);
  const sanitized = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  return {
    response: sanitized,
    trackingCode: isTelegramTrackingCode(raw) ? raw : null,
  };
}
