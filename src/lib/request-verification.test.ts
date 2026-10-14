import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REQUEST_VERIFICATION_TIMEOUT_MS,
  waitForRequestVerification,
} from "./request-verification";

test("verification has its own application deadline before request transport", () => {
  assert.equal(REQUEST_VERIFICATION_TIMEOUT_MS, 60_000);
});

test("valid proof and an absent optional widget remain distinguishable from execution failure", async () => {
  assert.deepEqual(await waitForRequestVerification(async () => "synthetic-token"), {
    kind: "ready",
    token: "synthetic-token",
  });
  assert.deepEqual(await waitForRequestVerification(async () => null), {
    kind: "ready",
    token: null,
  });
});

test("security execution which never calls back reaches the independent deadline", async () => {
  const result = await waitForRequestVerification(() => new Promise(() => {}), 20);
  assert.deepEqual(result, { kind: "unavailable" });
});

test("synchronous SDK exceptions and asynchronous rejection recover without throwing", async () => {
  for (const execute of [
    () => {
      throw new Error("Synthetic SDK exception");
    },
    async () => {
      throw new Error("Synthetic SDK rejection");
    },
  ]) {
    assert.deepEqual(await waitForRequestVerification(execute), { kind: "unavailable" });
  }
});

test("a token delivered after the deadline cannot change the completed outcome", async () => {
  let deliver!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    deliver = resolve;
  });
  const result = await waitForRequestVerification(() => pending, 20);
  deliver("late-synthetic-token");
  await pending;
  assert.deepEqual(result, { kind: "unavailable" });
});

test("a late provider rejection stays handled and a fresh attempt can succeed", async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<string>((_, fail) => {
    reject = fail;
  });
  assert.deepEqual(await waitForRequestVerification(() => pending, 20), { kind: "unavailable" });
  reject(new Error("Synthetic late SDK rejection"));
  await Promise.resolve();
  assert.deepEqual(await waitForRequestVerification(async () => "fresh-synthetic-token"), {
    kind: "ready",
    token: "fresh-synthetic-token",
  });
});
