import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildContentSecurityPolicy, CSP_NONCE_PATTERN } from "./csp";

const routerSource = readFileSync(new URL("../router.tsx", import.meta.url), "utf8");
const rootSource = readFileSync(new URL("../routes/__root.tsx", import.meta.url), "utf8");
const turnstileSource = readFileSync(
  new URL("../components/request-form/turnstile-field.tsx", import.meta.url),
  "utf8",
);

const nonce = "0123456789abcdef0123456789abcdef";

test("CSP builder emits a strict nonce policy compatible with Turnstile", () => {
  const policy = buildContentSecurityPolicy(nonce);

  assert.match(policy, new RegExp(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`));
  assert.match(policy, new RegExp(`style-src 'self' 'nonce-${nonce}'`));
  assert.match(policy, /script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(policy, /connect-src 'self' https:\/\/challenges\.cloudflare\.com/);
  assert.match(policy, /frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'self'/);
  assert.match(policy, /form-action 'self'/);
  assert.equal(policy.includes("'unsafe-inline'"), false);
  assert.equal(policy.includes("'unsafe-eval'"), false);
  assert.equal(/(?:^|\s)\*(?:\s|;|$)/.test(policy), false);
});

test("CSP builder rejects malformed or attacker-controlled nonce values", () => {
  assert.equal(CSP_NONCE_PATTERN.test(nonce), true);
  for (const invalid of [
    "",
    "abc",
    "A".repeat(32),
    "0".repeat(31),
    "0".repeat(33),
    `${"0".repeat(32)}' https://evil.example`,
  ]) {
    assert.throws(() => buildContentSecurityPolicy(invalid));
  }
});

test("router follows TanStack's server-only per-request nonce pattern", () => {
  assert.match(routerSource, /createIsomorphicFn\(\)\.server\(\(\) =>/);
  assert.match(routerSource, /new Uint8Array\(16\)/);
  assert.match(routerSource, /crypto\.getRandomValues\(bytes\)/);
  assert.match(routerSource, /ssr: getSSROptions\(\)/);
});

test("root response CSP consumes the same SSR nonce and fails closed if it is absent", () => {
  assert.match(rootSource, /headers: \(\{ ssr \}\) =>/);
  assert.match(rootSource, /const nonce = ssr\?\.nonce/);
  assert.match(rootSource, /buildContentSecurityPolicy\(nonce\)/);
  assert.match(rootSource, /default-src 'none'; frame-ancestors 'none'/);
  assert.match(rootSource, /if \(import\.meta\.env\.DEV\) return/);
  assert.equal(rootSource.includes("unsafe-inline"), false);
});

test("Turnstile loader propagates the document CSP nonce to api.js", () => {
  assert.match(turnstileSource, /querySelector<HTMLScriptElement>\("script\[nonce\]"\)/);
  assert.match(turnstileSource, /trustedScript\?\.nonce\.trim\(\)/);
  assert.match(turnstileSource, /const nonce = documentCspNonce\(\)/);
  assert.match(turnstileSource, /if \(nonce !== null\) script\.nonce = nonce/);
  assert.match(
    turnstileSource,
    /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/,
  );
});
