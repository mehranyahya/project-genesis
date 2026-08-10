import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { RequestPayload } from "./request-form";
import type { RequestSubmitTransport } from "./request-submit";
import { submitRequestWithTurnstile } from "./request-submit-turnstile";
import { readTurnstileToken, verifyTurnstileRequest } from "./turnstile.server";
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

  const controlHeaderRequest = {
    headers: { get: () => "bad\u0001value" },
  } as unknown as Request;
  assert.equal(readTurnstileToken(controlHeaderRequest), null);
});

test("missing proof is soft no_token and never calls Siteverify", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return result({ success: true, hostname: "mehrara.example", action: "submit_request" });
  };

  assert.deepEqual(await verifyTurnstileRequest(request(null), deps(fetcher)), {
    kind: "no_token",
  });
  assert.equal(calls, 0);
});

test("malformed present proof is invalid and never calls Siteverify", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return result({ success: true, hostname: "mehrara.example", action: "submit_request" });
  };

  assert.deepEqual(await verifyTurnstileRequest(request("x".repeat(2049)), deps(fetcher)), {
    kind: "invalid",
  });
  assert.equal(calls, 0);
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

test("configuration or repeated transport failure becomes service_error", async () => {
  const missingConfig: TurnstileDependencies = {
    getConfig: () => {
      throw new Error("missing");
    },
    fetchSiteverify: fetch,
    randomUuid: () => UUID,
  };
  assert.deepEqual(await verifyTurnstileRequest(request(), missingConfig), {
    kind: "service_error",
  });

  let calls = 0;
  const broken: typeof fetch = async () => {
    calls += 1;
    throw new Error("network");
  };
  assert.deepEqual(await verifyTurnstileRequest(request(), deps(broken)), {
    kind: "service_error",
  });
  assert.equal(calls, 2);
});

test("client transport omits the proof header when Turnstile is unavailable", async () => {
  let headers: Readonly<Record<string, string>> | null = null;
  const transport: RequestSubmitTransport = async (input) => {
    headers = input.headers;
    return { status: 503, body: JSON.stringify({ code: "TEMPORARILY_UNAVAILABLE" }) };
  };

  await submitRequestWithTurnstile({
    payload: {} as RequestPayload,
    turnstileToken: null,
    transport,
  });

  assert.ok(headers);
  assert.equal(Object.hasOwn(headers, "X-Turnstile-Token"), false);
});

test("client executes fresh proof before transport while Siteverify authority lives only in Edge", () => {
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
  const workerGateway = readFileSync(
    new URL("./gateway-submit.server.ts", import.meta.url),
    "utf8",
  );
  const edgeTurnstile = readFileSync(
    new URL("../../supabase/functions/_shared/turnstile.ts", import.meta.url),
    "utf8",
  );
  const edgeSubmit = readFileSync(
    new URL("../../supabase/functions/submit-request/index.ts", import.meta.url),
    "utf8",
  );

  assert.match(field, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(field, /action: ACTION/);
  assert.match(field, /execution: "execute"/);
  assert.match(field, /"refresh-expired": "auto"/);
  assert.match(field, /appearance: "interaction-only"/);
  assert.match(field, /size: "flexible"/);
  assert.match(field, /api\.execute\(container\)/);
  assert.match(field, /readonly execute: \(\) => Promise<string \| null>/);
  assert.match(field, /VITE_TURNSTILE_SITE_KEY/);
  assert.equal(/TURNSTILE_SECRET_KEY/.test(field), false);

  assert.match(transport, /turnstileToken: string \| null/);
  assert.match(transport, /"X-Turnstile-Token"/);
  assert.match(transport, /baseTransport\(\{/);
  assert.match(transport, /\.\.\.request\.headers/);
  assert.equal(/JSON\.stringify/.test(transport), false);

  assert.match(form, /const selectionBlocked = selectionBlockedByCatalog;/);
  assert.match(form, /if \(!termsReady \|\| selectionBlocked\) return;/);
  assert.equal(/useState<string \| null>\(null\).*turnstile/i.test(form), false);
  assert.match(form, /await turnstileRef\.current\?\.execute\(\)/);
  assert.match(form, /\{ payload, turnstileToken, transport \}/);
  assert.match(form, /resetTurnstile\(\)/);
  assert.match(form, /submitRequestWithTurnstile/);

  const validationPosition = form.indexOf("validateRequestForm");
  const executePosition = form.indexOf("await turnstileRef.current?.execute()");
  const transportPosition = form.indexOf("const result = await submitRequest");
  assert.ok(validationPosition >= 0 && executePosition > validationPosition);
  assert.ok(transportPosition > executePosition);

  assert.match(route, /TEMPORARILY_UNAVAILABLE/);
  assert.equal(/handleProtectedSubmitRequest|verifyTurnstileRequest/.test(route), false);
  assert.equal(/TURNSTILE_SECRET_KEY|process\.env/.test(route), false);

  assert.match(workerGateway, /turnstile_token: turnstileToken/);
  assert.match(workerGateway, /x-turnstile-token/);
  assert.equal(/challenges\.cloudflare\.com|TURNSTILE_SECRET_KEY/.test(workerGateway), false);

  assert.match(edgeTurnstile, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  assert.match(edgeTurnstile, /TURNSTILE_SECRET_KEY/);
  assert.match(edgeTurnstile, /unverified_no_token/);
  assert.match(edgeTurnstile, /unverified_service_error/);
  assert.match(edgeTurnstile, /turnstile_no_token/);
  assert.match(edgeTurnstile, /turnstile_unavailable/);
  assert.match(edgeTurnstile, /idempotency_key/);

  const inspectPosition = edgeSubmit.indexOf("inspect_request_idempotency");
  const siteverifyPosition = edgeSubmit.indexOf("verifyTurnstile({");
  assert.ok(inspectPosition >= 0 && siteverifyPosition > inspectPosition);
});
