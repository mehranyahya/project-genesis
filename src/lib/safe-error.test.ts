import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { describeError, safeErrorArguments } from "./safe-error";
import { reportLovableError } from "./lovable-error-reporting";

test("error diagnostics retain category/status but never a message, custom name, stack or nested cause", () => {
  const error = new TypeError("synthetic-private-phone-09123456789", {
    cause: { name: "synthetic-private-name" },
  });
  error.stack = "synthetic-private-address";
  Object.assign(error, { status: 503 });
  assert.deepEqual(JSON.parse(describeError(error)), { category: "TypeError", status: 503 });
  error.name = "synthetic-private-name";
  assert.deepEqual(JSON.parse(describeError(error)), { category: "Error", status: 503 });
});

test("arbitrary objects, strings and throwing getters are never serialized into diagnostics", () => {
  let calls = 0;
  const payload = {
    toJSON() {
      calls++;
      throw new Error("synthetic-private-body");
    },
    toString() {
      calls++;
      return "synthetic-private-body";
    },
  };
  const error = new Error("synthetic-private-body");
  Object.defineProperty(error, "name", {
    get() {
      throw new Error("synthetic-private-getter");
    },
  });
  const logged = safeErrorArguments([payload, "synthetic-private-body", error]);
  assert.equal(calls, 0);
  assert.equal(logged.join().includes("synthetic-private"), false);
  assert.equal(
    safeErrorArguments(["Worker submit flood limiter unavailable"])[0],
    "Worker submit flood limiter unavailable",
  );
});

test("global Worker error capture sends only safe arguments to its actual sink and retains no original Error", () => {
  const url = new URL("./error-capture.ts", import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      "--eval",
      `
    const logged = [];
    console.error = (...args) => logged.push(args);
    const { consumeLastCapturedError } = await import(${JSON.stringify(url)});
    const error = new Error("synthetic-private-body", { cause: "synthetic-private-cause" });
    console.error(error, { phone: "synthetic-private-phone" }, "synthetic-private-url");
    const captured = consumeLastCapturedError();
    process.stdout.write(JSON.stringify({ logged, captured, empty: consumeLastCapturedError() === undefined }));
  `,
    ],
    { encoding: "utf8", timeout: 10000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("synthetic-private"), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(typeof parsed.captured, "string");
  assert.equal(parsed.empty, true);
  assert.deepEqual(JSON.parse(parsed.captured), { category: "Error" });
});

test("both editor boundary hooks receive sanitized errors without route, stack, URL or arbitrary context", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const captured: unknown[] = [];
  const windowFixture = {
    location: { pathname: "/synthetic-private-route" },
    __lovableEvents: { captureException: (...args: unknown[]) => captured.push(args) },
    __lovableReportRuntimeError: (value: unknown) => captured.push(value),
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowFixture });
  try {
    reportLovableError(
      new Error("synthetic-private-message", { cause: "synthetic-private-cause" }),
      {
        boundary: "tanstack_root_error_component",
        phone: "synthetic-private-phone",
        route: "synthetic-private-route",
      },
    );
    assert.equal(captured.length, 2);
    assert.equal(JSON.stringify(captured).includes("synthetic-private"), false);
    const args = captured[0] as [Error, unknown];
    assert.equal(args[0].stack, undefined);
    assert.equal(args[0].cause, undefined);
    assert.deepEqual(args[1], {
      source: "react_error_boundary",
      boundary: "tanstack_root_error_component",
    });
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
