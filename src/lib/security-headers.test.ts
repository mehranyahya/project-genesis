import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyDeploymentIndexingHeaders } from "../server";
import { buildContentSecurityPolicy } from "./csp";
import { FATAL_HTML_HEADERS, SECURITY_HEADERS } from "./security-headers";

test("Worker security headers cover normal HTML, JSON, fatal and redirect responses without altering body or nonce", async () => {
  const csp = buildContentSecurityPolicy("a".repeat(32));
  for (const status of [200, 404, 422, 500, 302]) {
    const response = applyDeploymentIndexingHeaders(
      new Response("safe-body", {
        status,
        headers: {
          "content-security-policy": csp,
          "cache-control": "no-store",
          location: "/contact",
          "set-cookie": "synthetic=1; Secure",
        },
      }),
      { PUBLIC_INDEXING: "true" },
    );
    for (const [name, value] of Object.entries(SECURITY_HEADERS))
      assert.equal(response.headers.get(name), value);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("content-security-policy"), csp);
    assert.equal(response.headers.get("location"), "/contact");
    assert.equal(response.headers.get("set-cookie"), "synthetic=1; Secure");
    assert.equal(await response.text(), "safe-body");
  }
});

test("preview noindex and empty response semantics survive common header decoration", () => {
  const response = applyDeploymentIndexingHeaders(new Response(null, { status: 204 }), {});
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("fatal fallback denies scripts and has the same basic headers as the normal Worker", () => {
  assert.ok(FATAL_HTML_HEADERS["content-security-policy"].includes("default-src 'none'"));
  assert.ok(FATAL_HTML_HEADERS["content-security-policy"].includes("frame-ancestors 'none'"));
  assert.equal(FATAL_HTML_HEADERS["cache-control"], "no-store, max-age=0");
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    assert.equal(new Headers(FATAL_HTML_HEADERS).get(name), value);
});

test("static assets have matching basic security headers without a static CSP nonce or unverified HSTS", () => {
  const rules = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");
  const parsed = new Map(
    rules
      .split("\n")
      .slice(1)
      .filter((line) => line.trim())
      .map((line) => {
        const colon = line.indexOf(":");
        return [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()];
      }),
  );
  assert.ok(rules.startsWith("/*\n"));
  assert.deepEqual(Object.fromEntries(parsed), SECURITY_HEADERS);
  assert.equal(parsed.has("content-security-policy"), false);
  assert.equal(parsed.has("strict-transport-security"), false);
});
