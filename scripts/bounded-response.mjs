import { Buffer } from "node:buffer";

// Enforce limits while reading, before concatenating a remote body in memory.
export async function readBoundedBytes(response, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid response byte limit");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    if (response.body) await response.body.cancel().catch(() => {});
    throw new Error("Build response violates byte limit");
  }
  if (!response.body) throw new Error("Build response has no body");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > limit) throw new Error("Build response violates byte limit");
      chunks.push(Buffer.from(next.value));
    }
    if (total === 0) throw new Error("Build response has no body");
    return Buffer.concat(chunks, total);
  } catch {
    await reader.cancel().catch(() => {});
    throw new Error("Build response could not be read within byte limit");
  } finally {
    reader.releaseLock();
  }
}

export async function readBoundedJson(response, limit) {
  const bytes = await readBoundedBytes(response, limit);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    // JSON parser errors can quote the source. Do not leak private response data.
    throw new Error("Build response is not valid UTF-8 JSON");
  }
}
