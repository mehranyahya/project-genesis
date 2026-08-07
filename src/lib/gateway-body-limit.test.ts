import assert from "node:assert/strict";
import { test } from "node:test";

import {
  enforcePublicSubmitBodyLimit,
  PUBLIC_SUBMIT_MAX_BODY_BYTES,
} from "../server";

const endpoint = "https://example.test/api/submit-request";

function requestWithBody(body: string, headers?: HeadersInit): Request {
  return new Request(endpoint, {
    method: "POST",
    headers,
    body,
  });
}

test("public submit gateway limit is exactly 16 KiB", () => {
  assert.equal(PUBLIC_SUBMIT_MAX_BODY_BYTES, 16 * 1024);
});

test("a body exactly at the 16 KiB boundary passes and the original body remains readable", async () => {
  const body = "x".repeat(PUBLIC_SUBMIT_MAX_BODY_BYTES);
  const request = requestWithBody(body);

  assert.equal(await enforcePublicSubmitBodyLimit(request), null);
  assert.equal(await request.text(), body);
});

test("a body one byte above 16 KiB is rejected even without a content-length header", async () => {
  const request = requestWithBody("x".repeat(PUBLIC_SUBMIT_MAX_BODY_BYTES + 1));
  const response = await enforcePublicSubmitBodyLimit(request);

  assert.ok(response);
  assert.equal(response.status, 422);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.deepEqual(await response.json(), { code: "VALIDATION_ERROR", field_errors: {} });
});

test("an oversized declared content length is rejected before trusting a small body", async () => {
  const request = requestWithBody("{}", {
    "content-length": String(PUBLIC_SUBMIT_MAX_BODY_BYTES + 1),
  });
  const response = await enforcePublicSubmitBodyLimit(request);

  assert.ok(response);
  assert.equal(response.status, 422);
});

test("gateway body enforcement applies only to POST /api/submit-request", async () => {
  const oversized = "x".repeat(PUBLIC_SUBMIT_MAX_BODY_BYTES + 1);
  const getRequest = new Request(endpoint, { method: "GET" });
  const otherPost = new Request("https://example.test/contact", {
    method: "POST",
    body: oversized,
  });

  assert.equal(await enforcePublicSubmitBodyLimit(getRequest), null);
  assert.equal(await enforcePublicSubmitBodyLimit(otherPost), null);
});
