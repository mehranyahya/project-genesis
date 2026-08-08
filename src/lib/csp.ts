export const CSP_NONCE_PATTERN = /^[a-f0-9]{32}$/;

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export function buildContentSecurityPolicy(nonce: string): string {
  if (!CSP_NONCE_PATTERN.test(nonce)) {
    throw new Error("CSP nonce must be a 128-bit lowercase hex value");
  }

  const nonceSource = `'nonce-${nonce}'`;

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' ${nonceSource} 'strict-dynamic' ${TURNSTILE_ORIGIN}`,
    `style-src 'self' ${nonceSource}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${TURNSTILE_ORIGIN}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "manifest-src 'self'",
  ].join("; ");
}
