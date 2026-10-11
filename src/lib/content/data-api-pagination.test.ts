import assert from "node:assert/strict";
import { test } from "node:test";
import { createDataApiBudget, readPaginatedRows } from "../../../scripts/data-api-pagination.mjs";

function page(rows: unknown, range: string, status = 200): Response {
  return new Response(JSON.stringify(rows), {
    status,
    headers: { "content-range": range, "range-unit": "items" },
  });
}

function cancellable(body: Uint8Array, headers: HeadersInit) {
  let cancelled = false;
  let sent = false;
  const response = new Response(
    new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (sent) controller.close();
          else {
            sent = true;
            controller.enqueue(body);
          }
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    ),
    { headers },
  );
  return { response, cancelled: () => cancelled };
}

test("pagination collects more than 1000 rows and 4MiB despite a smaller server page cap", async () => {
  const source = Array.from({ length: 1201 }, (_, i) => ({
    id: `row-${i}`,
    text: "x".repeat(4000),
  }));
  assert.ok(Buffer.byteLength(JSON.stringify(source)) > 4 * 1024 * 1024);
  const budget = createDataApiBudget();
  let calls = 0;
  const rows = await readPaginatedRows(
    async (headers) => {
      calls++;
      assert.equal(headers["prefer"], "count=exact");
      assert.equal(headers["range-unit"], "items");
      const [offset, end] = headers["range"]!.split("-").map(Number) as [number, number];
      assert.equal(end, offset + 99);
      const result = source.slice(offset, offset + 73);
      return page(result, `${offset}-${offset + result.length - 1}/${source.length}`, 206);
    },
    ["id"],
    { budget },
  );
  assert.deepEqual(rows, source);
  assert.equal(calls, 17);
  assert.ok(budget.bytesRemaining < 64 * 1024 * 1024 - 4 * 1024 * 1024);
});

test("empty and exact-boundary result sets complete without a speculative extra request", async () => {
  let calls = 0;
  assert.deepEqual(
    await readPaginatedRows(async () => {
      calls++;
      return page([], "*/0");
    }, ["id"]),
    [],
  );
  assert.equal(calls, 1);
  const source = Array.from({ length: 100 }, (_, i) => ({ id: `id-${i}` }));
  calls = 0;
  assert.deepEqual(
    await readPaginatedRows(async () => {
      calls++;
      return page(source, "0-99/100");
    }, ["id"]),
    source,
  );
  assert.equal(calls, 1);
});

test("missing, estimated and malformed Content-Range values cancel unread bodies", async () => {
  for (const range of ["", "0-0/*", "*/1", "-1-0/1", "00-0/1", "0-0/-1", "0-0/9007199254740993"]) {
    const fixture = cancellable(Buffer.from("synthetic-private-response"), {
      "content-range": range,
    });
    await assert.rejects(readPaginatedRows(async () => fixture.response, ["id"]));
    assert.equal(fixture.cancelled(), true);
    assert.equal(fixture.response.body?.locked, false);
  }
});

test("gaps, overlap, count changes and too-wide ranges reject a partial catalogue", async () => {
  for (const range of ["0-0/3", "2-2/3", "1-1/4", "1-100/3"]) {
    let calls = 0;
    await assert.rejects(
      readPaginatedRows(async () => {
        calls++;
        return calls === 1 ? page([{ id: "first" }], "0-0/3") : page([{ id: "second" }], range);
      }, ["id"]),
    );
    assert.equal(calls, 2);
  }
  await assert.rejects(readPaginatedRows(async () => page([], "0-0/0"), ["id"]));
});

test("body length, top-level shape and row keys must agree with the declared range", async () => {
  for (const body of [
    [],
    [{ id: "1" }, { id: "2" }],
    { id: "1" },
    [null],
    [1],
    [{}],
    [{ id: "" }],
  ]) {
    await assert.rejects(readPaginatedRows(async () => page(body, "0-0/1"), ["id"]));
  }
  await assert.rejects(
    readPaginatedRows(async () => page([{ id: "same" }, { id: "same" }], "0-1/2"), ["id"]),
  );
  let calls = 0;
  await assert.rejects(
    readPaginatedRows(async () => {
      const offset = calls++;
      return page([{ id: "same" }], `${offset}-${offset}/2`);
    }, ["id"]),
  );
});

