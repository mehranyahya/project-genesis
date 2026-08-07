import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  cloudflareIp,
  handleSubmitRequest,
  hmacSha256Hex,
  stableJson,
} from "./request-api.server";
import type {
  RequestApiConfig,
  RequestApiDependencies,
  RequestRpcResult,
  RpcInput,
} from "./request-api.server";

const HASH = "a".repeat(64);
const CONFIG: RequestApiConfig = {
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "service-role-secret-that-never-leaves-server",
  fingerprintKey: "fingerprint-secret-123456789012345678901234567890",
  fingerprintKeyId: "v1",
  ipHashKey: "ip-hash-secret-123456789012345678901234567890123",
};

const contactPayload = (over: Record<string, unknown> = {}) => ({
  submission_id: "11111111-1111-4111-8111-111111111111",
  request_type: "contact",
  customer_name: "علی رضایی",
  phone: "+989121234567",
  city: null,
  location_text: null,
  preferred_contact: "phone",
  preferred_contact_time: null,
  customer_note: null,
  terms_version: "v1",
  terms_content_hash: HASH,
  terms_accepted: true,
  ...over,
});

function requestFor(payload: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://mehrara.example/api/submit-request", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

function dependencies(result: RequestRpcResult | null): {
  deps: RequestApiDependencies;
  inputs: RpcInput[];
} {
  const inputs: RpcInput[] = [];
  return {
    inputs,
    deps: {
      getConfig: () => CONFIG,
      getTerms: async () => ({ version: "v1", contentHash: HASH }),
      callRpc: async (_config, input) => {
        inputs.push(input);
        return result;
      },
    },
  };
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

test("stable JSON canonicalizes object keys recursively but preserves array order", () => {
  const first = { z: 1, a: { y: 2, x: 3 }, list: [{ b: 2, a: 1 }, "x"] };
  const second = { list: [{ a: 1, b: 2 }, "x"], a: { x: 3, y: 2 }, z: 1 };
  assert.equal(stableJson(first), stableJson(second));
  assert.notEqual(stableJson({ list: [1, 2] }), stableJson({ list: [2, 1] }));
});

test("HMAC output is lowercase SHA-256 hex and changes with key or value", () => {
  const one = hmacSha256Hex("k".repeat(32), "payload");
  const two = hmacSha256Hex("x".repeat(32), "payload");
  const three = hmacSha256Hex("k".repeat(32), "other");
  assert.match(one, /^[0-9a-f]{64}$/);
  assert.notEqual(one, two);
  assert.notEqual(one, three);
});

test("only Cloudflare connecting IP is trusted; forwarded-for is never a fallback", () => {
  const valid = new Request("https://example.test", {
    headers: { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.2" },
  });
  const spoofableOnly = new Request("https://example.test", {
    headers: { "x-forwarded-for": "198.51.100.2" },
  });
  assert.equal(cloudflareIp(valid), "203.0.113.7");
  assert.equal(cloudflareIp(spoofableOnly), null);
});

test("non-JSON, malformed JSON and oversized bodies fail before RPC", async () => {
  const tracker = dependencies({ code: "REQUEST_CREATED", tracking_code: "MA-1001" });

  const wrongType = new Request("https://example.test/api/submit-request", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  assert.equal((await handleSubmitRequest(wrongType, tracker.deps)).status, 422);

  const broken = new Request("https://example.test/api/submit-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal((await handleSubmitRequest(broken, tracker.deps)).status, 422);

  const huge = new Request("https://example.test/api/submit-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(33 * 1024) }),
  });
  assert.equal((await handleSubmitRequest(huge, tracker.deps)).status, 422);
  assert.equal(tracker.inputs.length, 0);
});

test("schema errors expose only fixed server field names and never raw validation copy", async () => {
  const tracker = dependencies({ code: "REQUEST_CREATED", tracking_code: "MA-1001" });
  const response = await handleSubmitRequest(
    requestFor(contactPayload({ customer_name: "x", phone: "bad" })),
    tracker.deps,
  );
  assert.equal(response.status, 422);
  const body = await bodyOf(response);
  assert.equal(body["code"], "VALIDATION_ERROR");
  assert.deepEqual(body["field_errors"], { customer_name: true, phone: true });
  assert.equal(JSON.stringify(body).includes("Invalid"), false);
  assert.equal(tracker.inputs.length, 0);
});

test("valid request sends canonical fingerprint, authoritative terms and hashed IP only", async () => {
  const tracker = dependencies({ code: "REQUEST_CREATED", tracking_code: "MA-1001" });
  const request = requestFor(contactPayload(), { "cf-connecting-ip": "203.0.113.7" });
  const response = await handleSubmitRequest(request, tracker.deps);

  assert.equal(response.status, 201);
  assert.equal(tracker.inputs.length, 1);
  const input = tracker.inputs[0]!;
  assert.equal(input.p_current_terms_version, "v1");
  assert.equal(input.p_current_terms_hash, HASH);
  assert.equal(input.p_bot_verification, "unverified_no_token");
  assert.deepEqual(input.p_risk_flags, ["turnstile_no_token"]);
  assert.equal(input.p_request_fingerprint_key_id, "v1");
  assert.equal(
    input.p_request_fingerprint,
    hmacSha256Hex(CONFIG.fingerprintKey, stableJson(input.p_payload)),
  );
  assert.equal(input.p_ip_hash, hmacSha256Hex(CONFIG.ipHashKey, "203.0.113.7"));
  assert.notEqual(input.p_ip_hash, "203.0.113.7");

  const responseText = JSON.stringify(await bodyOf(response));
  assert.equal(responseText.includes(CONFIG.serviceRoleKey), false);
  assert.equal(responseText.includes("203.0.113.7"), false);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("missing current Terms is passed as null so an existing idempotent replay can still resolve", async () => {
  const tracker = dependencies({ code: "REQUEST_REPLAYED", tracking_code: "MA-1001" });
  const deps: RequestApiDependencies = {
    ...tracker.deps,
    getTerms: async () => null,
  };
  const response = await handleSubmitRequest(requestFor(contactPayload()), deps);
  assert.equal(response.status, 200);
  assert.equal(tracker.inputs[0]!.p_current_terms_version, null);
  assert.equal(tracker.inputs[0]!.p_current_terms_hash, null);
});

test("configuration failure and malformed repository result fail closed as 503", async () => {
  const base = dependencies({ code: "REQUEST_CREATED", tracking_code: "MA-1001" });
  const badConfig: RequestApiDependencies = {
    ...base.deps,
    getConfig: () => {
      throw new Error("missing secret");
    },
  };
  const configResponse = await handleSubmitRequest(requestFor(contactPayload()), badConfig);
  assert.equal(configResponse.status, 503);

  const unavailable = dependencies(null);
  const rpcResponse = await handleSubmitRequest(requestFor(contactPayload()), unavailable.deps);
  assert.equal(rpcResponse.status, 503);
  assert.deepEqual(await bodyOf(rpcResponse), { code: "TEMPORARILY_UNAVAILABLE" });
});

test("RPC outcomes map to the exact public HTTP contract", async () => {
  const cases: readonly [RequestRpcResult, number][] = [
    [{ code: "REQUEST_CREATED", tracking_code: "MA-1001" }, 201],
    [{ code: "REQUEST_REPLAYED", tracking_code: "MA-1001" }, 200],
    [{ code: "PRICE_CHANGED", price: { price_type: "fixed", amount_toman: 25000000 } }, 409],
    [{ code: "SELECTION_UNAVAILABLE" }, 409],
    [{ code: "TERMS_UPDATED", terms: { version: "v2", content_hash: "b".repeat(64) } }, 409],
    [{ code: "IDEMPOTENCY_CONFLICT" }, 409],
    [{ code: "IDEMPOTENCY_EXPIRED" }, 409],
    [{ code: "VALIDATION_ERROR", field_errors: { phone: "raw", internal_debug: "secret" } }, 422],
    [{ code: "RATE_LIMITED" }, 429],
    [{ code: "TEMPORARILY_UNAVAILABLE" }, 503],
  ];

  for (const [result, expectedStatus] of cases) {
    const tracker = dependencies(result);
    const response = await handleSubmitRequest(requestFor(contactPayload()), tracker.deps);
    assert.equal(response.status, expectedStatus, result.code);
    if (result.code === "RATE_LIMITED") assert.equal(response.headers.get("retry-after"), "600");
    if (result.code === "VALIDATION_ERROR") {
      assert.deepEqual((await bodyOf(response))["field_errors"], { phone: true });
    }
  }
});

test("server route is POST-only and isolates all backend code from the UI", () => {
  const route = readFileSync(new URL("../routes/api/submit-request.ts", import.meta.url), "utf8");
  assert.match(route, /createFileRoute\("\/api\/submit-request"\)/);
  assert.match(route, /POST:/);
  assert.equal(/GET:|PUT:|PATCH:|DELETE:/.test(route), false);
  assert.match(route, /request-api\.server/);
  assert.equal(/SUPABASE|SERVICE_ROLE|process\.env|console\./.test(route), false);
  assert.equal(/component\s*:/.test(route), false);
});

test("request API server module never logs or persists a raw connecting IP", () => {
  const source = readFileSync(new URL("./request-api.server.ts", import.meta.url), "utf8");
  assert.equal(/console\.(log|info|warn|error)/.test(source), false);
  assert.equal(/x-forwarded-for/i.test(source), false);
  assert.match(source, /cf-connecting-ip/);
  assert.match(source, /hmacSha256Hex\(config\.ipHashKey, ip\)/);
});
