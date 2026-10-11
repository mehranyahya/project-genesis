import { readBoundedBytes } from "./bounded-response.mjs";

// Build-only limits. A limit stops generation; it never publishes a clipped list.
const PAGE_SIZE = 100;
const MAX_ROWS = 10_000;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_BUILD_BYTES = 64 * 1024 * 1024;
const MAX_BUILD_REQUESTS = 2_000;

export function createDataApiBudget({
  maxBytes = MAX_BUILD_BYTES,
  maxRequests = MAX_BUILD_REQUESTS,
} = {}) {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    !Number.isSafeInteger(maxRequests) ||
    maxRequests < 1
  ) {
    throw new Error("Invalid build data budget");
  }
  return { bytesRemaining: maxBytes, requestsRemaining: maxRequests };
}

async function rejectPage(response, message) {
  if (response.body) await response.body.cancel().catch(() => {});
  throw new Error(message);
}

function rowKey(row, columns) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return null;
  const parts = columns.map((column) => row[column]);
  if (parts.some((part) => typeof part !== "string" || part === "")) return null;
  // A composite key cannot collide when a component contains punctuation.
  return JSON.stringify(parts);
}

/**
 * Each request must have a unique, deterministic order supplied by its caller.
 * An exact count and contiguous Content-Range prove traversal completeness for
 * an unchanged result set, not a database snapshot across HTTP requests.
 */
export async function readPaginatedRows(
  requestPage,
  columns,
  {
    budget = createDataApiBudget(),
    pageSize = PAGE_SIZE,
    maxRows = MAX_ROWS,
    maxPageBytes = MAX_PAGE_BYTES,
  } = {},
) {
  if (
    !Array.isArray(columns) ||
    columns.length < 1 ||
    columns.some((column) => typeof column !== "string" || column === "") ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > PAGE_SIZE ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 0 ||
    maxRows > MAX_ROWS ||
    !Number.isSafeInteger(maxPageBytes) ||
    maxPageBytes < 1 ||
    maxPageBytes > MAX_PAGE_BYTES
  ) {
    throw new Error("Invalid build pagination options");
  }
  const rows = [];
  const seen = new Set();
  let expectedTotal = null;

  while (true) {
    if (
      !Number.isSafeInteger(budget.requestsRemaining) ||
      budget.requestsRemaining < 1 ||
      !Number.isSafeInteger(budget.bytesRemaining) ||
      budget.bytesRemaining < 1
    ) {
      throw new Error("Build data budget exhausted");
    }
    budget.requestsRemaining -= 1;
    const offset = rows.length;
    let response;
    try {
      response = await requestPage({
        "range-unit": "items",
        range: `${offset}-${offset + pageSize - 1}`,
        prefer: "count=exact",
      });
    } catch {
      throw new Error("Build table request unavailable");
    }
    if (!response.ok) await rejectPage(response, "Build table request failed");
    const unit = response.headers.get("range-unit");
    if (unit !== null && unit !== "items")
      await rejectPage(response, "Build table range unit is invalid");
    const range = /^(?:(0|[1-9][0-9]*)-(0|[1-9][0-9]*)|\*)\/(0|[1-9][0-9]*)$/.exec(
      response.headers.get("content-range") ?? "",
    );
    if (!range) await rejectPage(response, "Build table requires an exact Content-Range");
    const total = Number(range[3]);
    const first = range[1] === undefined ? null : Number(range[1]);
    const last = range[2] === undefined ? null : Number(range[2]);
    if (
      !Number.isSafeInteger(total) ||
      total > maxRows ||
      (expectedTotal !== null && total !== expectedTotal)
    ) {
      await rejectPage(response, "Build table count changed or exceeds row limit");
    }
    if (
      total === 0
        ? first !== null || offset !== 0
        : first !== offset ||
          last === null ||
          !Number.isSafeInteger(last) ||
          last < first ||
          last >= total ||
          last >= offset + pageSize
    ) {
      await rejectPage(response, "Build table range is not contiguous");
    }
    expectedTotal = total;
    const reserved = Math.min(maxPageBytes, budget.bytesRemaining);
    if (reserved < 1) await rejectPage(response, "Build data budget exhausted");
    // Reserve before awaiting the stream: parallel table reads share this cap.
    budget.bytesRemaining -= reserved;
    const bytes = await readBoundedBytes(response, reserved);
    budget.bytesRemaining += reserved - bytes.length;
    let page;
    try {
      page = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new Error("Build response is not valid UTF-8 JSON");
    }
    if (!Array.isArray(page) || page.length !== (total === 0 ? 0 : last - first + 1)) {
      throw new Error("Build table body does not match its range");
    }
    for (const row of page) {
      const key = rowKey(row, columns);
      if (key === null || seen.has(key))
        throw new Error("Build table has an invalid or repeated row key");
      seen.add(key);
      rows.push(row);
    }
    if (rows.length === total) return rows;
  }
}
