const encoder = new TextEncoder();

export function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value === null || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) output[key] = stableValue(input[key]);
  return output;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
}

export function constantTimeHexEqual(left: string, right: string): boolean {
  const a = hexToBytes(left);
  const b = hexToBytes(right);
  if (a === null || b === null || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index]! ^ b[index]!;
  return difference === 0;
}

function parseUuidBytes(value: string): Uint8Array | null {
  const compact = value.replaceAll("-", "");
  const bytes = hexToBytes(compact);
  return bytes?.length === 16 ? bytes : null;
}

function formatUuid(bytes: Uint8Array): string {
  const hex = bytesToHex(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export async function uuidV5(namespace: string, name: string): Promise<string> {
  const namespaceBytes = parseUuidBytes(namespace);
  if (namespaceBytes === null) throw new Error("Invalid UUIDv5 namespace");
  const input = new Uint8Array(namespaceBytes.length + encoder.encode(name).length);
  input.set(namespaceBytes, 0);
  input.set(encoder.encode(name), namespaceBytes.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", input)).slice(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  return formatUuid(digest);
}
