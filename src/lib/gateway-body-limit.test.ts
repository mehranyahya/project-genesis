import assert from "node:assert/strict";
import { test } from "node:test";

import { enforcePublicSubmitBodyLimit, PUBLIC_SUBMIT_MAX_BODY_BYTES } from "../server";

const endpoint = "https://example.test/api/submit-request";

function requestWithBody(body: string, headers?: HeadersInit): Request {
  const init: RequestInit = {
    method: "POST",
    body,
  };
  if (headers !== undefined) init.headers = headers;
  return new Request(endpoint, init);
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

test("oversized streaming bodies are rejected promptly without waiting for an unread cloned branch", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(PUBLIC_SUBMIT_MAX_BODY_BYTES + 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request(endpoint, {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      enforcePublicSubmitBodyLimit(request),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Body limit did not settle")), 1000);
      }),
    ]);
    assert.equal(response?.status, 422);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(cancelled, true);
  } finally {
    clearTimeout(timer);
  }
});
