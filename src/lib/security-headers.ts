export const SECURITY_HEADERS = {
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
} as const;

export const FATAL_HTML_HEADERS = {
  ...SECURITY_HEADERS,
  "cache-control": "no-store, max-age=0",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "content-type": "text/html; charset=utf-8",
} as const;

export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  // Preserve the per-response nonce policy and cache/redirect headers.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
