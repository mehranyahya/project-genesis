import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fromCrossJSON,
  fromJSON,
  SerovalDeserializationError,
  SerovalMalformedNodeError,
  toCrossJSON,
  toJSON,
} from "seroval";

// The malicious array-like source is deliberately tiny: this reproduces the
// missing type check without a large allocation or any live endpoint request.
test("Seroval rejects an array-like object as a TypedArray buffer in JSON", () => {
  const json = toJSON(new Uint8Array([4, 8]));
  if (json.t.t !== 15) throw new Error("Expected a TypedArray fixture");
  const arrayLike = { ...toJSON({ length: 8 }).t, i: 1 };
  const malformed = {
    ...json,
    t: { ...json.t, f: arrayLike },
  };
  assert.throws(
    () => fromJSON(malformed),
    (error: unknown) =>
      error instanceof SerovalDeserializationError &&
      error.cause instanceof SerovalMalformedNodeError,
  );
});

test("Seroval rejects an array-like object as a TypedArray buffer in cross JSON", () => {
  const node = toCrossJSON(new Uint8Array([4, 8]));
  if (node.t !== 15) throw new Error("Expected a TypedArray fixture");
  const malformed = { ...node, f: { ...toCrossJSON({ length: 8 }), i: 1 } };
  assert.throws(
    () => fromCrossJSON(malformed, {}),
    (error: unknown) =>
      error instanceof SerovalDeserializationError &&
      error.cause instanceof SerovalMalformedNodeError,
  );
});

test("patched Seroval preserves request-shaped data and valid typed arrays", () => {
  const value = {
    service: "building_stone",
    title: "درخواست بررسی سنگ / Stone enquiry",
    dimensions: { lengthCm: 120, widthCm: 60 },
    selectedCodes: ["marble", "flooring"],
    bytes: new Uint8Array([0, 4, 8, 255]),
  };
  assert.deepEqual(fromJSON(toJSON(value)), value);
  assert.deepEqual(fromCrossJSON(toCrossJSON(value), {}), value);
});
