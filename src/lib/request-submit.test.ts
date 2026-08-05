import { test } from "node:test";
import assert from "node:assert/strict";

import { REQUEST_FIELD_ERRORS } from "./request-form";
import type { RequestPayload } from "./request-form";
import type { RequestSubmitTransport, RequestSubmitTransportResult } from "./request-submit";
import {
  SUBMIT_ENDPOINT,
  SUBMIT_TIMEOUT_MS,
  TRACKING_CODE_PATTERN,
  interpretSubmitResponse,
  isTrackingCode,
  submitRequest,
} from "./request-submit";

const reply = (status: number, body: unknown): RequestSubmitTransportResult => ({
  status,
  body: typeof body === "string" ? body : JSON.stringify(body),
});

const payload = { submission_id: "sid-1", request_type: "contact" } as unknown as RequestPayload;

/* -------------------------------------------------------------------------- */
/* Tracking code                                                               */
/* -------------------------------------------------------------------------- */

test("1 the tracking code pattern is the official one", () => {
  assert.equal(TRACKING_CODE_PATTERN.source, "^MA-[1-9][0-9]{3,}$");
  assert.ok(isTrackingCode("MA-1001"));
  assert.ok(isTrackingCode("MA-123456"));
  for (const bad of ["MA-0999", "MA-999", "ma-1001", "MA1001", "", null, 1001]) {
    assert.ok(!isTrackingCode(bad));
  }
});

/* -------------------------------------------------------------------------- */
/* Success                                                                     */
/* -------------------------------------------------------------------------- */

test("2 success requires the exact code, status and tracking code", () => {
  assert.deepEqual(
    interpretSubmitResponse(reply(201, { code: "REQUEST_CREATED", tracking_code: "MA-1001" })),
    { kind: "success", trackingCode: "MA-1001", replayed: false },
  );
  assert.deepEqual(
    interpretSubmitResponse(reply(200, { code: "REQUEST_REPLAYED", tracking_code: "MA-1001" })),
    { kind: "success", trackingCode: "MA-1001", replayed: true },
  );
});

test("3 no success is produced on a mismatched status or invalid tracking code", () => {
  const cases = [
    reply(200, { code: "REQUEST_CREATED", tracking_code: "MA-1001" }),
    reply(201, { code: "REQUEST_REPLAYED", tracking_code: "MA-1001" }),
    reply(201, { code: "REQUEST_CREATED", tracking_code: "MA-0999" }),
    reply(201, { code: "REQUEST_CREATED" }),
  ];
  for (const item of cases) {
    assert.deepEqual(interpretSubmitResponse(item), { kind: "temporarily_unavailable" });
  }
});

test("4 an unknown code, empty body or broken JSON is temporary only", () => {
  for (const item of [
    reply(200, { code: "OK" }),
    reply(200, ""),
    reply(200, "{"),
    reply(200, "3"),
  ]) {
    assert.deepEqual(interpretSubmitResponse(item), { kind: "temporarily_unavailable" });
  }
});

/* -------------------------------------------------------------------------- */
/* Price changed                                                               */
/* -------------------------------------------------------------------------- */

test("5 a valid price change is surfaced as is", () => {
  assert.deepEqual(
    interpretSubmitResponse(
      reply(409, { code: "PRICE_CHANGED", price: { price_type: "estimate", amount_toman: 900 } }),
    ),
    { kind: "price_changed", price: { priceType: "estimate", amountToman: 900 } },
  );
  assert.deepEqual(
    interpretSubmitResponse(
      reply(409, { code: "PRICE_CHANGED", price: { price_type: "review", amount_toman: null } }),
    ),
    { kind: "price_changed", price: { priceType: "review", amountToman: null } },
  );
});

