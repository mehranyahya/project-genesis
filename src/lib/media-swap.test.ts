import { test } from "node:test";
import assert from "node:assert/strict";
import { createMediaSwapGuard, prepareMediaSwap } from "./media-swap";

test("an image cannot replace the old frame before decoding completes", async () => {
  let release!: () => void;
  const decoded = new Promise<void>((resolve) => {
    release = resolve;
  });
  let ready = false;
  const pending = prepareMediaSwap({ decode: () => decoded }, () => true).then((value) => {
    ready = value;
  });
  await Promise.resolve();
  assert.equal(ready, false);
  release();
  await pending;
  assert.equal(ready, true);
});
test("obsolete decode completions cannot replace the current frame", async () => {
  let release!: () => void;
  const decoded = new Promise<void>((resolve) => {
    release = resolve;
  });
  let current = true;
  const pending = prepareMediaSwap({ decode: () => decoded }, () => current);
  current = false;
  release();
  assert.equal(await pending, false);
});
test("a decode failure remains a failure and never signals readiness", async () => {
  await assert.rejects(
    prepareMediaSwap({ decode: () => Promise.reject(new Error("decode failed")) }, () => true),
    /decode failed/,
  );
});

test("a failed or timed-out attempt cannot revive after its late decode", async () => {
  const guard = createMediaSwapGuard();
  const attempt = guard.start();
  let release!: () => void;
  const decoded = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = prepareMediaSwap({ decode: () => decoded }, () => guard.isCurrent(attempt));
  guard.cancel();
  release();
  assert.equal(await pending, false);
});

test("retiring a gallery also retires its decode completions", async () => {
  const guard = createMediaSwapGuard();
  const attempt = guard.start();
  const pending = prepareMediaSwap({ decode: () => Promise.resolve() }, () =>
    guard.isCurrent(attempt),
  );
  guard.cancel();
  assert.equal(await pending, false);
});

test("a retried or newer attempt is the only one that may replace the visible frame", async () => {
  const guard = createMediaSwapGuard();
  const oldAttempt = guard.start();
  const oldDecode = prepareMediaSwap({ decode: () => Promise.resolve() }, () =>
    guard.isCurrent(oldAttempt),
  );
  guard.cancel();
  const retry = guard.start();
  assert.notEqual(retry, oldAttempt);
  assert.equal(await oldDecode, false);
  assert.equal(
    await prepareMediaSwap({ decode: () => Promise.resolve() }, () => guard.isCurrent(retry)),
    true,
  );
  guard.cancel();
  assert.equal(guard.isCurrent(retry), false);
});
