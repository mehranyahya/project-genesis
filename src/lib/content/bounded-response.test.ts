import assert from "node:assert/strict";
import { test } from "node:test";
import { readBoundedBytes, readBoundedJson } from "../../../scripts/bounded-response.mjs";

function streamResponse(chunks: readonly Uint8Array[], headers?: HeadersInit) {
  let index = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[index++];
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return {
    response: new Response(body, headers === undefined ? {} : { headers }),
    wasCancelled: () => cancelled,
  };
}

test("bounded reader accepts the exact boundary including multibyte UTF-8 split across chunks", async () => {
  const bytes = Buffer.from(JSON.stringify({ title: "سنگ Stone" }));
  const { response } = streamResponse([bytes.subarray(0, 12), bytes.subarray(12)]);
  assert.deepEqual(await readBoundedJson(response, bytes.length), { title: "سنگ Stone" });
});

test("oversized declared responses are cancelled before reading their body", async () => {
  const fixture = streamResponse([Buffer.alloc(1)], { "content-length": "9" });
  await assert.rejects(readBoundedBytes(fixture.response, 8));
  assert.equal(fixture.wasCancelled(), true);
  assert.equal(fixture.response.body?.locked, false);
});

test("chunked and misleading short-length responses stop and cancel as soon as they exceed the cap", async () => {
  for (const headers of [{}, { "content-length": "1" }]) {
    const fixture = streamResponse([Buffer.alloc(4), Buffer.alloc(5), Buffer.alloc(100)], headers);
    await assert.rejects(readBoundedBytes(fixture.response, 8));
    assert.equal(fixture.wasCancelled(), true);
    assert.equal(fixture.response.body?.locked, false);
  }
});

test("empty, malformed-length and broken response streams fail without leaking source errors", async () => {
  for (const body of [new Response(null), new Response("")]) {
    await assert.rejects(readBoundedBytes(body, 8));
  }
  await assert.rejects(
    readBoundedBytes(new Response("{}", { headers: { "content-length": "NaN" } }), 8),
  );
  const broken = new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error("synthetic-private-source-error"));
      },
    }),
  );
  await assert.rejects(
    readBoundedBytes(broken, 8),
    (error: unknown) =>
      error instanceof Error && !error.message.includes("synthetic-private-source-error"),
  );
});

test("JSON parser rejects invalid UTF-8 and malformed JSON with a fixed safe error", async () => {
  for (const response of [
    new Response(new Uint8Array([0xc3, 0x28])),
    new Response("synthetic-private-text"),
  ]) {
    await assert.rejects(readBoundedJson(response, 64), {
      message: "Build response is not valid UTF-8 JSON",
    });
  }
});