test("composite row identifiers cannot collide at punctuation boundaries", async () => {
  const rows = [
    { owner: "a,b", key: "c" },
    { owner: "a", key: "b,c" },
  ];
  assert.deepEqual(
    await readPaginatedRows(async () => page(rows, "0-1/2"), ["owner", "key"]),
    rows,
  );
});

test("a count over the table cap fails before reading or publishing any row", async () => {
  for (const total of [101, 10_001]) {
    const fixture = cancellable(Buffer.from("private-value"), { "content-range": `0-0/${total}` });
    await assert.rejects(
      readPaginatedRows(async () => fixture.response, ["id"], { maxRows: 100 }),
      { message: "Build table count changed or exceeds row limit" },
    );
    assert.equal(fixture.cancelled(), true);
  }
  assert.deepEqual(
    await readPaginatedRows(async () => page([], "*/0"), ["id"], { maxRows: 0 }),
    [],
  );
});

test("the per-page stream cap and the shared byte cap stop reading oversized responses", async () => {
  const body = Buffer.from(JSON.stringify([{ id: "1", privateText: "synthetic-private-value" }]));
  const fixture = cancellable(body, { "content-range": "0-0/1", "content-length": "1" });
  await assert.rejects(
    readPaginatedRows(async () => fixture.response, ["id"], { maxPageBytes: body.length - 1 }),
  );
  assert.equal(fixture.cancelled(), true);
  assert.equal(fixture.response.body?.locked, false);
  const one = JSON.stringify([{ id: "one" }]);
  const budget = createDataApiBudget({ maxBytes: Buffer.byteLength(one) * 2 - 1 });
  await readPaginatedRows(async () => page([{ id: "one" }], "0-0/1"), ["id"], { budget });
  await assert.rejects(
    readPaginatedRows(async () => page([{ id: "two" }], "0-0/1"), ["id"], { budget }),
  );
  assert.ok(budget.bytesRemaining >= 0);
});

test("parallel table readers cannot overdraw their shared byte budget", async () => {
  const bytes = Buffer.byteLength(JSON.stringify([{ id: "one" }]));
  const budget = createDataApiBudget({ maxBytes: bytes * 2 - 1 });
  const results = await Promise.allSettled(
    ["one", "two"].map((id) =>
      readPaginatedRows(async () => page([{ id }], "0-0/1"), ["id"], {
        budget,
        maxPageBytes: bytes,
      }),
    ),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.ok(budget.bytesRemaining >= 0);
});

test("request-budget exhaustion stops small server pages instead of looping or returning partial data", async () => {
  let calls = 0;
  const budget = createDataApiBudget({ maxRequests: 2 });
  await assert.rejects(
    readPaginatedRows(
      async () => {
        const offset = calls++;
        return page([{ id: String(offset) }], `${offset}-${offset}/3`);
      },
      ["id"],
      { budget },
    ),
    { message: "Build data budget exhausted" },
  );
  assert.equal(calls, 2);
  assert.equal(budget.requestsRemaining, 0);
});

test("HTTP, range-unit and invalid UTF-8/JSON errors expose no response or exception values", async () => {
  const secret = "synthetic-private-error";
  const sources = [
    async () => {
      throw new Error(secret);
    },
    async () => new Response(secret, { status: 503 }),
    async () =>
      new Response(secret, { headers: { "content-range": "0-0/1", "range-unit": "bytes" } }),
    async () => new Response(secret, { headers: { "content-range": "0-0/1" } }),
    async () =>
      new Response(new Uint8Array([0xc3, 0x28]), { headers: { "content-range": "0-0/1" } }),
  ];
  for (const request of sources) {
    await assert.rejects(
      readPaginatedRows(request, ["id"]),
      (error: unknown) => error instanceof Error && !error.message.includes(secret),
    );
  }
});

test("invalid budgets and pagination options fail before requesting remote data", async () => {
  for (const maxBytes of [0, -1, NaN, Infinity, 1.5])
    assert.throws(() => createDataApiBudget({ maxBytes }));
  for (const maxRequests of [0, -1, NaN, Infinity, 1.5])
    assert.throws(() => createDataApiBudget({ maxRequests }));
  for (const options of [
    { pageSize: 0 },
    { pageSize: 101 },
    { maxRows: -1 },
    { maxRows: 10001 },
    { maxPageBytes: 0 },
    { maxPageBytes: 4 * 1024 * 1024 + 1 },
  ]) {
    await assert.rejects(
      readPaginatedRows(
        async () => {
          assert.fail("must not fetch");
        },
        ["id"],
        options,
      ),
    );
  }
});
