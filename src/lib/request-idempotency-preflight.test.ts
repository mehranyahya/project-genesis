import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inspectRequestIdempotencyBeforeTurnstile,
  type RequestIdempotencyPreflightDependencies,
} from "./request-idempotency-preflight.server";
import {
  handleProtectedSubmitRequest,
  type ProtectedSubmitDependencies,
} from "./request-api.route.server";
import {
  jsonResponse,
  requestFingerprint,
  requestPayloadSchema,
  type RequestApiConfig,
} from "./request-api.server";

const HASH = "a".repeat(64);
const SUBMISSION_ID = "11111111-1111-4111-8111-111111111111";

const CONFIG: RequestApiConfig = {
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "s".repeat(40),
  fingerprintKey: "f".repeat(40),
  fingerprintKeyId: "request-v1",
  ipHashKey: "i".repeat(40),
};

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    submission_id: SUBMISSION_ID,
    request_type: "contact",
    customer_name: "  Test User  ",
    phone: "+989121234567",
    city: null,
    location_text: null,
    preferred_contact: "phone",
    preferred_contact_time: null,
    customer_note: null,
    terms_version: "v1",
    terms_content_hash: HASH,
    terms_accepted: true,
    ...overrides,
  };
}

function request(body: Record<string, unknown> = payload()): Request {
  return new Request("https://mehrara.example/api/submit-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("preflight uses canonical parsed payload fingerprint and leaves original body unread", async () => {
  let captured: { readonly fingerprint: string; readonly submissionId: string } | null = null;
  const dependencies: RequestIdempotencyPreflightDependencies = {
    getConfig: () => CONFIG,
    callInspectRpc: async (_config, input) => {
      captured = {
        fingerprint: input.p_request_fingerprint,
        submissionId: input.p_submission_id,
      };
      return { code: "MISSING" };
    },
  };

  const original = request();
  const result = await inspectRequestIdempotencyBeforeTurnstile(original, dependencies);
  assert.deepEqual(result, { kind: "missing" });

  const parsed = requestPayloadSchema.parse(payload());
  assert.deepEqual(captured, {
    fingerprint: requestFingerprint(parsed, CONFIG),
    submissionId: SUBMISSION_ID,
  });
  assert.deepEqual(JSON.parse(await original.text()), payload());
});

test("preflight maps replay, conflict and expiry without exposing stored data", async () => {
  const outcomes = [
    { input: { code: "REQUEST_REPLAYED", tracking_code: "MA-1001" } as const, status: 200 },
    { input: { code: "IDEMPOTENCY_CONFLICT" } as const, status: 409 },
    { input: { code: "IDEMPOTENCY_EXPIRED" } as const, status: 409 },
  ];

  for (const outcome of outcomes) {
    const result = await inspectRequestIdempotencyBeforeTurnstile(request(), {
      getConfig: () => CONFIG,
      callInspectRpc: async () => outcome.input,
    });
    assert.equal(result.kind, "resolved");
    if (result.kind !== "resolved") continue;
    assert.equal(result.response.status, outcome.status);
    const body = (await result.response.json()) as Record<string, unknown>;
    assert.equal(body["code"], outcome.input.code);
    assert.deepEqual(Object.keys(body).sort(),
      outcome.input.code === "REQUEST_REPLAYED" ? ["code", "tracking_code"] : ["code"]);
  }
});

test("invalid public body skips inspection and keeps the existing validation path authoritative", async () => {
  let configCalls = 0;
  let rpcCalls = 0;
  const result = await inspectRequestIdempotencyBeforeTurnstile(request({ invalid: true }), {
    getConfig: () => {
      configCalls += 1;
      return CONFIG;
    },
    callInspectRpc: async () => {
      rpcCalls += 1;
      return { code: "MISSING" };
    },
  });

  assert.deepEqual(result, { kind: "skip" });
  assert.equal(configCalls, 0);
  assert.equal(rpcCalls, 0);
});

test("inspection infrastructure failure returns temporary unavailable before Turnstile", async () => {
  const result = await inspectRequestIdempotencyBeforeTurnstile(request(), {
    getConfig: () => CONFIG,
    callInspectRpc: async () => null,
  });

  assert.equal(result.kind, "resolved");
  if (result.kind !== "resolved") return;
  assert.equal(result.response.status, 503);
  assert.deepEqual(await result.response.json(), { code: "TEMPORARILY_UNAVAILABLE" });
});

test("existing replay returns before Turnstile verification and before create RPC", async () => {
  let verifyCalls = 0;
  let submitCalls = 0;
  const dependencies: ProtectedSubmitDependencies = {
    inspectIdempotency: async () => ({
      kind: "resolved",
      response: jsonResponse({ code: "REQUEST_REPLAYED", tracking_code: "MA-1001" }, 200),
    }),
    verifyTurnstile: async () => {
      verifyCalls += 1;
      return { kind: "verified" };
    },
    submitRequest: async () => {
      submitCalls += 1;
      return jsonResponse({ code: "REQUEST_CREATED", tracking_code: "MA-1002" }, 201);
    },
  };

  const response = await handleProtectedSubmitRequest(request(), dependencies);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { code: "REQUEST_REPLAYED", tracking_code: "MA-1001" });
  assert.equal(verifyCalls, 0);
  assert.equal(submitCalls, 0);
});

test("missing preflight proceeds through Turnstile and the authoritative submit boundary", async () => {
  let verifyCalls = 0;
  let submitCalls = 0;
  const dependencies: ProtectedSubmitDependencies = {
    inspectIdempotency: async () => ({ kind: "missing" }),
    verifyTurnstile: async () => {
      verifyCalls += 1;
      return { kind: "verified" };
    },
    submitRequest: async (_request, _dependencies, security) => {
      submitCalls += 1;
      assert.deepEqual(security, { botVerification: "verified", riskFlags: [] });
      return jsonResponse({ code: "REQUEST_CREATED", tracking_code: "MA-1002" }, 201);
    },
  };

  const response = await handleProtectedSubmitRequest(request(), dependencies);
  assert.equal(response.status, 201);
  assert.equal(verifyCalls, 1);
  assert.equal(submitCalls, 1);
});