test("6 an invalid price change never becomes a fake review state", () => {
  const cases = [
    { price_type: "fixed", amount_toman: 0 },
    { price_type: "fixed", amount_toman: null },
    { price_type: "estimate", amount_toman: -5 },
    { price_type: "estimate", amount_toman: 1.5 },
    { price_type: "review", amount_toman: 900 },
    { price_type: "unknown", amount_toman: 900 },
    null,
  ];
  for (const price of cases) {
    assert.deepEqual(interpretSubmitResponse(reply(409, { code: "PRICE_CHANGED", price })), {
      kind: "temporarily_unavailable",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Conflicts and errors                                                        */
/* -------------------------------------------------------------------------- */

test("7 selection, terms and idempotency conflicts require status 409", () => {
  assert.deepEqual(interpretSubmitResponse(reply(409, { code: "SELECTION_UNAVAILABLE" })), {
    kind: "selection_unavailable",
  });
  assert.deepEqual(interpretSubmitResponse(reply(409, { code: "IDEMPOTENCY_CONFLICT" })), {
    kind: "idempotency_conflict",
  });
  assert.deepEqual(interpretSubmitResponse(reply(409, { code: "IDEMPOTENCY_EXPIRED" })), {
    kind: "idempotency_expired",
  });
  assert.deepEqual(interpretSubmitResponse(reply(200, { code: "SELECTION_UNAVAILABLE" })), {
    kind: "temporarily_unavailable",
  });
});

test("8 a terms update carries only a valid replacement document", () => {
  const hash = "c".repeat(64);
  assert.deepEqual(
    interpretSubmitResponse(
      reply(409, { code: "TERMS_UPDATED", terms: { version: "2.0", content_hash: hash } }),
    ),
    { kind: "terms_updated", termsDocument: { version: "2.0", contentHash: hash } },
  );
  assert.deepEqual(
    interpretSubmitResponse(
      reply(409, { code: "TERMS_UPDATED", terms: { version: "2.0", content_hash: "x" } }),
    ),
    { kind: "terms_updated", termsDocument: null },
  );
});

test("9 validation errors map server fields to fixed client messages", () => {
  const outcome = interpretSubmitResponse(
    reply(422, {
      code: "VALIDATION_ERROR",
      field_errors: {
        phone: "<script>raw server text</script>",
        terms: "raw",
        unknown_field: "raw",
      },
    }),
  );
  assert.equal(outcome.kind, "validation_error");
  if (outcome.kind !== "validation_error") throw new Error("unreachable");
  assert.deepEqual(outcome.fieldErrors, {
    phone: REQUEST_FIELD_ERRORS.phone,
    termsAccepted: REQUEST_FIELD_ERRORS.termsAccepted,
  });
  assert.ok(!JSON.stringify(outcome.fieldErrors).includes("raw"));
});

test("10 bot verification, rate limiting and unavailability map to their own states", () => {
  assert.deepEqual(interpretSubmitResponse(reply(422, { code: "BOT_VERIFICATION_INVALID" })), {
    kind: "bot_verification_invalid",
  });
  assert.deepEqual(interpretSubmitResponse(reply(429, { code: "RATE_LIMITED" })), {
    kind: "rate_limited",
  });
  assert.deepEqual(interpretSubmitResponse(reply(503, { code: "TEMPORARILY_UNAVAILABLE" })), {
    kind: "temporarily_unavailable",
  });
  assert.deepEqual(interpretSubmitResponse(reply(200, { code: "RATE_LIMITED" })), {
    kind: "temporarily_unavailable",
  });
});

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

test("11 the submit call is same-origin, POST, JSON and not cached", async () => {
  let seen: Parameters<RequestSubmitTransport>[0] | null = null;
  const transport: RequestSubmitTransport = async (input) => {
    seen = input;
    return reply(201, { code: "REQUEST_CREATED", tracking_code: "MA-1001" });
  };
  const outcome = await submitRequest({ payload, transport });
  assert.equal(outcome.kind, "success");
  assert.equal(SUBMIT_ENDPOINT, "/api/submit-request");
  assert.ok(seen !== null);
  const input = seen as unknown as Parameters<RequestSubmitTransport>[0];
  assert.equal(input.url, SUBMIT_ENDPOINT);
  assert.equal(input.method, "POST");
  assert.equal(input.cache, "no-store");
  assert.equal(input.headers["Content-Type"], "application/json");
  assert.equal(JSON.parse(input.body).submission_id, "sid-1");
});

test("12 a rejected transport resolves to the temporary state", async () => {
  const outcome = await submitRequest({
    payload,
    transport: async () => {
      throw new Error("network");
    },
  });
  assert.deepEqual(outcome, { kind: "temporarily_unavailable" });
});

test("13 the official timeout is 15 seconds", () => {
  assert.equal(SUBMIT_TIMEOUT_MS, 15000);
});

test("14 a transport that ignores the abort signal still times out", async () => {
  let aborted = false;
  const outcome = await submitRequest({
    payload,
    timeoutMs: 20,
    transport: (input) =>
      new Promise((resolve) => {
        input.signal.addEventListener("abort", () => {
          aborted = true;
        });
        setTimeout(
          () => resolve(reply(201, { code: "REQUEST_CREATED", tracking_code: "MA-1001" })),
          400,
        );
      }),
  });
  assert.deepEqual(outcome, { kind: "temporarily_unavailable" });
  assert.equal(aborted, true);
});
