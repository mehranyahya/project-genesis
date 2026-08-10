import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalJson, parseStrictJson } from "./strict-json";

test("strict JSON rejects duplicate decoded keys and unpaired Unicode surrogates", () => {
  assert.equal(parseStrictJson('{"a":1,"a":2}'), null);
  assert.equal(parseStrictJson('{"a":1,"\\u0061":2}'), null);
  assert.equal(parseStrictJson('{"value":"\\ud800"}'), null);
  assert.equal(parseStrictJson('{"value":"\\udc00"}'), null);
  assert.deepEqual(parseStrictJson('{"value":"\\ud83d\\ude00"}'), { value: "😀" });
});

test("canonical JSON preserves dangerous-looking own keys without prototype mutation", () => {
  const parsed = parseStrictJson('{"__proto__":{"polluted":true},"a":1}');
  assert.ok(parsed);
  assert.equal(({} as { polluted?: unknown }).polluted, undefined);
  assert.equal(canonicalJson(parsed), '{"__proto__":{"polluted":true},"a":1}');
  assert.equal(({} as { polluted?: unknown }).polluted, undefined);
});

test("strict JSON bounds structural depth", () => {
  const within = `${"[".repeat(64)}0${"]".repeat(64)}`;
  const tooDeep = `${"[".repeat(66)}0${"]".repeat(66)}`;
  assert.ok(parseStrictJson(within));
  assert.equal(parseStrictJson(tooDeep), null);
});
