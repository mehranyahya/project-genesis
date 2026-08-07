import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  readTurnstileToken,
  verifyTurnstileRequest,
} from "./turnstile.server";
import type { TurnstileDependencies } from "./turnstile.server";

const SECRET = "turnstile-secret-value";
const TOKEN = "token-value";
const UUID = "11111111-1111-4111-8111-111111111111";

function request(token: string | null = TOKEN): Request {
  const headers = new Headers({ "cf-connecting-ip": "203.0.113.7" });
  if (token !== null) headers.set("x-turnstile-token", token);
  return new Request("https://mehrara.example/api/submit-request", { headers });
}

function deps(
  fetchSiteverify: typeof fetch,
  hostnames: readonly string[] = ["mehrara.example"],
): TurnstileDependencies {
  return {
    getConfig: () => ({ secretKey: SECRET, allowedHostnames: new Set(hostnames) }),
    fetchSiteverify,
    randomUuid: () => UUID,
  };
}

function result(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Turnstile token header is bounded and rejects controls", () => {
  assert.equal(readTurnstileToken(request()), TOKEN);
  assert.equal(readTurnstileToken(request(null)), null);
  assert.equal(readTurnstileToken(request("x".repeat(2049))), null);
  assert.equal(readTurnstileToken(request("bad\nvalue")), null);
});

test("successful Siteverify requires exact action and allowlisted hostname", async () => {
  let sent: Record<string, unknown> | null = null;
  const fetcher: typeof fetch = async (_input, init) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return result({ success: true, hostname: "mehrara.example", action: "submit_request" });
  };

  assert.deepEqual(await verifyTurnstileRequest(request(), deps(fetcher)), { kind: "verified" });
  assert.deepEqual(sent, {
    secret: SECRET,
    response: TOKEN,
    idempotency_key: UUID,
    remoteip: "203.0.113.7",
  });
});

test("wrong action, wrong hostname and ordinary token rejection are invalid", async () => {
  const wrongAction: typeof fetch = async () =>
    result({ success: true, hostname: "mehrara.example", action: "other" });
  assert.deepEqual(await verifyTurnstileRequest(request(), deps(wrongAction)), { kind: "invalid" });

  const wrongHost: typeof fetch = async () =>
    result({ success: true, hostname: "evil.example", action: "submit_request" });
  assert.deepEqual(await verifyTurnstileRequest(request(), deps(wrongHost)), { kind: "invalid" });

  const rejected: typeof fetch = async () =>
    result({ success: false, "error-codes": ["timeout-or-duplicate"] });
  assert.deepEqual(await verifyTurnstileRequest(request(), deps(rejected)), { kind: "invalid" });
});

test("internal Siteverify errors retry once with the same idempotency key", async () => {
  const ids: string[] = [];
  let calls = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    ids.push(body["idempotency_key"] ?? "");
    return calls === 1
      ? result({ success: false, "error-codes": ["internal-error"] })
      : result({ success: true, hostname: "mehrara.example", action: "submit_request" });
  };

  assert.deepEqual(await verifyTurnstileRequest(request(), deps(fetcher)), { kind: "verified" });
  assert.equal(calls, 2);
  assert.deepEqual(ids, [UUID, UUID]);
});

test("configuration or repeated transport failure fails closed", async () => {
  const missingConfig: TurnstileDependencies = {
    getConfig: () => {
      throw new Error("missing");
    },
    fetchSiteverify: fetch,
    randomUuid: () => UUID,
  };
  assert.deepEqual(await verifyTurnstileRequest(request(), missingConfig), { kind: "service_error" });

  let calls = 0;
  const broken: typeof fetch = async () => {
    calls += 1;
    throw new Error("network");
  };
  assert.deepEqual(await verifyTurnstileRequest(request(), deps(broken)), { kind: "service_error" });
  assert.equal(calls, 2);
});

test("client integration keeps token outside payload and server secret outside browser code", () => {
  const field = readFileSync(
    new URL("../components/request-form/turnstile-field.tsx", import.meta.url),
    "utf8",
  );
  const transport = readFileSync(new URL("./request-submit-turnstile.ts", import.meta.url), "utf8");
  const form = readFileSync(
    new URL("../components/request-form/request-form.tsx", import.meta.url),
    "utf8",
  );
  const route = readFileSync(new URL("../routes/api/submit-request.ts", import.meta.url), "utf8");
  const routeServer = readFileSync(new URL("./request-api.route.server.ts", import.meta.url), "utf8");

  assert.match(field, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(field, /action: ACTION/);
  assert.match(field, /appearance: "interaction-only"/);
  assert.match(field, /size: "flexible"/);
  assert.match(field, /VITE_TURNSTILE_SITE_KEY/);
  assert.equal(/TURNSTILE_SECRET_KEY/.test(field), false);

  assert.match(transport, /"X-Turnstile-Token"/);
  assert.match(transport, /body: JSON\.stringify\(input\.payload\)/);
  assert.equal(/turnstileToken[^\n]*payload/.test(transport), false);

  assert.match(form, /turnstileToken === null/);
  assert.match(form, /resetTurnstile\(\)/);
  assert.match(form, /submitRequestWithTurnstile/);

  assert.match(route, /handleProtectedSubmitRequest/);
  assert.match(routeServer, /botVerification: "verified"/);
  assert.match(routeServer, /riskFlags: \[\]/);
  assert.equal(/TURNSTILE_SECRET_KEY|process\.env/.test(route), false);
});
