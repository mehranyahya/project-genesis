import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import {
  canonicalJson,
  canonicalizeClientIp,
  gatewaySignatureInput,
  handleSignedSubmitGateway,
  type GatewayDependencies,
} from "./gateway-submit.server";

const gatewaySecret = "g".repeat(40);
const env = {
  SUPABASE_FUNCTION_BASE_URL: "https://project.supabase.co/functions/v1",
  EDGE_GATEWAY_KEYS_JSON: JSON.stringify({ "gateway-v1": gatewaySecret }),
  EDGE_GATEWAY_PRIMARY_KEY_ID: "gateway-v1",
  IP_HASH_SECRET: "i".repeat(40),
  ALLOWED_ORIGINS: "https://preview.example,https://www.example.com",
};

const payload = {
  submission_id: "018f8f68-7a9f-4a7c-9e2a-2ef62587ea37",
  request_type: "contact",
  customer_name: "کاربر آزمایشی",
};

function request(input?: {
  origin?: string;
  token?: string | null;
  body?: unknown;
  ip?: string;
}): Request {
  const headers = new Headers({
    "content-type": "application/json",
    origin: input?.origin ?? "https://preview.example",
    "cf-connecting-ip": input?.ip ?? "2001:0db8:0:0:0:0:0:1",
  });
  if (input?.token !== null) headers.set("x-turnstile-token", input?.token ?? "turnstile-proof");
  return new Request("https://preview.example/api/submit-request", {
    method: "POST",
    headers,
    body: JSON.stringify(input?.body ?? payload),
  });
}

function dependencies(
  responder: (input: { url: string; init: RequestInit; envelope: Record<string, unknown> }) => Response,
): GatewayDependencies {
  return {
    nowUnix: () => 1_786_319_000,
    randomNonce: () => "0123456789abcdef0123456789abcdef",
    randomUuid: () => "018f8f68-7a9f-4a7c-9e2a-2ef62587ea38",
    fetchUpstream: async (url, init) => {
      const body = typeof init?.body === "string" ? init.body : "";
      return responder({
        url: String(url),
        init: init ?? {},
        envelope: JSON.parse(body) as Record<string, unknown>,
      });
    },
  };
}

test("canonical JSON is deterministic and client IP normalization is stable", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
  assert.equal(canonicalizeClientIp("192.168.001.001"), null);
  assert.equal(canonicalizeClientIp("192.168.1.1"), "192.168.1.1");
  assert.equal(canonicalizeClientIp("2001:0db8:0:0:0:0:0:1"), "2001:db8::1");
  assert.equal(canonicalizeClientIp("not-an-ip"), null);
});

test("gateway emits exactly payload + gateway and signs the entire canonical envelope", async () => {
  const response = await handleSignedSubmitGateway(
    request(),
    env,
    dependencies(({ url, init, envelope }) => {
      assert.equal(url, "https://project.supabase.co/functions/v1/submit-request");
      assert.deepEqual(Object.keys(envelope).sort(), ["gateway", "payload"]);

      const signedPayload = envelope.payload as Record<string, unknown>;
      assert.equal(signedPayload.turnstile_token, "turnstile-proof");
      assert.equal(signedPayload.customer_name, payload.customer_name);

      const gateway = envelope.gateway as Record<string, unknown>;
      assert.deepEqual(Object.keys(gateway).sort(), [
        "gateway_key_id",
        "ip_hash",
        "nonce",
        "origin",
        "received_at_unix",
        "worker_request_id",
      ]);
      assert.equal(gateway.origin, "https://preview.example");
      assert.equal(gateway.gateway_key_id, "gateway-v1");
      assert.match(String(gateway.ip_hash), /^[0-9a-f]{64}$/);
      assert.equal(Object.values(envelope).includes("2001:0db8:0:0:0:0:0:1"), false);

      const headers = new Headers(init.headers);
      assert.equal(headers.get("x-gateway-key-id"), "gateway-v1");
      assert.equal(headers.get("x-gateway-timestamp"), "1786319000");
      assert.equal(headers.get("x-gateway-nonce"), gateway.nonce);

      const body = canonicalJson(envelope);
      const signingInput = gatewaySignatureInput({
        canonicalEnvelopeBody: body,
        timestamp: 1_786_319_000,
        nonce: String(gateway.nonce),
        keyId: "gateway-v1",
      });
      const expected = createHmac("sha256", gatewaySecret).update(signingInput).digest("hex");
      assert.equal(headers.get("x-gateway-signature"), expected);
      assert.equal(headers.has("authorization"), false);
      assert.equal(headers.has("apikey"), false);
      assert.equal(headers.has("user-agent"), false);
      assert.equal(headers.has("cf-connecting-ip"), false);

      return new Response(JSON.stringify({ code: "REQUEST_CREATED", tracking_code: "MA-1001" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }),
  );

  assert.ok(response);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { code: "REQUEST_CREATED", tracking_code: "MA-1001" });
});

test("missing Turnstile proof remains a signed null field rather than a Worker hard gate", async () => {
  const response = await handleSignedSubmitGateway(
    request({ token: null }),
    env,
    dependencies(({ envelope }) => {
      assert.equal((envelope.payload as Record<string, unknown>).turnstile_token, null);
      return new Response(JSON.stringify({ code: "TEMPORARILY_UNAVAILABLE" }), { status: 503 });
    }),
  );
  assert.ok(response);
  assert.equal(response.status, 503);
});

test("gateway rejects wrong origin, malformed token and reserved token injection before upstream", async () => {
  let calls = 0;
  const deps = dependencies(() => {
    calls += 1;
    return new Response("{}", { status: 503 });
  });

  const wrongOrigin = await handleSignedSubmitGateway(request({ origin: "https://evil.example" }), env, deps);
  assert.ok(wrongOrigin);
  assert.equal(wrongOrigin.status, 403);

  const malformedToken = await handleSignedSubmitGateway(request({ token: "bad\u0001token" }), env, deps);
  assert.ok(malformedToken);
  assert.equal(malformedToken.status, 422);

  const injected = await handleSignedSubmitGateway(
    request({ body: { ...payload, turnstile_token: "forged" } }),
    env,
    deps,
  );
  assert.ok(injected);
  assert.equal(injected.status, 422);
  assert.equal(calls, 0);
});

test("gateway fails closed on incomplete configuration and sanitizes upstream errors", async () => {
  const broken = await handleSignedSubmitGateway(request(), { ...env, EDGE_GATEWAY_KEYS_JSON: "{}" });
  assert.ok(broken);
  assert.equal(broken.status, 503);

  const replay = await handleSignedSubmitGateway(
    request(),
    env,
    dependencies(() => new Response(JSON.stringify({ code: "GATEWAY_REPLAY", detail: "secret" }), { status: 409 })),
  );
  assert.ok(replay);
  assert.equal(replay.status, 503);
  assert.deepEqual(await replay.json(), { code: "TEMPORARILY_UNAVAILABLE" });

  const unknown = await handleSignedSubmitGateway(
    request(),
    env,
    dependencies(() =>
      new Response(JSON.stringify({ code: "SOMETHING_NEW", stack: "must not escape" }), { status: 500 }),
    ),
  );
  assert.ok(unknown);
  assert.equal(unknown.status, 503);
  assert.equal((await unknown.text()).includes("stack"), false);
});
